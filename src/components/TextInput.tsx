'use client';

import { useState, useCallback, useImperativeHandle, forwardRef } from 'react';

interface TextInputProps {
  onTextSubmit: (text: string) => void;
  isLoading?: boolean;
}

export interface TextInputHandle {
  clear: () => void;
}

const MIN_TEXT_LENGTH = 3;

const TextInput = forwardRef<TextInputHandle, TextInputProps>(
  function TextInput({ onTextSubmit, isLoading = false }, ref) {
    const [text, setText] = useState('');
    const [error, setError] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      clear: () => {
        setText('');
        setError(null);
      },
    }));

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

  return (
    <div className="w-full space-y-4">
      <div className="relative">
        <textarea
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
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
            ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 rounded-lg">
            <div className="text-center space-y-2">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-black border-t-transparent mx-auto" />
              <p className="text-sm text-gray-600">Parsing event details...</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p id="text-input-error" className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end">
        <button
          onClick={handleSubmit}
          disabled={isLoading || text.trim().length < MIN_TEXT_LENGTH}
          aria-label="Parse event from text"
          className={`
            px-6 py-2 rounded-lg font-medium
            transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2
            ${
              isLoading || text.trim().length < MIN_TEXT_LENGTH
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-black text-white hover:bg-gray-800'
            }
          `}
        >
          Parse Event
        </button>
      </div>
    </div>
  );
});

export default TextInput;
