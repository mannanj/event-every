'use client';

import { useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { acceptAttribute, collectInput, describeInput, fileKind, InputRefused, MAX_PHOTOS, refusalFor, type EventEveryInput } from './input-kinds';

export * from './input-kinds';

/**
 * Event Every's input, for another app to put at the top of its own
 * create-an-event flow. The same input as Event Every's site, smaller.
 *
 *   signed out:  ┃ Use Event Every                         [Sign in] ┃  (blue)
 *   signed in:   ┌─────────────────────────────────────────────────┐
 *                │ Paste an invite, a link, or drop an .ics / photo │ ⤢ 📎 →
 *                │ [▣ shot.png ×]                                   │
 *                │                        Provided by Event Every ↗ │
 *                └─────────────────────────────────────────────────┘
 *
 * As on the site, what goes in the box is held until it is sent: a link typed
 * and a screenshot pasted under it are read together, as one input. ⤢ opens
 * the same input full size.
 *
 * UI ONLY. It never calls Event Every itself: the host app signs in (OAuth,
 * through its own server - see @mannan/mcp-connector's linked-app.ts) and
 * passes `onRead`, which gets everything in the box and resolves when the host
 * has done with the events. That keeps the token on the host's server and lets
 * each host decide what "use these events" means.
 *
 * Skinned through custom properties (styles.css), like the MCP connector.
 */

export type EventEveryStatus = 'unknown' | 'signed-out' | 'signed-in' | 'unavailable';

export interface EventEveryBarProps {
  status: EventEveryStatus;
  onSignIn: () => void;
  /** Resolve when the events are in; throw with a person-readable message to show it. */
  onRead: (input: EventEveryInput) => Promise<void>;
  href?: string;
  placeholder?: string;
  className?: string;
}

export const EVENT_EVERY_HREF = 'https://eventevery.com';

/** "Provided by Event Every", the name in the rainbow, linking home. */
export function ProvidedBy({ href = EVENT_EVERY_HREF }: { href?: string }) {
  return (
    <span className="eei-credit">
      Provided by{' '}
      <a className="eei-rainbow" href={href} target="_blank" rel="noopener">
        Event Every
      </a>
    </span>
  );
}

export function EventEveryBar({
  status,
  onSignIn,
  onRead,
  href = EVENT_EVERY_HREF,
  placeholder = 'Paste an invite, a link, or drop an .ics or photo',
  className,
}: EventEveryBarProps) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Hold files in the box beside the words; nothing is read until it is sent. */
  const hold = (added: readonly File[]) => {
    if (reading || added.length === 0) return;
    const refused = added.map(refusalFor).find(Boolean);
    const ok = added.filter((f) => !refusalFor(f));
    const photos = [...files, ...ok].filter((f) => fileKind(f) === 'photo').length;
    if (photos > MAX_PHOTOS) {
      setError(`Up to ${MAX_PHOTOS} photos at a time.`);
      return;
    }
    setError(refused ?? null);
    if (ok.length) setFiles((held) => [...held, ...ok]);
  };

  const send = async () => {
    if (reading) return;
    setError(null);
    let input: EventEveryInput | null;
    try {
      input = await collectInput(text, files);
    } catch (e) {
      setError(e instanceof InputRefused ? e.message : 'Could not open that file.');
      return;
    }
    if (!input) return;
    setReading(describeInput(input));
    try {
      await onRead(input);
      setText('');
      setFiles([]);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Event Every could not read that.');
    } finally {
      setReading(null);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = Array.from(e.clipboardData.files);
    if (pasted.length) {
      e.preventDefault();
      hold(pasted);
    }
  };

  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) hold(dropped);
    else {
      const words = e.dataTransfer.getData('text/plain');
      if (words) setText((t) => (t.trim() ? `${t}\n${words}` : words));
    }
  };

  const cls = ['eei', className].filter(Boolean).join(' ');

  if (status === 'unknown' || status === 'unavailable') return null;

  if (status === 'signed-out') {
    return (
      <section className={`${cls} eei--signed-out`} aria-label="Use Event Every" data-testid="event-every-bar">
        <span className="eei-head">Use Event Every</span>
        <button type="button" className="eei-signin" onClick={onSignIn}>
          Sign in
        </button>
      </section>
    );
  }

  const busy = reading !== null;
  return (
    <section
      className={`${cls} eei--signed-in${expanded ? ' eei--expanded' : ''}${dragging ? ' is-dragging' : ''}${busy ? ' is-reading' : ''}`}
      aria-label="Use Event Every"
      aria-busy={busy || undefined}
      data-testid="event-every-bar"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className="eei-field">
        <textarea
          className="eei-text"
          aria-label="Use Event Every"
          rows={expanded ? 8 : 2}
          value={text}
          placeholder={placeholder}
          readOnly={busy}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
        <span className="eei-actions">
          <button
            type="button"
            className="eei-icon"
            aria-label={expanded ? 'Make the input smaller' : 'Open the full input'}
            aria-pressed={expanded}
            title={expanded ? 'Smaller' : 'Full size'}
            onClick={() => setExpanded((x) => !x)}
          >
            {expanded ? <CollapseGlyph /> : <ExpandGlyph />}
          </button>
          <button
            type="button"
            className="eei-icon"
            aria-label="Add a file"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <PaperclipGlyph />
          </button>
          <button
            type="button"
            className="eei-icon eei-go"
            aria-label="Read with Event Every"
            disabled={busy || (!text.trim() && files.length === 0)}
            onClick={() => void send()}
          >
            <ArrowGlyph />
          </button>
        </span>
        {files.length > 0 && (
          <ul className="eei-files" aria-label="Added files">
            {files.map((file, i) => (
              <li key={`${file.name}-${i}`} className="eei-file">
                <span className="eei-file__kind" aria-hidden="true">{fileKind(file) === 'calendar' ? <CalendarGlyph /> : <PhotoGlyph />}</span>
                <span className="eei-file__name">{file.name || (fileKind(file) === 'calendar' ? 'Calendar file' : 'Photo')}</span>
                <button
                  type="button"
                  className="eei-file__remove"
                  aria-label={`Remove ${file.name || 'file'}`}
                  disabled={busy}
                  onClick={() => setFiles((held) => held.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          ref={fileRef}
          type="file"
          hidden
          multiple
          accept={acceptAttribute()}
          onChange={(e) => {
            hold(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        <ProvidedBy href={href} />
      </div>
      {reading && (
        <p className="eei-status" role="status">
          {reading}…
        </p>
      )}
      {error && !reading && (
        <p className="eei-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * "Apply <value>?" beside a field's label, for a value Event Every found that
 * the person had already typed over. Applying swaps it in and leaves an undo
 * arrow - only here, only for a value applied from this button.
 */
export function ApplyChip({
  value,
  applied,
  onApply,
  onUndo,
  field,
}: {
  value: ReactNode;
  applied: boolean;
  onApply: () => void;
  onUndo: () => void;
  /** For the accessible names: "Apply title", "Undo title". */
  field: string;
}) {
  if (applied) {
    return (
      <button type="button" className="eei-chip eei-chip--undo" onClick={onUndo} aria-label={`Undo ${field}`} title="Undo">
        <UndoGlyph />
      </button>
    );
  }
  return (
    <button type="button" className="eei-chip" onClick={onApply} aria-label={`Apply ${field} from Event Every`}>
      Apply <span className="eei-chip__value">{value}</span>?
    </button>
  );
}

function ArrowGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function ExpandGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

function CollapseGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
    </svg>
  );
}

function PhotoGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m21 16-5-5-9 9" />
    </svg>
  );
}

function CalendarGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function PaperclipGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4L15.5 7" />
    </svg>
  );
}

function UndoGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}
