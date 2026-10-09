// 이모지(▶ 등)는 기기마다 컬러 이모지로 깨져서 SVG로 고정 (프로토타입에서 배운 것)
const PATHS = {
  play: <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" />,
  pause: (
    <>
      <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
    </>
  ),
  next: (
    <>
      <path d="M6 6.2v11.6a.8.8 0 0 0 1.25.66l8.4-5.8a.8.8 0 0 0 0-1.32l-8.4-5.8A.8.8 0 0 0 6 6.2z" fill="currentColor" />
      <rect x="16.5" y="5.5" width="2.5" height="13" rx="1" fill="currentColor" />
    </>
  ),
  replay: <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  close: <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />,
  plus: <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  back: <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  chevron: <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  external: (
    <path d="M14 5h5v5M19 5l-8 8M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  copy: (
    <>
      <rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M16 8V6a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h2" stroke="currentColor" strokeWidth="2" fill="none" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="12" r="3.5" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M11.5 12H20M17 12v3M20 12v2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  baton: <path d="M4 20L15 9M14 4.5a2.5 2.5 0 1 1 5.5 5.5 2.5 2.5 0 0 1-5.5-5.5z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />,
  edit: <path d="M5 19h4l10-10-4-4L5 15v4zM13 7l4 4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round" />,
  trash: <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  up: <path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  down: <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  top: <path d="M6 5h12M6 17l6-6 6 6" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  note: (
    <>
      <path d="M9.5 17.5V6.2l9-2v11.3" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="17.5" r="2.5" fill="currentColor" />
      <circle cx="16" cy="15.5" r="2.5" fill="currentColor" />
    </>
  ),
  eq: (
    <>
      <rect className="eq-bar" x="5" y="8" width="3" height="10" rx="1" fill="currentColor" />
      <rect className="eq-bar" x="10.5" y="5" width="3" height="13" rx="1" fill="currentColor" />
      <rect className="eq-bar" x="16" y="10" width="3" height="8" rx="1" fill="currentColor" />
    </>
  ),
};

export default function Icon({ name, size = 20, className = '' }) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
