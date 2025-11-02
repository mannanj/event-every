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
