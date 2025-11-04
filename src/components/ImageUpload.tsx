'use client';

import { useState, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';

interface ImageUploadProps {
  onImageSelect: (file: File) => void;
  onError: (error: string) => void;
  isLoading?: boolean;
}

export interface ImageUploadHandle {
  clear: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'];

const ImageUpload = forwardRef<ImageUploadHandle, ImageUploadProps>(
  function ImageUpload({ onImageSelect, onError, isLoading = false }, ref) {
    const [isDragging, setIsDragging] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      clear: () => {
        setPreview(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      },
    }));

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      return 'Please upload a valid image file (JPEG, PNG, WebP, or HEIC)';
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'File size must be less than 10MB';
    }
    return null;
  };

  const handleFile = useCallback((file: File) => {
    const error = validateFile(file);
    if (error) {
      onError(error);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    onImageSelect(file);
  }, [onImageSelect, onError]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (isLoading) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleClick = () => {
    if (!isLoading && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={isLoading ? -1 : 0}
        aria-label="Upload image file. Click or drag and drop an image to extract event details"
        aria-disabled={isLoading}
        className={`
          relative border-2 border-dashed rounded-lg p-8 text-center
          transition-all duration-200 cursor-pointer
          ${isDragging
            ? 'border-black bg-gray-50'
            : 'border-gray-300 hover:border-black hover:bg-gray-50'
          }
          ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
          ${preview ? 'border-solid' : ''}
          focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          onChange={handleFileInputChange}
          disabled={isLoading}
          aria-hidden="true"
        />

        {preview ? (
          <div className="space-y-4">
            <img
              src={preview}
              alt="Uploaded event image"
              className="max-h-64 mx-auto rounded"
            />
            {!isLoading && (
              <p className="text-sm text-gray-600">Click to change image</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
              aria-hidden="true"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="text-gray-600">
              <p className="font-medium">Click to upload or drag and drop</p>
              <p className="text-sm mt-1">JPEG, PNG, WebP, or HEIC up to 10MB</p>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 rounded-lg">
            <div className="text-center space-y-2">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-black border-t-transparent mx-auto" />
              <p className="text-sm text-gray-600">Uploading...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default ImageUpload;
