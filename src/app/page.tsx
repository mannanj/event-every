'use client';

import { useState, useRef, useEffect } from 'react';
import SmartInput, { SmartInputHandle } from '@/components/SmartInput';
import UnsavedEventsSection from '@/components/UnsavedEventsSection';
import ErrorNotification from '@/components/ErrorNotification';
import RateLimitBanner from '@/components/RateLimitBanner';
import InlineEventEditor from '@/components/InlineEventEditor';
import { CalendarEvent, ParsedEvent, StreamedEventChunk, EventAttachment, EventSortOption } from '@/types/event';
import { exportToICS } from '@/services/exporter';
import { useHistory } from '@/hooks/useHistory';
import { useProcessingQueue } from '@/hooks/useProcessingQueue';
import { detectURLs } from '@/services/urlDetector';
import { scrapeURLsBatch } from '@/services/webScraper';
import { QueueItem } from '@/services/processingQueue';
import { eventStorage } from '@/services/storage';
import { parseICSFile } from '@/services/icsParser';

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
  const [rateLimitInfo, setRateLimitInfo] = useState<{ remaining: number; total: number; resetTime: number } | undefined>();
  const [hasLoadedTempEvents, setHasLoadedTempEvents] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const { events, addEvent, deleteEvent, updateEvent, sortOption, setSortOption, dateRange, setDateRange } = useHistory();
  const [totalEventsInStorage, setTotalEventsInStorage] = useState(0);
  const { addToQueue, updateProgress } = useProcessingQueue();
  const smartInputRef = useRef<SmartInputHandle>(null);
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);

  useEffect(() => {
    const result = eventStorage.getTempUnsavedEvents();
    if (result.success && result.data && result.data.length > 0) {
      setUnsavedEvents(result.data);
    }
    setHasLoadedTempEvents(true);

    const allEventsResult = eventStorage.getAllEvents();
    if (allEventsResult.success && allEventsResult.data) {
      setTotalEventsInStorage(allEventsResult.data.length);
    }
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
      url: parsed.url,
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

  const handleSmartInputSubmit = async (data: { text: string; images: File[]; calendarFiles: File[] }) => {
    const { text, images, calendarFiles } = data;

    if (images.length > 0) {
      handleImageSelect(images);
    }

    if (calendarFiles.length > 0) {
      handleCalendarFilesSubmit(calendarFiles);
    }

    if (text.trim().length > 0) {
      handleTextSubmit(text);
    }

    smartInputRef.current?.clear();
  };

  const handleCalendarFilesSubmit = async (files: File[]) => {
    for (const file of files) {
      try {
        const events = await parseICSFile(file);

        if (events.length > 0) {
          setUnsavedEvents(prev => [...prev, ...events]);
        }
      } catch (error) {
        const errorMessage = error instanceof Error
          ? `Failed to parse ${file.name}: ${error.message}`
          : `Failed to parse ${file.name}`;

        const processingId = `error-${Date.now()}`;
        setProcessingEvents(prev => [...prev, {
          id: processingId,
          type: 'text',
          status: 'error',
          error: errorMessage,
        }]);

        setTimeout(() => {
          setProcessingEvents(prev => prev.filter(p => p.id !== processingId));
        }, 5000);
      }
    }
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

  const handleDeleteEvent = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (deleteConfirmId) {
      deleteEvent(deleteConfirmId);
      setDeleteConfirmId(null);

      const allEventsResult = eventStorage.getAllEvents();
      if (allEventsResult.success && allEventsResult.data) {
        setTotalEventsInStorage(allEventsResult.data.length - 1);
      }
    }
  };

  const cancelDelete = () => {
    setDeleteConfirmId(null);
  };

  const handleBatchEventEdit = (updatedEvent: CalendarEvent) => {
    setUnsavedEvents(prev =>
      prev.map(e => e.id === updatedEvent.id ? updatedEvent : e)
    );
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

  const handleSortChange = (value: string) => {
    const option = value as EventSortOption;
    setSortOption(option);
    if (option === 'custom-range') {
      setShowDateRangePicker(true);
    } else {
      setShowDateRangePicker(false);
      setDateRange(null);
    }
  };

  const handleDateRangeSubmit = (start: string | Date, end: string | Date) => {
    const startDate = typeof start === 'string' ? new Date(start) : start;
    const endDate = typeof end === 'string' ? new Date(end) : end;
    if (typeof end === 'string') {
      endDate.setHours(23, 59, 59, 999);
    }
    setDateRange({ start: startDate, end: endDate });
    setSortOption('custom-range');
    setShowDateRangePicker(false);
  };

  return (
    <main className="min-h-screen rainbow-gradient-bg">
      <RateLimitBanner rateLimitInfo={rateLimitInfo} />

      <div className="w-full px-[14.28%] py-12">
        <header className="text-center mb-12">
          <h1 className="text-5xl font-black retro-rainbow-text tracking-wider">Event Every</h1>
          <p className="text-black text-sm">From anything to your calendar. Instantly.</p>
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
            setTotalEventsInStorage(prev => prev + events.length);
          }}
        />

        {/* History section */}
        {totalEventsInStorage > 0 && (
          <div className="mb-12">
            <div className="mb-2 flex gap-4 items-center">
              <label htmlFor="sort-select" className="text-black font-semibold">
                Sort by:
              </label>
              <select
                id="sort-select"
                value={sortOption}
                onChange={(e) => handleSortChange(e.target.value)}
                onFocus={(e) => {
                  if (e.target.value === 'custom-range') {
                    setShowDateRangePicker(true);
                  }
                }}
                className="px-4 py-2 border-2 border-black bg-white text-black focus:outline-none focus:ring-2 focus:ring-black"
              >
                <option value="upcoming">Upcoming Events</option>
                <option value="created-newest">Recently Created</option>
                <option value="created-oldest">Oldest First</option>
                <option value="today">Today</option>
                <option value="custom-range">Custom</option>
              </select>
            </div>

            {events.length > 0 ? (
            <div className="max-h-[99vh] overflow-y-auto">
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
                      onClick={() => handleDeleteEvent(event.id)}
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
            ) : (
              <div className="border-2 border-black bg-white p-8 text-center">
                <p className="text-gray-600">No events match the current filter. Try a different sort option.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {deleteConfirmId && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center"
            onClick={cancelDelete}
          >
            <div
              className="bg-white border-2 border-black p-8 max-w-sm mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-center mb-6 font-semibold">
                Do you want to delete this event? This is irreversible.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={cancelDelete}
                  className="flex-1 px-6 py-2 bg-white text-black border-2 border-black hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                >
                  No
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-6 py-2 bg-black text-white border-2 border-black hover:bg-white hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {showDateRangePicker && (
        <div
          className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowDateRangePicker(false);
            setSortOption('created-newest');
          }}
        >
          <div
            className="bg-white border-2 border-black p-8 w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-6">Select Date Range</h2>

            <div className="mb-6">
              <p className="text-sm font-semibold mb-3">Quick Presets:</p>
              <div className="grid grid-cols-6 gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const start = new Date(now.getTime() - 60 * 60 * 1000);
                    handleDateRangeSubmit(start, now);
                  }}
                  className="px-2 py-2 text-xs bg-white text-black border-2 border-black hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                >
                  Last Hour
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    handleDateRangeSubmit(start, now);
                  }}
                  className="px-2 py-2 text-xs bg-white text-black border-2 border-black hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                >
                  Last 24h
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const start = new Date(now.getTime() - 48 * 60 * 60 * 1000);
                    handleDateRangeSubmit(start, now);
                  }}
                  className="px-2 py-2 text-xs bg-white text-black border-2 border-black hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                >
                  Last 48h
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    handleDateRangeSubmit(start, now);
                  }}
                  className="px-2 py-2 text-xs bg-white text-black border-2 border-black hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                >
                  Last Week
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    handleDateRangeSubmit(start, now);
                  }}
                  className="px-2 py-2 text-xs bg-white text-black border-2 border-black hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                >
                  Last Month
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const start = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
                    handleDateRangeSubmit(start, now);
                  }}
                  className="px-2 py-2 text-xs bg-black text-white border-2 border-black hover:bg-white hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                >
                  Last 3 Days
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const end = new Date(now.getTime() + 60 * 60 * 1000);
                    handleDateRangeSubmit(now, end);
                  }}
                  className="px-2 py-2 text-xs bg-white text-black border-2 border-black hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                >
                  Next Hour
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                    handleDateRangeSubmit(now, end);
                  }}
                  className="px-2 py-2 text-xs bg-white text-black border-2 border-black hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                >
                  Next 24h
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const end = new Date(now.getTime() + 48 * 60 * 60 * 1000);
                    handleDateRangeSubmit(now, end);
                  }}
                  className="px-2 py-2 text-xs bg-white text-black border-2 border-black hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                >
                  Next 48h
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                    handleDateRangeSubmit(now, end);
                  }}
                  className="px-2 py-2 text-xs bg-white text-black border-2 border-black hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                >
                  Next Week
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
                    handleDateRangeSubmit(now, end);
                  }}
                  className="px-2 py-2 text-xs bg-white text-black border-2 border-black hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                >
                  Next Month
                </button>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const start = formData.get('start') as string;
                const end = formData.get('end') as string;
                if (start && end) {
                  handleDateRangeSubmit(start, end);
                }
              }}
            >
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <label htmlFor="start-date" className="block mb-2 font-semibold">
                    Start Date
                  </label>
                  <input
                    type="date"
                    id="start-date"
                    name="start"
                    defaultValue={(() => {
                      const now = new Date();
                      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
                      return threeDaysAgo.toISOString().split('T')[0];
                    })()}
                    required
                    className="w-full px-4 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
                <div>
                  <label htmlFor="end-date" className="block mb-2 font-semibold">
                    End Date
                  </label>
                  <input
                    type="date"
                    id="end-date"
                    name="end"
                    defaultValue={new Date().toISOString().split('T')[0]}
                    required
                    className="w-full px-4 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
              </div>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowDateRangePicker(false);
                    setSortOption('created-newest');
                  }}
                  className="flex-1 px-6 py-2 bg-white text-black border-2 border-black hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-2 bg-black text-white border-2 border-black hover:bg-white hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                >
                  Apply
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
