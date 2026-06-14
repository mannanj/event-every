'use client';

import { useRotatingMessage } from '@/hooks/useRotatingMessage';

const FUN_MESSAGES = [
  'Reading the tea leaves',
  'Consulting the calendar spirits',
  'Decoding the temporal mysteries',
  'Pulling event details from the void',
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
            animationDelay: `${index * 0.033}s`,
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

interface ProcessingShimmerProps {
  skeletonCount: number; // = processingCount from the parent
  onCancel: () => void;
}

/**
 * The animated "parsing…" heading + skeleton rows shown while events are being
 * extracted. Owns its own rotating-message timer so the 6–9s tick re-renders only
 * this block, never the sibling event-card list.
 */
export default function ProcessingShimmer({ skeletonCount, onCancel }: ProcessingShimmerProps) {
  const message = useRotatingMessage(FUN_MESSAGES);

  return (
    <div className="relative p-4 bg-gray-50 border-b-2 border-black">
      <button
        onClick={onCancel}
        className="absolute top-2 right-2 z-20 p-1 text-black hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-black"
        aria-label="Cancel processing"
        data-testid="cancel-job-button"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <h2 className="text-lg font-bold text-black mb-4">
        <RainbowText>{message}</RainbowText>
        <AnimatedEllipsis textLength={message.length} />
      </h2>
      <div className="space-y-4">
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <SkeletonLoader key={index} />
        ))}
      </div>
    </div>
  );
}
