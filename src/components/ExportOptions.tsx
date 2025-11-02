'use client';

import { useState } from 'react';
import { CalendarEvent } from '@/types/event';
import { exportToICS } from '@/services/exporter';

interface ExportOptionsProps {
  event: CalendarEvent;
  onBack?: () => void;
}

export default function ExportOptions({ event, onBack }: ExportOptionsProps) {
  const [exportStatus, setExportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleExport = () => {
    const result = exportToICS(event);

    if (result.success) {
      setExportStatus('success');
      setErrorMessage('');

      setTimeout(() => {
        setExportStatus('idle');
      }, 3000);
    } else {
      setExportStatus('error');
      setErrorMessage(result.error || 'Failed to export event');
    }
  };

  return (
    <div className="bg-white border-2 border-black p-6 space-y-6">
      <div className="border-b-2 border-black pb-4">
        <h2 className="text-2xl font-bold text-black mb-1">Export Event</h2>
        <p className="text-sm text-gray-600">Download as iCalendar file (.ics)</p>
      </div>

      <div className="space-y-4">
        <div className="bg-gray-50 border border-black p-4">
          <p className="text-sm text-black mb-2">
            <span className="font-medium">File format:</span> iCalendar (.ics)
          </p>
          <p className="text-sm text-gray-600">
            Compatible with Apple Calendar, Google Calendar, Outlook, and other calendar applications.
          </p>
        </div>

        {exportStatus === 'success' && (
          <div className="bg-white border-2 border-black p-4">
            <p className="text-sm font-medium text-black">
              ✓ Event exported successfully!
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Check your downloads folder for the .ics file.
            </p>
          </div>
        )}

        {exportStatus === 'error' && (
          <div className="bg-white border-2 border-black p-4">
            <p className="text-sm font-medium text-black mb-1">
              Export failed
            </p>
            <p className="text-xs text-gray-600">
              {errorMessage}
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-4 border-t-2 border-black">
        {onBack && (
          <button
            onClick={onBack}
            className="flex-1 py-3 px-6 bg-white border-2 border-black text-black font-medium hover:bg-black hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
            aria-label="Go back"
          >
            Back
          </button>
        )}
        <button
          onClick={handleExport}
          className="flex-1 py-3 px-6 bg-black text-white font-medium hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
          aria-label="Download calendar file"
        >
          Download .ics File
        </button>
      </div>
    </div>
  );
}
