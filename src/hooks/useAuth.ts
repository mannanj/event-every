'use client';

import { useState, useEffect } from 'react';

const AUTH_KEY = 'event-every-auth';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [attempts, setAttempts] = useState(3);

  useEffect(() => {
    const authState = sessionStorage.getItem(AUTH_KEY);
    setIsAuthenticated(authState === 'true');
    setIsLoading(false);
  }, []);

  const verifyPattern = async (input: string): Promise<boolean> => {
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
        sessionStorage.setItem(AUTH_KEY, 'true');
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
    sessionStorage.setItem(AUTH_KEY, 'false');
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
