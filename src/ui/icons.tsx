interface IconProps {
  size?: number;
  strokeWidth?: number;
}

function svg(path: React.ReactNode, { size = 22, strokeWidth = 1.9 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

export const IconToday = (p: IconProps = {}) =>
  svg(
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>,
    p,
  );

export const IconTraining = (p: IconProps = {}) =>
  svg(
    <>
      <path d="M6.5 6.5v11M17.5 6.5v11" />
      <path d="M3.5 9v6M20.5 9v6" />
      <path d="M6.5 12h11" />
    </>,
    p,
  );

export const IconHabits = (p: IconProps = {}) =>
  svg(
    <>
      <path d="M20 6 9 17l-5-5" />
    </>,
    p,
  );

export const IconTasks = (p: IconProps = {}) =>
  svg(
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </>,
    p,
  );

export const IconAnalytics = (p: IconProps = {}) =>
  svg(
    <>
      <path d="M3 20h18" />
      <path d="M6 20v-6M11 20V8M16 20v-9M21 20V5" />
    </>,
    p,
  );

export const IconCalendar = (p: IconProps = {}) =>
  svg(
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>,
    p,
  );

export const IconGoal = (p: IconProps = {}) =>
  svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.4" />
    </>,
    p,
  );

export const IconCoach = (p: IconProps = {}) =>
  svg(
    <>
      <path d="M21 12a8 8 0 1 1-3.2-6.4" />
      <path d="M8.5 15.5c1 1 2.2 1.5 3.5 1.5s2.5-.5 3.5-1.5" />
      <path d="M9 10h.01M15 10h.01" />
    </>,
    p,
  );

export const IconProfile = (p: IconProps = {}) =>
  svg(
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>,
    p,
  );

export const IconSleep = (p: IconProps = {}) =>
  svg(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />, p);

export const IconPlus = (p: IconProps = {}) => svg(<path d="M12 5v14M5 12h14" />, p);
export const IconMinus = (p: IconProps = {}) => svg(<path d="M5 12h14" />, p);
export const IconCheck = (p: IconProps = {}) => svg(<path d="M20 6 9 17l-5-5" />, p);
export const IconClose = (p: IconProps = {}) => svg(<path d="m6 6 12 12M18 6 6 18" />, p);
export const IconChevronLeft = (p: IconProps = {}) => svg(<path d="m15 5-7 7 7 7" />, p);
export const IconChevronRight = (p: IconProps = {}) => svg(<path d="m9 5 7 7-7 7" />, p);
export const IconChevronDown = (p: IconProps = {}) => svg(<path d="m5 9 7 7 7-7" />, p);
export const IconEdit = (p: IconProps = {}) =>
  svg(
    <>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m14.5 6.5 3 3" />
    </>,
    p,
  );
export const IconTrash = (p: IconProps = {}) =>
  svg(
    <>
      <path d="M4 7h16M10 4h4M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>,
    p,
  );
export const IconSettings = (p: IconProps = {}) =>
  svg(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>,
    p,
  );
export const IconFlame = (p: IconProps = {}) =>
  svg(
    <>
      <path d="M12 22c4 0 7-2.8 7-6.5 0-4.5-4-6-5-9.5-2 1.5-2.5 3.5-2.5 5C10 9 9 7.5 9 6c-1.5 1.5-4 4-4 9.5C5 19.2 8 22 12 22Z" />
    </>,
    p,
  );
export const IconTrophy = (p: IconProps = {}) =>
  svg(
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
      <path d="M9 20h6M12 14v6" />
    </>,
    p,
  );
export const IconDownload = (p: IconProps = {}) =>
  svg(
    <>
      <path d="M12 3v12M7 11l5 5 5-5" />
      <path d="M4 20h16" />
    </>,
    p,
  );
export const IconUpload = (p: IconProps = {}) =>
  svg(
    <>
      <path d="M12 17V5M7 9l5-5 5 5" />
      <path d="M4 20h16" />
    </>,
    p,
  );
export const IconInfo = (p: IconProps = {}) =>
  svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>,
    p,
  );
