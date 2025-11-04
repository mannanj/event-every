'use client';

import { useState, useRef, useEffect } from 'react';

interface PatternLockProps {
  onSubmit: (pattern: number[]) => Promise<void>;
  error?: string;
  attemptsLeft: number;
}

interface Point {
  x: number;
  y: number;
}

export default function PatternLock({ onSubmit, error, attemptsLeft }: PatternLockProps) {
  const [pattern, setPattern] = useState<number[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPos, setCurrentPos] = useState<Point | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const gridSize = 3;
  const dotRadius = 12;
  const activeDotRadius = 18;

  useEffect(() => {
    drawPattern();
  }, [pattern, currentPos]);

  const getCanvasCoordinates = (clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const getDotPosition = (index: number, canvasSize: number): Point => {
    const row = Math.floor(index / gridSize);
    const col = index % gridSize;
    const spacing = canvasSize / (gridSize + 1);

    return {
      x: spacing * (col + 1),
      y: spacing * (row + 1)
    };
  };

  const findClosestDot = (point: Point, canvasSize: number): number | null => {
    let closestDot = -1;
    let minDistance = Infinity;

    for (let i = 0; i < gridSize * gridSize; i++) {
      const dotPos = getDotPosition(i, canvasSize);
      const distance = Math.sqrt(
        Math.pow(point.x - dotPos.x, 2) + Math.pow(point.y - dotPos.y, 2)
      );

      if (distance < minDistance && distance < activeDotRadius * 2) {
        minDistance = distance;
        closestDot = i;
      }
    }

    return closestDot !== -1 ? closestDot : null;
  };

  const drawPattern = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;

    ctx.clearRect(0, 0, size, size);

    if (pattern.length > 0) {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      const firstDot = getDotPosition(pattern[0], size);
      ctx.moveTo(firstDot.x, firstDot.y);

      for (let i = 1; i < pattern.length; i++) {
        const dotPos = getDotPosition(pattern[i], size);
        ctx.lineTo(dotPos.x, dotPos.y);
      }

      if (currentPos && isDrawing) {
        ctx.lineTo(currentPos.x, currentPos.y);
      }

      ctx.stroke();
    }

    for (let i = 0; i < gridSize * gridSize; i++) {
      const pos = getDotPosition(i, size);
      const isActive = pattern.includes(i);

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, isActive ? activeDotRadius : dotRadius, 0, 2 * Math.PI);
      ctx.fillStyle = isActive ? '#000000' : '#FFFFFF';
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  };

  const handleStart = (clientX: number, clientY: number) => {
    setIsDrawing(true);
    setPattern([]);

    const point = getCanvasCoordinates(clientX, clientY);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dot = findClosestDot(point, canvas.width);
    if (dot !== null) {
      setPattern([dot]);
    }
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!isDrawing) return;

    const point = getCanvasCoordinates(clientX, clientY);
    setCurrentPos(point);

    const canvas = canvasRef.current;
    if (!canvas) return;

    const dot = findClosestDot(point, canvas.width);
    if (dot !== null && !pattern.includes(dot)) {
      setPattern([...pattern, dot]);
    }
  };

  const handleEnd = async () => {
    if (!isDrawing) return;

    setIsDrawing(false);
    setCurrentPos(null);

    if (pattern.length >= 2 && !isSubmitting) {
      setIsSubmitting(true);
      await onSubmit(pattern);
      setIsSubmitting(false);
      setTimeout(() => setPattern([]), 500);
    } else {
      setTimeout(() => setPattern([]), 300);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (attemptsLeft === 0 || isSubmitting) return;
    handleStart(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    handleMove(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    handleEnd();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (attemptsLeft === 0 || isSubmitting) return;
    e.preventDefault();
    const touch = e.touches[0];
    handleStart(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleMove(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    handleEnd();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white p-8">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Draw Pattern to Unlock</h1>
        <p className="text-xs text-gray-500">
          Attempts remaining: {attemptsLeft}
        </p>
      </div>

      <div className="relative touch-none">
        <canvas
          ref={canvasRef}
          width={300}
          height={300}
          className={`border-2 border-black ${attemptsLeft === 0 || isSubmitting ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      </div>

      {isSubmitting && (
        <p className="mt-4 text-sm text-gray-600">Verifying...</p>
      )}

      {error && (
        <p className="mt-4 text-sm text-black border border-black px-4 py-2">
          {error}
        </p>
      )}

      {pattern.length > 0 && isDrawing && (
        <p className="mt-4 text-sm text-gray-600">
          Release to submit pattern
        </p>
      )}
    </div>
  );
}
