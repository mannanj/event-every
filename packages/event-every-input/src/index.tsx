'use client';

import { useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { acceptAttribute, describeInput, inputFromFile, inputFromText, InputRefused, type EventEveryInput } from './input-kinds';

export * from './input-kinds';

/**
 * Event Every's input, for another app to put at the top of its own
 * create-an-event flow.
 *
 *   signed out:  ┃ Use Event Every                         [Sign in] ┃  (blue)
 *   signed in:   ┌─────────────────────────────────────────────────┐
 *                │ Paste an invite, a link, or drop an .ics / photo │
 *                │                        Provided by Event Every ↗ │
 *                └─────────────────────────────────────────────────┘
 *
 * UI ONLY. It never calls Event Every itself: the host app signs in (OAuth,
 * through its own server - see @mannan/mcp-connector's linked-app.ts) and
 * passes `onRead`, which gets one sorted input and resolves when the host has
 * done with the events. That keeps the token on the host's server and lets
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
  const [reading, setReading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (input: EventEveryInput | null) => {
    if (!input || reading) return;
    setError(null);
    setReading(describeInput(input));
    try {
      await onRead(input);
      setText('');
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Event Every could not read that.');
    } finally {
      setReading(null);
    }
  };

  const fromFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      await run(await inputFromFile(file));
    } catch (e) {
      setError(e instanceof InputRefused ? e.message : 'Could not open that file.');
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void run(inputFromText(text));
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const file = e.clipboardData.files[0];
    if (file) {
      e.preventDefault();
      void fromFile(file);
    }
  };

  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void fromFile(file);
    else {
      const dropped = e.dataTransfer.getData('text/plain');
      if (dropped) void run(inputFromText(dropped));
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

  return (
    <section
      className={`${cls} eei--signed-in${dragging ? ' is-dragging' : ''}${reading ? ' is-reading' : ''}`}
      aria-label="Use Event Every"
      aria-busy={reading ? true : undefined}
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
          rows={2}
          value={text}
          placeholder={placeholder}
          readOnly={reading !== null}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
        <span className="eei-actions">
          <button
            type="button"
            className="eei-icon"
            aria-label="Choose a file"
            disabled={reading !== null}
            onClick={() => fileRef.current?.click()}
          >
            <PaperclipGlyph />
          </button>
          <button
            type="button"
            className="eei-icon eei-go"
            aria-label="Read with Event Every"
            disabled={reading !== null || !text.trim()}
            onClick={() => void run(inputFromText(text))}
          >
            <ArrowGlyph />
          </button>
        </span>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept={acceptAttribute()}
          onChange={(e) => {
            void fromFile(e.target.files?.[0]);
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
