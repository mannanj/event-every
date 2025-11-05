'use client';

import { useState } from 'react';

interface SideDrawerLockButtonProps {
  onLock: () => void;
}

export default function SideDrawerLockButton({ onLock }: SideDrawerLockButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const handleClick = () => {
    setShowConfirmation(true);
  };

  const handleConfirm = () => {
    setShowConfirmation(false);
    onLock();
  };

  const handleCancel = () => {
    setShowConfirmation(false);
  };

  return (
    <>
      <button
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleClick}
        className="absolute right-0 bg-white border-2 border-black border-r-0 rounded-l-3xl py-3 z-50 flex items-center overflow-hidden transition-all duration-300 ease-in-out hover:bg-black hover:text-white group"
        style={{
          top: '4rem',
          width: isHovered ? '120px' : '48px',
          paddingLeft: isHovered ? '16px' : '12px',
          paddingRight: isHovered ? '16px' : '12px',
        }}
        aria-label="Lock application"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5 flex-shrink-0"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span
          className="ml-2 text-sm font-medium whitespace-nowrap transition-opacity duration-300"
          style={{
            opacity: isHovered ? 1 : 0,
          }}
        >
          Lock
        </span>
      </button>

      {showConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white border-4 border-black p-8 max-w-sm mx-4">
            <h2 className="text-xl font-bold mb-4">Lock Screen?</h2>
            <p className="text-sm mb-6">
              Are you sure you want to lock the screen? You'll need to enter the pattern to unlock.
            </p>
            <div className="flex gap-4">
              <button
                onClick={handleCancel}
                className="flex-1 px-4 py-2 bg-white border-2 border-black hover:bg-gray-100 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 px-4 py-2 bg-black text-white hover:bg-gray-800 transition-colors font-medium"
              >
                Lock
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
