'use client';

import { useState } from 'react';

interface EmailRequestModalProps {
  onClose: () => void;
}

export default function EmailRequestModal({ onClose }: EmailRequestModalProps) {
  const [reason, setReason] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [honeypotWebsite, setHoneypotWebsite] = useState('');
  const [honeypotPhone, setHoneypotPhone] = useState('');
  const [honeypotEmail, setHoneypotEmail] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (honeypotWebsite || honeypotPhone || honeypotEmail) {
      console.warn('Bot detected: honeypot field filled');
      return;
    }

    if (reason.trim()) {
      setShowEmail(true);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center p-4 z-50">
      <div className="bg-white border-2 border-black p-8 max-w-md w-full shadow-lg">
        <button
          onClick={onClose}
          className="float-right text-xl leading-none hover:opacity-50 transition-opacity -mt-2 -mr-2"
          aria-label="Close modal"
        >
          ×
        </button>

        {!showEmail ? (
          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label htmlFor="reason" className="block text-base mb-3">
                Mind sharing why you'd like access?
              </label>
              <textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full border border-gray-300 p-3 min-h-[100px] focus:outline-none focus:border-black transition-colors"
                placeholder="Just curious! Would love to try it out..."
                required
              />
            </div>

            <input
              type="text"
              name="website"
              value={honeypotWebsite}
              onChange={(e) => setHoneypotWebsite(e.target.value)}
              className="honeypot-field"
              tabIndex={-1}
              aria-hidden="true"
              autoComplete="off"
            />
            <input
              type="tel"
              name="phone"
              value={honeypotPhone}
              onChange={(e) => setHoneypotPhone(e.target.value)}
              className="honeypot-field"
              tabIndex={-1}
              aria-hidden="true"
              autoComplete="off"
            />
            <input
              type="email"
              name="email_confirm"
              value={honeypotEmail}
              onChange={(e) => setHoneypotEmail(e.target.value)}
              className="honeypot-field"
              tabIndex={-1}
              aria-hidden="true"
              autoComplete="off"
            />

            <button
              type="submit"
              className="w-full bg-black text-white py-2.5 px-6 hover:bg-gray-800 transition-colors"
            >
              Continue
            </button>
          </form>
        ) : (
          <div className="text-center pt-2">
            <p className="mb-2 text-base">
              Thanks! Drop me a line:
            </p>
            <a
              href="mailto:hello@mannan.is"
              className="text-xl font-medium hover:underline block mb-6 mt-4"
            >
              hello@mannan.is
            </a>
            <button
              onClick={onClose}
              className="w-full bg-black text-white py-2.5 px-6 hover:bg-gray-800 transition-colors"
            >
              Got it
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
