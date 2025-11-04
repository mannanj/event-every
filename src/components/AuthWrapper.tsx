'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import PatternLock from './PatternLock';

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, attempts, verifyPattern, logout } = useAuth();
  const [error, setError] = useState('');
  const [showDevLock, setShowDevLock] = useState(false);

  const isDevMode = process.env.NEXT_PUBLIC_DISABLE_AUTH === 'true';

  const handleVerify = async (input: number[]) => {
    const isValid = await verifyPattern(input);

    if (!isValid) {
      if (attempts - 1 === 0) {
        setError('No attempts remaining. Please refresh the page to try again.');
      } else {
        setError(`Incorrect pattern. ${attempts - 1} attempt${attempts - 1 !== 1 ? 's' : ''} remaining.`);
      }
    } else {
      setError('');
      setShowDevLock(false);
    }
  };

  const handleDevLock = () => {
    setShowDevLock(true);
    setError('');
  };

  if (isDevMode) {
    if (showDevLock) {
      return (
        <PatternLock
          onSubmit={handleVerify}
          error={error}
          attemptsLeft={attempts}
        />
      );
    }

    return (
      <>
        {children}
        <button
          onClick={handleDevLock}
          className="fixed top-4 right-4 px-4 py-2 bg-white border-2 border-black hover:bg-black hover:text-white transition-colors text-sm z-50"
          aria-label="Test pattern lock"
        >
          🔒 Test Lock
        </button>
      </>
    );
  }

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
    return (
      <PatternLock
        onSubmit={handleVerify}
        error={error}
        attemptsLeft={attempts}
      />
    );
  }

  return <>{children}</>;
}
