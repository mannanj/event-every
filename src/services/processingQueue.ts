import { CalendarEvent } from '@/types/event';

export interface QueueItem {
  id: string;
  type: 'image' | 'text';
  status: 'queued' | 'processing' | 'complete' | 'error' | 'cancelled';
  progress: number;
  payload: File[] | string;
  result?: CalendarEvent[];
  error?: string;
  created: Date;
  startedAt?: Date;
  completedAt?: Date;
  metadata?: {
    filename?: string;
    fileCount?: number;
    urlCount?: number;
  };
}

type QueueListener = (queue: QueueItem[]) => void;

class ProcessingQueue {
  private queue: QueueItem[] = [];
  private maxConcurrent = 3;
  private listeners: QueueListener[] = [];
  private processingCallbacks: Map<string, (item: QueueItem) => Promise<CalendarEvent[]>> = new Map();

  subscribe(listener: QueueListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(): void {
    this.listeners.forEach(listener => listener([...this.queue]));
  }

  add(
    type: 'image' | 'text',
    payload: File[] | string,
    processor: (item: QueueItem) => Promise<CalendarEvent[]>,
    metadata?: QueueItem['metadata']
  ): string {
    const id = `queue-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const item: QueueItem = {
      id,
      type,
      status: 'queued',
      progress: 0,
      payload,
      created: new Date(),
      metadata,
    };

    this.queue.push(item);
    this.processingCallbacks.set(id, processor);
    this.notify();
    this.processNext();

    return id;
  }

  remove(id: string): void {
    const item = this.queue.find(i => i.id === id);
    if (!item) return;

    if (item.status === 'processing') {
      item.status = 'cancelled';
      item.completedAt = new Date();
    }

    this.queue = this.queue.filter(i => i.id !== id);
    this.processingCallbacks.delete(id);
    this.notify();
    this.processNext();
  }

  updateProgress(id: string, progress: number): void {
    const item = this.queue.find(i => i.id === id);
    if (!item) return;

    item.progress = Math.max(0, Math.min(100, progress));
    this.notify();
  }

  getAll(): QueueItem[] {
    return [...this.queue];
  }

  getActive(): QueueItem[] {
    return this.queue.filter(i => i.status === 'processing' || i.status === 'queued');
  }

  private getActiveCount(): number {
    return this.queue.filter(i => i.status === 'processing').length;
  }

  private async processNext(): Promise<void> {
    while (this.getActiveCount() < this.maxConcurrent) {
      const nextItem = this.queue.find(i => i.status === 'queued');
      if (!nextItem) break;

      this.processItem(nextItem);
    }
  }

  private async processItem(item: QueueItem): Promise<void> {
    item.status = 'processing';
    item.startedAt = new Date();
    item.progress = 0;
    this.notify();

    const processor = this.processingCallbacks.get(item.id);
    if (!processor) {
      item.status = 'error';
      item.error = 'No processor found for this item';
      item.completedAt = new Date();
      this.notify();
      this.processNext();
      return;
    }

    try {
      const result = await processor(item);

      if ((item.status as string) === 'cancelled') {
        return;
      }

      item.status = 'complete';
      item.result = result;
      item.progress = 100;
      item.completedAt = new Date();
      this.notify();
    } catch (err) {
      if ((item.status as string) === 'cancelled') {
        return;
      }

      item.status = 'error';
      item.error = err instanceof Error ? err.message : 'Unknown error occurred';
      item.completedAt = new Date();
      this.notify();
    } finally {
      this.processingCallbacks.delete(item.id);
      this.processNext();
    }
  }

  clearCompleted(): void {
    this.queue = this.queue.filter(i => i.status !== 'complete' && i.status !== 'error');
    this.notify();
  }
}

export const processingQueue = new ProcessingQueue();
