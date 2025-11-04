'use client';

import { useState } from 'react';

interface PatternLockProps {
  onSubmit: (input: string) => Promise<void>;
  error?: string;
  attemptsLeft: number;
}

export default function PatternLock({ onSubmit, error, attemptsLeft }: PatternLockProps) {
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isSubmitting) {
      setIsSubmitting(true);
      await onSubmit(input.toUpperCase());
      setInput('');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white p-8">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold mb-2">Unlock</h1>
        <p className="text-sm text-gray-600 mb-2">
          Enter the letter to unlock
        </p>
        <p className="text-xs text-gray-500">
          Attempts remaining: {attemptsLeft}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          className="w-full px-4 py-3 border-2 border-black text-center text-4xl focus:outline-none focus:ring-2 focus:ring-black uppercase"
          placeholder="L"
          maxLength={1}
          autoFocus
          autoComplete="off"
        />

        <button
          type="submit"
          disabled={isSubmitting || attemptsLeft === 0}
          className="w-full mt-4 px-4 py-3 bg-black text-white hover:bg-white hover:text-black border-2 border-black transition-colors font-medium disabled:bg-gray-300 disabled:text-gray-500 disabled:border-gray-300 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Verifying...' : 'Unlock'}
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
