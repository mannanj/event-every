'use client';

import { useState, useRef, useCallback, useImperativeHandle, forwardRef, useEffect } from 'react';
import URLPill from './URLPill';
import ImageModal from './ImageModal';

interface SmartInputProps {
  onSubmit: (data: { text: string; images: File[] }) => void;
  onError: (error: string) => void;
}

export interface SmartInputHandle {
  clear: () => void;
}

const MIN_TEXT_LENGTH = 3;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 25;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'];
const URL_REGEX = /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*))/gi;

interface ImagePreview {
  file: File;
  preview: string;
}

const SmartInput = forwardRef<SmartInputHandle, SmartInputProps>(
  function SmartInput({ onSubmit, onError }, ref) {
    const [text, setText] = useState('');
    const [images, setImages] = useState<ImagePreview[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [detectedUrls, setDetectedUrls] = useState<string[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [hoveredImageIndex, setHoveredImageIndex] = useState<number | null>(null);
    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => ({
      clear: () => {
        setText('');
        setImages([]);
        setError(null);
        setDetectedUrls([]);
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

    const validateFile = (file: File): string | null => {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        return 'Please upload a valid image file (JPEG, PNG, WebP, or HEIC)';
      }
      if (file.size > MAX_FILE_SIZE) {
        return 'File size must be less than 10MB';
      }
      return null;
    };

    const handleFiles = useCallback((files: File[]) => {
      if (files.length === 0) return;

      if (images.length + files.length > MAX_FILES) {
        onError(`You can only upload up to ${MAX_FILES} images at once`);
        return;
      }

      const validFiles: File[] = [];
      const errors: string[] = [];

      files.forEach(file => {
        const errorMsg = validateFile(file);
        if (errorMsg) {
          errors.push(`${file.name}: ${errorMsg}`);
        } else {
          validFiles.push(file);
        }
      });

      if (errors.length > 0) {
        onError(errors.join('\n'));
      }

      if (validFiles.length === 0) return;

      const newPreviews: ImagePreview[] = [];
      validFiles.forEach((file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          newPreviews.push({
            file,
            preview: reader.result as string,
          });
          if (newPreviews.length === validFiles.length) {
            setImages(prev => [...prev, ...newPreviews]);
          }
        };
        reader.readAsDataURL(file);
      });
    }, [images.length, onError]);

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
        ACCEPTED_IMAGE_TYPES.includes(file.type)
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

    const handleSubmit = useCallback(() => {
      setError(null);

      const trimmedText = text.trim();

      if (trimmedText.length < MIN_TEXT_LENGTH && images.length === 0) {
        setError('Please enter at least 3 characters or add an image');
        return;
      }

      onSubmit({
        text: trimmedText,
        images: images.map(img => img.file),
      });
    }, [text, images, onSubmit]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
      if (error) {
        setError(null);
      }
    };

    const handleRemoveUrl = (urlToRemove: string) => {
      setText(prevText => prevText.replace(urlToRemove, '').trim());
    };

    const handleUploadClick = () => {
      fileInputRef.current?.click();
    };

    const isButtonEnabled = text.trim().length >= MIN_TEXT_LENGTH || images.length > 0;

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
          {/* Images row at top - scrollable horizontally up to attach icon */}
          {images.length > 0 && (
            <div className="flex-shrink-0 pt-3 pl-2 pr-12 pb-2">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((img, index) => (
                  <div
                    key={index}
                    className="relative group flex-shrink-0 pt-1 pr-1"
                    onMouseEnter={() => setHoveredImageIndex(index)}
                    onMouseLeave={() => setHoveredImageIndex(null)}
                  >
                    <div
                      onClick={(e) => handleImageClick(e, index)}
                      className="w-[128px] h-[128px] border-2 border-black bg-white cursor-pointer overflow-hidden hover:border-gray-600 transition-colors relative"
                    >
                      <img
                        src={img.preview}
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
                            src={img.preview}
                            alt={`Preview ${index + 1}`}
                            className="max-w-lg max-h-96 object-contain"
                          />
                          <p className="text-black text-xs mt-2 text-center truncate max-w-lg">{img.file.name}</p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Attach icon button at top-right - floating */}
          <button
            onClick={handleUploadClick}
            className="absolute top-2 right-2 z-20 p-2 text-gray-600 hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-black rounded"
            aria-label="Attach images"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            {images.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-black text-white text-xs w-5 h-5 flex items-center justify-center rounded-full font-medium">
                {images.length}
              </span>
            )}
          </button>

          {/* Text area - takes remaining space */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Add text, images or more"
            aria-label="Enter event details as text or drop images"
            aria-describedby={error ? 'smart-input-error' : undefined}
            aria-invalid={error ? 'true' : 'false'}
            className="flex-1 w-full p-2 pr-12 text-black placeholder-gray-400 bg-transparent resize-none focus:outline-none"
          />

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
              <button
                onClick={handleSubmit}
                disabled={!isButtonEnabled}
                aria-label="Transform content to events"
                className={`
                  flex-shrink-0 px-6 py-2 rounded font-medium
                  transition-all duration-200
                  focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2
                  ${
                    !isButtonEnabled
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-black text-white hover:bg-gray-800'
                  }
                `}
              >
                Transform
              </button>
            </div>
          )}

          {/* Transform button when no pills - floating at bottom-right */}
          {detectedUrls.length === 0 && (
            <button
              onClick={handleSubmit}
              disabled={!isButtonEnabled}
              aria-label="Transform content to events"
              className={`
                absolute bottom-2 right-2 z-20
                px-6 py-2 rounded font-medium
                transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2
                ${
                  !isButtonEnabled
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-black text-white hover:bg-gray-800'
                }
              `}
            >
              Transform
            </button>
          )}


          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
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
