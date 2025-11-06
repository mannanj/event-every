'use client';

import { useState, useEffect, useMemo } from 'react';

interface ParticleButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isProcessing?: boolean;
  'aria-label'?: string;
  className?: string;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  color: string;
}

const PARTICLE_COUNT = 12;

const IDLE_COLORS = [
  '#000000', // black
  '#1f1f1f', // dark gray
  '#3f3f3f', // medium dark gray
  '#525252', // gray
  '#666666', // medium gray
];

const PROCESSING_COLOR = '#ffffff'; // white

const ParticleButton: React.FC<ParticleButtonProps> = ({
  onClick,
  disabled = false,
  isProcessing = false,
  'aria-label': ariaLabel,
  className = '',
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const particles = useMemo(() => {
    const newParticles: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
      const distance = 30 + Math.random() * 10;

      newParticles.push({
        id: i,
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        size: 2 + Math.random() * 2,
        duration: 1.5 + Math.random() * 1,
        delay: Math.random() * 2,
        color: IDLE_COLORS[Math.floor(Math.random() * IDLE_COLORS.length)],
      });
    }
    return newParticles;
  }, []);

  const activeColors = isProcessing ? PROCESSING_COLOR : undefined;

  return (
    <div className="relative inline-block">
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`
          relative px-6 py-2 rounded font-medium
          transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2
          ${
            disabled
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-black text-white hover:bg-gray-800'
          }
          ${className}
        `}
      >
        <span className="relative z-10">Transform</span>

        {/* Particles overlay */}
        {!disabled && (isHovered || isProcessing) && (
          <div className="absolute inset-0 pointer-events-none overflow-visible">
            <div className="absolute inset-0 flex items-center justify-center">
              {particles.map((particle) => (
                <div
                  key={particle.id}
                  className="absolute particle"
                  style={{
                    width: `${particle.size}px`,
                    height: `${particle.size}px`,
                    left: '50%',
                    top: '50%',
                    transform: `translate(-50%, -50%) translate(${particle.x}px, ${particle.y}px)`,
                    backgroundColor: activeColors || particle.color,
                    borderRadius: '50%',
                    animation: `twinkle ${particle.duration}s ease-in-out ${particle.delay}s infinite`,
                    opacity: 0,
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </button>

      <style jsx>{`
        @keyframes twinkle {
          0%, 100% {
            opacity: 0;
            transform: translate(-50%, -50%) translate(var(--x), var(--y)) scale(0.5);
          }
          50% {
            opacity: 1;
            transform: translate(-50%, -50%) translate(var(--x), var(--y)) scale(1);
          }
        }

        .particle:nth-child(1) { --x: ${particles[0]?.x}px; --y: ${particles[0]?.y}px; }
        .particle:nth-child(2) { --x: ${particles[1]?.x}px; --y: ${particles[1]?.y}px; }
        .particle:nth-child(3) { --x: ${particles[2]?.x}px; --y: ${particles[2]?.y}px; }
        .particle:nth-child(4) { --x: ${particles[3]?.x}px; --y: ${particles[3]?.y}px; }
        .particle:nth-child(5) { --x: ${particles[4]?.x}px; --y: ${particles[4]?.y}px; }
        .particle:nth-child(6) { --x: ${particles[5]?.x}px; --y: ${particles[5]?.y}px; }
        .particle:nth-child(7) { --x: ${particles[6]?.x}px; --y: ${particles[6]?.y}px; }
        .particle:nth-child(8) { --x: ${particles[7]?.x}px; --y: ${particles[7]?.y}px; }
        .particle:nth-child(9) { --x: ${particles[8]?.x}px; --y: ${particles[8]?.y}px; }
        .particle:nth-child(10) { --x: ${particles[9]?.x}px; --y: ${particles[9]?.y}px; }
        .particle:nth-child(11) { --x: ${particles[10]?.x}px; --y: ${particles[10]?.y}px; }
        .particle:nth-child(12) { --x: ${particles[11]?.x}px; --y: ${particles[11]?.y}px; }
      `}</style>
    </div>
  );
};

export default ParticleButton;
