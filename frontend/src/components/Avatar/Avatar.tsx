import { useState, useEffect } from 'react';
import type { VisemeKey } from '../../lib/audio';

type AvatarProps = {
  viseme: VisemeKey;
  speaking: boolean;
  connected: boolean;
};

// Anime-style mouths — small, expressive, centered lower on face
const mouths: Record<VisemeKey, string> = {
  // Gentle cat-smile curve
  rest: 'M 110 140 C 113 143 116 145 120 145 C 124 145 127 143 130 140',
  // Closed — tiny pressed line
  mbp: 'M 112 142 C 116 143 124 143 128 142',
  // Wide open happy — anime laugh
  ai: 'M 106 138 C 110 148 116 152 120 152 C 124 152 130 148 134 138 C 128 140 122 141 120 141 C 118 141 112 140 106 138',
  // Small open — horizontal stretch
  e: 'M 108 140 C 114 145 120 146 120 146 C 120 146 126 145 132 140 C 126 143 120 144 120 144 C 120 144 114 143 108 140',
  // Round open — small circle
  o: 'M 114 139 C 114 135 126 135 126 139 C 126 145 122 148 120 148 C 118 148 114 145 114 139',
  // Tight round
  u: 'M 115 140 C 115 137 125 137 125 140 C 125 144 122 146 120 146 C 118 146 115 144 115 140',
  // Slight open — teeth showing
  fv: 'M 109 140 C 113 144 118 146 120 146 C 122 146 127 144 131 140 L 109 140',
  // Open relaxed
  l: 'M 110 139 C 114 146 118 148 120 148 C 122 148 126 146 130 139',
  // Small pursed
  wq: 'M 114 140 C 116 137 124 137 126 140 C 124 144 120 146 120 146 C 120 146 116 144 114 140',
  // Medium open
  etc: 'M 108 139 C 112 147 117 150 120 150 C 123 150 128 147 132 139 C 126 142 120 143 120 143 C 120 143 114 142 108 139',
};

export function Avatar({ viseme, speaking, connected }: AvatarProps) {
  const [blinking, setBlinking] = useState(false);

  useEffect(() => {
    const scheduleBlink = () => {
      const delay = 2500 + Math.random() * 4000; // 2.5–6.5s between blinks
      return setTimeout(() => {
        setBlinking(true);
        setTimeout(() => setBlinking(false), 150); // blink lasts 150ms
        timerId = scheduleBlink();
      }, delay);
    };
    let timerId = scheduleBlink();
    return () => clearTimeout(timerId);
  }, []);

  return (
    <div className={`avatar-shell ${speaking ? 'speaking' : ''} ${connected ? 'connected' : ''}`}>
      <svg viewBox="-40 -40 320 320" className="avatar-svg" aria-label="Tutor avatar">
        <defs>
          {/* Glowing orb gradient using Live+AI brand colors */}
          <radialGradient id="orbGradient" cx="50%" cy="45%" r="50%">
            <stop offset="0%" stopColor="#f5c26b" stopOpacity="0.95" />
            <stop offset="25%" stopColor="#e8689a" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#c95fb8" stopOpacity="0.8" />
            <stop offset="70%" stopColor="#9b6bcd" stopOpacity="0.55" />
            <stop offset="85%" stopColor="#6bcbef" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#53d5ff" stopOpacity="0" />
          </radialGradient>
          {/* Soft blur filter for the orb edge */}
          <filter id="orbBlur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="12" />
          </filter>
          {/* Subtle inner glow */}
          <radialGradient id="orbInnerGlow" cx="50%" cy="40%" r="35%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Glowing orb background with blurred edges */}
        <circle cx="120" cy="120" r="140" fill="url(#orbGradient)" filter="url(#orbBlur)" />
        {/* Slightly smaller, sharper inner core for depth */}
        <circle cx="120" cy="115" r="95" fill="url(#orbGradient)" opacity="0.5" />
        {/* Inner highlight */}
        <circle cx="120" cy="110" r="70" fill="url(#orbInnerGlow)" />

        {/* Anime-style eyes */}
        {blinking ? (
          <>
            {/* Closed eyes — curved lines */}
            <path d="M 89 108 C 94 112 106 112 111 108" stroke="#1a1025" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M 129 108 C 134 112 146 112 151 108" stroke="#1a1025" strokeWidth="3" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            {/* Left eye */}
            <ellipse cx="100" cy="106" rx="11" ry="14" fill="#1a1025" />
            <ellipse cx="100" cy="108" rx="9" ry="11" fill="#5c2d6e" />
            <ellipse cx="100" cy="111" rx="7" ry="7" fill="#8b45a6" />
            <ellipse cx="100" cy="114" rx="5" ry="4" fill="#c475d4" opacity="0.4" />
            <ellipse cx="103" cy="101" rx="4" ry="5" fill="rgba(255,255,255,0.85)" />
            <circle cx="97" cy="113" r="2.2" fill="rgba(255,255,255,0.45)" />
            {/* Right eye */}
            <ellipse cx="140" cy="106" rx="11" ry="14" fill="#1a1025" />
            <ellipse cx="140" cy="108" rx="9" ry="11" fill="#5c2d6e" />
            <ellipse cx="140" cy="111" rx="7" ry="7" fill="#8b45a6" />
            <ellipse cx="140" cy="114" rx="5" ry="4" fill="#c475d4" opacity="0.4" />
            <ellipse cx="137" cy="101" rx="4" ry="5" fill="rgba(255,255,255,0.85)" />
            <circle cx="143" cy="113" r="2.2" fill="rgba(255,255,255,0.45)" />
          </>
        )}
        <path
          d={mouths[viseme]}
          fill={['ai', 'o', 'u', 'e', 'fv', 'l', 'wq', 'etc'].includes(viseme) ? '#5c1a2a' : 'none'}
          stroke="#3a1020"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="avatar-status">{connected ? (speaking ? 'Speaking' : 'Listening') : 'Ready to connect'}</div>
    </div>
  );
}
