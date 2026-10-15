// Набор линейных иконок 24×24 (обводка наследует currentColor).
const PATHS = {
  tooth: <path d="M12 4.5c-1.6-1-3.1-1.5-4.6-1.2C4.8 3.8 3.6 6 4 9c.3 2 .9 3.4 1.4 5.2.6 2.3.9 6.3 2.6 6.3 1.4 0 1.6-2.4 2-4.2.3-1.2 1-1.8 2-1.8s1.7.6 2 1.8c.4 1.8.6 4.2 2 4.2 1.7 0 2-4 2.6-6.3.5-1.8 1.1-3.2 1.4-5.2.4-3-.8-5.2-3.4-5.7-1.5-.3-3 .2-4.6 1.2Z" />,
  implant: <><path d="M7.5 3h9l-1.2 4H8.7L7.5 3Z" /><path d="M10 7v12.5l2 1.5 2-1.5V7" /><path d="M9 10.5h6M9 14h6M9 17.5h6" /></>,
  sparkle: <><path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9L11 3Z" /><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></>,
  braces: <><path d="M3 12h18" /><rect x="4.5" y="9" width="3.5" height="6" rx="1" /><rect x="10.25" y="9" width="3.5" height="6" rx="1" /><rect x="16" y="9" width="3.5" height="6" rx="1" /></>,
  smile: <><circle cx="12" cy="12" r="9" /><path d="M8 14c1 1.3 2.4 2 4 2s3-.7 4-2" /><path d="M9 9.5h.01M15 9.5h.01" /></>,
  shield: <><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3Z" /><path d="M9 12l2 2 4-4" /></>,
  feather: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  microscope: <><path d="M6 21h12" /><path d="M8.5 17.5A6.5 6.5 0 0 0 18 12" /><path d="M9.5 3.5l3-1 3.5 9.5-3 1z" /><path d="M8 18h7" /><circle cx="15.5" cy="15" r="1.5" /></>,
  sterile: <><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" /><path d="M9.5 14.5l1.8 1.8 3.2-3.6" /></>,
  card: <><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h4" /></>,
  doc: <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h4" /></>,
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2Z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  pin: <><path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" /><circle cx="12" cy="9" r="2.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3.5 6.5 12 13l8.5-6.5" /></>,
  left: <path d="M15 5l-7 7 7 7" />,
  right: <path d="M9 5l7 7-7 7" />,
  play: <path d="M8 5.5v13l10-6.5-10-6.5Z" fill="currentColor" />,
  pause: <path d="M8.5 5v14M15.5 5v14" />,
  replay: <><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4.5h4.5" /></>,
  cube: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="M12 12l8-4.5M12 12v9M12 12 4 7.5" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
};

export default function Icon({ name, size = 24, strokeWidth = 1.8, ...props }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      {PATHS[name]}
    </svg>
  );
}
