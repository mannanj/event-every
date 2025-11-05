'use client';

interface ProcessingError {
  id: string;
  type: 'image' | 'text';
  error: string;
}

interface ErrorNotificationProps {
  errors: ProcessingError[];
  onDismiss: (id: string) => void;
}

export default function ErrorNotification({ errors, onDismiss }: ErrorNotificationProps) {
  if (errors.length === 0) return null;

  return (
    <div className="mb-12">
      <div className="space-y-3">
        {errors.map((error) => (
          <div
            key={error.id}
            className="border-2 border-black bg-white p-4 flex items-start gap-3"
            role="alert"
          >
            <svg className="w-6 h-6 text-black flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <div className="flex-1">
              <p className="font-medium text-black">Error processing {error.type}</p>
              <p className="text-sm text-gray-600 mt-1">{error.error}</p>
            </div>
            <button
              onClick={() => onDismiss(error.id)}
              className="text-black hover:text-gray-600 focus:outline-none flex-shrink-0"
              aria-label="Dismiss error"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
