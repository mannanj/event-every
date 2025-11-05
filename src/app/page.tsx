'use client';

import { useState, useRef } from 'react';
import ImageUpload, { ImageUploadHandle } from '@/components/ImageUpload';
import TextInput, { TextInputHandle } from '@/components/TextInput';
import EventEditor from '@/components/EventEditor';
import ProcessingSection from '@/components/ProcessingSection';
import ErrorNotification from '@/components/ErrorNotification';
import RateLimitBanner from '@/components/RateLimitBanner';
import { CalendarEvent, ParsedEvent, StreamedEventChunk, EventAttachment } from '@/types/event';
import { exportToICS } from '@/services/exporter';
import { useHistory } from '@/hooks/useHistory';
import { useProcessingQueue } from '@/hooks/useProcessingQueue';
import { deduplicateEvents } from '@/utils/deduplication';
import { detectURLs } from '@/services/urlDetector';
import { scrapeURLsBatch } from '@/services/webScraper';
import { QueueItem } from '@/services/processingQueue';

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
  const [imageProcessingStatuses, setImageProcessingStatuses] = useState<ImageProcessingStatus[]>([]);
  const [urlProcessingStatus, setUrlProcessingStatus] = useState<URLProcessingStatus | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [rateLimitInfo, setRateLimitInfo] = useState<{ remaining: number; total: number; resetTime: number } | undefined>();
  const { events, addEvent, deleteEvent } = useHistory();
  const { addToQueue, updateProgress } = useProcessingQueue();
  const imageUploadRef = useRef<ImageUploadHandle>(null);
  const textInputRef = useRef<TextInputHandle>(null);

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
    setBatchProcessing({
      id: batchId,
      events: [],
      isProcessing: true,
      source,
    });

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
              if (source === 'image') {
                imageUploadRef.current?.clear();
              } else if (source === 'text') {
                textInputRef.current?.clear();
              }
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

    imageUploadRef.current?.clear();

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

        setBatchProcessing(prev => {
          if (!prev) return null;
          const deduplicatedEvents = deduplicateEvents(prev.events);
          return {
            ...prev,
            events: deduplicatedEvents,
            isProcessing: false,
          };
        });

        setTimeout(() => {
          setImageProcessingStatuses([]);
        }, 10000);

        return allEvents;
      },
      { fileCount: files.length }
    );
  };

  const handleTextSubmit = async (text: string) => {
    textInputRef.current?.clear();

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

    if (batchProcessing) {
      const isInBatch = batchProcessing.events.some(e => e.id === editingEvent.id);
      if (isInBatch) {
        setBatchProcessing(prev => {
          if (!prev) return null;
          return {
            ...prev,
            events: prev.events.map(e => e.id === editingEvent.id ? updatedEvent : e),
          };
        });
        setEditingEvent(null);
        return;
      }
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
    setBatchProcessing(prev => {
      if (!prev) return null;
      return {
        ...prev,
        events: prev.events.filter(e => e.id !== eventId),
      };
    });
  };

  const handleBatchEventExport = (event: CalendarEvent) => {
    exportToICS(event);
  };

  const handleCancelBatch = () => {
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
    <main className="min-h-screen bg-white">
      <RateLimitBanner rateLimitInfo={rateLimitInfo} />

      <div className="w-full px-[14.28%] py-12">
        <header className="text-center mb-12">
          <h1 className="text-5xl font-bold text-black mb-3">Event Every</h1>
          <p className="text-gray-600">Transform images and text into calendar events</p>
        </header>

        {/* Single card input section */}
        <div className="border-2 border-black p-4 mb-12">
          <h2 className="text-lg font-medium mb-4 text-black">Add an image or enter text</h2>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <ImageUpload
                ref={imageUploadRef}
                onImageSelect={handleImageSelect}
                onError={handleError}
              />
            </div>

            <div className="flex-1">
              <TextInput
                ref={textInputRef}
                onTextSubmit={handleTextSubmit}
              />
            </div>
          </div>
        </div>

        {/* Error notifications */}
        <ErrorNotification
          errors={processingEvents}
          onDismiss={handleRemoveFromQueue}
        />

        {/* Unified Processing section */}
        <ProcessingSection
          imageProcessingStatuses={imageProcessingStatuses}
          urlProcessingStatus={urlProcessingStatus}
          batchProcessing={batchProcessing}
          onBatchEventEdit={handleBatchEventEdit}
          onBatchEventDelete={handleBatchEventDelete}
          onBatchEventExport={handleBatchEventExport}
          onCancelBatch={handleCancelBatch}
          onExportComplete={(events) => {
            events.forEach(event => addEvent(event));
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
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-4 text-black">Event History</h2>
            <div className="space-y-4">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="border-2 border-black p-4 bg-white hover:bg-gray-50 transition-colors"
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg flex-1">{event.title}</h3>
                    <button
                      onClick={() => deleteEvent(event.id)}
                      className="ml-2 text-black hover:text-gray-600 focus:outline-none"
                      aria-label={`Delete ${event.title}`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="space-y-1 mb-3 text-sm">
                    <p className="text-gray-700">
                      <span className="font-semibold">Start:</span> {formatDate(event.startDate)}
                    </p>
                    <p className="text-gray-700">
                      <span className="font-semibold">End:</span> {formatDate(event.endDate)}
                    </p>
                    {event.location && (
                      <p className="text-gray-700">
                        <span className="font-semibold">Location:</span> {event.location}
                      </p>
                    )}
                    {event.description && (
                      <p className="text-gray-700 line-clamp-2">
                        <span className="font-semibold">Description:</span> {event.description}
                      </p>
                    )}
                    <p className="text-gray-500 text-xs mt-2">
                      Created: {formatDate(event.created)}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleExportFromHistory(event)}
                      className="flex-1 px-4 py-2 bg-black text-white border-2 border-black hover:bg-white hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                      aria-label={`Export ${event.title}`}
                    >
                      Export
                    </button>
                    <button
                      onClick={() => handleEditFromHistory(event)}
                      className="flex-1 px-4 py-2 bg-white text-black border-2 border-black hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                      aria-label={`Edit ${event.title}`}
                    >
                      Edit
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
