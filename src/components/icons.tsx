import type { ReactNode } from 'react';

export type IconName =
  | 'play'
  | 'pause'
  | 'cue'
  | 'mark'
  | 'analyze'
  | 'record'
  | 'stop'
  | 'admin'
  | 'sign-out'
  | 'download'
  | 'search'
  | 'trash'
  | 'user'
  | 'chevron-left'
  | 'chevron-right'
  | 'auto'
  | 'plus'
  | 'minus'
  | 'check'
  | 'x'
  | 'mail'
  | 'code'
  | 'disc'
  | 'viz'
  | 'mic'
  | 'camera'
  | 'reset'
  | 'reverb'
  | 'bell'
  | 'key';

const ICONS: Record<IconName, ReactNode> = {
  play: <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />,
  pause: <path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor" stroke="none" />,
  cue: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </>
  ),
  mark: <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />,
  analyze: (
    <>
      <path d="M2 10v4" />
      <path d="M6 6v12" />
      <path d="M10 3v18" />
      <path d="M14 8v8" />
      <path d="M18 5v14" />
      <path d="M22 10v4" />
    </>
  ),
  record: <circle cx="12" cy="12" r="7" fill="currentColor" stroke="none" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" stroke="none" />,
  admin: <path d="M12 3 5 6v6c0 4.2 2.9 7.2 7 8.5 4.1-1.3 7-4.3 7-8.5V6z" />,
  'sign-out': (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 21h14" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7l1 13h10l1-13" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  'chevron-left': <path d="m14 6-6 6 6 6" />,
  'chevron-right': <path d="m10 6 6 6-6 6" />,
  auto: (
    <>
      <path d="M4 12h16" />
      <path d="m8 8-4 4 4 4" />
      <path d="m16 8 4 4-4 4" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  check: <path d="m5 12 5 5L20 7" />,
  x: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 7 9-7" />
    </>
  ),
  code: (
    <>
      <path d="m8 8-4 4 4 4" />
      <path d="m16 8 4 4-4 4" />
    </>
  ),
  viz: (
    <>
      <path d="M4 10v4" />
      <path d="M8 6v12" />
      <path d="M12 3v18" />
      <path d="M16 8v8" />
      <path d="M20 11v2" />
    </>
  ),
  disc: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v4" />
    </>
  ),
  camera: (
    <>
      <path d="M3 8h12v10H3z" />
      <path d="m15 12 6-3v8l-6-3" />
    </>
  ),
  reset: (
    <>
      <path d="M4 12a8 8 0 1 0 2.3-5.7" />
      <path d="M4 4v5h5" />
    </>
  ),
  reverb: (
    <>
      <path d="M5 10v4" />
      <path d="M9 7a6 6 0 0 1 0 10" />
      <path d="M13 4a10 10 0 0 1 0 16" />
    </>
  ),
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m11.5 12.5 9-9" />
      <path d="M16 4h4v4" />
      <path d="M15 8h3" />
    </>
  ),
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  );
}
