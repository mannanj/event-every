'use client';

import { useState } from 'react';
import ImageUpload from '@/components/ImageUpload';
import TextInput from '@/components/TextInput';
import EventConfirmation from '@/components/EventConfirmation';
import EventEditor from '@/components/EventEditor';
import { CalendarEvent, ParsedEvent } from '@/types/event';

type InputMode = 'image' | 'text';
type ViewMode = 'input' | 'confirmation' | 'editing';

export default function Home() {
  const [inputMode, setInputMode] = useState<InputMode>('image');
  const [viewMode, setViewMode] = useState<ViewMode>('input');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentEvent, setCurrentEvent] = useState<CalendarEvent | null>(null);

  const convertParsedToCalendarEvent = (
    parsed: ParsedEvent,
    source: 'image' | 'text',
    originalInput?: string
  ): CalendarEvent => {
    const now = new Date();
    const startDate = parsed.startDate ? new Date(parsed.startDate) : now;
    const endDate = parsed.endDate ? new Date(parsed.endDate) : new Date(startDate.getTime() + 60 * 60 * 1000);

    return {
      id: `event-${Date.now()}`,
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

  const handleImageSelect = async (file: File) => {
    setError(null);
    setIsLoading(true);

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

      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          imageMimeType: mimeType,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse event from image' }));
        throw new Error(errorData.error || 'Failed to parse event from image');
      }

      const parsed: ParsedEvent = await response.json();
      const event = convertParsedToCalendarEvent(parsed, 'image', URL.createObjectURL(file));
      setCurrentEvent(event);
      setViewMode('confirmation');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to extract event details from this image. Please try a different image or enter the details manually.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleTextSubmit = async (text: string) => {
    setError(null);
    setIsLoading(true);

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
      setCurrentEvent(event);
      setViewMode('confirmation');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to extract event details from this text. Please check the format and try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
  };

  const handleEdit = () => {
    setViewMode('editing');
  };

  const handleSave = (updatedEvent: CalendarEvent) => {
    setCurrentEvent(updatedEvent);
    setViewMode('confirmation');
  };

  const handleCancel = () => {
    setViewMode('confirmation');
  };

  const handleExport = () => {
    console.log('Export event:', currentEvent);
  };

  const handleStartOver = () => {
    setCurrentEvent(null);
    setViewMode('input');
    setError(null);
  };

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <header className="text-center mb-12">
          <h1 className="text-5xl font-bold text-black mb-3">Event Every</h1>
          <p className="text-gray-600">Transform images and text into calendar events</p>
        </header>

        <div className="space-y-6">
          {viewMode === 'input' && (
            <>
              <div className="flex gap-2 border-b-2 border-gray-200">
                <button
                  onClick={() => setInputMode('image')}
                  disabled={isLoading}
                  aria-label="Switch to image upload mode"
                  aria-pressed={inputMode === 'image'}
                  className={`
                    flex-1 py-3 px-6 font-medium transition-all
                    focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2
                    ${
                      inputMode === 'image'
                        ? 'text-black border-b-2 border-black -mb-0.5'
                        : 'text-gray-500 hover:text-black'
                    }
                    ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                >
                  Image Upload
                </button>
                <button
                  onClick={() => setInputMode('text')}
                  disabled={isLoading}
                  aria-label="Switch to text input mode"
                  aria-pressed={inputMode === 'text'}
                  className={`
                    flex-1 py-3 px-6 font-medium transition-all
                    focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2
                    ${
                      inputMode === 'text'
                        ? 'text-black border-b-2 border-black -mb-0.5'
                        : 'text-gray-500 hover:text-black'
                    }
                    ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                >
                  Text Input
                </button>
              </div>

              {error && (
                <div
                  role="alert"
                  className="p-4 border-2 border-black bg-white"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-semibold text-black mb-1">Unable to Parse Event</p>
                      <p className="text-sm text-gray-600">{error}</p>
                    </div>
                    <button
                      onClick={() => setError(null)}
                      className="ml-4 text-black hover:text-gray-600 focus:outline-none"
                      aria-label="Dismiss error"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-8">
                {inputMode === 'image' ? (
                  <ImageUpload
                    onImageSelect={handleImageSelect}
                    onError={handleError}
                    isLoading={isLoading}
                  />
                ) : (
                  <TextInput
                    onTextSubmit={handleTextSubmit}
                    isLoading={isLoading}
                  />
                )}
              </div>
            </>
          )}

          {viewMode === 'confirmation' && currentEvent && (
            <>
              <button
                onClick={handleStartOver}
                className="mb-4 text-sm text-gray-600 hover:text-black focus:outline-none focus:underline"
              >
                ← Start Over
              </button>
              <EventConfirmation
                event={currentEvent}
                onEdit={handleEdit}
                onExport={handleExport}
              />
            </>
          )}

          {viewMode === 'editing' && currentEvent && (
            <>
              <button
                onClick={() => setViewMode('confirmation')}
                className="mb-4 text-sm text-gray-600 hover:text-black focus:outline-none focus:underline"
              >
                ← Back to Preview
              </button>
              <EventEditor
                event={currentEvent}
                onSave={handleSave}
                onCancel={handleCancel}
              />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
