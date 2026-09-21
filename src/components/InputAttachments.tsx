'use client';

import { useEffect, useMemo, useState } from 'react';
import { StoredInputFile } from '@/types/input';
import ImageModal from './ImageModal';

interface InputAttachmentsProps {
  files: StoredInputFile[];
}

interface ImagePreview {
  file: File;
  preview: string;
}

export default function InputAttachments({ files }: InputAttachmentsProps) {
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

  const downloadCalendarFile = (stored: StoredInputFile) => {
    const url = URL.createObjectURL(stored.file);
    const link = document.createElement('a');
    link.href = url;
    link.download = stored.name;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="px-4 pt-3 pb-2 border-t-2 border-black" data-testid="unsaved-attachments">
      <p className="text-xs tracking-widest text-gray-500 mb-2">ATTACHMENTS</p>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {previews.map((img, index) => (
          <div
            key={`att-img-${index}`}
            className="relative group flex-shrink-0 pt-1 pr-1"
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <button
              onClick={() => setSelectedImageIndex(index)}
              className="w-[128px] h-[128px] border-2 border-black bg-white cursor-pointer overflow-hidden hover:border-gray-600 transition-colors relative block focus:outline-none focus:ring-2 focus:ring-black"
              aria-label={`View attachment ${index + 1}: ${img.file.name}`}
            >
              <img
                src={img.preview || undefined}
                alt={`Attachment ${index + 1}`}
                className="w-full h-full object-cover"
              />
              {index === 0 && (
                <div className="absolute top-1 left-1 bg-black text-white text-xs px-2 py-1 font-medium">
                  {previews.length} {previews.length === 1 ? 'image' : 'images'}
                </div>
              )}
              <div className="absolute bottom-1 left-1 bg-black bg-opacity-75 text-white text-xs px-1.5 py-0.5 rounded">
                #{index + 1}
              </div>
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
          <div key={`att-cal-${index}`} className="relative group flex-shrink-0 pt-1 pr-1">
            <button
              onClick={() => downloadCalendarFile(cal)}
              className="w-[128px] h-[128px] border-2 border-black bg-gray-100 overflow-hidden hover:border-gray-600 transition-colors relative flex items-center justify-center p-2 focus:outline-none focus:ring-2 focus:ring-black"
              aria-label={`Download calendar file ${cal.name}`}
            >
              <svg className="w-12 h-12 text-gray-700 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {index === 0 && (
                <div className="absolute top-1 left-1 bg-black text-white text-xs px-2 py-1 font-medium leading-tight">
                  <div className="whitespace-nowrap">{calendarFiles.length} Calendar</div>
                  <div className="whitespace-nowrap">{calendarFiles.length === 1 ? 'File' : 'Files'}</div>
                </div>
              )}
              <div className="absolute bottom-1 left-1 bg-black bg-opacity-75 text-white text-xs px-1.5 py-0.5 rounded">
                #{index + 1}
              </div>
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
