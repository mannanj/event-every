'use client';

interface UndoRemovalRowProps {
  title: string;
  onUndo: () => void;
}

/**
 * The slim row a removed card leaves behind, in the spot the card occupied.
 *
 * Its two halves sit in the card's own columns rather than at the row's edges:
 * 44px in from the left is where a card's title starts (12px padding + a 20px
 * checkbox + a 12px gap). 48px in from the right is where the trash glyph ends:
 * 12px padding, the 28px caret, a 4px gap, then the trash button's own 4px of
 * padding. So the name reads from the title's column and the word "Undo" ends
 * exactly under the icon that removed the card, not under its hit area.
 */
export default function UndoRemovalRow({ title, onUndo }: UndoRemovalRowProps) {
  return (
    <div
      data-testid="undo-removal-row"
      className="border-t-2 border-black bg-gray-50 pl-11 pr-12 py-2 flex items-center justify-between gap-3"
    >
      <p className="text-sm italic text-gray-600 truncate" title={title}>
        Removed {title}
      </p>
      <button
        type="button"
        data-testid="undo-removal-button"
        onClick={onUndo}
        className="text-sm italic text-gray-600 hover:text-black inline-flex items-center gap-1.5 flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-black"
        aria-label={`Undo removing ${title}`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
        </svg>
        <span>Undo</span>
      </button>
    </div>
  );
}
