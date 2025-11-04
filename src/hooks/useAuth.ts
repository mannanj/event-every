'use client';

import { useState, useEffect } from 'react';

const AUTH_TIMESTAMP_KEY = 'event-every-auth-timestamp';
const AUTH_DURATION_MS = 48 * 60 * 60 * 1000; // 48 hours

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [attempts, setAttempts] = useState(3);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutMinutes, setLockoutMinutes] = useState(0);

  const checkAuthStatus = () => {
    const authTimestamp = localStorage.getItem(AUTH_TIMESTAMP_KEY);

    if (!authTimestamp) {
      return false;
    }

    const timestamp = parseInt(authTimestamp, 10);
    const now = Date.now();
    const hasExpired = now - timestamp > AUTH_DURATION_MS;

    if (hasExpired) {
      localStorage.removeItem(AUTH_TIMESTAMP_KEY);
      return false;
    }

    return true;
  };

  useEffect(() => {
    const isAuth = checkAuthStatus();
    setIsAuthenticated(isAuth);
    setIsLoading(false);
  }, []);

  const verifyPattern = async (input: number[]): Promise<boolean | { success: false; attemptsLeft: number; isLockedOut: boolean; lockoutMinutes: number }> => {
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
        localStorage.setItem(AUTH_TIMESTAMP_KEY, Date.now().toString());
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
    } catch (error) {
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem(AUTH_TIMESTAMP_KEY);
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
