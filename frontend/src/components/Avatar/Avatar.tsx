import type { VisemeKey } from '../../lib/audio';

type AvatarProps = {
  viseme: VisemeKey;
  speaking: boolean;
  connected: boolean;
};

const mouths: Record<VisemeKey, string> = {
  rest: 'M 92 148 Q 120 152 148 148',
  mbp: 'M 96 146 Q 120 148 144 146 Q 120 158 96 146',
  ai: 'M 92 142 Q 120 170 148 142 Q 120 180 92 142',
  e: 'M 92 147 Q 120 150 148 147 Q 120 160 92 147',
  o: 'M 108 140 Q 120 134 132 140 Q 138 152 132 164 Q 120 170 108 164 Q 102 152 108 140',
  u: 'M 104 146 Q 120 142 136 146 Q 132 164 120 168 Q 108 164 104 146',
  fv: 'M 96 145 Q 120 155 144 145 Q 120 166 96 145',
  l: 'M 94 145 Q 120 162 146 145',
  wq: 'M 102 146 Q 120 137 138 146 Q 134 158 120 162 Q 106 158 102 146',
  etc: 'M 90 145 Q 120 164 150 145 Q 120 172 90 145',
};

export function Avatar({ viseme, speaking, connected }: AvatarProps) {
  return (
    <div className={`avatar-shell ${speaking ? 'speaking' : ''} ${connected ? 'connected' : ''}`}>
      <svg viewBox="0 0 240 240" className="avatar-svg" aria-label="Tutor avatar">
        <defs>
          <linearGradient id="faceGradient" x1="0" x2="1">
            <stop offset="0%" stopColor="#fde6d5" />
            <stop offset="100%" stopColor="#ffd2f1" />
          </linearGradient>
        </defs>
        <circle cx="120" cy="120" r="94" fill="url(#faceGradient)" />
        <circle cx="88" cy="104" r="10" fill="#1a1633" />
        <circle cx="152" cy="104" r="10" fill="#1a1633" />
        <path d="M 74 84 Q 88 72 102 84" stroke="#4c2f61" strokeWidth="6" fill="none" strokeLinecap="round" />
        <path d="M 138 84 Q 152 72 166 84" stroke="#4c2f61" strokeWidth="6" fill="none" strokeLinecap="round" />
        <path d="M 114 110 Q 120 126 126 110" stroke="#8a5a6f" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path
          d={mouths[viseme]}
          fill={viseme === 'o' ? '#7c2432' : 'none'}
          stroke="#7c2432"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="avatar-status">{connected ? (speaking ? 'Speaking' : 'Listening') : 'Ready to connect'}</div>
    </div>
  );
}
