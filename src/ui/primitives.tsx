import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { IconCheck, IconChevronLeft, IconClose, IconMinus, IconPlus } from './icons.tsx';

/* ---------- Card ---------- */

export function Card({
  children,
  className = '',
  hero,
  accentEdge,
  tight,
  flush,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  hero?: boolean;
  accentEdge?: boolean;
  tight?: boolean;
  flush?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  const classes = [
    'card',
    hero ? 'card-hero' : '',
    accentEdge ? 'accent-edge' : '',
    tight ? 'tight' : '',
    flush ? 'flush' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  action,
  subtitle,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <div className="t-label">{title}</div>
        {subtitle && <div className="t-caption muted mt-2">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

/* ---------- Button ---------- */

type ButtonVariant = 'default' | 'primary' | 'ghost' | 'outline' | 'danger';

export function Button({
  children,
  variant = 'default',
  size,
  block,
  className = '',
  ...rest
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: 'sm' | 'lg';
  block?: boolean;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = [
    'btn',
    variant !== 'default' ? `btn-${variant}` : '',
    size ? `btn-${size}` : '',
    block ? 'btn-block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}

/* ---------- Pill ---------- */

export function Pill({
  children,
  tone = 'default',
  className = '',
}: {
  children: ReactNode;
  tone?: 'default' | 'good' | 'warn' | 'bad' | 'info' | 'accent';
  className?: string;
}) {
  return (
    <span className={`pill ${tone !== 'default' ? `pill-${tone}` : ''} ${className}`}>{children}</span>
  );
}

export function Dot({ color }: { color: string }) {
  return <span className="dot" style={{ background: color }} />;
}

/* ---------- Stat ---------- */

export function Stat({
  label,
  value,
  sub,
  size,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  size?: 'sm' | 'lg';
  tone?: 'good' | 'warn' | 'bad' | 'accent';
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${size ?? ''} ${tone ? tone : ''}`}>{value}</div>
      {sub != null && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function StatTile(props: Parameters<typeof Stat>[0]) {
  return (
    <div className="stat-tile">
      <Stat {...props} />
    </div>
  );
}

/* ---------- Progress ---------- */

export function ProgressBar({
  value,
  max,
  color = 'var(--accent)',
  thickness,
  marker,
}: {
  value: number;
  max: number;
  color?: string;
  thickness?: 'thin' | 'thick';
  /** Optional reference marker at this value, e.g. a minimum threshold. */
  marker?: number;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const markerPct = marker != null && max > 0 ? Math.min(100, (marker / max) * 100) : null;
  return (
    <div className={`bar-track ${thickness ?? ''}`}>
      <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
      {markerPct != null && <div className="bar-marker" style={{ left: `${markerPct}%` }} />}
    </div>
  );
}

export function SegmentedBar({ segments }: { segments: { value: number; color: string; label?: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return <div className="bar-track" />;
  return (
    <div className="segmented-bar">
      {segments.map((s, i) => (
        <span
          key={i}
          style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
          title={s.label}
        />
      ))}
    </div>
  );
}

/* ---------- Checkbox ---------- */

export function Check({
  state,
  onClick,
  round,
  label,
}: {
  state: 'checked' | 'partial' | 'empty';
  onClick?: () => void;
  round?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`check ${state === 'checked' ? 'checked' : ''} ${state === 'partial' ? 'partial' : ''} ${round ? 'round' : ''}`}
      onClick={onClick}
      aria-pressed={state === 'checked'}
      aria-label={label}
    >
      {state === 'checked' && <IconCheck size={15} strokeWidth={3} />}
      {state === 'partial' && <IconMinus size={15} strokeWidth={3} />}
    </button>
  );
}

/* ---------- Form fields ---------- */

/**
 * A labelled group. It deliberately does not use <label>: a Field often wraps a
 * set of chips or a segmented control, and a <label> wrapping several controls
 * hands its text to all of them as an accessible name. A labelled group gives
 * assistive technology the right structure either way.
 */
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field" role="group" aria-labelledby={id}>
      <span className="field-label" id={id}>
        {label}
      </span>
      {children}
      {hint && <span className="t-caption muted">{hint}</span>}
    </div>
  );
}

export function TextInput({
  suffix,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { suffix?: string }) {
  if (!suffix) return <input className="input" {...rest} />;
  return (
    <span className="input-suffix">
      <input className="input" {...rest} />
      <span>{suffix}</span>
    </span>
  );
}

export function Select({
  options,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: { value: string; label: string }[];
}) {
  return (
    <select className="select" {...rest}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="textarea" {...props} />;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  accent,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  accent?: boolean;
}) {
  return (
    <div className={`segmented ${accent ? 'accent' : ''}`} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ScalePicker({
  value,
  onChange,
  labels,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  labels?: [string, string];
}) {
  return (
    <div className="col gap-2">
      <div className="scale-picker">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={value === n ? 'active' : ''}
            onClick={() => onChange(n)}
            aria-pressed={value === n}
          >
            {n}
          </button>
        ))}
      </div>
      {labels && (
        <div className="row between t-caption muted">
          <span>{labels[0]}</span>
          <span>{labels[1]}</span>
        </div>
      )}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`switch ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      aria-label={label}
    >
      <span />
    </button>
  );
}

export function Stepper({
  value,
  step = 1,
  min = 0,
  max,
  onChange,
  format,
}: {
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const clampValue = (v: number) => {
    const rounded = Math.round(v * 1000) / 1000;
    if (rounded < min) return min;
    if (max != null && rounded > max) return max;
    return rounded;
  };
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(clampValue(value - step))} aria-label="Weniger">
        <IconMinus size={16} />
      </button>
      <span className="stepper-value">{format ? format(value) : value}</span>
      <button type="button" onClick={() => onChange(clampValue(value + step))} aria-label="Mehr">
        <IconPlus size={16} />
      </button>
    </div>
  );
}

export function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="row between gap-4" style={{ padding: '10px 0' }}>
      <div className="grow">
        <div className="t-body" style={{ fontWeight: 560 }}>
          {label}
        </div>
        {hint && <div className="t-caption muted mt-2">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

/* ---------- Sheet ---------- */

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="sheet-backdrop"
      ref={backdropRef}
      onMouseDown={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="sheet">
        <div className="sheet-grabber" />
        <div className="sheet-header">
          <div className="t-heading truncate">{title}</div>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Schließen">
            <IconClose size={19} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Misc ---------- */

export function Empty({
  icon,
  title,
  hint,
  action,
}: {
  icon: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div className="t-heading" style={{ color: 'var(--text-secondary)' }}>
        {title}
      </div>
      {hint && <div className="t-small" style={{ maxWidth: 320 }}>{hint}</div>}
      {action}
    </div>
  );
}

export function IconBadge({
  children,
  color,
  small,
}: {
  children: ReactNode;
  color?: string;
  small?: boolean;
}) {
  return (
    <span
      className={`icon-badge ${small ? 'sm' : ''}`}
      style={color ? { background: `color-mix(in srgb, ${color} 18%, transparent)` } : undefined}
    >
      {children}
    </span>
  );
}

/** Collapsible section used for "why?" explanations. */
export function Disclosure({
  summary,
  children,
  defaultOpen,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div>
      <button
        type="button"
        className="row between gap-3"
        style={{ width: '100%', textAlign: 'left' }}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="grow">{summary}</span>
        <span
          className="muted"
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 200ms', display: 'grid' }}
        >
          <IconChevronLeft size={16} />
        </span>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function ReasonList({
  reasons,
}: {
  reasons: { text: string; impact: 'positive' | 'negative' | 'neutral' }[];
}) {
  if (reasons.length === 0) return null;
  return (
    <ul className="reasons">
      {reasons.map((r, i) => (
        <li className="reason" key={i}>
          <span className={`reason-mark ${r.impact}`}>
            {r.impact === 'positive' ? '+' : r.impact === 'negative' ? '−' : '•'}
          </span>
          <span>{r.text}</span>
        </li>
      ))}
    </ul>
  );
}
