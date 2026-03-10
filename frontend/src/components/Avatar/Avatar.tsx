import { useState, useEffect, memo } from 'react';
import type { VisemeKey } from '../../lib/audio';

type AvatarProps = {
  viseme: VisemeKey;
  speaking: boolean;
  connected: boolean;
  connecting?: boolean;
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

// Memoized cloud body — never re-renders, so SVG <animate> timelines stay stable
const CloudBody = memo(function CloudBody() {
  return (
    <>
      <defs>
        {/* Heavy blur for cloud blobs */}
        <filter id="cloudBlur" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="28" />
        </filter>
        {/* Lighter blur for inner glow layer */}
        <filter id="innerBlur" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="18" />
        </filter>
        {/* Radial fade for each color blob — vivid centers, wide reach */}
        <radialGradient id="blobGold" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f5c26b" stopOpacity="1" />
          <stop offset="45%" stopColor="#f5c26b" stopOpacity="0.7" />
          <stop offset="80%" stopColor="#f5c26b" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#f5c26b" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="blobCoral" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#e8689a" stopOpacity="1" />
          <stop offset="45%" stopColor="#e8689a" stopOpacity="0.65" />
          <stop offset="80%" stopColor="#e8689a" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#e8689a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="blobMagenta" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#c95fb8" stopOpacity="1" />
          <stop offset="45%" stopColor="#c95fb8" stopOpacity="0.6" />
          <stop offset="80%" stopColor="#c95fb8" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#c95fb8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="blobPurple" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#9b6bcd" stopOpacity="1" />
          <stop offset="45%" stopColor="#9b6bcd" stopOpacity="0.6" />
          <stop offset="80%" stopColor="#9b6bcd" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#9b6bcd" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="blobCyan" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#6bcbef" stopOpacity="1" />
          <stop offset="45%" stopColor="#6bcbef" stopOpacity="0.65" />
          <stop offset="80%" stopColor="#6bcbef" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#6bcbef" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="blobBlue" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#53d5ff" stopOpacity="0.95" />
          <stop offset="45%" stopColor="#53d5ff" stopOpacity="0.55" />
          <stop offset="80%" stopColor="#53d5ff" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#53d5ff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Animated cloud body — 6 blobs orbit around a circle at different speeds */}
      <g filter="url(#cloudBlur)">
        {/* Gold — starts 12, orbits clockwise */}
        <ellipse rx="105" ry="98" fill="url(#blobGold)">
          <animate attributeName="cx" values="120;180;180;120;62;62;120" dur="24s" repeatCount="indefinite" />
          <animate attributeName="cy" values="50;85;155;192;155;85;50" dur="24s" repeatCount="indefinite" />
        </ellipse>
        {/* Coral/pink — starts 2, orbits clockwise */}
        <ellipse rx="100" ry="92" fill="url(#blobCoral)">
          <animate attributeName="cx" values="180;180;120;62;62;120;180" dur="28s" repeatCount="indefinite" />
          <animate attributeName="cy" values="85;155;192;155;85;50;85" dur="28s" repeatCount="indefinite" />
        </ellipse>
        {/* Magenta — starts 4, orbits clockwise */}
        <ellipse rx="108" ry="95" fill="url(#blobMagenta)">
          <animate attributeName="cx" values="180;120;62;62;120;180;180" dur="22s" repeatCount="indefinite" />
          <animate attributeName="cy" values="155;192;155;85;50;85;155" dur="22s" repeatCount="indefinite" />
        </ellipse>
        {/* Purple — starts 6, orbits counter-clockwise */}
        <ellipse rx="100" ry="105" fill="url(#blobPurple)">
          <animate attributeName="cx" values="120;62;62;120;180;180;120" dur="26s" repeatCount="indefinite" />
          <animate attributeName="cy" values="192;155;85;50;85;155;192" dur="26s" repeatCount="indefinite" />
        </ellipse>
        {/* Cyan — starts 8, orbits counter-clockwise */}
        <ellipse rx="98" ry="95" fill="url(#blobCyan)">
          <animate attributeName="cx" values="62;120;180;180;120;62;62" dur="30s" repeatCount="indefinite" />
          <animate attributeName="cy" values="155;192;155;85;50;85;155" dur="30s" repeatCount="indefinite" />
        </ellipse>
        {/* Light blue — starts 10, orbits counter-clockwise */}
        <ellipse rx="95" ry="90" fill="url(#blobBlue)">
          <animate attributeName="cx" values="62;62;120;180;180;120;62" dur="20s" repeatCount="indefinite" />
          <animate attributeName="cy" values="85;155;192;155;85;50;85" dur="20s" repeatCount="indefinite" />
        </ellipse>
      </g>
      {/* Inner glow layer — slower orbits for depth */}
      <g filter="url(#innerBlur)" opacity="0.6">
        <ellipse rx="68" ry="60" fill="url(#blobGold)">
          <animate attributeName="cx" values="120;158;158;120;82;82;120" dur="30s" repeatCount="indefinite" />
          <animate attributeName="cy" values="75;98;142;165;142;98;75" dur="30s" repeatCount="indefinite" />
        </ellipse>
        <ellipse rx="62" ry="65" fill="url(#blobCoral)">
          <animate attributeName="cx" values="158;120;82;82;120;158;158" dur="26s" repeatCount="indefinite" />
          <animate attributeName="cy" values="98;75;98;142;165;142;98" dur="26s" repeatCount="indefinite" />
        </ellipse>
        <ellipse rx="70" ry="62" fill="url(#blobMagenta)">
          <animate attributeName="cx" values="82;120;158;158;120;82;82" dur="34s" repeatCount="indefinite" />
          <animate attributeName="cy" values="142;165;142;98;75;98;142" dur="34s" repeatCount="indefinite" />
        </ellipse>
      </g>
    </>
  );
});

export function Avatar({ viseme, speaking, connected, connecting }: AvatarProps) {
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
    <div className={`avatar-shell ${speaking ? 'speaking' : ''} ${connected ? 'connected' : ''} ${connecting ? 'connecting' : ''}`}>
      <svg viewBox="-80 -80 400 400" className="avatar-svg" aria-label="Tutor avatar">
        <CloudBody />

        {/* Face group — drifts gently with the cloud */}
        <g>
          <animateTransform attributeName="transform" type="translate" values="0,0;6,-4;-3,5;4,3;-5,-2;0,0" dur="18s" repeatCount="indefinite" />
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
        </g>
      </svg>
    </div>
  );
}
