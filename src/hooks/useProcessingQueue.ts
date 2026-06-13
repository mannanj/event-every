import { useState, useEffect, useCallback } from 'react';
import { processingQueue, QueueItem } from '@/services/processingQueue';
import { CalendarEvent } from '@/types/event';
import { isActive, isDone } from '@/types/processing';

export function useProcessingQueue() {
  const [queue, setQueue] = useState<QueueItem[]>([]);

  useEffect(() => {
    const unsubscribe = processingQueue.subscribe((updatedQueue) => {
      setQueue(updatedQueue);
    });

    return unsubscribe;
  }, []);

  const addToQueue = useCallback(
    (
      type: 'image' | 'text',
      payload: File[] | string,
      text: string | undefined,
      processor: (item: QueueItem) => Promise<CalendarEvent[]>,
      metadata?: QueueItem['metadata']
    ): string => {
      return processingQueue.add(type, payload, processor, metadata, text);
    },
    []
  );

  const cancelItem = useCallback((id: string) => {
    processingQueue.remove(id);
  }, []);

  const updateProgress = useCallback((id: string, progress: number) => {
    processingQueue.updateProgress(id, progress);
  }, []);

  const clearCompleted = useCallback(() => {
    processingQueue.clearCompleted();
  }, []);

  const activeItems = queue.filter(item => isActive(item.status));

  const completedItems = queue.filter(item => isDone(item.status));

  return {
    queue,
    activeItems,
    completedItems,
    addToQueue,
    cancelItem,
    updateProgress,
    clearCompleted,
  };
}
