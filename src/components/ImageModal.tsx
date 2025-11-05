'use client';

import { useState, useEffect, useRef } from 'react';

interface ImagePreview {
  file: File;
  preview: string;
}

interface ImageModalProps {
  images: ImagePreview[];
  initialIndex: number;
  onClose: () => void;
}

const ImageModal = ({ images, initialIndex, onClose }: ImageModalProps) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentImage = images[currentIndex];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        handlePrevious();
      } else if (e.key === 'ArrowRight' && currentIndex < images.length - 1) {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, images.length, onClose]);

  useEffect(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, [currentIndex]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(prev => Math.max(0.5, Math.min(5, prev + delta)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(5, prev + 0.25));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(0.5, prev - 0.25));
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < images.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center"
      onClick={handleBackdropClick}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 bg-white text-black rounded-full hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-white z-10"
        aria-label="Close image viewer"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Navigation buttons */}
      {images.length > 1 && (
        <>
          <button
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className={`absolute left-4 p-3 bg-white text-black rounded-full hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-white z-10 ${
              currentIndex === 0 ? 'opacity-30 cursor-not-allowed' : ''
            }`}
            aria-label="Previous image"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={handleNext}
            disabled={currentIndex === images.length - 1}
            className={`absolute right-4 p-3 bg-white text-black rounded-full hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-white z-10 ${
              currentIndex === images.length - 1 ? 'opacity-30 cursor-not-allowed' : ''
            }`}
            aria-label="Next image"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2 bg-white rounded-full p-2 z-10">
        <button
          onClick={handleZoomOut}
          className="p-2 hover:bg-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-black"
          aria-label="Zoom out"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
          </svg>
        </button>
        <button
          onClick={handleResetZoom}
          className="px-3 py-2 hover:bg-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-black text-sm font-medium"
          aria-label="Reset zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={handleZoomIn}
          className="p-2 hover:bg-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-black"
          aria-label="Zoom in"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
          </svg>
        </button>
      </div>

      {/* Image counter */}
      {images.length > 1 && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-white rounded-full px-4 py-2 text-sm font-medium z-10">
          {currentIndex + 1} / {images.length}
        </div>
      )}

      {/* Image */}
      <div
        className="relative max-w-[90vw] max-h-[90vh] p-8 flex items-center justify-center"
        onWheel={handleWheel}
      >
        <img
          ref={imageRef}
          src={currentImage.preview}
          alt={currentImage.file.name}
          className={`max-w-full max-h-full object-contain transition-transform ${
            zoom > 1 ? 'cursor-move' : 'cursor-zoom-in'
          }`}
          style={{
            transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
          }}
          onMouseDown={handleMouseDown}
          draggable={false}
        />
      </div>

      {/* Image name */}
      <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 bg-white rounded px-4 py-2 text-sm max-w-md truncate z-10">
        {currentImage.file.name}
      </div>
    </div>
  );
};

export default ImageModal;
