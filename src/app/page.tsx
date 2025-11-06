'use client';

import { useState, useRef, useEffect } from 'react';
import SmartInput, { SmartInputHandle } from '@/components/SmartInput';
import EventEditor from '@/components/EventEditor';
import UnsavedEventsSection from '@/components/UnsavedEventsSection';
import ErrorNotification from '@/components/ErrorNotification';
import RateLimitBanner from '@/components/RateLimitBanner';
import InlineEventEditor from '@/components/InlineEventEditor';
import { CalendarEvent, ParsedEvent, StreamedEventChunk, EventAttachment } from '@/types/event';
import { exportToICS } from '@/services/exporter';
import { useHistory } from '@/hooks/useHistory';
import { useProcessingQueue } from '@/hooks/useProcessingQueue';
import { detectURLs } from '@/services/urlDetector';
import { scrapeURLsBatch } from '@/services/webScraper';
import { QueueItem } from '@/services/processingQueue';
import { eventStorage } from '@/services/storage';

interface ProcessingEvent {
  id: string;
  type: 'image' | 'text';
  status: 'processing' | 'success' | 'error';
  event?: CalendarEvent;
  error?: string;
}

interface ImageProcessingStatus {
  id: string;
  filename: string;
  status: 'pending' | 'processing' | 'complete' | 'error';
  error?: string;
  eventCount?: number;
}

interface BatchProcessing {
  id: string;
  events: CalendarEvent[];
  isProcessing: boolean;
  totalExpected?: number;
  source: 'image' | 'text';
}

interface URLProcessingStatus {
  phase: 'detecting' | 'fetching' | 'extracting' | 'complete';
  urlCount?: number;
  fetchedCount?: number;
  message: string;
}

export default function Home() {
  const [processingEvents, setProcessingEvents] = useState<ProcessingEvent[]>([]);
  const [batchProcessing, setBatchProcessing] = useState<BatchProcessing | null>(null);
  const [unsavedEvents, setUnsavedEvents] = useState<CalendarEvent[]>([]);
  const [imageProcessingStatuses, setImageProcessingStatuses] = useState<ImageProcessingStatus[]>([]);
  const [urlProcessingStatus, setUrlProcessingStatus] = useState<URLProcessingStatus | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [rateLimitInfo, setRateLimitInfo] = useState<{ remaining: number; total: number; resetTime: number } | undefined>();
  const [hasLoadedTempEvents, setHasLoadedTempEvents] = useState(false);
  const { events, addEvent, deleteEvent, updateEvent } = useHistory();
  const { addToQueue, updateProgress } = useProcessingQueue();
  const smartInputRef = useRef<SmartInputHandle>(null);

  useEffect(() => {
    const result = eventStorage.getTempUnsavedEvents();
    if (result.success && result.data && result.data.length > 0) {
      setUnsavedEvents(result.data);
    }
    setHasLoadedTempEvents(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedTempEvents) return;

    if (unsavedEvents.length > 0) {
      eventStorage.saveTempUnsavedEvents(unsavedEvents);
    } else {
      eventStorage.clearTempUnsavedEvents();
    }
  }, [unsavedEvents, hasLoadedTempEvents]);

  const updateRateLimitFromHeaders = (headers: Headers) => {
    const remaining = parseInt(headers.get('X-RateLimit-Remaining') || '5');
    const total = parseInt(headers.get('X-RateLimit-Limit') || '5');
    const reset = parseInt(headers.get('X-RateLimit-Reset') || '0');

    if (reset > 0) {
      setRateLimitInfo({
        remaining,
        total,
        resetTime: reset,
      });
    }
  };

  const convertParsedToCalendarEvent = (
    parsed: ParsedEvent,
    source: 'image' | 'text',
    originalInput?: string,
    attachments?: EventAttachment[]
  ): CalendarEvent => {
    const now = new Date();

    const parseDate = (dateString: string | undefined, fallback: Date): Date => {
      if (!dateString) return fallback;
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? fallback : date;
    };

    const startDate = parseDate(parsed.startDate, now);
    const endDate = parseDate(parsed.endDate, new Date(startDate.getTime() + 60 * 60 * 1000));

    return {
      id: `event-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      title: parsed.title || 'Untitled Event',
      startDate,
      endDate,
      location: parsed.location,
      description: parsed.description,
      allDay: false,
      created: now,
      source,
      originalInput,
      attachments,
    };
  };

  const handleBatchStream = async (
    source: 'image' | 'text',
    body: Record<string, unknown>,
    originalInput?: string,
    attachments?: EventAttachment[]
  ) => {
    const batchId = `batch-${Date.now()}`;
    setBatchProcessing(prev => ({
      id: batchId,
      events: prev?.events || [],
      isProcessing: true,
      source,
    }));

    try {
      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, batch: true }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to process batch' }));
        throw new Error(errorData.error || 'Failed to process batch');
      }

      updateRateLimitFromHeaders(response.headers);

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response stream');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            if (data.error) {
              throw new Error(data.error);
            }

            const chunk = data as StreamedEventChunk;

            if (chunk.isComplete) {
              setBatchProcessing(prev => prev ? { ...prev, isProcessing: false } : null);
              break;
            }

            if (chunk.events && chunk.events.length > 0) {
              const newEvents = chunk.events.map(parsed =>
                convertParsedToCalendarEvent(parsed, source, originalInput, attachments)
              );

              setBatchProcessing(prev => {
                if (!prev) return null;
                return {
                  ...prev,
                  events: [...prev.events, ...newEvents],
                };
              });
            }
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error
        ? err.message
        : 'Failed to process batch';

      const processingId = `error-${Date.now()}`;
      setProcessingEvents(prev => [...prev, {
        id: processingId,
        type: source,
        status: 'error',
        error: errorMessage,
      }]);

      setBatchProcessing(null);

      setTimeout(() => {
        setProcessingEvents(prev => prev.filter(p => p.id !== processingId));
      }, 5000);
    }
  };

  const handleImageSelect = async (files: File[]) => {
    if (files.length === 0) return;

    addToQueue(
      'image',
      files,
      async (queueItem: QueueItem) => {
        const imageFiles = queueItem.payload as File[];
        const allEvents: CalendarEvent[] = [];

        const batchId = `batch-${Date.now()}`;
        setBatchProcessing({
          id: batchId,
          events: [],
          isProcessing: true,
          source: 'image',
        });

        const initialStatuses: ImageProcessingStatus[] = imageFiles.map((file, index) => ({
          id: `image-${Date.now()}-${index}`,
          filename: file.name,
          status: 'pending' as const,
        }));

        setImageProcessingStatuses(initialStatuses);

        for (let i = 0; i < imageFiles.length; i++) {
          const file = imageFiles[i];
          const statusId = initialStatuses[i].id;

          setImageProcessingStatuses(prev =>
            prev.map(s => s.id === statusId ? { ...s, status: 'processing' as const } : s)
          );

          updateProgress(queueItem.id, Math.round((i / imageFiles.length) * 100));

          try {
            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve, reject) => {
              reader.onload = () => {
                const result = reader.result as string;
                const base64 = result.split(',')[1];
                resolve(base64);
              };
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });

            const base64 = await base64Promise;
            const mimeType = file.type;

            const attachment: EventAttachment = {
              id: `attachment-${Date.now()}-${i}`,
              filename: file.name,
              mimeType,
              data: base64,
              type: 'original-image',
              size: file.size,
            };

            const response = await fetch('/api/parse', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                imageBase64: base64,
                imageMimeType: mimeType,
                batch: true,
              }),
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({ error: 'Failed to process image' }));
              throw new Error(errorData.error || 'Failed to process image');
            }

            updateRateLimitFromHeaders(response.headers);

            const reader2 = response.body?.getReader();
            if (!reader2) {
              throw new Error('No response stream');
            }

            const decoder = new TextDecoder();
            let buffer = '';
            let eventsFromThisImage = 0;

            while (true) {
              const { done, value } = await reader2.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = JSON.parse(line.slice(6));

                  if (data.error) {
                    throw new Error(data.error);
                  }

                  const chunk = data as StreamedEventChunk;

                  if (chunk.isComplete) {
                    break;
                  }

                  if (chunk.events && chunk.events.length > 0) {
                    const newEvents = chunk.events.map(parsed =>
                      convertParsedToCalendarEvent(parsed, 'image', URL.createObjectURL(file), [attachment])
                    );

                    eventsFromThisImage += newEvents.length;
                    allEvents.push(...newEvents);

                    setUnsavedEvents(prev => [...prev, ...newEvents]);
                  }
                }
              }
            }

            setImageProcessingStatuses(prev =>
              prev.map(s => s.id === statusId ? { ...s, status: 'complete' as const, eventCount: eventsFromThisImage } : s)
            );
          } catch (err) {
            const errorMessage = err instanceof Error
              ? err.message
              : 'Unable to extract event details from this image.';

            setImageProcessingStatuses(prev =>
              prev.map(s => s.id === statusId ? { ...s, status: 'error' as const, error: errorMessage } : s)
            );
          }
        }

        setBatchProcessing(prev => prev ? { ...prev, isProcessing: false } : null);

        setTimeout(() => {
          setImageProcessingStatuses([]);
        }, 10000);

        return allEvents;
      },
      { fileCount: files.length }
    );
  };

  const handleTextSubmit = async (text: string) => {
    addToQueue(
      'text',
      text,
      async (queueItem: QueueItem) => {
        const inputText = queueItem.payload as string;

        try {
          setUrlProcessingStatus({
            phase: 'detecting',
            message: 'Detecting URLs...',
          });

          const urlDetectionResult = await detectURLs(inputText);

          let combinedText = inputText;

          if (urlDetectionResult.hasUrls && urlDetectionResult.urls.length > 0) {
            setUrlProcessingStatus({
              phase: 'fetching',
              urlCount: urlDetectionResult.urls.length,
              message: `Fetching ${urlDetectionResult.urls.length} event page${urlDetectionResult.urls.length !== 1 ? 's' : ''}...`,
            });

            updateProgress(queueItem.id, 30);

            const scrapedContent = await scrapeURLsBatch(urlDetectionResult.urls);

            const successfulScrapes = scrapedContent.results.filter(r => r.status === 'success');

            const scrapedTexts = successfulScrapes.map(result => {
              const content = result.title
                ? `${result.title}\n\n${result.text}`
                : result.text;
              return `${content}\n\n---\nOriginal Event: ${result.url}`;
            });

            combinedText = [
              urlDetectionResult.remainingText,
              ...scrapedTexts,
            ]
              .filter(t => t.trim())
              .join('\n\n');

            if (!combinedText.trim()) {
              throw new Error('Unable to extract content from the provided URLs. Please check the URLs and try again.');
            }
          }

          if (!combinedText.trim()) {
            throw new Error('Please enter some text or URLs to process.');
          }

          setUrlProcessingStatus({
            phase: 'extracting',
            message: 'Extracting events...',
          });

          updateProgress(queueItem.id, 50);

          const textBase64 = btoa(unescape(encodeURIComponent(inputText)));
          const textSizeBytes = new Blob([inputText]).size;

          const attachment: EventAttachment = {
            id: `attachment-${Date.now()}`,
            filename: 'original-input.txt',
            mimeType: 'text/plain',
            data: textBase64,
            type: 'original-text',
            size: textSizeBytes,
          };

          const batchId = `batch-${Date.now()}`;
          setBatchProcessing({
            id: batchId,
            events: [],
            isProcessing: true,
            source: 'text',
          });

          const response = await fetch('/api/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: combinedText, batch: true }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to process batch' }));
            throw new Error(errorData.error || 'Failed to process batch');
          }

          updateRateLimitFromHeaders(response.headers);

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('No response stream');
          }

          const decoder = new TextDecoder();
          let buffer = '';
          const allEvents: CalendarEvent[] = [];

          updateProgress(queueItem.id, 70);

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = JSON.parse(line.slice(6));

                if (data.error) {
                  throw new Error(data.error);
                }

                const chunk = data as StreamedEventChunk;

                if (chunk.isComplete) {
                  setBatchProcessing(prev => prev ? { ...prev, isProcessing: false } : null);
                  break;
                }

                if (chunk.events && chunk.events.length > 0) {
                  const newEvents = chunk.events.map(parsed =>
                    convertParsedToCalendarEvent(parsed, 'text', inputText, [attachment])
                  );

                  allEvents.push(...newEvents);

                  setUnsavedEvents(prev => [...prev, ...newEvents]);
                }
              }
            }
          }

          setUrlProcessingStatus({
            phase: 'complete',
            message: 'Complete',
          });

          setTimeout(() => {
            setUrlProcessingStatus(null);
          }, 3000);

          return allEvents;
        } catch (err) {
          const errorMessage = err instanceof Error
            ? err.message
            : 'Unable to extract event details from this text.';

          const processingId = `error-${Date.now()}`;
          setProcessingEvents(prev => [...prev, {
            id: processingId,
            type: 'text',
            status: 'error',
            error: errorMessage,
          }]);

          setUrlProcessingStatus(null);

          setTimeout(() => {
            setProcessingEvents(prev => prev.filter(p => p.id !== processingId));
          }, 5000);

          throw err;
        }
      }
    );
  };

  const handleSmartInputSubmit = async (data: { text: string; images: File[] }) => {
    const { text, images } = data;

    if (images.length > 0) {
      handleImageSelect(images);
    }

    if (text.trim().length > 0) {
      handleTextSubmit(text);
    }

    smartInputRef.current?.clear();
  };

  const handleError = (errorMessage: string) => {
    const processingId = `error-${Date.now()}`;
    setProcessingEvents(prev => [...prev, {
      id: processingId,
      type: 'image',
      status: 'error',
      error: errorMessage,
    }]);

    setTimeout(() => {
      setProcessingEvents(prev => prev.filter(p => p.id !== processingId));
    }, 5000);
  };

  const handleRemoveFromQueue = (id: string) => {
    setProcessingEvents(prev => prev.filter(p => p.id !== id));
  };

  const handleExportFromHistory = (event: CalendarEvent) => {
    exportToICS(event);
  };

  const handleEditFromHistory = (event: CalendarEvent) => {
    setEditingEvent(event);
    setTimeout(() => {
      const editSection = document.getElementById('edit-section');
      editSection?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleSaveEdit = (updatedEvent: CalendarEvent) => {
    if (!editingEvent) return;

    const isInUnsaved = unsavedEvents.some(e => e.id === editingEvent.id);
    if (isInUnsaved) {
      setUnsavedEvents(prev =>
        prev.map(e => e.id === editingEvent.id ? updatedEvent : e)
      );
      setEditingEvent(null);
      return;
    }

    deleteEvent(editingEvent.id);
    addEvent(updatedEvent);
    setEditingEvent(null);
  };

  const handleCancelEdit = () => {
    setEditingEvent(null);
  };

  const handleBatchEventEdit = (event: CalendarEvent) => {
    setEditingEvent(event);
    setTimeout(() => {
      const editSection = document.getElementById('edit-section');
      editSection?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleBatchEventDelete = (eventId: string) => {
    setUnsavedEvents(prev => prev.filter(e => e.id !== eventId));
  };

  const handleBatchEventExport = (event: CalendarEvent) => {
    exportToICS(event);
  };

  const handleCancelBatch = () => {
    setUnsavedEvents([]);
    setBatchProcessing(null);
  };

  const formatDate = (date: Date) => {
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <main className="min-h-screen rainbow-gradient-bg">
      <RateLimitBanner rateLimitInfo={rateLimitInfo} />

      <div className="w-full px-[14.28%] py-12">
        <header className="text-center mb-12">
          <h1 className="text-5xl font-black retro-rainbow-text tracking-wider">Event Every</h1>
          <p className="text-black text-sm">Transform image and text into calendar events</p>
        </header>

        {/* Smart input section */}
        <div className="border-2 border-black bg-white p-[5px] mb-12 h-[400px]">
          <SmartInput
            ref={smartInputRef}
            onSubmit={handleSmartInputSubmit}
            onError={handleError}
          />
        </div>

        {/* Error notifications */}
        <ErrorNotification
          errors={processingEvents.filter(e => e.status === 'error' && e.error).map(e => ({
            id: e.id,
            type: e.type,
            error: e.error!,
          }))}
          onDismiss={handleRemoveFromQueue}
        />

        {/* Unified processing and unsaved events section */}
        <UnsavedEventsSection
          events={unsavedEvents}
          imageProcessingStatuses={imageProcessingStatuses}
          urlProcessingStatus={urlProcessingStatus}
          isProcessing={batchProcessing?.isProcessing || false}
          onEdit={handleBatchEventEdit}
          onDelete={handleBatchEventDelete}
          onExport={handleBatchEventExport}
          onCancelAll={handleCancelBatch}
          onExportComplete={(events) => {
            events.forEach(event => addEvent(event));
            setUnsavedEvents([]);
          }}
        />

        {/* Event editor section */}
        {editingEvent && (
          <div id="edit-section" className="mb-12">
            <h2 className="text-2xl font-bold mb-4 text-black">Edit Event</h2>
            <EventEditor
              event={editingEvent}
              onSave={handleSaveEdit}
              onCancel={handleCancelEdit}
            />
          </div>
        )}

        {/* History section */}
        {events.length > 0 && (
          <div className="mb-12 max-h-[99vh] overflow-y-auto">
              <div className="border-2 border-black">
              {events.map((event, index) => (
                <div
                  key={event.id}
                  className={`p-4 bg-white ${index > 0 ? 'border-t-2 border-black' : ''}`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <InlineEventEditor
                        event={event}
                        onChange={(updatedEvent) => updateEvent(updatedEvent)}
                        showAttachments={true}
                      />
                    </div>
                    <button
                      onClick={() => deleteEvent(event.id)}
                      className="ml-2 text-black hover:text-gray-600 focus:outline-none flex-shrink-0"
                      aria-label={`Delete ${event.title}`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <p className="text-gray-500 text-xs mb-3">
                    Created: {formatDate(event.created)}
                  </p>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleExportFromHistory(event)}
                      className="flex-1 px-4 py-2 bg-black text-white border-2 border-black hover:bg-white hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                      aria-label={`Export ${event.title}`}
                    >
                      Export
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
