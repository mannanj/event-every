'use client';

import { useState, useEffect } from 'react';

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

interface ProcessingSectionProps {
  imageProcessingStatuses: ImageProcessingStatus[];
  urlProcessingStatus: URLProcessingStatus | null;
  isProcessing: boolean;
}

const FUN_MESSAGES = [
  'Reading the tea leaves',
  'Consulting the calendar spirits',
  'Decoding the temporal mysteries',
  'Summoning event details from the void',
  'Teaching AI to read your wildest desires',
  'Calculating the space-time coordinates',
  'Extracting the juicy bits',
  'Pondering the meaning of it all',
  'Converting pixels to plans',
  'Making sense of the chaos',
  'Channeling my inner detective',
  'Connecting the dots',
  'Unraveling the event enigma',
  'Working my magic',
  'Actualizing your hopes and dreams',
  'Almost there... probably',
];

function AnimatedEllipsis() {
  return (
    <span className="inline-flex gap-[1px] items-end">
      <span className="animate-[bounce_0.8s_ease-in-out_0s_infinite] inline-block translate-y-1">.</span>
      <span className="animate-[bounce_1.2s_ease-in-out_0.15s_infinite] inline-block translate-y-1">.</span>
      <span className="animate-[bounce_1s_ease-in-out_0.3s_infinite] inline-block translate-y-1">.</span>
    </span>
  );
}

function RainbowText({ children }: { children: string }) {
  const chars = children.split('');

  return (
    <span className="inline-block">
      {chars.map((char, index) => (
        <span
          key={index}
          className="inline-block animate-[rainbow_4s_linear_infinite]"
          style={{
            animationDelay: `${index * 0.1}s`,
          }}
        >
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
    </span>
  );
}

export default function ProcessingSection({
  imageProcessingStatuses,
  urlProcessingStatus,
  isProcessing,
}: ProcessingSectionProps) {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

  useEffect(() => {
    const getRandomInterval = () => Math.floor(Math.random() * 3000) + 6000;

    const scheduleNextMessage = () => {
      const timeout = setTimeout(() => {
        setCurrentMessageIndex((prev) => (prev + 1) % FUN_MESSAGES.length);
        scheduleNextMessage();
      }, getRandomInterval());

      return timeout;
    };

    const timeout = scheduleNextMessage();
    return () => clearTimeout(timeout);
  }, []);

  const activeProcessingItems = imageProcessingStatuses.filter(
    status => status.status === 'pending' || status.status === 'processing'
  );
  const hasActiveProcessing = activeProcessingItems.length > 0 ||
    (urlProcessingStatus !== null && urlProcessingStatus.phase !== 'complete') ||
    isProcessing;

  if (!hasActiveProcessing) {
    return null;
  }

  return (
    <div className="mb-12">
      <div className="border-2 border-black bg-gray-50">
        <div className="p-4">
          <h2 className="text-lg font-bold mb-4 text-black">Processing</h2>
          <div className="space-y-3">
            {/* Consolidated processing banner */}
            {isProcessing && (
              <div className="flex items-center gap-3 p-3 bg-white border border-gray-300">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">
                    <RainbowText>{FUN_MESSAGES[currentMessageIndex]}</RainbowText>
                    <AnimatedEllipsis />
                  </p>
                </div>
              </div>
            )}

            {/* Image processing items */}
            {!isProcessing && activeProcessingItems.map((status, index) => {
                    const isComplete = status.status === 'complete';
                    const isError = status.status === 'error';
                    const isProcessing = status.status === 'processing';

                    return (
                      <div
                        key={status.id}
                        className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-300"
                      >
                        {isComplete && (
                          <div className="flex-shrink-0">
                            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                        {isError && (
                          <div className="flex-shrink-0">
                            <svg className="w-3 h-3 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">
                            {status.status === 'pending' && (
                              <>
                                <RainbowText>Waiting</RainbowText>
                                <AnimatedEllipsis />
                              </>
                            )}
                            {status.status === 'processing' && (
                              <>
                                <RainbowText>{FUN_MESSAGES[currentMessageIndex]}</RainbowText>
                                <AnimatedEllipsis />
                              </>
                            )}
                            {status.status === 'complete' && (
                              <span className="text-black">{`${status.eventCount || 0} event${status.eventCount !== 1 ? 's' : ''} made`}</span>
                            )}
                            {status.status === 'error' && (
                              <span className="text-black">{status.error || 'No events could be found'}</span>
                            )}
                          </p>
                        </div>
                      </div>
                    );
                  })}

            {/* URL processing item */}
            {urlProcessingStatus && (
              <div className="flex items-center gap-3 p-3 bg-white border border-gray-300">
                      {urlProcessingStatus.phase === 'complete' && (
                        <div className="flex-shrink-0">
                          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-black">
                          {urlProcessingStatus.message}
                        </p>
                        {urlProcessingStatus.phase === 'fetching' && urlProcessingStatus.urlCount && (
                          <p className="text-xs text-gray-600">
                            {urlProcessingStatus.urlCount} URL{urlProcessingStatus.urlCount !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
