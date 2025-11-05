'use client';

import { useState } from 'react';
import { QueueItem } from '@/services/processingQueue';

interface ProcessingQueuePanelProps {
  items: QueueItem[];
  onCancel: (id: string) => void;
  onClear: () => void;
}

export default function ProcessingQueuePanel({
  items,
  onCancel,
  onClear,
}: ProcessingQueuePanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (items.length === 0) return null;

  const activeItems = items.filter(i => i.status === 'processing' || i.status === 'queued');
  const completedItems = items.filter(i => i.status === 'complete' || i.status === 'error');

  const getStatusIcon = (status: QueueItem['status']) => {
    switch (status) {
      case 'queued':
        return (
          <div className="w-5 h-5 border-2 border-gray-400 rounded-full" />
        );
      case 'processing':
        return (
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-black border-t-transparent" />
        );
      case 'complete':
        return (
          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      case 'cancelled':
        return (
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
    }
  };

  const getItemLabel = (item: QueueItem) => {
    if (item.type === 'image') {
      const fileCount = item.metadata?.fileCount || 1;
      return `${fileCount} image${fileCount !== 1 ? 's' : ''}`;
    }
    return 'Text input';
  };

  const getStatusText = (item: QueueItem) => {
    switch (item.status) {
      case 'queued':
        return 'Waiting...';
      case 'processing':
        return item.progress > 0 ? `Processing... ${item.progress}%` : 'Processing...';
      case 'complete':
        const eventCount = item.result?.length || 0;
        return `${eventCount} event${eventCount !== 1 ? 's' : ''} found`;
      case 'error':
        return item.error || 'Error occurred';
      case 'cancelled':
        return 'Cancelled';
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)]">
      <div className="border-2 border-black bg-white shadow-lg">
        <div className="flex items-center justify-between p-3 border-b-2 border-black">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-black">Processing Queue</h3>
            {activeItems.length > 0 && (
              <span className="text-xs bg-black text-white px-2 py-1 rounded-full">
                {activeItems.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {completedItems.length > 0 && (
              <button
                onClick={onClear}
                className="text-xs text-gray-600 hover:text-black transition-colors"
                aria-label="Clear completed items"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="text-black hover:text-gray-600 transition-colors"
              aria-label={isCollapsed ? 'Expand queue' : 'Collapse queue'}
            >
              <svg
                className={`w-5 h-5 transition-transform ${isCollapsed ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {!isCollapsed && (
          <div className="max-h-96 overflow-y-auto">
            {items.map((item) => (
              <div
                key={item.id}
                className={`p-3 border-b border-gray-200 last:border-b-0 ${
                  item.status === 'error' ? 'bg-red-50' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {getStatusIcon(item.status)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-sm text-black truncate">
                        {getItemLabel(item)}
                      </p>
                      {item.metadata?.filename && (
                        <span className="text-xs text-gray-500 truncate">
                          {item.metadata.filename}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-gray-600">
                      {getStatusText(item)}
                    </p>

                    {item.status === 'processing' && item.progress > 0 && (
                      <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-black h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {(item.status === 'processing' || item.status === 'queued') && (
                    <button
                      onClick={() => onCancel(item.id)}
                      className="flex-shrink-0 text-gray-400 hover:text-black transition-colors"
                      aria-label="Cancel this item"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
