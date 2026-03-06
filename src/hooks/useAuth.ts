'use client';

import { useState, useEffect } from 'react';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [attempts, setAttempts] = useState(3);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutMinutes, setLockoutMinutes] = useState(0);

  useEffect(() => {
    fetch('/api/auth/check')
      .then(res => res.json())
      .then(data => {
        setIsAuthenticated(data.authenticated === true);
      })
      .catch(() => {
        setIsAuthenticated(false);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const verifyPattern = async (input: number[]): Promise<boolean | { success: false; attemptsLeft: number; isLockedOut: boolean; lockoutMinutes: number; networkError?: boolean }> => {
    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pattern: input }),
      });

      const data = await response.json();

      if (response.status === 429) {
        setIsLockedOut(true);
        setLockoutMinutes(data.lockoutMinutes || 15);
        setAttempts(0);
        return {
          success: false,
          attemptsLeft: 0,
          isLockedOut: true,
          lockoutMinutes: data.lockoutMinutes || 15
        };
      }

      if (data.success) {
        setIsAuthenticated(true);
        setAttempts(3);
        setIsLockedOut(false);
        setLockoutMinutes(0);
        return true;
      }

      setAttempts(data.attemptsLeft ?? 0);

      if (data.lockedOut) {
        setIsLockedOut(true);
        setLockoutMinutes(data.lockoutMinutes || 15);
      }

      return {
        success: false,
        attemptsLeft: data.attemptsLeft ?? 0,
        isLockedOut: data.lockedOut || false,
        lockoutMinutes: data.lockoutMinutes || 0
      };
    } catch {
      return { success: false as const, attemptsLeft: attempts, isLockedOut: false, lockoutMinutes: 0, networkError: true };
    }
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setIsAuthenticated(false);
    setAttempts(3);
    setIsLockedOut(false);
    setLockoutMinutes(0);
  };

  return {
    isAuthenticated,
    isLoading,
    attempts,
    isLockedOut,
    lockoutMinutes,
    verifyPattern,
    logout,
  };
}
