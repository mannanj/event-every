'use client';

import { useState } from 'react';

interface URLPillProps {
  url: string;
  onRemove?: () => void;
  large?: boolean;
}

const URLPill = ({ url, onRemove, large = false }: URLPillProps) => {
  const [copied, setCopied] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const isMeetupURL = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.includes('meetup.com');
    } catch {
      return false;
    }
  };

  const truncateURL = (url: string) => {
    const maxLength = large ? 50 : 12;
    const pathMaxLength = large ? 45 : 10;
    const smallPathMaxLength = large ? 35 : 6;

    try {
      const urlObj = new URL(url);
      let hostname = urlObj.hostname.replace(/^www\./, '');
      const path = urlObj.pathname + urlObj.search;

      if (hostname.includes('meetup.com')) {
        const pathWithoutSlash = path.replace(/^\//, '');
        return pathWithoutSlash.length > maxLength ? `${pathWithoutSlash.substring(0, pathMaxLength)}...` : pathWithoutSlash;
      }

      if (path.length <= (large ? 20 : 8)) {
        return `${hostname}${path}`;
      }

      return `${hostname}${path.substring(0, smallPathMaxLength)}...`;
    } catch {
      return url.length > maxLength ? `${url.substring(0, pathMaxLength)}...` : url;
    }
  };

  const getTooltipText = (url: string) => {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace(/^www\./, '');

      if (hostname.includes('meetup.com')) {
        return `Copy Meetup Event ${url}`;
      }

      return url;
    } catch {
      return url;
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
    onRemove?.();
  };

  const iconSize = large ? 'w-3 h-3' : 'w-2.5 h-2.5';
  const textSize = large ? 'text-xs' : 'text-[10px]';
  const padding = large ? 'px-1.5 py-1' : 'px-0.5 py-0.5';
  const gap = large ? 'gap-1' : 'gap-0.5';
  const closeIconSize = large ? 'w-2.5 h-2.5' : 'w-2 h-2';

  return (
    <>
      <div className="relative inline-block">
        <div
          onClick={handlePillClick}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`inline-flex items-center ${gap} ${padding} bg-gray-100 rounded-full cursor-pointer focus:outline-none focus:ring-1 focus:ring-black`}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handlePillClick();
            }
          }}
          aria-label="Copy URL to clipboard"
        >
          {copied ? (
            <svg className={`${iconSize} text-black`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : isHovered ? (
            <svg className={`${iconSize} text-black`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          ) : (
            <svg className={`${iconSize} text-black`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          )}

          <span className={`${textSize} text-black select-none`}>
            {truncateURL(url)}
          </span>

          {onRemove && (
            <button
              onClick={handleRemove}
              className="hover:scale-110 transform focus:outline-none"
              aria-label="Remove URL"
            >
              <svg className={`${closeIconSize} text-black`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {isHovered && !copied && (
          <div className={`absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-2 py-1 bg-black text-white ${large ? 'text-xs' : 'text-[10px]'} rounded z-50 max-w-sm break-words`}>
            {getTooltipText(url)}
          </div>
        )}
      </div>

      {showToast && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-black text-white text-sm rounded shadow-lg z-50 animate-fade-in">
          copied URL to clipboard
        </div>
      )}
    </>
  );
};

export default URLPill;
