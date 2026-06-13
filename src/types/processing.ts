import { CalendarEvent } from '@/types/event';

export interface ProcessingEvent {
  id: string;
  type: 'image' | 'text';
  status: 'processing' | 'success' | 'error';
  event?: CalendarEvent;
  error?: string;
}

export interface ImageProcessingStatus {
  id: string;
  filename: string;
  status: 'pending' | 'processing' | 'complete' | 'error';
  error?: string;
  eventCount?: number;
}

export interface BatchProcessing {
  id: string;
  events: CalendarEvent[];
  isProcessing: boolean;
  totalExpected?: number;
  source: 'image' | 'text';
}

/** Sub-phase of a single URL-scrape job — NOT a job status. */
export type URLPhase = 'detecting' | 'fetching' | 'extracting' | 'complete';

export interface URLProcessingStatus {
  phase: URLPhase;
  urlCount?: number;
  fetchedCount?: number;
  message: string;
}

/**
 * The single processing lifecycle, reconciled from the previously divergent
 * vocabularies:
 *   - 'queued'    ≈ the old 'pending' (accepted, not yet started)
 *   - 'complete'  ≈ the old 'success' (terminal, ok)
 *   - 'error', 'cancelled' are terminal.
 * NOTE: keep 'cancelled' — processingQueue.ts sets it from remove() and guards
 * on it after await; removing it breaks that guard.
 */
export type ProcessingStatus =
  | 'queued'
  | 'processing'
  | 'complete'
  | 'error'
  | 'cancelled';

/** Active = not yet in a terminal state. */
export function isActive(status: ProcessingStatus): boolean {
  return status === 'queued' || status === 'processing';
}

/** Done = terminal, regardless of outcome. */
export function isDone(status: ProcessingStatus): boolean {
  return status === 'complete' || status === 'error' || status === 'cancelled';
}

export function isCancelled(status: ProcessingStatus): boolean {
  return status === 'cancelled';
}
