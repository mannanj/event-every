'use client';

import { useEffect, useMemo, useState } from 'react';
import { StoredInputFile } from '@/types/input';
import ImageModal from './ImageModal';

/**
 * The files an input was scanned from, as a row of tiles.
 *
 * `md` is the 128px tile the smart input uses while you are composing; `sm` is
 * the half-size tile for showing an event's source alongside its fields, where
 * the row is a footnote to the text rather than the subject of the screen.
 */
export type AttachmentTileSize = 'sm' | 'md';

interface InputAttachmentsProps {
  files: StoredInputFile[];
  size?: AttachmentTileSize;
  className?: string;
}

interface ImagePreview {
  file: File;
  preview: string;
}

// The index badge is dropped at `sm`: on a 64px tile it covered a third of the
// image, and position already carries the ordering the badge was there to give.
const TILE = {
  sm: { box: 'w-[64px] h-[64px]', gap: 'gap-1.5', icon: 'w-7 h-7', badge: null },
  md: { box: 'w-[128px] h-[128px]', gap: 'gap-2', icon: 'w-12 h-12', badge: 'text-xs px-1.5 py-0.5' },
} as const;

export default function InputAttachments({ files, size = 'md', className }: InputAttachmentsProps) {
  const [previews, setPreviews] = useState<ImagePreview[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const images = useMemo(() => files.filter((f) => f.kind === 'image'), [files]);
  const calendarFiles = useMemo(() => files.filter((f) => f.kind === 'calendar'), [files]);

  useEffect(() => {
    // createObjectURL can throw on a File rehydrated from IndexedDB whose blob
    // no longer resolves; a skipped tile beats a broken <img src="">.
    const built: ImagePreview[] = [];
    for (const stored of images) {
      try {
        built.push({ file: stored.file, preview: URL.createObjectURL(stored.file) });
      } catch {
        continue;
      }
    }
    setPreviews(built);

    return () => built.forEach(({ preview }) => URL.revokeObjectURL(preview));
  }, [images]);

  if (files.length === 0) return null;

  const tile = TILE[size];

  const downloadCalendarFile = (stored: StoredInputFile) => {
    const url = URL.createObjectURL(stored.file);
    const link = document.createElement('a');
    link.href = url;
    link.download = stored.name;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={className} data-testid="unsaved-attachments">
      <div className={`flex ${tile.gap} overflow-x-auto`}>
        {previews.map((img, index) => (
          <div
            key={`att-img-${index}`}
            className="relative flex-shrink-0"
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <button
              onClick={() => setSelectedImageIndex(index)}
              className={`${tile.box} border-2 border-black bg-white cursor-pointer overflow-hidden hover:border-gray-600 transition-colors relative block focus:outline-none focus:ring-2 focus:ring-black`}
              aria-label={`View attachment ${index + 1}: ${img.file.name}`}
            >
              <img
                src={img.preview || undefined}
                alt={`Attachment ${index + 1}`}
                className="w-full h-full object-cover"
              />
              {tile.badge && (
                <div className={`absolute bottom-0.5 left-0.5 bg-black bg-opacity-75 text-white rounded ${tile.badge}`}>
                  #{index + 1}
                </div>
              )}
            </button>

            {hoveredIndex === index && selectedImageIndex === null && (
              <div className="absolute bottom-full left-0 mb-2 z-50 pointer-events-none">
                <div className="bg-white border-2 border-black p-3 shadow-xl">
                  <img
                    src={img.preview || undefined}
                    alt={`Preview ${index + 1}`}
                    className="max-w-lg max-h-96 object-contain"
                  />
                  <p className="text-black text-xs mt-2 text-center truncate max-w-lg">{img.file.name}</p>
                </div>
              </div>
            )}
          </div>
        ))}

        {calendarFiles.map((cal, index) => (
          <div key={`att-cal-${index}`} className="relative flex-shrink-0">
            <button
              onClick={() => downloadCalendarFile(cal)}
              className={`${tile.box} border-2 border-black bg-gray-100 overflow-hidden hover:border-gray-600 transition-colors relative flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-black`}
              aria-label={`Download calendar file ${cal.name}`}
            >
              <svg className={`${tile.icon} text-gray-700`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {tile.badge && (
                <div className={`absolute bottom-0.5 left-0.5 bg-black bg-opacity-75 text-white rounded ${tile.badge}`}>
                  #{index + 1}
                </div>
              )}
            </button>
          </div>
        ))}
      </div>

      {selectedImageIndex !== null && (
        <ImageModal
          images={previews}
          initialIndex={selectedImageIndex}
          onClose={() => setSelectedImageIndex(null)}
        />
      )}
    </div>
  );
}
