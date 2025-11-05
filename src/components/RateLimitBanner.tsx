'use client';

import { useState, useEffect } from 'react';

interface RateLimitInfo {
  remaining: number;
  total: number;
  resetTime: number;
}

interface RateLimitBannerProps {
  rateLimitInfo?: RateLimitInfo;
}

export default function RateLimitBanner({ rateLimitInfo }: RateLimitBannerProps) {
  const [timeUntilReset, setTimeUntilReset] = useState('');

  useEffect(() => {
    if (!rateLimitInfo?.resetTime) return;

    const updateTimeRemaining = () => {
      const now = Date.now();
      const diff = rateLimitInfo.resetTime - now;

      if (diff <= 0) {
        setTimeUntilReset('Resetting soon...');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (hours > 0) {
        setTimeUntilReset(`${hours}h ${minutes}m`);
      } else {
        setTimeUntilReset(`${minutes}m`);
      }
    };

    updateTimeRemaining();
    const interval = setInterval(updateTimeRemaining, 60000);

    return () => clearInterval(interval);
  }, [rateLimitInfo?.resetTime]);

  if (!rateLimitInfo) return null;

  const { remaining, total } = rateLimitInfo;

  if (remaining >= 10) return null;

  const percentage = (remaining / total) * 100;

  const isLow = remaining <= 1;
  const isMedium = remaining === 2;

  return (
    <div className="fixed top-4 right-4 z-50 bg-white border-2 border-black p-4 min-w-[200px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">Daily Limit</span>
        <span className="text-lg font-bold">
          {remaining}/{total}
        </span>
      </div>

      <div className="w-full h-2 bg-gray-200 border border-black mb-2">
        <div
          className={`h-full transition-all duration-300 ${
            isLow ? 'bg-black' : isMedium ? 'bg-gray-600' : 'bg-gray-800'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {timeUntilReset && (
        <p className="text-xs text-gray-600">
          Resets in {timeUntilReset}
        </p>
      )}

      {remaining === 0 && (
        <p className="text-xs font-medium mt-2">
          Daily limit reached. Try again after reset.
        </p>
      )}

      {isLow && remaining > 0 && (
        <p className="text-xs font-medium mt-2">
          {remaining} event{remaining === 1 ? '' : 's'} remaining
        </p>
      )}
    </div>
  );
}
