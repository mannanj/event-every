'use client';

import { useState, useCallback, useImperativeHandle, forwardRef } from 'react';

interface LinkInputProps {
  onLinkSubmit: (url: string) => void;
  isLoading?: boolean;
}

export interface LinkInputHandle {
  clear: () => void;
}

const MIN_URL_LENGTH = 10;

const isValidURL = (urlString: string): boolean => {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const LinkInput = forwardRef<LinkInputHandle, LinkInputProps>(
  function LinkInput({ onLinkSubmit, isLoading = false }, ref) {
    const [url, setUrl] = useState('');
    const [error, setError] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      clear: () => {
        setUrl('');
        setError(null);
      },
    }));

  const handleSubmit = useCallback(() => {
    setError(null);

    const trimmedUrl = url.trim();

    if (trimmedUrl.length < MIN_URL_LENGTH) {
      setError('Please enter a valid URL');
      return;
    }

    if (!isValidURL(trimmedUrl)) {
      setError('Please enter a valid http:// or https:// URL');
      return;
    }

    onLinkSubmit(trimmedUrl);
  }, [url, onLinkSubmit]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    if (error) {
      setError(null);
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className="relative">
        <input
          type="url"
          value={url}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          placeholder="Paste event page URL here... (e.g., https://www.meetup.com/group/events/123)"
          aria-label="Enter event page URL"
          aria-describedby={error ? 'link-input-error' : undefined}
          aria-invalid={error ? 'true' : 'false'}
          className={`
            w-full px-4 py-3 border-2 rounded-lg
            text-black placeholder-gray-400 bg-white
            transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2
            ${error ? 'border-red-500' : 'border-gray-300 hover:border-black'}
            ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 rounded-lg">
            <div className="text-center space-y-2">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-black border-t-transparent mx-auto" />
              <p className="text-sm text-gray-600">Fetching event details...</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p id="link-input-error" className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end">
        <button
          onClick={handleSubmit}
          disabled={isLoading || url.trim().length < MIN_URL_LENGTH}
          aria-label="Fetch event from URL"
          className={`
            px-6 py-2 rounded-lg font-medium
            transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2
            ${
              isLoading || url.trim().length < MIN_URL_LENGTH
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-black text-white hover:bg-gray-800'
            }
          `}
        >
          Fetch Event
        </button>
      </div>
    </div>
  );
});

export default LinkInput;
