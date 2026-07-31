'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import SmartInput, { SmartInputHandle } from '@/components/SmartInput';
import UnsavedEventsSection from '@/components/UnsavedEventsSection';
import InputHistoryModal from '@/components/InputHistoryModal';
import ErrorNotification from '@/components/ErrorNotification';
import RateLimitBanner from '@/components/RateLimitBanner';
import EventFields from '@/components/EventFields';
import ReviewDraftSection from '@/components/review/ReviewDraftSection';
import { SiteNav, HowItWorks, TrustPoints, Faq, SiteFooter } from '@/components/landing/LandingSections';
import { CalendarEvent, EventSortOption } from '@/types/event';
import { InputHistoryEntry, StoredInputFile, InputSource } from '@/types/input';
import { exportToICS } from '@/services/exporter';
import { useHistory } from '@/hooks/useHistory';
import { useInputHistory } from '@/hooks/useInputHistory';
import { useProcessingQueue } from '@/hooks/useProcessingQueue';
import { useEventSelection } from '@/hooks/useEventSelection';
import { buildEnrichedUrlText, detectURLs } from '@/services/urlDetector';
import { summarizeInput } from '@/services/summarizer';
import { scrapeURLsBatch } from '@/services/webScraper';
import { QueueItem } from '@/services/processingQueue';
import { eventStorage } from '@/services/storage';
import { parseICSFile } from '@/services/icsParser';
import { exportAllEvents } from '@/services/exportAll';
import { convertRawToDate } from '@/utils/timeConversion';
import { COMMUNITY_LIMIT_CODE, emitCommunityLimit } from '@/utils/communityLimit';
import { ProcessingEvent, ImageProcessingStatus, BatchProcessing, URLProcessingStatus } from '@/types/processing';
import { scan, ScanClientError } from '@/services/scanClient';
import { createReviewDraft, editReviewDraft } from '@/services/scannerDraft';
import type { ReviewDraft, ReviewFieldEdit } from '@/types/review';
import type { ScanRequest } from '@/types/scannerHttp';

export default function Home() {
  const [processingEvents, setProcessingEvents] = useState<ProcessingEvent[]>([]);
  const [batchProcessing, setBatchProcessing] = useState<BatchProcessing | null>(null);
  const [unsavedEvents, setUnsavedEvents] = useState<CalendarEvent[]>([]);
  const [reviewDrafts, setReviewDrafts] = useState<ReviewDraft[]>([]);
  const [, setUserTouchedTimezones] = useState<Set<string>>(new Set());
  const [tzSuggestions, setTzSuggestions] = useState<Record<string, { timezone: string; confidence: number }>>({});
  // Selection for the unsaved batch lives here so it can outlive any single
  // sub-component and (later) be shared with a header/footer. Streamed arrivals
  // default to selected without resetting the user's manual deselects.
  const selection = useEventSelection(unsavedEvents);
  const [imageProcessingStatuses, setImageProcessingStatuses] = useState<ImageProcessingStatus[]>([]);
  const [urlProcessingStatus, setUrlProcessingStatus] = useState<URLProcessingStatus | null>(null);
  const [rateLimitInfo] = useState<{ remaining: number; total: number; resetTime: number } | undefined>();
  const [hasLoadedTempEvents, setHasLoadedTempEvents] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const { events, addEvent, deleteEvent, updateEvent, sortOption, setSortOption, setDateRange } = useHistory();
  const [totalEventsInStorage, setTotalEventsInStorage] = useState(0);
  const { addToQueue, updateProgress } = useProcessingQueue();
  const smartInputRef = useRef<SmartInputHandle>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { entries: inputHistory, addEntry: addInputHistory, setSummary: setInputSummary } = useInputHistory();
  const [pendingSummaryIds, setPendingSummaryIds] = useState<Set<string>>(new Set());

  const markSummaryPending = (id: string, pending: boolean) =>
    setPendingSummaryIds(prev => {
      const next = new Set(prev);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });

  // Fire a lightweight 2-3 word summary for a saved Recent entry, in parallel
  // with (and never blocking) event extraction. Patches the entry once the label lands.
  const summarizeAndStore = (entryId: string | undefined, text: string, events: readonly Pick<CalendarEvent, 'title'>[]) => {
    if (!entryId) return;
    const eventTitles = events.map(e => e.title).filter(t => !!t && t.trim().length > 0);
    if (!text.trim() && eventTitles.length === 0) return;
    markSummaryPending(entryId, true);
    summarizeInput({ text: text.trim(), eventTitles })
      .then(summary => { if (summary) setInputSummary(entryId, summary); })
      .finally(() => markSummaryPending(entryId, false));
  };
  const abortRef = useRef<AbortController | null>(null);
  const activeSubmissionRef = useRef<string | null>(null);
  const activeImageBatchRef = useRef<string | null>(null);
  const loadedSigRef = useRef<string | null>(null);
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [lastPresetDates, setLastPresetDates] = useState<{ start: Date; end: Date } | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>('last-3-days');
  const [exportAllState, setExportAllState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [exportAllError, setExportAllError] = useState<string | null>(null);
  const [exportCooldownRemaining, setExportCooldownRemaining] = useState(0);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const result = eventStorage.getTempUnsavedEvents();
    if (result.success && result.data && result.data.length > 0) {
      setUnsavedEvents(result.data);
    }
    setHasLoadedTempEvents(true);

    const allEventsResult = eventStorage.getAllEvents();
    if (allEventsResult.success && allEventsResult.data) {
      setTotalEventsInStorage(allEventsResult.data.length);
    }

    checkExportCooldown();
  }, []);

  useEffect(() => {
    if (exportCooldownRemaining > 0) {
      const timer = setInterval(() => {
        const remaining = checkExportCooldown();
        if (remaining === 0) {
          clearInterval(timer);
        }
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [exportCooldownRemaining]);

  useEffect(() => {
    if (!hasLoadedTempEvents) return;

    if (unsavedEvents.length > 0) {
      eventStorage.saveTempUnsavedEvents(unsavedEvents);
    } else {
      eventStorage.clearTempUnsavedEvents();
    }
  }, [unsavedEvents, hasLoadedTempEvents]);

  const runScan = useCallback(async (request: ScanRequest, signal: AbortSignal): Promise<ReviewDraft[]> => {
    const response = await scan(request, signal);
    if (signal.aborted) return [];

    const createdAt = new Date().toISOString();
    const drafts = response.candidates.map((candidate) => createReviewDraft(
      candidate,
      response.issues,
      { handle: response.source, label: null },
      {
        id: crypto.randomUUID(),
        exportUid: `${crypto.randomUUID()}@event-every`,
        createdAt,
      },
    ));

    if (!signal.aborted) {
      setReviewDrafts((previous) => [...previous, ...drafts]);
    }
    return drafts;
  }, []);

  const fileToDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read image.'));
    reader.readAsDataURL(file);
  });

  const pushProcessingError = (type: 'image' | 'text', error: unknown) => {
    if (error instanceof ScanClientError && error.code === COMMUNITY_LIMIT_CODE) {
      emitCommunityLimit(error.resetAt ?? undefined);
    }
    const id = `error-${Date.now()}`;
    const message = error instanceof Error ? error.message : 'Unable to scan this input.';
    setProcessingEvents((previous) => [...previous, { id, type, status: 'error', error: message }]);
    setTimeout(() => setProcessingEvents((previous) => previous.filter((item) => item.id !== id)), 5000);
  };

  const handleImageSelect = async (files: File[], summaryEntryId?: string) => {
    if (files.length === 0) return;
    addToQueue('image', files, undefined, async (queueItem: QueueItem) => {
      const imageFiles = queueItem.payload as File[];
      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;
      const batchId = crypto.randomUUID();
      activeSubmissionRef.current = batchId;
      activeImageBatchRef.current = batchId;
      const statuses = imageFiles.map((file, index) => ({
        id: `image-${Date.now()}-${index}`,
        filename: file.name,
        status: 'pending' as const,
      }));
      setBatchProcessing({ id: batchId, events: [], isProcessing: true, source: 'image' });
      setImageProcessingStatuses(statuses);
      const titles: string[] = [];

      try {
        for (let index = 0; index < imageFiles.length; index += 1) {
          if (controller.signal.aborted) break;
          const status = statuses[index];
          setImageProcessingStatuses((previous) => previous.map((item) =>
            item.id === status.id ? { ...item, status: 'processing' as const } : item,
          ));
          updateProgress(queueItem.id, Math.round((index / imageFiles.length) * 100));
          const dataUrl = await fileToDataUrl(imageFiles[index]);
          if (controller.signal.aborted || activeSubmissionRef.current !== batchId) break;
          const drafts = await runScan({ kind: 'image', dataUrl }, controller.signal);
          if (controller.signal.aborted || activeSubmissionRef.current !== batchId) break;
          titles.push(...drafts.map((draft) => draft.candidate.title.value).filter((title): title is string => title !== null));
          setImageProcessingStatuses((previous) => previous.map((item) =>
            item.id === status.id ? { ...item, status: 'complete' as const, eventCount: drafts.length } : item,
          ));
        }
        if (!controller.signal.aborted) summarizeAndStore(summaryEntryId, '', titles.map((title) => ({ title })));
      } catch (error) {
        if (!controller.signal.aborted && !(error instanceof DOMException && error.name === 'AbortError')) {
          pushProcessingError('image', error);
        }
      } finally {
        const current = abortRef.current === controller;
        if (current) abortRef.current = null;
        setBatchProcessing((previous) => previous?.id === batchId ? { ...previous, isProcessing: false } : previous);
        if (current) setTimeout(() => {
          if (activeImageBatchRef.current === batchId && activeSubmissionRef.current === batchId) setImageProcessingStatuses([]);
        }, 10000);
      }
      return [];
    }, { fileCount: files.length });
  };

  const handleTextSubmit = async (text: string, summaryEntryId?: string) => {
    addToQueue('text', text, undefined, async (queueItem: QueueItem) => {
      const inputText = queueItem.payload as string;
      const controller = new AbortController();
      abortRef.current?.abort();
      if (activeImageBatchRef.current !== null) setImageProcessingStatuses([]);
      abortRef.current = controller;
      const batchId = crypto.randomUUID();
      activeSubmissionRef.current = batchId;
      setBatchProcessing({ id: batchId, events: [], isProcessing: true, source: 'text' });

      try {
        setUrlProcessingStatus({ phase: 'detecting', message: 'Detecting URLs...' });
        const detection = await detectURLs(inputText, controller.signal);
        if (controller.signal.aborted || activeSubmissionRef.current !== batchId) return [];
        let combinedText = inputText;
        if (detection.hasUrls && detection.urls.length > 0) {
          setUrlProcessingStatus({
            phase: 'fetching',
            urlCount: detection.urls.length,
            message: `Fetching ${detection.urls.length} event page${detection.urls.length === 1 ? '' : 's'}...`,
          });
          updateProgress(queueItem.id, 30);
          const scraped = await scrapeURLsBatch(detection.urls, controller.signal);
          if (controller.signal.aborted || activeSubmissionRef.current !== batchId) return [];
          combinedText = buildEnrichedUrlText(inputText, detection.urls, detection.remainingText, scraped.results);
          if (!combinedText.trim()) {
            throw new Error('Unable to extract content from the provided URLs. Please check the URLs and try again.');
          }
        }
        if (!combinedText.trim()) throw new Error('Please enter some text or URLs to process.');

        setUrlProcessingStatus({ phase: 'extracting', message: 'Extracting events...' });
        updateProgress(queueItem.id, 50);
        const drafts = await runScan({ kind: 'text', text: combinedText }, controller.signal);
        if (controller.signal.aborted || activeSubmissionRef.current !== batchId) return [];
        const titles = drafts.map((draft) => draft.candidate.title.value).filter((title): title is string => title !== null);
        summarizeAndStore(summaryEntryId, inputText, titles.map((title) => ({ title })));
        setUrlProcessingStatus({ phase: 'complete', message: 'Complete' });
        setTimeout(() => { if (activeSubmissionRef.current === batchId) setUrlProcessingStatus(null); }, 3000);
      } catch (error) {
        if (!controller.signal.aborted && !(error instanceof DOMException && error.name === 'AbortError')) {
          pushProcessingError('text', error);
        }
        if (abortRef.current === controller) setUrlProcessingStatus(null);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setBatchProcessing((previous) => previous?.id === batchId ? { ...previous, isProcessing: false } : previous);
      }
      return [];
    });
  };

  const inputSignature = (text: string, images: File[], calendarFiles: File[]): string =>
    `${text.trim()}|${[...images, ...calendarFiles].map(f => `${f.name}:${f.size}`).join(',')}`;

  const buildHistoryFiles = (images: File[], calendarFiles: File[]): StoredInputFile[] => [
    ...images.map(file => ({ id: `f-${Date.now()}-${Math.random().toString(36).slice(2)}`, file, kind: 'image' as const, name: file.name, mimeType: file.type, size: file.size })),
    ...calendarFiles.map(file => ({ id: `f-${Date.now()}-${Math.random().toString(36).slice(2)}`, file, kind: 'calendar' as const, name: file.name, mimeType: file.type || 'text/calendar', size: file.size })),
  ];

  const saveInputToHistory = (text: string, images: File[], calendarFiles: File[]): string | undefined => {
    const trimmed = text.trim();
    if (!trimmed && images.length === 0 && calendarFiles.length === 0) return undefined;
    const hasFiles = images.length + calendarFiles.length > 0;
    const source: InputSource = trimmed && hasFiles ? 'mixed' : hasFiles ? 'image' : 'text';
    const id = `ih-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    addInputHistory({
      id,
      createdAt: Date.now(),
      text: trimmed,
      files: buildHistoryFiles(images, calendarFiles),
      source,
    });
    return id;
  };

  const handleApplyInput = async (entry: InputHistoryEntry) => {
    const current = smartInputRef.current?.getDraft();
    if (
      current &&
      (current.text.trim() || current.images.length > 0 || current.calendarFiles.length > 0) &&
      inputSignature(current.text, current.images, current.calendarFiles) !== loadedSigRef.current
    ) {
      saveInputToHistory(current.text, current.images, current.calendarFiles);
    }
    const entryImages = entry.files.filter(f => f.kind === 'image').map(f => f.file);
    const entryCalendars = entry.files.filter(f => f.kind === 'calendar').map(f => f.file);
    await smartInputRef.current?.loadInput(entry.text, entry.files);
    loadedSigRef.current = inputSignature(entry.text, entryImages, entryCalendars);
    setHistoryOpen(false);
  };

  const handleSmartInputSubmit = async (data: { text: string; images: File[]; calendarFiles: File[] }) => {
    const { text, images, calendarFiles } = data;

    if (text.trim().length > 0 && images.length > 0) {
      const id = `error-${Date.now()}`;
      setProcessingEvents((previous) => [...previous, {
        id,
        type: 'text',
        status: 'error',
        error: 'Scan text and images separately for now.',
      }]);
      setTimeout(() => setProcessingEvents((previous) => previous.filter((item) => item.id !== id)), 5000);
      return;
    }

    const unsupportedImage = images.find((file) => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type));
    if (unsupportedImage) {
      const id = `error-${Date.now()}`;
      setProcessingEvents((previous) => [...previous, {
        id,
        type: 'image',
        status: 'error',
        error: `${unsupportedImage.name} cannot be scanned. Use PNG, JPEG, or WebP.`,
      }]);
      setTimeout(() => setProcessingEvents((previous) => previous.filter((item) => item.id !== id)), 5000);
      return;
    }

    // Transform always records to Recent — re-saving a loaded entry is fine.
    const entryId = saveInputToHistory(text, images, calendarFiles);
    loadedSigRef.current = null;

    // Exactly one handler "owns" the 2-3 word summary for this submit, so a mixed
    // input (e.g. images + a calendar file) never fires two competing summaries.
    const imageEntryId = images.length > 0 ? entryId : undefined;
    const calendarEntryId = images.length === 0 && calendarFiles.length > 0 ? entryId : undefined;
    const textEntryId =
      images.length === 0 && calendarFiles.length === 0 && text.trim().length > 0 ? entryId : undefined;

    if (images.length > 0) {
      handleImageSelect(images, imageEntryId);
    }

    if (calendarFiles.length > 0) {
      handleCalendarFilesSubmit(calendarFiles, calendarEntryId);
    }

    if (text.trim().length > 0 && images.length === 0) {
      handleTextSubmit(text, textEntryId);
    }

    smartInputRef.current?.clear();
  };

  const handleCalendarFilesSubmit = async (files: File[], summaryEntryId?: string) => {
    const collected: CalendarEvent[] = [];
    for (const file of files) {
      try {
        const events = await parseICSFile(file);

        if (events.length > 0) {
          collected.push(...events);
          setUnsavedEvents(prev => [...prev, ...events]);
        }
      } catch (error) {
        const errorMessage = error instanceof Error
          ? `Failed to parse ${file.name}: ${error.message}`
          : `Failed to parse ${file.name}`;

        const processingId = `error-${Date.now()}`;
        setProcessingEvents(prev => [...prev, {
          id: processingId,
          type: 'text',
          status: 'error',
          error: errorMessage,
        }]);

        setTimeout(() => {
          setProcessingEvents(prev => prev.filter(p => p.id !== processingId));
        }, 5000);
      }
    }
    summarizeAndStore(summaryEntryId, '', collected);
  };

  const handleError = (errorMessage: string) => {
    const processingId = `error-${Date.now()}`;
    setProcessingEvents(prev => [...prev, {
      id: processingId,
      type: 'image',
      status: 'error',
      error: errorMessage,
    }]);

    setTimeout(() => {
      setProcessingEvents(prev => prev.filter(p => p.id !== processingId));
    }, 5000);
  };

  const handleRemoveFromQueue = (id: string) => {
    setProcessingEvents(prev => prev.filter(p => p.id !== id));
  };

  const handleExportFromHistory = (event: CalendarEvent) => {
    exportToICS(event);
  };

  const handleDeleteEvent = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (deleteConfirmId) {
      deleteEvent(deleteConfirmId);
      setDeleteConfirmId(null);

      const allEventsResult = eventStorage.getAllEvents();
      if (allEventsResult.success && allEventsResult.data) {
        setTotalEventsInStorage(allEventsResult.data.length - 1);
      }
    }
  };

  const cancelDelete = () => {
    setDeleteConfirmId(null);
  };

  // Stable so it doesn't defeat the <EventCard> memo on unrelated page re-renders.
  const handleBatchEventEdit = useCallback((updatedEvent: CalendarEvent) => {
    setUnsavedEvents(prev =>
      prev.map(e => e.id === updatedEvent.id ? updatedEvent : e)
    );
  }, []);

  const handleBatchEventDelete = (eventId: string) => {
    setUnsavedEvents(prev => prev.filter(e => e.id !== eventId));
  };

  const handleBatchEventExport = (event: CalendarEvent) => {
    exportToICS(event);
  };

  const handleReviewDraftEdit = useCallback((id: string, edit: ReviewFieldEdit) => {
    setReviewDrafts((previous) => previous.map((draft) =>
      draft.id === id ? editReviewDraft(draft, edit) : draft,
    ));
  }, []);

  const handleReviewDraftDelete = useCallback((id: string) => {
    setReviewDrafts((previous) => previous.filter((draft) => draft.id !== id));
  }, []);

  // Task 6 wires this selection to Scanner-owned ICS generation. Keeping the callback
  // boundary here means review drafts never cross into legacy CalendarEvent export code.
  const handleReviewDraftExport = useCallback((_drafts: readonly ReviewDraft[]) => {}, []);

  const handleCancelBatch = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBatchProcessing(null);
    setImageProcessingStatuses([]);
    setUrlProcessingStatus(null);
  };

  // Stable identities (state setters + a module import only) so the memoized
  // <EventCard>s aren't re-rendered just because the page re-rendered.
  const handleTzSuggestionApply = useCallback((eventId: string, timezone: string) => {
    setTzSuggestions(prev => {
      const next = { ...prev };
      delete next[eventId];
      return next;
    });
    setUnsavedEvents(prev => prev.map(e => {
      if (e.id !== eventId) return e;
      const newStart = e.rawStartDate ? convertRawToDate(e.rawStartDate, timezone) : e.startDate;
      const newEnd = e.rawEndDate ? convertRawToDate(e.rawEndDate, timezone) : e.endDate;
      return { ...e, timezone, startDate: newStart, endDate: newEnd, timezoneSource: 'llm' as const, timezoneStatus: 'resolved' as const };
    }));
  }, []);

  const handleTzSuggestionDismiss = useCallback((eventId: string) => {
    setTzSuggestions(prev => {
      const next = { ...prev };
      delete next[eventId];
      return next;
    });
  }, []);

  const handleTimezoneUserChange = useCallback((eventId: string) => {
    setUserTouchedTimezones(prev => new Set([...prev, eventId]));
  }, []);

  const formatDate = (date: Date) => {
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  const handleSortChange = (value: string) => {
    const option = value as EventSortOption;
    setSortOption(option);
    if (option === 'custom-range') {
      setShowDateRangePicker(true);
    } else {
      setShowDateRangePicker(false);
      setDateRange(null);
    }
  };

  const handleDateRangeSubmit = (start: string | Date, end: string | Date) => {
    const startDate = typeof start === 'string' ? new Date(start) : start;
    const endDate = typeof end === 'string' ? new Date(end) : end;
    if (typeof end === 'string') {
      endDate.setHours(23, 59, 59, 999);
    }
    setDateRange({ start: startDate, end: endDate });
    setSortOption('custom-range');
    setShowDateRangePicker(false);
  };

  const checkExportCooldown = (): number => {
    const COOLDOWN_WINDOW = 5 * 60 * 1000;
    const MAX_EXPORTS = 3;
    const storageKey = 'exportAllTimestamps';

    const storedData = localStorage.getItem(storageKey);
    const timestamps: number[] = storedData ? JSON.parse(storedData) : [];

    const now = Date.now();
    const validTimestamps = timestamps.filter(ts => now - ts < COOLDOWN_WINDOW);

    if (validTimestamps.length >= MAX_EXPORTS) {
      const oldestTimestamp = Math.min(...validTimestamps);
      const timeUntilReset = COOLDOWN_WINDOW - (now - oldestTimestamp);
      const secondsRemaining = Math.ceil(timeUntilReset / 1000);
      setExportCooldownRemaining(secondsRemaining);
      return secondsRemaining;
    }

    setExportCooldownRemaining(0);
    return 0;
  };

  const recordExportTimestamp = () => {
    const COOLDOWN_WINDOW = 5 * 60 * 1000;
    const storageKey = 'exportAllTimestamps';

    const storedData = localStorage.getItem(storageKey);
    const timestamps: number[] = storedData ? JSON.parse(storedData) : [];

    const now = Date.now();
    const validTimestamps = timestamps.filter(ts => now - ts < COOLDOWN_WINDOW);
    validTimestamps.push(now);

    localStorage.setItem(storageKey, JSON.stringify(validTimestamps));
  };

  const handleExportAll = async () => {
    const cooldown = checkExportCooldown();
    if (cooldown > 0) {
      return;
    }

    setExportAllState('loading');
    setExportAllError(null);

    try {
      const result = await exportAllEvents();

      if (result.success) {
        recordExportTimestamp();
        setExportAllState('success');

        setTimeout(() => {
          setExportAllState('idle');
        }, 5000);
      } else {
        setExportAllState('error');
        setExportAllError(result.error || 'Failed to export events');

        setTimeout(() => {
          setExportAllState('idle');
          setExportAllError(null);
        }, 3000);
      }
    } catch (error) {
      setExportAllState('error');
      setExportAllError(error instanceof Error ? error.message : 'Failed to export events');

      setTimeout(() => {
        setExportAllState('idle');
        setExportAllError(null);
      }, 3000);
    }
  };

  const hasStarted =
    unsavedEvents.length > 0 ||
    reviewDrafts.length > 0 ||
    (batchProcessing?.isProcessing ?? false) ||
    imageProcessingStatuses.length > 0 ||
    urlProcessingStatus !== null;
  // New visitors get the full landing; once you start — or if you've used it before — it recedes.
  const showMarketing = !hasStarted && totalEventsInStorage === 0;

  return (
    <main id="top" className="min-h-screen rainbow-gradient-bg flex flex-col">
      <RateLimitBanner rateLimitInfo={rateLimitInfo} />
      <SiteNav showHow={showMarketing} />

      <div className="flex-1 w-full max-w-2xl mx-auto px-6 pb-4">
        {/* Hero — the headline riffs on the name */}
        <header className="text-center pt-16 pb-9">
          <h1 className="rise rise-1 display text-[clamp(2.6rem,8vw,4.25rem)] leading-[1.04] text-black">
            Event <span className="rainbow-flow brand-glow">everything</span>.
          </h1>
          <p className="rise rise-2 mt-5 text-lg sm:text-xl text-gray-600 max-w-md mx-auto leading-snug">
            Turn a flyer, screenshot, email, link — into a{" "}
            <span className="text-black">calendar event.</span>
          </p>
        </header>

        {/* The input is the hero — offset shadow, staggered in */}
        <div
          className="rise rise-3 border-2 border-black bg-white p-[5px] h-[400px] offset-shadow"
          data-testid="input-box"
        >
          <SmartInput
            ref={smartInputRef}
            onSubmit={handleSmartInputSubmit}
            onError={handleError}
            onOpenHistory={() => setHistoryOpen(true)}
            hasHistory={inputHistory.length > 0}
          />
        </div>
        <p className="rise rise-4 mt-4 mb-10 text-center eyebrow text-black/40">
          Works with Apple · Google · Outlook
        </p>

        {/* Error notifications */}
        <ErrorNotification
          errors={processingEvents.filter(e => e.status === 'error' && e.error).map(e => ({
            id: e.id,
            type: e.type,
            error: e.error!,
          }))}
          onDismiss={handleRemoveFromQueue}
        />

        {/* Unified processing and unsaved events section */}
        <UnsavedEventsSection
          events={unsavedEvents}
          selection={selection}
          imageProcessingStatuses={imageProcessingStatuses}
          urlProcessingStatus={urlProcessingStatus}
          isProcessing={batchProcessing?.isProcessing || false}
          onEdit={handleBatchEventEdit}
          onDelete={handleBatchEventDelete}
          onExport={handleBatchEventExport}
          onCancelAll={handleCancelBatch}
          onExportComplete={(events) => {
            events.forEach(event => addEvent(event));
            setUnsavedEvents([]);
            setTotalEventsInStorage(prev => prev + events.length);
          }}
          tzSuggestions={tzSuggestions}
          onTzSuggestionApply={handleTzSuggestionApply}
          onTzSuggestionDismiss={handleTzSuggestionDismiss}
          onTimezoneUserChange={handleTimezoneUserChange}
        />

        <ReviewDraftSection
          drafts={reviewDrafts}
          onEdit={handleReviewDraftEdit}
          onDelete={handleReviewDraftDelete}
          onExport={handleReviewDraftExport}
        />

        {/* Marketing — recedes the moment you start */}
        <div className={`collapsible ${showMarketing ? '' : 'is-collapsed'}`}>
          <div>
            <HowItWorks />
            <TrustPoints />
            <Faq />
          </div>
        </div>

        {/* Saved events */}
        {totalEventsInStorage > 0 && (
          <div className="pt-16">
            <p className="eyebrow text-black/40 mb-4">Your events</p>
            <div className="mb-4 flex gap-4 items-center justify-between">
              <div className="flex gap-4 items-center">
                <label htmlFor="sort-select" className="text-black font-semibold">
                  Sort by:
                </label>
                <select
                  id="sort-select"
                  value={sortOption}
                  onChange={(e) => handleSortChange(e.target.value)}
                  onFocus={(e) => {
                    if (e.target.value === 'custom-range') {
                      setShowDateRangePicker(true);
                    }
                  }}
                  className="px-4 py-2 border-2 border-black bg-white text-black focus:outline-none focus:ring-2 focus:ring-black"
                >
                  <option value="upcoming">Upcoming Events</option>
                  <option value="created-newest">Recently Created</option>
                  <option value="created-oldest">Oldest First</option>
                  <option value="today">Today</option>
                  <option value="custom-range">Custom</option>
                </select>
              </div>

              <button
                onClick={handleExportAll}
                disabled={exportAllState === 'loading' || exportAllState === 'success' || exportCooldownRemaining > 0}
                className="px-6 py-2 bg-black text-white border-2 border-black hover:bg-white hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-400 disabled:border-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                title={exportCooldownRemaining > 0 ? `Cooldown: ${exportCooldownRemaining}s remaining` : undefined}
              >
                {exportAllState === 'loading' && (
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                {exportAllState === 'success' && (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {exportAllState === 'error' && (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                <span>
                  {exportAllState === 'loading' && 'Exporting...'}
                  {exportAllState === 'success' && 'Exported!'}
                  {exportAllState === 'error' && (exportAllError || 'Error')}
                  {exportAllState === 'idle' && exportCooldownRemaining > 0 && `Breather ${exportCooldownRemaining}s`}
                  {exportAllState === 'idle' && exportCooldownRemaining === 0 && 'Export all'}
                </span>
              </button>
            </div>

            {events.length > 0 ? (
            <div className="max-h-[99vh] overflow-y-auto">
              <div className="border-2 border-black">
              {events.map((event, index) => (
                <div
                  key={event.id}
                  className={`p-4 bg-white ${index > 0 ? 'border-t-2 border-black' : ''}`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <EventFields
                        mode="inline"
                        event={event}
                        onChange={(updatedEvent) => updateEvent(updatedEvent)}
                        showAttachments={true}
                      />
                    </div>
                    <button
                      onClick={() => handleDeleteEvent(event.id)}
                      className="ml-2 text-black hover:text-gray-600 focus:outline-none flex-shrink-0"
                      aria-label={`Delete ${event.title}`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <p className="text-gray-500 text-xs mb-3">
                    Created: {formatDate(event.created)}
                  </p>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleExportFromHistory(event)}
                      className="flex-1 px-4 py-2 bg-black text-white border-2 border-black hover:bg-white hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                      aria-label={`Export ${event.title}`}
                    >
                      Export
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
            ) : (
              <div className="border-2 border-black bg-white p-8 text-center">
                <p className="text-gray-600">No events match the current filter. Try a different sort option.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <SiteFooter />

      {deleteConfirmId && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center"
            onClick={cancelDelete}
          >
            <div
              className="bg-white border-4 border-black pt-6 px-6 pb-4 max-w-sm mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-lg font-bold text-center mb-4">
                Delete forever?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={cancelDelete}
                  className="flex-1 py-1.5 px-4 bg-white text-black border-4 border-black hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-black text-sm font-bold"
                >
                  No
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 py-1.5 px-4 bg-red-500 text-white border-4 border-black hover:bg-red-600 transition-colors focus:outline-none focus:ring-2 focus:ring-black text-sm font-bold"
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {showDateRangePicker && (
        <div
          className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowDateRangePicker(false);
            setIsCustomMode(false);
          }}
        >
          <div
            className="bg-white border-2 border-black p-8 w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-6">Select Date Range</h2>

            <div className="mb-6">
              <div className="grid grid-cols-6 gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const start = new Date(now.getTime() - 60 * 60 * 1000);
                    setLastPresetDates({ start, end: now });
                    setIsCustomMode(false);
                    setSelectedPreset('last-hour');
                  }}
                  className={`px-2 py-2 text-xs border-2 border-black transition-colors focus:outline-none focus:ring-2 focus:ring-black ${
                    selectedPreset === 'last-hour'
                      ? 'bg-black text-white'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  Last Hour
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    setLastPresetDates({ start, end: now });
                    setIsCustomMode(false);
                    setSelectedPreset('last-24h');
                  }}
                  className={`px-2 py-2 text-xs border-2 border-black transition-colors focus:outline-none focus:ring-2 focus:ring-black ${
                    selectedPreset === 'last-24h'
                      ? 'bg-black text-white'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  Last 24h
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const start = new Date(now.getTime() - 48 * 60 * 60 * 1000);
                    setLastPresetDates({ start, end: now });
                    setIsCustomMode(false);
                    setSelectedPreset('last-48h');
                  }}
                  className={`px-2 py-2 text-xs border-2 border-black transition-colors focus:outline-none focus:ring-2 focus:ring-black ${
                    selectedPreset === 'last-48h'
                      ? 'bg-black text-white'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  Last 48h
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    setLastPresetDates({ start, end: now });
                    setIsCustomMode(false);
                    setSelectedPreset('last-week');
                  }}
                  className={`px-2 py-2 text-xs border-2 border-black transition-colors focus:outline-none focus:ring-2 focus:ring-black ${
                    selectedPreset === 'last-week'
                      ? 'bg-black text-white'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  Last Week
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    setLastPresetDates({ start, end: now });
                    setIsCustomMode(false);
                    setSelectedPreset('last-month');
                  }}
                  className={`px-2 py-2 text-xs border-2 border-black transition-colors focus:outline-none focus:ring-2 focus:ring-black ${
                    selectedPreset === 'last-month'
                      ? 'bg-black text-white'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  Last Month
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const start = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
                    setLastPresetDates({ start, end: now });
                    setIsCustomMode(false);
                    setSelectedPreset('last-3-days');
                  }}
                  className={`px-2 py-2 text-xs border-2 border-black transition-colors focus:outline-none focus:ring-2 focus:ring-black ${
                    selectedPreset === 'last-3-days'
                      ? 'bg-black text-white'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  Last 3 Days
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const end = new Date(now.getTime() + 60 * 60 * 1000);
                    setLastPresetDates({ start: now, end });
                    setIsCustomMode(false);
                    setSelectedPreset('next-hour');
                  }}
                  className={`px-2 py-2 text-xs border-2 border-black transition-colors focus:outline-none focus:ring-2 focus:ring-black ${
                    selectedPreset === 'next-hour'
                      ? 'bg-black text-white'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  Next Hour
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                    setLastPresetDates({ start: now, end });
                    setIsCustomMode(false);
                    setSelectedPreset('next-24h');
                  }}
                  className={`px-2 py-2 text-xs border-2 border-black transition-colors focus:outline-none focus:ring-2 focus:ring-black ${
                    selectedPreset === 'next-24h'
                      ? 'bg-black text-white'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  Next 24h
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const end = new Date(now.getTime() + 48 * 60 * 60 * 1000);
                    setLastPresetDates({ start: now, end });
                    setIsCustomMode(false);
                    setSelectedPreset('next-48h');
                  }}
                  className={`px-2 py-2 text-xs border-2 border-black transition-colors focus:outline-none focus:ring-2 focus:ring-black ${
                    selectedPreset === 'next-48h'
                      ? 'bg-black text-white'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  Next 48h
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                    setLastPresetDates({ start: now, end });
                    setIsCustomMode(false);
                    setSelectedPreset('next-week');
                  }}
                  className={`px-2 py-2 text-xs border-2 border-black transition-colors focus:outline-none focus:ring-2 focus:ring-black ${
                    selectedPreset === 'next-week'
                      ? 'bg-black text-white'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  Next Week
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
                    setLastPresetDates({ start: now, end });
                    setIsCustomMode(false);
                    setSelectedPreset('next-month');
                  }}
                  className={`px-2 py-2 text-xs border-2 border-black transition-colors focus:outline-none focus:ring-2 focus:ring-black ${
                    selectedPreset === 'next-month'
                      ? 'bg-black text-white'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  Next Month
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomMode(true);
                    setSelectedPreset('custom');
                  }}
                  className={`px-2 py-2 text-xs border-2 border-black transition-colors focus:outline-none focus:ring-2 focus:ring-black ${
                    selectedPreset === 'custom'
                      ? 'bg-black text-white shadow-[inset_4px_4px_0px_rgba(255,255,255,0.3)]'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  Custom
                </button>
              </div>
            </div>

            {isCustomMode && (
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <label htmlFor="start-date" className="block mb-2 font-semibold">
                    Start Date
                  </label>
                  <input
                    type="date"
                    id="start-date"
                    name="start"
                    defaultValue={(() => {
                      if (lastPresetDates) {
                        return lastPresetDates.start.toISOString().split('T')[0];
                      }
                      const now = new Date();
                      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
                      return threeDaysAgo.toISOString().split('T')[0];
                    })()}
                    className="w-full px-4 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
                <div>
                  <label htmlFor="end-date" className="block mb-2 font-semibold">
                    End Date
                  </label>
                  <input
                    type="date"
                    id="end-date"
                    name="end"
                    defaultValue={(() => {
                      if (lastPresetDates) {
                        return lastPresetDates.end.toISOString().split('T')[0];
                      }
                      return new Date().toISOString().split('T')[0];
                    })()}
                    className="w-full px-4 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => {
                  setShowDateRangePicker(false);
                  setIsCustomMode(false);
                }}
                className="flex-1 px-6 py-2 bg-white text-black border-2 border-black hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-black"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isCustomMode) {
                    const startInput = document.getElementById('start-date') as HTMLInputElement;
                    const endInput = document.getElementById('end-date') as HTMLInputElement;
                    if (startInput && endInput && startInput.value && endInput.value) {
                      handleDateRangeSubmit(startInput.value, endInput.value);
                      setShowDateRangePicker(false);
                    }
                  } else if (lastPresetDates) {
                    handleDateRangeSubmit(lastPresetDates.start, lastPresetDates.end);
                    setShowDateRangePicker(false);
                  }
                }}
                className="flex-1 px-6 py-2 bg-black text-white border-2 border-black hover:bg-white hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-black"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
      <InputHistoryModal
        open={historyOpen}
        entries={inputHistory}
        onClose={() => setHistoryOpen(false)}
        onApply={handleApplyInput}
        pendingSummaryIds={pendingSummaryIds}
      />
    </main>
  );
}
