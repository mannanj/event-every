'use client';

import { useState, useRef } from 'react';
import ImageUpload, { ImageUploadHandle } from '@/components/ImageUpload';
import TextInput, { TextInputHandle } from '@/components/TextInput';
import EventEditor from '@/components/EventEditor';
import BatchEventList from '@/components/BatchEventList';
import { CalendarEvent, ParsedEvent, StreamedEventChunk } from '@/types/event';
import { exportToICS } from '@/services/exporter';
import { useHistory } from '@/hooks/useHistory';

interface ProcessingEvent {
  id: string;
  type: 'image' | 'text';
  status: 'processing' | 'success' | 'error';
  event?: CalendarEvent;
  error?: string;
}

interface BatchProcessing {
  id: string;
  events: CalendarEvent[];
  isProcessing: boolean;
  totalExpected?: number;
}

export default function Home() {
  const [processingEvents, setProcessingEvents] = useState<ProcessingEvent[]>([]);
  const [batchProcessing, setBatchProcessing] = useState<BatchProcessing | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const { events, addEvent, deleteEvent } = useHistory();
  const imageUploadRef = useRef<ImageUploadHandle>(null);
  const textInputRef = useRef<TextInputHandle>(null);

  const convertParsedToCalendarEvent = (
    parsed: ParsedEvent,
    source: 'image' | 'text',
    originalInput?: string
  ): CalendarEvent => {
    const now = new Date();
    const startDate = parsed.startDate ? new Date(parsed.startDate) : now;
    const endDate = parsed.endDate ? new Date(parsed.endDate) : new Date(startDate.getTime() + 60 * 60 * 1000);

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
    };
  };

  const handleBatchStream = async (
    source: 'image' | 'text',
    body: Record<string, unknown>,
    originalInput?: string
  ) => {
    const batchId = `batch-${Date.now()}`;
    setBatchProcessing({
      id: batchId,
      events: [],
      isProcessing: true,
    });

    try {
      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, batch: true }),
      });

      if (!response.ok) {
        throw new Error('Failed to process batch');
      }

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
              }
              break;
            }

            if (chunk.events && chunk.events.length > 0) {
              const newEvents = chunk.events.map(parsed =>
                convertParsedToCalendarEvent(parsed, source, originalInput)
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

  const handleImageSelect = async (file: File) => {
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

      await handleBatchStream('image', {
        imageBase64: base64,
        imageMimeType: mimeType,
      }, URL.createObjectURL(file));
    } catch (err) {
      const errorMessage = err instanceof Error
        ? err.message
        : 'Unable to extract event details from this image.';

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
    }
  };

  const handleTextSubmit = async (text: string) => {
    const processingId = `processing-${Date.now()}`;

    setProcessingEvents(prev => [...prev, {
      id: processingId,
      type: 'text',
      status: 'processing',
    }]);

    try {
      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse event from text' }));
        throw new Error(errorData.error || 'Failed to parse event from text');
      }

      const parsed: ParsedEvent = await response.json();
      const event = convertParsedToCalendarEvent(parsed, 'text', text);

      setProcessingEvents(prev =>
        prev.map(p => p.id === processingId ? { ...p, status: 'success', event } : p)
      );

      setTimeout(() => {
        setProcessingEvents(prev => prev.filter(p => p.id !== processingId));
        addEvent(event);
        textInputRef.current?.clear();
      }, 2000);
    } catch (err) {
      const errorMessage = err instanceof Error
        ? err.message
        : 'Unable to extract event details from this text.';

      setProcessingEvents(prev =>
        prev.map(p => p.id === processingId ? { ...p, status: 'error', error: errorMessage } : p)
      );

      setTimeout(() => {
        setProcessingEvents(prev => prev.filter(p => p.id !== processingId));
      }, 5000);
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

  const handleSaveBatch = () => {
    if (!batchProcessing) return;

    batchProcessing.events.forEach(event => {
      addEvent(event);
    });

    setBatchProcessing(null);
  };

  const handleCancelBatch = () => {
    setBatchProcessing(null);
  };

  const formatDate = (date: Date) => {
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
                isLoading={batchProcessing?.isProcessing || false}
              />
            </div>

            <div className="flex-1">
              <TextInput
                ref={textInputRef}
                onTextSubmit={handleTextSubmit}
                isLoading={false}
              />
            </div>
          </div>
        </div>

        {/* Batch processing section */}
        {batchProcessing && (
          <div className="mb-12">
            <BatchEventList
              events={batchProcessing.events}
              isProcessing={batchProcessing.isProcessing}
              totalExpected={batchProcessing.totalExpected}
              onEdit={handleBatchEventEdit}
              onDelete={handleBatchEventDelete}
              onExport={handleBatchEventExport}
              onCancel={handleCancelBatch}
              onSaveToHistory={(events) => {
                events.forEach(event => addEvent(event));
              }}
            />
          </div>
        )}

        {/* Processing queue section */}
        {processingEvents.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-4 text-black">Processing</h2>
            <div className="space-y-4">
              {processingEvents.map((item) => (
                <div
                  key={item.id}
                  className={`border-2 p-4 ${
                    item.status === 'error' ? 'border-red-500 bg-red-50' :
                    item.status === 'success' ? 'border-green-500 bg-green-50' :
                    'border-black bg-white'
                  }`}
                >
                  {item.status === 'processing' && (
                    <div className="flex items-center gap-3">
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-black border-t-transparent" />
                      <span className="text-black flex-1">Processing {item.type} input...</span>
                      <button
                        onClick={() => handleRemoveFromQueue(item.id)}
                        className="ml-2 text-black hover:text-gray-600 focus:outline-none"
                        aria-label="Cancel processing"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}

                  {item.status === 'success' && item.event && (
                    <div className="flex items-center gap-3">
                      <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <div className="flex-1">
                        <span className="font-bold text-black">{item.event.title}</span>
                        <span className="text-sm text-gray-600 ml-2">
                          {formatDate(item.event.startDate)}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemoveFromQueue(item.id)}
                        className="ml-2 text-black hover:text-gray-600 focus:outline-none"
                        aria-label="Remove from queue"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}

                  {item.status === 'error' && (
                    <div className="flex items-center gap-3">
                      <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      <span className="text-red-600 flex-1">{item.error}</span>
                      <button
                        onClick={() => handleRemoveFromQueue(item.id)}
                        className="ml-2 text-black hover:text-gray-600 focus:outline-none"
                        aria-label="Remove from queue"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

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
