'use client';

import { useState } from 'react';

interface EmailRequestModalProps {
  onClose: () => void;
}

export default function EmailRequestModal({ onClose }: EmailRequestModalProps) {
  const [reason, setReason] = useState('');
  const [showEmail, setShowEmail] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim()) {
      setShowEmail(true);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white border-4 border-black p-8 max-w-md w-full">
        <div className="flex justify-between items-start mb-6">
          <h2 className="text-2xl font-bold">Request Access</h2>
          <button
            onClick={onClose}
            className="text-2xl leading-none hover:opacity-50 transition-opacity"
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {!showEmail ? (
          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label htmlFor="reason" className="block text-sm font-medium mb-2">
                Why do you need access?
              </label>
              <textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full border-2 border-black p-3 min-h-[120px] focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="Please provide a brief reason..."
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-black text-white py-3 px-6 hover:bg-white hover:text-black border-2 border-black transition-colors font-medium"
            >
              Submit Request
            </button>
          </form>
        ) : (
          <div className="text-center">
            <p className="mb-4 text-gray-600">
              Thank you for your request. Please contact:
            </p>
            <a
              href="mailto:hello@mannan.is"
              className="text-2xl font-bold hover:underline block mb-6"
            >
              hello@mannan.is
            </a>
            <button
              onClick={onClose}
              className="w-full bg-black text-white py-3 px-6 hover:bg-white hover:text-black border-2 border-black transition-colors font-medium"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
