'use client';

import { useState } from 'react';

interface URLPillProps {
  url: string;
  onRemove: () => void;
}

const URLPill = ({ url, onRemove }: URLPillProps) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [copied, setCopied] = useState(false);

  const truncateURL = (url: string) => {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const path = urlObj.pathname + urlObj.search;

      if (path.length <= 20) {
        return `${hostname}${path}`;
      }

      return `${hostname}${path.substring(0, 17)}...`;
    } catch {
      return url.length > 30 ? `${url.substring(0, 27)}...` : url;
    }
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  return (
    <div
      className="relative inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-full group hover:bg-gray-200 transition-colors"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className="text-sm text-gray-700 select-none">
        URL: {truncateURL(url)}
      </span>

      <button
        onClick={handleCopy}
        className="opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 transform focus:outline-none"
        aria-label="Copy URL to clipboard"
        title={copied ? 'Copied!' : 'Copy URL'}
      >
        {copied ? (
          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>

      <button
        onClick={onRemove}
        className="hover:scale-110 transform focus:outline-none"
        aria-label="Remove URL"
        title="Remove URL"
      >
        <svg className="w-4 h-4 text-gray-600 hover:text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {showTooltip && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-black text-white text-xs rounded shadow-lg whitespace-nowrap z-10 max-w-xs overflow-hidden text-ellipsis">
          {url}
        </div>
      )}
    </div>
  );
};

export default URLPill;
