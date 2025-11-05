'use client';

import { useState, useCallback, useImperativeHandle, forwardRef, useEffect } from 'react';
import URLPill from './URLPill';

interface TextInputProps {
  onTextSubmit: (text: string) => void;
}

export interface TextInputHandle {
  clear: () => void;
}

const MIN_TEXT_LENGTH = 3;

const URL_REGEX = /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*))/gi;

const TextInput = forwardRef<TextInputHandle, TextInputProps>(
  function TextInput({ onTextSubmit }, ref) {
    const [text, setText] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [detectedUrls, setDetectedUrls] = useState<string[]>([]);

    useImperativeHandle(ref, () => ({
      clear: () => {
        setText('');
        setError(null);
        setDetectedUrls([]);
      },
    }));

    useEffect(() => {
      const matches = text.match(URL_REGEX);
      if (matches) {
        const uniqueUrls = Array.from(new Set(matches));
        setDetectedUrls(uniqueUrls);
      } else {
        setDetectedUrls([]);
      }
    }, [text]);

  const handleSubmit = useCallback(() => {
    setError(null);

    const trimmedText = text.trim();

    if (trimmedText.length < MIN_TEXT_LENGTH) {
      setError('Please enter at least 3 characters');
      return;
    }

    onTextSubmit(trimmedText);
  }, [text, onTextSubmit]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (error) {
      setError(null);
    }
  };

  const handleRemoveUrl = (urlToRemove: string) => {
    setText(prevText => prevText.replace(urlToRemove, '').trim());
  };

  return (
    <div className="w-full space-y-4">
      <div className="relative">
        <textarea
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Paste event details here... (e.g., 'Team meeting tomorrow at 3pm in Conference Room A')"
          aria-label="Enter event details as text"
          aria-describedby={error ? 'text-input-error' : undefined}
          aria-invalid={error ? 'true' : 'false'}
          rows={6}
          className={`
            w-full px-4 py-3 border-2 rounded-lg
            text-black placeholder-gray-400 bg-white
            resize-none
            transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2
            ${error ? 'border-red-500' : 'border-gray-300 hover:border-black'}
          `}
        />
      </div>

      {error && (
        <p id="text-input-error" className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {detectedUrls.length > 0 && (
        <div
          className="flex flex-wrap gap-1.5 items-center"
          aria-label="Detected URLs"
        >
          {detectedUrls.map((url, index) => (
            <URLPill
              key={`${url}-${index}`}
              url={url}
              onRemove={() => handleRemoveUrl(url)}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-end">
        <button
          onClick={handleSubmit}
          disabled={text.trim().length < MIN_TEXT_LENGTH}
          aria-label="Parse event from text"
          className={`
            px-6 py-2 rounded-lg font-medium
            transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2
            ${
              text.trim().length < MIN_TEXT_LENGTH
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-black text-white hover:bg-gray-800'
            }
          `}
        >
          Transform
        </button>
      </div>
    </div>
  );
});

export default TextInput;
