'use client';

import { useState, useEffect } from 'react';

const AUTH_TIMESTAMP_KEY = 'event-every-auth-timestamp';
const AUTH_DURATION_MS = 48 * 60 * 60 * 1000; // 48 hours

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [attempts, setAttempts] = useState(3);

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

  const verifyPattern = async (input: number[]): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pattern: input }),
      });

      const data = await response.json();
      const isValid = data.success;

      if (isValid) {
        localStorage.setItem(AUTH_TIMESTAMP_KEY, Date.now().toString());
        setIsAuthenticated(true);
        setAttempts(3);
        return true;
      } else {
        setAttempts((prev) => prev - 1);
        return false;
      }
    } catch (error) {
      setAttempts((prev) => prev - 1);
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem(AUTH_TIMESTAMP_KEY);
    setIsAuthenticated(false);
    setAttempts(3);
  };

  return {
    isAuthenticated,
    isLoading,
    attempts,
    verifyPattern,
    logout,
  };
}
