'use client';

import { useState, KeyboardEvent } from 'react';

interface PatternLockProps {
  mode: 'set' | 'verify';
  onPatternComplete: (pattern: string) => void;
  error?: string;
}

export default function PatternLock({ mode, onPatternComplete, error }: PatternLockProps) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onPatternComplete(input);
      setInput('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white p-8">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold mb-2">
          {mode === 'set' ? 'Set Lock' : 'Unlock'}
        </h1>
        <p className="text-sm text-gray-600">
          {mode === 'set'
            ? 'Enter "L" to set your lock'
            : 'Enter "L" to unlock'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-4 py-3 border-2 border-black text-center text-2xl focus:outline-none focus:ring-2 focus:ring-black uppercase"
          placeholder="L"
          maxLength={1}
          autoFocus
        />

        <button
          type="submit"
          className="w-full mt-4 px-4 py-3 bg-black text-white hover:bg-white hover:text-black border-2 border-black transition-colors font-medium"
        >
          {mode === 'set' ? 'Set Lock' : 'Unlock'}
        </button>
      </form>

      {error && (
        <p className="mt-4 text-sm text-black border border-black px-4 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
