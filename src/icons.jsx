import { useId } from 'react'

const P = {
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  pin: (
    <path d="M12 17v5M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.8a2 2 0 0 0-1.1-1.8l-1.8-.9A2 2 0 0 1 15 10.8V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
  ),
  trash: <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />,
  download: <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />,
  link: (
    <path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.5 1.5M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.5-1.5" />
  ),
  graph: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="8" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M8.3 6.8l7.4.8M7.2 8.2l3.6 7.6M16.8 10.2l-3.6 5.6" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  back: <path d="M15 6l-6 6 6 6" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  notes: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  hash: <path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18" />,
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  edit: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  dots: (
    <>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20" />
    </>
  ),
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.1 0-.9.7-1.6 1.6-1.6H17a4 4 0 0 0 4-4c0-4.4-4-8.4-9-8.4z" />
      <circle cx="7.5" cy="11" r="1" />
      <circle cx="10.5" cy="7" r="1" />
      <circle cx="15" cy="7.5" r="1" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M21 16l-5-5-8 8" />
    </>
  ),
  board: (
    <>
      <rect x="3" y="4" width="5" height="16" rx="1.5" />
      <rect x="10" y="4" width="5" height="10" rx="1.5" />
      <rect x="17" y="4" width="4" height="13" rx="1.5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6" />
    </>
  ),
}

export function Icon({ name, size = 18, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {P[name]}
    </svg>
  )
}

export function HexLogo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <polygon points="32,4 56,18 56,46 32,60 8,46 8,18" fill="var(--honey)" />
      <polygon points="32,18 44,25 44,39 32,46 20,39 20,25" fill="var(--hex-core)" />
    </svg>
  )
}

// A little honey bee (faces right). Wings flap via CSS.
export function Bee({ size = 32, className = '' }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg className={`bee ${className}`} width={size} height={size * 0.8} viewBox="0 0 64 51" aria-hidden="true">
      <defs>
        <clipPath id={'bb' + id}>
          <ellipse cx="28" cy="32" rx="18" ry="12.5" />
        </clipPath>
        <linearGradient id={'bg' + id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd25e" />
          <stop offset="1" stopColor="#eaa21c" />
        </linearGradient>
      </defs>
      <g className="bee-wing w1">
        <ellipse cx="24" cy="14" rx="8" ry="12" transform="rotate(-28 24 14)" />
      </g>
      <g className="bee-wing w2">
        <ellipse cx="34" cy="13" rx="8" ry="12" transform="rotate(22 34 13)" />
      </g>
      <path d="M8 32 L1 30 L8 35 Z" fill="#2a1d08" />
      <ellipse cx="28" cy="32" rx="18" ry="12.5" fill={`url(#bg${id})`} />
      <g clipPath={`url(#bb${id})`} fill="#2a1d08">
        <rect x="16" y="16" width="6" height="34" rx="2" />
        <rect x="27" y="16" width="6" height="34" rx="2" />
      </g>
      <ellipse cx="28" cy="32" rx="18" ry="12.5" fill="none" stroke="#2a1d08" strokeWidth="2.4" />
      <circle cx="49" cy="29" r="8.5" fill="#2a1d08" />
      <circle cx="52" cy="27" r="2.2" fill="#fff" />
      <path d="M50 21 C 51 14, 55 11, 58 11 M46 21 C 45 15, 47 10, 50 8" fill="none" stroke="#2a1d08" strokeWidth="2" strokeLinecap="round" />
      <path d="M50.5 33 q2 2 4 0" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

// Honey dripping from the top edge of a card
export function HoneyDrip({ className = '' }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg className={`honey-drip ${className}`} viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={'hd' + id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c47f12" />
          <stop offset="1" stopColor="#f0b33a" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#hd${id})`}
        d="M0 0 H400 V14 C392 14 388 18 386 26 C384 34 376 34 375 26 C373 16 366 15 352 16 C338 17 334 20 333 30 C332 44 320 44 319 30 C318 19 310 15 290 15 C262 16 256 17 254 22 C252 28 246 28 244 22 C240 15 222 15 200 16 C176 17 170 19 168 30 C166 52 152 52 150 30 C149 19 140 15 118 15 C96 15 92 18 90 24 C88 30 81 30 79 24 C76 16 66 15 52 16 C38 17 34 20 33 28 C32 38 22 38 21 28 C20 18 12 14 0 14 Z"
      />
      <path d="M8 6 H392" stroke="#fff" strokeOpacity=".35" strokeWidth="3" strokeLinecap="round" />
      <circle className="drop" cx="159" cy="50" r="4.5" fill={`url(#hd${id})`} />
    </svg>
  )
}
