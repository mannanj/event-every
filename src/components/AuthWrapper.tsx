'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import PatternLock from './PatternLock';
import EmailRequestModal from './EmailRequestModal';

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, attempts, isLockedOut, lockoutMinutes, verifyPattern, logout } = useAuth();
  const [error, setError] = useState('');
  const [showDevLock, setShowDevLock] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  const isDevMode = process.env.NEXT_PUBLIC_DISABLE_AUTH === 'true';

  const handleVerify = async (input: number[]) => {
    const result = await verifyPattern(input);

    if (result === true) {
      setError('');
      setShowDevLock(false);
    } else if (typeof result === 'object') {
      if (result.isLockedOut) {
        setError('Whoa there! Too many tries. Take a breather.');
      } else if (result.attemptsLeft === 0) {
        setError('Not quite! No attempts remaining.');
      } else if (result.attemptsLeft === 1) {
        setError('Nope! Last chance—make it count.');
      } else {
        setError(`Not quite! ${result.attemptsLeft} attempts left.`);
      }
    } else {
      setError('Not quite! Try again.');
    }
  };

  const handleDevLock = () => {
    setShowDevLock(true);
    setError('');
  };

  const handleRequestAccess = () => {
    setShowEmailModal(true);
  };

  const handleCloseModal = () => {
    setShowEmailModal(false);
  };

  if (isDevMode) {
    if (showDevLock) {
      return (
        <>
          <PatternLock
            onSubmit={handleVerify}
            error={error}
            attemptsLeft={attempts}
          />
          {isLockedOut && (
            <div className="fixed bottom-32 left-1/2 transform -translate-x-1/2">
              <button
                onClick={handleRequestAccess}
                className="px-6 py-3 bg-black text-white hover:bg-white hover:text-black border-2 border-black transition-colors font-medium"
              >
                Request Access
              </button>
            </div>
          )}
          {showEmailModal && <EmailRequestModal onClose={handleCloseModal} />}
        </>
      );
    }

    return (
      <>
        {children}
        <button
          onClick={handleDevLock}
          className="fixed top-4 right-4 px-4 py-2 bg-white border-2 border-black hover:bg-black hover:text-white transition-colors text-sm z-50"
          aria-label="Lock application"
        >
          Lock
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
      <>
        <PatternLock
          onSubmit={handleVerify}
          error={error}
          attemptsLeft={attempts}
        />
        {isLockedOut && (
          <div className="fixed bottom-32 left-1/2 transform -translate-x-1/2">
            <button
              onClick={handleRequestAccess}
              className="px-6 py-3 bg-black text-white hover:bg-white hover:text-black border-2 border-black transition-colors font-medium"
            >
              Request Access
            </button>
          </div>
        )}
        {showEmailModal && <EmailRequestModal onClose={handleCloseModal} />}
      </>
    );
  }

  return <>{children}</>;
}
