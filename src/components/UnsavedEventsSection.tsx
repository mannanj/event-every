'use client';

import { useState, useEffect } from 'react';
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

interface UnsavedEventsSectionProps {
  events: CalendarEvent[];
  imageProcessingStatuses: ImageProcessingStatus[];
  urlProcessingStatus: URLProcessingStatus | null;
  isProcessing: boolean;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (eventId: string) => void;
  onExport: (event: CalendarEvent) => void;
  onCancelAll: () => void;
  onExportComplete: (events: CalendarEvent[]) => void;
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

function AnimatedEllipsis({ textLength }: { textLength: number }) {
  const baseDelay = textLength * 0.1;

  return (
    <span className="inline-flex gap-[1px] items-end">
      <span
        className="inline-block"
        style={{
          animation: `bounceUp1 1.4s ease-out 0.3s infinite, rainbow 4s linear ${baseDelay}s infinite`
        }}
      >.</span>
      <span
        className="inline-block"
        style={{
          animation: `bounceUp2 0.7s ease-in-out 0.8s infinite, rainbow 4s linear ${baseDelay + 0.1}s infinite`
        }}
      >.</span>
      <span
        className="inline-block"
        style={{
          animation: `bounceUp3 1.8s ease-in 0.1s infinite, rainbow 4s linear ${baseDelay + 0.2}s infinite`
        }}
      >.</span>
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

function SkeletonLoader() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
    </div>
  );
}

export default function UnsavedEventsSection({
  events,
  imageProcessingStatuses,
  urlProcessingStatus,
  isProcessing,
  onEdit,
  onDelete,
  onExport,
  onCancelAll,
  onExportComplete,
}: UnsavedEventsSectionProps) {
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

  if (events.length === 0 && !hasActiveProcessing) {
    return null;
  }

  const processingCount = Math.min(
    activeProcessingItems.length + (urlProcessingStatus && urlProcessingStatus.phase !== 'complete' ? 1 : 0) || 1,
    3
  );

  const currentMessage = FUN_MESSAGES[currentMessageIndex];

  return (
    <div className="mb-12">
      <div className="border-2 border-black bg-white">
        {/* Processing status label and skeleton loaders */}
        {hasActiveProcessing && (
          <div className="p-4 bg-gray-50 border-b-2 border-black">
            <h2 className="text-lg font-bold text-black mb-4">
              <RainbowText>{currentMessage}</RainbowText>
              <AnimatedEllipsis textLength={currentMessage.length} />
            </h2>
            <div className="space-y-4">
              {Array.from({ length: processingCount }).map((_, index) => (
                <SkeletonLoader key={index} />
              ))}
            </div>
          </div>
        )}

        {/* Unsaved events list */}
        {events.length > 0 && (
          <BatchEventList
            events={events}
            isProcessing={isProcessing}
            source={events[0]?.source || 'text'}
            onEdit={onEdit}
            onDelete={onDelete}
            onExport={onExport}
            onCancel={onCancelAll}
            onExportComplete={onExportComplete}
            showHeader={false}
          />
        )}
      </div>
    </div>
  );
}
