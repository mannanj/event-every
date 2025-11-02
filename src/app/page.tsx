'use client';

import { useState } from 'react';
import ImageUpload from '@/components/ImageUpload';
import TextInput from '@/components/TextInput';

type InputMode = 'image' | 'text';

export default function Home() {
  const [inputMode, setInputMode] = useState<InputMode>('image');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImageSelect = async (file: File) => {
    setError(null);
    setIsLoading(true);

    // TODO: Implement OCR processing
    console.log('Processing image:', file.name);

    // Placeholder - will be replaced with actual OCR service
    setTimeout(() => {
      setIsLoading(false);
      console.log('Image processed');
    }, 2000);
  };

  const handleTextSubmit = async (text: string) => {
    setError(null);
    setIsLoading(true);

    // TODO: Implement text parsing
    console.log('Parsing text:', text);

    // Placeholder - will be replaced with actual parsing service
    setTimeout(() => {
      setIsLoading(false);
      console.log('Text parsed');
    }, 2000);
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
  };

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <header className="text-center mb-12">
          <h1 className="text-5xl font-bold text-black mb-3">Event Every</h1>
          <p className="text-gray-600">Transform images and text into calendar events</p>
        </header>

        <div className="space-y-6">
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
              className="p-4 bg-red-50 border border-red-200 rounded-lg"
            >
              <p className="text-sm text-red-600">{error}</p>
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
        </div>
      </div>
    </main>
  );
}
