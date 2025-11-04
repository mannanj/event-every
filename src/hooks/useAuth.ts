'use client';

import { useState, useEffect } from 'react';

const PATTERN_KEY = 'event-every-pattern';
const AUTH_KEY = 'event-every-auth';

async function hashPattern(pattern: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pattern.toUpperCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasPattern, setHasPattern] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedPattern = localStorage.getItem(PATTERN_KEY);
    const authState = localStorage.getItem(AUTH_KEY);

    setHasPattern(!!storedPattern);
    setIsAuthenticated(authState === 'true');
    setIsLoading(false);
  }, []);

  const setPattern = async (pattern: string) => {
    const hash = await hashPattern(pattern);
    localStorage.setItem(PATTERN_KEY, hash);
    localStorage.setItem(AUTH_KEY, 'true');
    setHasPattern(true);
    setIsAuthenticated(true);
  };

  const verifyPattern = async (pattern: string): Promise<boolean> => {
    const storedHash = localStorage.getItem(PATTERN_KEY);
    if (!storedHash) return false;

    const hash = await hashPattern(pattern);
    const isValid = hash === storedHash;

    if (isValid) {
      localStorage.setItem(AUTH_KEY, 'true');
      setIsAuthenticated(true);
    }

    return isValid;
  };

  const logout = () => {
    localStorage.setItem(AUTH_KEY, 'false');
    setIsAuthenticated(false);
  };

  const resetPattern = () => {
    localStorage.removeItem(PATTERN_KEY);
    localStorage.removeItem(AUTH_KEY);
    setHasPattern(false);
    setIsAuthenticated(false);
  };

  return {
    isAuthenticated,
    hasPattern,
    isLoading,
    setPattern,
    verifyPattern,
    logout,
    resetPattern,
  };
}
