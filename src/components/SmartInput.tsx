'use client';

import { useState, useRef, useCallback, useImperativeHandle, forwardRef, useEffect } from 'react';
import URLPill from './URLPill';
import ImageModal from './ImageModal';
import ParticleButton from './ParticleButton';
import { parseICSFile } from '@/services/icsParser';
import { inputStorage } from '@/services/inputStorage';
import { StoredInputFile, InputDraft } from '@/types/input';

interface SmartInputProps {
  onSubmit: (data: { text: string; images: File[]; calendarFiles: File[] }) => void;
  onError: (error: string) => void;
  onOpenHistory: () => void;
  hasHistory: boolean;
}

export interface SmartInputHandle {
  clear: () => void;
  getDraft: () => { text: string; images: File[]; calendarFiles: File[] };
  loadInput: (text: string, files: StoredInputFile[]) => Promise<void>;
}

const MIN_TEXT_LENGTH = 3;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 25;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'];
const ACCEPTED_CALENDAR_TYPES = ['text/calendar', 'application/ics'];
const URL_REGEX = /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*))/gi;

function makeFileId(): string {
  return `f-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface ImagePreview {
  file: File;
  preview: string;
}

interface CalendarFilePreview {
  file: File;
  eventCount: number;
}

const SmartInput = forwardRef<SmartInputHandle, SmartInputProps>(
  function SmartInput({ onSubmit, onError, onOpenHistory, hasHistory }, ref) {
    const [text, setText] = useState('');
    const [images, setImages] = useState<ImagePreview[]>([]);
    const [calendarFiles, setCalendarFiles] = useState<CalendarFilePreview[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [detectedUrls, setDetectedUrls] = useState<string[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [hoveredImageIndex, setHoveredImageIndex] = useState<number | null>(null);
    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const editorRef = useRef<HTMLDivElement>(null);
    const restoredRef = useRef(false);

    const objectUrlsRef = useRef<string[]>([]);

    const applyStoredFiles = useCallback(async (files: StoredInputFile[]) => {
      // Revoke object URLs from a previous load before creating new ones.
      objectUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
      objectUrlsRef.current = [];

      const cals = files.filter(f => f.kind === 'calendar');
      setCalendarFiles(cals.map(c => ({ file: c.file, eventCount: c.eventCount ?? 0 })));

      // Render stored blobs via object URLs (synchronous + robust) instead of FileReader,
      // which can fail on an IndexedDB-restored File and leave an empty <img src="">.
      const imgs = files.filter(f => f.kind === 'image');
      const previews: ImagePreview[] = [];
      for (const f of imgs) {
        try {
          const url = URL.createObjectURL(f.file);
          objectUrlsRef.current.push(url);
          previews.push({ file: f.file, preview: url });
        } catch {
          // Unreadable stored blob — skip rather than render a broken image.
        }
      }
      setImages(previews);
    }, []);

    useEffect(
      () => () => {
        objectUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
      },
      []
    );

    // Imperatively set the editor's content for programmatic changes (clear / load / restore /
    // URL-pill removal). The contenteditable is otherwise uncontrolled — user typing flows
    // DOM -> state via onInput, so React never re-renders (and never clobbers) its children.
    const setEditorContent = useCallback((value: string) => {
      if (editorRef.current && editorRef.current.innerText !== value) {
        editorRef.current.innerText = value;
      }
      setText(value);
    }, []);

    useImperativeHandle(ref, () => ({
      clear: () => {
        objectUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
        objectUrlsRef.current = [];
        setEditorContent('');
        setImages([]);
        setCalendarFiles([]);
        setError(null);
        setDetectedUrls([]);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        inputStorage.clearDraft();
      },
      getDraft: () => ({
        text,
        images: images.map(img => img.file),
        calendarFiles: calendarFiles.map(cal => cal.file),
      }),
      loadInput: async (loadedText: string, files: StoredInputFile[]) => {
        setError(null);
        setEditorContent(loadedText);
        await applyStoredFiles(files);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      },
    }));

    useEffect(() => {
      const matches = text.match(URL_REGEX);
      if (matches) {
        const uniqueUrls = Array.from(new Set(matches));
        setDetectedUrls(uniqueUrls);
      } else {
        setDetectedUrls([]);
      }
    }, [text]);

    // Restore an in-progress draft (text + files) so a refresh/reload never loses work.
    useEffect(() => {
      let cancelled = false;
      inputStorage.getDraft().then(async draft => {
        if (cancelled) return;
        if (draft && (draft.text || draft.files.length > 0)) {
          if (editorRef.current) editorRef.current.innerText = draft.text || '';
          setText(draft.text || '');
          await applyStoredFiles(draft.files);
        } else if (editorRef.current?.innerText) {
          // The browser can restore contentEditable text (bfcache / form restore)
          // before React hydrates. Capture it into state so data-empty, the
          // placeholder, and the Transform button reflect the real DOM content.
          setText(editorRef.current.innerText);
        }
        restoredRef.current = true;
      });
      return () => {
        cancelled = true;
      };
    }, [applyStoredFiles]);

    // Persist the current draft (debounced) once the initial restore has run.
    useEffect(() => {
      if (!restoredRef.current) return;
      const handle = setTimeout(() => {
        const isEmpty = text.trim().length === 0 && images.length === 0 && calendarFiles.length === 0;
        if (isEmpty) {
          inputStorage.clearDraft();
          return;
        }
        const draft: InputDraft = {
          text,
          files: [
            ...images.map(img => ({
              id: makeFileId(),
              file: img.file,
              kind: 'image' as const,
              name: img.file.name,
              mimeType: img.file.type,
              size: img.file.size,
            })),
            ...calendarFiles.map(cal => ({
              id: makeFileId(),
              file: cal.file,
              kind: 'calendar' as const,
              name: cal.file.name,
              mimeType: cal.file.type || 'text/calendar',
              size: cal.file.size,
              eventCount: cal.eventCount,
            })),
          ],
          updatedAt: Date.now(),
        };
        inputStorage.saveDraft(draft);
      }, 400);
      return () => clearTimeout(handle);
    }, [text, images, calendarFiles]);

    const isImageFile = (file: File): boolean => {
      return ACCEPTED_IMAGE_TYPES.includes(file.type);
    };

    const isCalendarFile = (file: File): boolean => {
      return ACCEPTED_CALENDAR_TYPES.includes(file.type) || file.name.toLowerCase().endsWith('.ics');
    };

    const validateFile = (file: File): string | null => {
      const isImage = isImageFile(file);
      const isCalendar = isCalendarFile(file);

      if (!isImage && !isCalendar) {
        return 'Please upload a valid image file (JPEG, PNG, WebP, HEIC) or calendar file (.ics)';
      }
      if (file.size > MAX_FILE_SIZE) {
        return 'File size must be less than 10MB';
      }
      return null;
    };

    const handleFiles = useCallback(async (files: File[]) => {
      if (files.length === 0) return;

      const totalFiles = images.length + calendarFiles.length + files.length;
      if (totalFiles > MAX_FILES) {
        onError(`You can only upload up to ${MAX_FILES} files at once`);
        return;
      }

      const validImageFiles: File[] = [];
      const validCalendarFiles: File[] = [];
      const errors: string[] = [];

      files.forEach(file => {
        const errorMsg = validateFile(file);
        if (errorMsg) {
          errors.push(`${file.name}: ${errorMsg}`);
        } else {
          if (isImageFile(file)) {
            validImageFiles.push(file);
          } else if (isCalendarFile(file)) {
            validCalendarFiles.push(file);
          }
        }
      });

      if (errors.length > 0) {
        onError(errors.join('\n'));
      }

      if (validImageFiles.length === 0 && validCalendarFiles.length === 0) return;

      // Handle image files
      if (validImageFiles.length > 0) {
        const newPreviews: ImagePreview[] = [];
        validImageFiles.forEach((file) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            newPreviews.push({
              file,
              preview: reader.result as string,
            });
            if (newPreviews.length === validImageFiles.length) {
              setImages(prev => [...prev, ...newPreviews]);
            }
          };
          reader.readAsDataURL(file);
        });
      }

      // Handle calendar files
      if (validCalendarFiles.length > 0) {
        const newCalendarPreviews: CalendarFilePreview[] = [];
        for (const file of validCalendarFiles) {
          try {
            const events = await parseICSFile(file);
            newCalendarPreviews.push({
              file,
              eventCount: events.length,
            });
          } catch (error) {
            errors.push(`${file.name}: Failed to parse calendar file`);
          }
        }
        if (newCalendarPreviews.length > 0) {
          setCalendarFiles(prev => [...prev, ...newCalendarPreviews]);
        }
      }

      if (errors.length > 0) {
        onError(errors.join('\n'));
      }
    }, [images.length, calendarFiles.length, onError]);

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files).filter(file =>
        isImageFile(file) || isCalendarFile(file)
      );
      if (files.length > 0) {
        handleFiles(files);
      }
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFiles(Array.from(files));
      }
    };

    const handleImageClick = (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      setSelectedImageIndex(index);
    };

    const handleRemoveImage = (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      setImages(prev => prev.filter((_, i) => i !== index));
    };

    const handleRemoveCalendarFile = (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      setCalendarFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = useCallback(() => {
      setError(null);

      const trimmedText = text.trim();

      if (trimmedText.length < MIN_TEXT_LENGTH && images.length === 0 && calendarFiles.length === 0) {
        setError('Please enter at least 3 characters, add an image, or upload a calendar file');
        return;
      }

      onSubmit({
        text: trimmedText,
        images: images.map(img => img.file),
        calendarFiles: calendarFiles.map(cal => cal.file),
      });
    }, [text, images, calendarFiles, onSubmit]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    };

    const handleEditorInput = () => {
      setText(editorRef.current?.innerText ?? '');
      if (error) {
        setError(null);
      }
    };

    // Paste as plain text so rich flyer/email content doesn't inject markup.
    const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const plain = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, plain);
    };

    const handleRemoveUrl = (urlToRemove: string) => {
      setEditorContent((editorRef.current?.innerText ?? text).replace(urlToRemove, '').trim());
    };

    const handleUploadClick = () => {
      fileInputRef.current?.click();
    };

    const isButtonEnabled = text.trim().length >= MIN_TEXT_LENGTH || images.length > 0 || calendarFiles.length > 0;

    // Calculate content density (0 to 1) for sun-like color progression
    const calculateDensity = (): number => {
      let density = 0;

      // Images trigger immediate color (blue phase) - start at 0.15 for first image
      if (images.length > 0) {
        density += 0.15 + Math.min(0.35, (images.length - 1) / 10 * 0.35);
      }

      // Calendar files also trigger color
      if (calendarFiles.length > 0) {
        density += 0.15 + Math.min(0.35, (calendarFiles.length - 1) / 10 * 0.35);
      }

      // Text makes it darker - each character adds progression
      const textLength = text.trim().length;
      if (textLength > 0) {
        density += Math.min(0.5, (textLength / 80) * 0.5);
      }

      // URLs add additional density
      density += Math.min(0.15, (detectedUrls.length / 2) * 0.15);

      return Math.min(1, density);
    };

    const contentDensity = calculateDensity();

    return (
      <div className="w-full h-full flex flex-col">
        <div
          className={`relative flex-1 flex flex-col transition-all duration-200 ${
            isDragging ? 'bg-gray-50' : ''
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Files row at top - scrollable horizontally up to attach icon */}
          {(images.length > 0 || calendarFiles.length > 0) && (
            <div className="flex-shrink-0 pt-3 pl-2 pr-24 pb-2">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {/* Images first */}
                {images.map((img, index) => (
                  <div
                    key={`img-${index}`}
                    className="relative group flex-shrink-0 pt-1 pr-1"
                    onMouseEnter={() => setHoveredImageIndex(index)}
                    onMouseLeave={() => setHoveredImageIndex(null)}
                  >
                    <div
                      onClick={(e) => handleImageClick(e, index)}
                      className="w-[128px] h-[128px] border-2 border-black bg-white cursor-pointer overflow-hidden hover:border-gray-600 transition-colors relative"
                    >
                      <img
                        src={img.preview || undefined}
                        alt={`Uploaded ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      {/* Image count label on first image only */}
                      {index === 0 && (
                        <div className="absolute top-1 left-1 bg-black text-white text-xs px-2 py-1 font-medium">
                          {images.length} {images.length === 1 ? 'image' : 'images'}
                        </div>
                      )}
                      <div className="absolute bottom-1 left-1 bg-black bg-opacity-75 text-white text-xs px-1.5 py-0.5 rounded">
                        #{index + 1}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleRemoveImage(e, index)}
                      className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-600 text-white rounded-full flex items-center justify-center hover:bg-red-700 focus:outline-none z-50"
                      aria-label={`Remove image ${index + 1}`}
                    >
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 12h12" />
                      </svg>
                    </button>

                    {/* Enhanced tooltip preview */}
                    {hoveredImageIndex === index && (
                      <div className="absolute top-full left-0 mt-2 z-50 pointer-events-none">
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

                {/* Calendar files second */}
                {calendarFiles.map((cal, index) => (
                  <div
                    key={`cal-${index}`}
                    className="relative group flex-shrink-0 pt-1 pr-1"
                  >
                    <div
                      className="w-[128px] h-[128px] border-2 border-black bg-gray-100 overflow-hidden hover:border-gray-600 transition-colors relative flex items-center justify-center p-2"
                    >
                      {/* Calendar icon */}
                      <svg className="w-12 h-12 text-gray-700 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>

                      {/* Event count label on first calendar file only */}
                      {index === 0 && (
                        <div className="absolute top-1 left-1 bg-black text-white text-xs px-2 py-1 font-medium leading-tight">
                          <div className="whitespace-nowrap">{calendarFiles.length} Calendar</div>
                          <div className="whitespace-nowrap">{calendarFiles.length === 1 ? 'Event' : 'Events'}</div>
                        </div>
                      )}
                      <div className="absolute bottom-1 left-1 bg-black bg-opacity-75 text-white text-xs px-1.5 py-0.5 rounded">
                        #{index + 1}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleRemoveCalendarFile(e, index)}
                      className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-600 text-white rounded-full flex items-center justify-center hover:bg-red-700 focus:outline-none z-50"
                      aria-label={`Remove calendar file ${index + 1}`}
                    >
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 12h12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent summons button — floating, left of the attach icon; only when history exists */}
          {hasHistory && (
            <button
              onClick={onOpenHistory}
              className="absolute top-2 right-14 z-20 p-2 text-gray-600 hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-black rounded"
              aria-label="Open recent summons"
              data-testid="input-history-button"
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}

          {/* Attach icon button at top-right - floating */}
          <button
            onClick={handleUploadClick}
            className="absolute top-2 right-2 z-20 p-2 text-gray-600 hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-black rounded"
            aria-label="Attach files"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            {(images.length > 0 || calendarFiles.length > 0) && (
              <span className="absolute -top-1 -right-1 bg-black text-white text-xs w-5 h-5 flex items-center justify-center rounded-full font-medium">
                {images.length + calendarFiles.length}
              </span>
            )}
          </button>

          {/* Text area — contentEditable so text wraps around the corner controls.
              A transparent float (.smart-wrap-spacer) carves the top-right (icons) and
              bottom-right (Transform button) corners; middle lines stay full width. */}
          <div className="relative flex-1 w-full overflow-y-auto [container-type:size]">
            <div aria-hidden="true" className={`smart-wrap-spacer${hasHistory ? ' with-history' : ''}`} />
            <div
              ref={editorRef}
              data-testid="smart-input-textarea"
              role="textbox"
              aria-multiline="true"
              aria-label="Enter event details as text or drop images"
              aria-describedby={error ? 'smart-input-error' : undefined}
              aria-invalid={error ? 'true' : 'false'}
              contentEditable
              suppressContentEditableWarning
              suppressHydrationWarning
              spellCheck
              data-placeholder="Drop your screenshot, image, or text here. We'll turn it into events ✨"
              data-empty={text.trim().length === 0 ? 'true' : 'false'}
              data-has-images={images.length > 0 ? 'true' : 'false'}
              onInput={handleEditorInput}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              className="smart-editor"
            />
          </div>

          {/* URL pills row at bottom - flex item like images */}
          {detectedUrls.length > 0 && (
            <div className="flex-shrink-0 flex items-center gap-2 pl-2 pr-2 pb-2">
              <div className="flex gap-1.5 overflow-x-auto overflow-y-hidden whitespace-nowrap flex-1">
                {detectedUrls.map((url, index) => (
                  <div key={`${url}-${index}`} className="flex-shrink-0">
                    <URLPill
                      url={url}
                      onRemove={() => handleRemoveUrl(url)}
                    />
                  </div>
                ))}
              </div>
              {/* Transform button inline with pills */}
              <ParticleButton
                onClick={handleSubmit}
                disabled={!isButtonEnabled}
                contentDensity={contentDensity}
                aria-label="Transform content to events"
                className="flex-shrink-0"
              />
            </div>
          )}

          {/* Transform button when no pills - floating at bottom-right */}
          {detectedUrls.length === 0 && (
            <div className="absolute bottom-2 right-2 z-20">
              <ParticleButton
                onClick={handleSubmit}
                disabled={!isButtonEnabled}
                contentDensity={contentDensity}
                aria-label="Transform content to events"
              />
            </div>
          )}


          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={[...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_CALENDAR_TYPES, '.ics'].join(',')}
            multiple
            onChange={handleFileInputChange}
            aria-hidden="true"
          />
        </div>

        {error && (
          <p id="smart-input-error" className="text-sm text-red-600 mt-2" role="alert">
            {error}
          </p>
        )}

        {/* Image zoom modal */}
        {selectedImageIndex !== null && (
          <ImageModal
            images={images}
            initialIndex={selectedImageIndex}
            onClose={() => setSelectedImageIndex(null)}
          />
        )}
      </div>
    );
  }
);

export default SmartInput;
