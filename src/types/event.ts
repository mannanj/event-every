export interface EventAttachment {
  id: string;
  filename: string;
  mimeType: string;
  data: string;
  type: 'original-image' | 'original-text' | 'llm-metadata';
  size: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  description?: string;
  url?: string;
  allDay: boolean;
  timezone?: string;
  created: Date;
  source: 'image' | 'text' | 'url';
  originalInput?: string;
  attachments?: EventAttachment[];
}

export interface OCRResult {
  text: string;
  confidence: number;
  error?: string;
}

export interface ParsedEvent {
  title?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  description?: string;
  url?: string;
  timezone?: string;
  confidence: number;
}

export interface BatchParsedEvents {
  events: ParsedEvent[];
  totalCount: number;
  confidence: number;
}

export interface StreamedEventChunk {
  events: ParsedEvent[];
  chunkIndex: number;
  isComplete: boolean;
}

export type EventSortOption =
  | 'upcoming'
  | 'created-newest'
  | 'created-oldest'
  | 'today'
  | 'last-hour'
  | 'last-24h'
  | 'last-48h'
  | 'last-week'
  | 'last-month'
  | 'next-hour'
  | 'next-24h'
  | 'next-48h'
  | 'next-week'
  | 'next-month'
  | 'custom-range';

export interface DateRange {
  start: Date;
  end: Date;
}

export interface ClientContext {
  currentDateTime: string;
  timezone: string;
  timezoneOffset: number;
  locale: string;
}
