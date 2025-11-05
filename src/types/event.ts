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
  allDay: boolean;
  created: Date;
  source: 'image' | 'text';
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
