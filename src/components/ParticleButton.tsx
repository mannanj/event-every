'use client';

import { useState } from 'react';

interface ParticleButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isProcessing?: boolean;
  contentDensity?: number; // 0 to 1, represents how much content is added
  'aria-label'?: string;
  className?: string;
}

const ParticleButton: React.FC<ParticleButtonProps> = ({
  onClick,
  disabled = false,
  isProcessing = false,
  contentDensity = 0,
  'aria-label': ariaLabel,
  className = '',
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const density = Math.min(1, Math.max(0, contentDensity));
  const isEnabled = density > 0;

  // Sun-like color progression: blue → red → yellow → gold → yellow → red → blue → black
  const getSunColor = (phase: number) => {
    if (density === 0) return 'rgba(255, 255, 255, 0)';

    const opacity = 0.5 + density * 0.5;

    // Phase 0-1: blue → red
    if (phase < 0.125) {
      const t = phase / 0.125;
      const r = Math.round(100 + t * 155);
      const g = Math.round(150 * (1 - t));
      const b = Math.round(255 - t * 255);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    // Phase 1-2: red → yellow
    else if (phase < 0.25) {
      const t = (phase - 0.125) / 0.125;
      const r = 255;
      const g = Math.round(t * 255);
      const b = 0;
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    // Phase 2-3: yellow → gold
    else if (phase < 0.375) {
      const t = (phase - 0.25) / 0.125;
      const r = 255;
      const g = Math.round(255 - t * 40);
      const b = Math.round(t * 20);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    // Phase 3-4: gold → yellow (returning)
    else if (phase < 0.5) {
      const t = (phase - 0.375) / 0.125;
      const r = 255;
      const g = Math.round(215 + t * 40);
      const b = Math.round(20 - t * 20);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    // Phase 4-5: yellow → red (returning)
    else if (phase < 0.625) {
      const t = (phase - 0.5) / 0.125;
      const r = 255;
      const g = Math.round(255 - t * 255);
      const b = 0;
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    // Phase 5-6: red → blue (returning)
    else if (phase < 0.75) {
      const t = (phase - 0.625) / 0.125;
      const r = Math.round(255 - t * 155);
      const g = Math.round(t * 150);
      const b = Math.round(t * 255);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    // Phase 6-7: blue → black
    else {
      const t = (phase - 0.75) / 0.25;
      const r = Math.round(100 * (1 - t));
      const g = Math.round(150 * (1 - t));
      const b = Math.round(255 * (1 - t));
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
  };

  return (
    <div className="relative inline-block">
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel || 'Transform content to events'}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          backgroundColor: '#ffffff',
          border: isEnabled ? '2px solid #000000' : '2px solid #e5e7eb',
          transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        className={`
          relative px-4 py-2 rounded-lg font-medium overflow-hidden
          focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2
          ${!isEnabled ? 'cursor-not-allowed' : 'hover:scale-105 cursor-pointer'}
          ${className}
        `}
      >
        {/* Transform text with icon */}
        <span
          className="relative z-10 flex items-center gap-1.5 text-sm font-medium"
          style={{
            color: isEnabled ? '#000000' : '#9ca3af',
            transition: 'color 0.4s ease',
          }}
        >
          Transform
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
            />
          </svg>
        </span>

        {/* Fluid paint-in-water effect with sun-like colors - appears after text */}
        {isEnabled && (
          <>
            {/* First fluid layer - full coverage */}
            <div
              className="absolute inset-0 rounded-lg"
              style={{
                background: `linear-gradient(135deg, ${getSunColor(density)} 0%, ${getSunColor(Math.min(1, density + 0.2))} 100%)`,
                animation: 'fluidMove1 3s ease-in-out infinite',
                opacity: 0.7,
                transition: 'opacity 0.3s ease',
              }}
            />
            {/* Second fluid layer - radial overlay */}
            <div
              className="absolute inset-0 rounded-lg"
              style={{
                background: `radial-gradient(ellipse at 40% 40%, ${getSunColor(Math.min(1, density + 0.15))}, transparent 80%)`,
                animation: 'fluidMove2 4s ease-in-out infinite',
                opacity: isHovered ? 0.9 : 0.7,
                transition: 'opacity 0.3s ease',
              }}
            />
            {/* Third fluid layer - another radial */}
            <div
              className="absolute inset-0 rounded-lg"
              style={{
                background: `radial-gradient(ellipse at 70% 60%, ${getSunColor(Math.min(1, density + 0.1))}, transparent 75%)`,
                animation: 'fluidMove3 5s ease-in-out infinite',
                opacity: 0.6,
              }}
            />
          </>
        )}
      </button>

      <style jsx>{`
        @keyframes fluidMove1 {
          0%, 100% {
            transform: translate(0%, 0%) scale(1);
          }
          33% {
            transform: translate(-15%, 10%) scale(1.1);
          }
          66% {
            transform: translate(10%, -10%) scale(0.95);
          }
        }

        @keyframes fluidMove2 {
          0%, 100% {
            transform: translate(0%, 0%) scale(1);
          }
          33% {
            transform: translate(10%, -15%) scale(0.9);
          }
          66% {
            transform: translate(-10%, 15%) scale(1.15);
          }
        }

        @keyframes fluidMove3 {
          0%, 100% {
            transform: translate(0%, 0%) rotate(0deg) scale(1);
          }
          50% {
            transform: translate(5%, 5%) rotate(180deg) scale(1.05);
          }
        }
      `}</style>
    </div>
  );
};

export default ParticleButton;
