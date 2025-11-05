'use client';

import { useState } from 'react';

interface URLPillProps {
  url: string;
  onRemove: () => void;
}

const URLPill = ({ url, onRemove }: URLPillProps) => {
  const [copied, setCopied] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const truncateURL = (url: string) => {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const path = urlObj.pathname + urlObj.search;

      if (path.length <= 15) {
        return `${hostname}${path}`;
      }

      return `${hostname}${path.substring(0, 12)}...`;
    } catch {
      return url.length > 20 ? `${url.substring(0, 17)}...` : url;
    }
  };

  const handlePillClick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setShowToast(true);
      setTimeout(() => {
        setCopied(false);
        setShowToast(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove();
  };

  return (
    <>
      <button
        onClick={handlePillClick}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 rounded-full cursor-pointer focus:outline-none focus:ring-1 focus:ring-black"
        aria-label="Copy URL to clipboard"
      >
        {copied ? (
          <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        )}

        <span className="text-xs text-black select-none">
          {truncateURL(url)}
        </span>

        <button
          onClick={handleRemove}
          className="hover:scale-110 transform focus:outline-none ml-0.5"
          aria-label="Remove URL"
        >
          <svg className="w-2.5 h-2.5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </button>

      {showToast && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-black text-white text-sm rounded shadow-lg z-50 animate-fade-in">
          copied URL to clipboard
        </div>
      )}
    </>
  );
};

export default URLPill;
