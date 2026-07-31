import {
  generateIcs,
  type OmittedIcsField,
  type ScannerIssue,
} from '@event-every/scanner';
import type { ReviewDraft } from '@/types/review';

const scannerPolicy = (draft: ReviewDraft) => ({
  uid: draft.exportUid,
  dtstamp: draft.createdAt,
  prodId: '-//Event Every//Scanner//EN',
});

const calendarMimeType = 'text/calendar;charset=utf-8' as const;

export type BrowserDownloadEffects = Readonly<{
  download(input: Readonly<{
    calendarText: string;
    filename: string;
    mimeType: typeof calendarMimeType;
  }>): void;
}>;

export type ScannerExportResult =
  | Readonly<{ ok: true; warnings: readonly ScannerIssue[]; omittedFields: readonly OmittedIcsField[] }>
  | Readonly<{ ok: false; blockers: readonly ScannerIssue[]; warnings: readonly ScannerIssue[] }>;

type ScannerCalendar = Readonly<{
  calendarText: string;
  warnings: readonly ScannerIssue[];
  omittedFields: readonly OmittedIcsField[];
}>;

type ScannerGenerationFailure = Extract<ScannerExportResult, { ok: false }>;

type ScannerGenerator = (draft: ReviewDraft) => ScannerCalendar | ScannerGenerationFailure;

/** Internal dependency seam for deterministic exporter tests. */
type ScannerExporterDependencies = Readonly<{
  generateCalendar?: ScannerGenerator;
}>;

type CalendarEnvelope = Readonly<{
  header: string;
  event: string;
  footer: string;
  version: string;
  prodId: string;
}>;

function filenamePart(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  return sanitized || 'scanner-event';
}

function withIcsExtension(filename: string): string {
  const safe = filenamePart(filename);
  return safe.toLowerCase().endsWith('.ics') ? safe : `${safe}.ics`;
}

function exportFilename(draft: ReviewDraft): string {
  return withIcsExtension(draft.candidate.title.value ?? 'scanner-event');
}

function malformedCalendarIssue(message: string): ScannerIssue {
  return {
    code: 'field_incomplete',
    kind: 'incomplete',
    severity: 'blocker',
    field: 'temporal',
    message,
    evidence: [],
  };
}

function hasStrictCrLfFraming(calendarText: string): boolean {
  return !/(?:^|[^\r])\n|\r(?!\n)/.test(calendarText);
}

function parseCalendarEnvelope(calendarText: string): CalendarEnvelope | null {
  if (!hasStrictCrLfFraming(calendarText)) return null;
  const lines = calendarText.split('\r\n');
  if (lines.at(-1) !== '') return null;
  const content = lines.slice(0, -1);
  const componentMarkers = content.filter((line) => line.startsWith('BEGIN:') || line.startsWith('END:'));
  const expectedMarkers = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'END:VEVENT', 'END:VCALENDAR'];
  if (componentMarkers.length !== expectedMarkers.length || componentMarkers.some((line, index) => line !== expectedMarkers[index])) return null;

  const eventStart = content.indexOf('BEGIN:VEVENT');
  const eventEnd = content.indexOf('END:VEVENT');
  if (eventStart < 0 || eventEnd < 0 || eventStart >= eventEnd) return null;

  const headerLines = content.slice(0, eventStart);
  const footerLines = content.slice(eventEnd + 1);
  if (footerLines.length !== 1) return null;
  const version = 'VERSION:2.0';
  const prodId = 'PRODID:-//Event Every//Scanner//EN';
  const expectedHeader = ['BEGIN:VCALENDAR', version, prodId, 'CALSCALE:GREGORIAN'];
  if (headerLines.length !== expectedHeader.length || headerLines.some((line, index) => line !== expectedHeader[index])) return null;

  return {
    header: `${headerLines.join('\r\n')}\r\n`,
    event: `${content.slice(eventStart, eventEnd + 1).join('\r\n')}\r\n`,
    footer: `${footerLines[0]}\r\n`,
    version,
    prodId,
  };
}

function generatedCalendar(draft: ReviewDraft): ScannerCalendar | ScannerGenerationFailure {
  const result = generateIcs(draft.candidate, scannerPolicy(draft));
  if (!result.ok) {
    return { ok: false, blockers: result.blockers, warnings: result.warnings };
  }
  return result;
}

function isFailed(result: ScannerCalendar | ScannerGenerationFailure): result is ScannerGenerationFailure {
  return !('calendarText' in result);
}

export function createScannerExporter(
  effects: BrowserDownloadEffects,
  dependencies: ScannerExporterDependencies = {},
): Readonly<{
  exportReviewDraft(draft: ReviewDraft): ScannerExportResult;
  exportReviewDrafts(drafts: readonly ReviewDraft[], filename: string): ScannerExportResult;
}> {
  const generateCalendar = dependencies.generateCalendar ?? generatedCalendar;
  const exportReviewDraft = (draft: ReviewDraft): ScannerExportResult => {
    const result = generateCalendar(draft);
    if (isFailed(result)) return result;
    if (!hasStrictCrLfFraming(result.calendarText)) {
      return {
        ok: false,
        blockers: [malformedCalendarIssue('Scanner generated calendar text without strict CRLF line framing.')],
        warnings: result.warnings,
      };
    }
    effects.download({ calendarText: result.calendarText, filename: exportFilename(draft), mimeType: calendarMimeType });
    return { ok: true, warnings: result.warnings, omittedFields: result.omittedFields };
  };

  const exportReviewDrafts = (drafts: readonly ReviewDraft[], filename: string): ScannerExportResult => {
    const generated = drafts.map(generateCalendar);
    const failed = generated.filter(isFailed);
    if (failed.length > 0) {
      return {
        ok: false,
        blockers: failed.flatMap((result) => result.blockers),
        warnings: generated.flatMap((result) => result.warnings),
      };
    }

    const calendars = generated as ScannerCalendar[];
    const envelopes = calendars.map((result) => parseCalendarEnvelope(result.calendarText));
    const first = envelopes[0];
    if (!first || envelopes.some((envelope) => !envelope || envelope.version !== first.version || envelope.prodId !== first.prodId)) {
      return {
        ok: false,
        blockers: [malformedCalendarIssue('Scanner generated a malformed or incompatible iCalendar envelope.')],
        warnings: calendars.flatMap((result) => result.warnings),
      };
    }

    const calendarText = `${first.header}${envelopes.map((envelope) => envelope!.event).join('')}${first.footer}`;
    effects.download({ calendarText, filename: withIcsExtension(filename), mimeType: calendarMimeType });
    return {
      ok: true,
      warnings: calendars.flatMap((result) => result.warnings),
      omittedFields: calendars.flatMap((result) => result.omittedFields),
    };
  };

  return { exportReviewDraft, exportReviewDrafts };
}

export function createBrowserDownloadEffects(): BrowserDownloadEffects {
  return {
    download({ calendarText, filename, mimeType }) {
      const blob = new Blob([calendarText], { type: mimeType });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      try {
        document.body.appendChild(anchor);
        anchor.click();
      } finally {
        anchor.remove();
        URL.revokeObjectURL(objectUrl);
      }
    },
  };
}
