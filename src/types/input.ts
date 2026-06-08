export type InputSource = 'text' | 'image' | 'mixed';

export interface StoredInputFile {
  id: string;
  file: File;
  kind: 'image' | 'calendar';
  name: string;
  mimeType: string;
  size: number;
  eventCount?: number;
}

export interface InputDraft {
  text: string;
  files: StoredInputFile[];
  updatedAt: number;
}

export interface InputHistoryEntry {
  id: string;
  createdAt: number;
  text: string;
  files: StoredInputFile[];
  source: InputSource;
}
