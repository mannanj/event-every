'use client';

import { CalendarEvent } from '@/types/event';
import BatchEventList from './BatchEventList';

interface ImageProcessingStatus {
  id: string;
  filename: string;
  status: 'pending' | 'processing' | 'complete' | 'error';
  error?: string;
  eventCount?: number;
}

interface URLProcessingStatus {
  phase: 'detecting' | 'fetching' | 'extracting' | 'complete';
  urlCount?: number;
  fetchedCount?: number;
  message: string;
}

interface BatchProcessing {
  id: string;
  events: CalendarEvent[];
  isProcessing: boolean;
  totalExpected?: number;
  source: 'image' | 'text';
}

interface ProcessingSectionProps {
  imageProcessingStatuses: ImageProcessingStatus[];
  urlProcessingStatus: URLProcessingStatus | null;
  batchProcessing: BatchProcessing | null;
  onBatchEventEdit: (event: CalendarEvent) => void;
  onBatchEventDelete: (eventId: string) => void;
  onBatchEventExport: (event: CalendarEvent) => void;
  onCancelBatch: () => void;
  onExportComplete: (events: CalendarEvent[]) => void;
}

export default function ProcessingSection({
  imageProcessingStatuses,
  urlProcessingStatus,
  batchProcessing,
  onBatchEventEdit,
  onBatchEventDelete,
  onBatchEventExport,
  onCancelBatch,
  onExportComplete,
}: ProcessingSectionProps) {
  const hasProcessingItems = imageProcessingStatuses.length > 0 || urlProcessingStatus !== null;
  const hasCompletedBatch = batchProcessing && !batchProcessing.isProcessing && batchProcessing.events.length > 0;

  if (!hasProcessingItems && !batchProcessing) {
    return null;
  }

  return (
    <div className="mb-12">
      <div className="border-2 border-black">
        {/* Processing items header and list */}
        {hasProcessingItems && (
          <div className="p-4 border-b-2 border-black">
            <h2 className="text-lg font-bold mb-4 text-black">Processing</h2>
            <div className="space-y-3">
              {/* Image processing items */}
              {imageProcessingStatuses.map((status, index) => {
                const isComplete = status.status === 'complete';
                const isError = status.status === 'error';
                const isProcessing = status.status === 'processing';

                return (
                  <div
                    key={status.id}
                    className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-300"
                  >
                    <div className="flex-shrink-0">
                      {isComplete && (
                        <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {isError && (
                        <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                      {isProcessing && (
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-black border-t-transparent" />
                      )}
                      {status.status === 'pending' && (
                        <div className="w-6 h-6 border-2 border-gray-300 rounded-full" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-black">
                        [Image #{index + 1}]
                        {status.status === 'pending' && ' - Waiting...'}
                        {status.status === 'processing' && ' - Extracting text...'}
                        {status.status === 'complete' && ` - Extracted ${status.eventCount || 0} event${status.eventCount !== 1 ? 's' : ''}`}
                        {status.status === 'error' && ' - Error'}
                      </p>
                      {status.error && (
                        <p className="text-xs text-gray-600 truncate">{status.error}</p>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* URL processing item */}
              {urlProcessingStatus && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-300">
                  <div className="flex-shrink-0">
                    {urlProcessingStatus.phase === 'complete' ? (
                      <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-black border-t-transparent" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-black">
                      [Text #1] - {urlProcessingStatus.message}
                    </p>
                    {urlProcessingStatus.phase === 'fetching' && urlProcessingStatus.urlCount && (
                      <p className="text-xs text-gray-600">
                        Processing {urlProcessingStatus.urlCount} URL{urlProcessingStatus.urlCount !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Text processing with batch indicator */}
              {batchProcessing && batchProcessing.isProcessing && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-300">
                  <div className="flex-shrink-0">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-black border-t-transparent" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-black">
                      [{batchProcessing.source === 'image' ? 'Image' : 'Text'} #1] - Extracting events... ({batchProcessing.events.length} found)
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Batch event list for review and export */}
        {hasCompletedBatch && (
          <div className="p-4">
            <BatchEventList
              events={batchProcessing.events}
              isProcessing={batchProcessing.isProcessing}
              totalExpected={batchProcessing.totalExpected}
              source={batchProcessing.source}
              onEdit={onBatchEventEdit}
              onDelete={onBatchEventDelete}
              onExport={onBatchEventExport}
              onCancel={onCancelBatch}
              onExportComplete={onExportComplete}
            />
          </div>
        )}
      </div>
    </div>
  );
}
