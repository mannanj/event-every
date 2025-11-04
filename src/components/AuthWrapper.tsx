'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import PatternLock from './PatternLock';

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hasPattern, isLoading, setPattern, verifyPattern, logout } = useAuth();
  const [error, setError] = useState('');
  const [confirmPattern, setConfirmPattern] = useState<string | null>(null);

  const handleSetPattern = async (pattern: string) => {
    if (!confirmPattern) {
      setConfirmPattern(pattern);
      setError('');
      return;
    }

    if (pattern.toUpperCase() === confirmPattern.toUpperCase()) {
      await setPattern(pattern);
      setConfirmPattern(null);
      setError('');
    } else {
      setError('Input does not match. Try again.');
      setConfirmPattern(null);
    }
  };

  const handleVerifyPattern = async (pattern: string) => {
    const isValid = await verifyPattern(pattern);
    if (!isValid) {
      setError('Incorrect input. Try again.');
    } else {
      setError('');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (!hasPattern) {
      return (
        <div>
          <PatternLock
            mode="set"
            onPatternComplete={handleSetPattern}
            error={error}
          />
          {confirmPattern && (
            <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-white border-2 border-black px-4 py-2 text-sm">
              Confirm your input
            </div>
          )}
        </div>
      );
    }

    return (
      <PatternLock
        mode="verify"
        onPatternComplete={handleVerifyPattern}
        error={error}
      />
    );
  }

  return (
    <>
      {children}
      <button
        onClick={logout}
        className="fixed top-4 right-4 px-4 py-2 bg-white border-2 border-black hover:bg-black hover:text-white transition-colors text-sm z-50"
        aria-label="Lock app"
      >
        Lock
      </button>
    </>
  );
}
