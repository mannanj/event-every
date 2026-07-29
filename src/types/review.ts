import type {
  CandidateField,
  EventCandidate,
  IcsReadiness,
  ScannerIssue,
  SourceHandle,
} from '@event-every/scanner';

type ReviewSourceHandle = Extract<SourceHandle, { kind: 'text' | 'image' }>;

export type ReviewSource = Readonly<{
  handle: ReviewSourceHandle;
  label: string | null;
}>;

export type ReviewDraft = Readonly<{
  id: string;
  exportUid: string;
  createdAt: string;
  candidate: EventCandidate;
  scanIssues: readonly ScannerIssue[];
  readiness: IcsReadiness;
  source: ReviewSource;
}>;

export type ReviewFieldEdit =
  | Readonly<{
    field: Exclude<CandidateField, 'sourceUid' | 'temporal' | 'recurrence'>;
    value: string | null;
  }>
  | Readonly<{
    field: 'temporal';
    value: EventCandidate['temporal']['value'];
  }>
  | Readonly<{
    field: 'recurrence';
    value: EventCandidate['recurrence']['value'];
  }>;
