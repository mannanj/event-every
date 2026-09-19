'use client';

interface UndoRemovalRowProps {
  title: string;
  onUndo: () => void;
}

/**
 * The slim row a removed card leaves behind, in the spot the card occupied.
 *
 * Deliberately short: it holds the place for a few seconds without pushing the
 * remaining cards around, and it is the only thing left in the section when the
 * card removed was the last one.
 */
export default function UndoRemovalRow({ title, onUndo }: UndoRemovalRowProps) {
  return (
    <div
      data-testid="undo-removal-row"
      className="border-t-2 border-black bg-gray-50 px-3 py-2 flex items-center justify-between gap-3"
    >
      <p className="text-xs text-gray-500 truncate" title={title}>
        Removed {title}
      </p>
      <button
        type="button"
        data-testid="undo-removal-button"
        onClick={onUndo}
        className="text-xs text-black underline hover:no-underline focus:outline-none focus:ring-2 focus:ring-black flex-shrink-0"
        aria-label={`Undo removing ${title}`}
      >
        Undo
      </button>
    </div>
  );
}
