import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { NavLink } from 'react-router'
import type { TrafficLight } from '../../core/types'

export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={`rounded-2xl bg-panel p-4 ${className}`} {...rest}>
      {children}
    </section>
  )
}

export function H2({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{children}</h2>
}

/** Zwischenüberschrift innerhalb einer Gruppe. */
export function Sub({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold">{children}</h3>
}

/** Aufklappbarer Bereich (Details erst beim Antippen). */
export function Disclosure({
  title,
  summary,
  children,
  defaultOpen = false,
  card = false,
  className = '',
  ...rest
}: { title: ReactNode; summary?: ReactNode; children: ReactNode; defaultOpen?: boolean; card?: boolean; className?: string } & Omit<React.HTMLAttributes<HTMLElement>, 'title'>) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className={`group ${card ? 'rounded-2xl bg-panel' : ''} ${className}`} {...rest}>
      <summary className={`flex min-h-11 cursor-pointer list-none items-center gap-3 ${card ? 'px-4 py-3' : 'py-1'} [&::-webkit-details-marker]:hidden`}>
        <span className={`flex-1 ${card ? 'font-medium' : 'text-sm text-muted'}`}>{title}</span>
        {summary !== undefined && <span className="max-w-[55%] truncate text-right text-xs text-muted">{summary}</span>}
        <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-90" fill="currentColor">
          <path d="M7.3 4.3a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 1 1-1.4-1.4L11.6 10 7.3 5.7a1 1 0 0 1 0-1.4Z" />
        </svg>
      </summary>
      <div className={card ? 'px-4 pb-4' : 'pt-2'}>{children}</div>
    </details>
  )
}

/** Umschalter für Unterseiten (Links, damit die Adressen erhalten bleiben). */
export function SegmentedLinks({ items, label }: { items: { to: string; label: string }[]; label: string }) {
  return (
    <nav aria-label={label} className="grid rounded-xl bg-panel p-1" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          className={({ isActive }) => `flex min-h-10 items-center justify-center rounded-lg text-sm ${isActive ? 'bg-panel-2 font-semibold text-ink' : 'text-muted'}`}
        >
          {i.label}
        </NavLink>
      ))}
    </nav>
  )
}

/** Umschalter innerhalb einer Seite (z. B. Zeitraum). */
export function SegmentedButtons<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="grid rounded-xl bg-panel p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-10 rounded-lg text-sm ${value === o.value ? 'bg-panel-2 font-semibold text-ink' : 'text-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Große Kennzahl mit kleiner Beschriftung. */
export function Stat({ value, label, sub, className = '' }: { value: ReactNode; label: string; sub?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className="text-2xl font-bold leading-tight">{value}</div>
      {sub !== undefined && <div className="text-xs text-muted">{sub}</div>}
    </div>
  )
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-bg font-semibold',
  secondary: 'bg-panel-2 text-ink border border-line',
  ghost: 'text-muted underline-offset-2 hover:underline',
  danger: 'bg-red/15 text-red border border-red/40',
}

export function Button({ variant = 'secondary', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`min-h-11 rounded-xl px-4 py-2 text-sm disabled:opacity-50 ${VARIANT[variant]} ${className}`} {...rest} />
}

export function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warn' | 'danger' }) {
  const t = {
    neutral: 'bg-panel-2 text-muted',
    accent: 'bg-accent/15 text-accent',
    warn: 'bg-yellow/15 text-yellow',
    danger: 'bg-red/15 text-red',
  }[tone]
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${t}`}>{children}</span>
}

export const TRAFFIC_LABEL: Record<TrafficLight, string> = { green: 'Grün', yellow: 'Gelb', red: 'Rot' }
const TRAFFIC_CLASS: Record<TrafficLight, string> = { green: 'bg-green', yellow: 'bg-yellow', red: 'bg-red' }

export function TrafficDot({ traffic, size = 'md' }: { traffic?: TrafficLight; size?: 'md' | 'lg' }) {
  const s = size === 'lg' ? 'h-12 w-12' : 'h-3 w-3'
  return <span aria-hidden className={`inline-block shrink-0 rounded-full ${s} ${traffic ? TRAFFIC_CLASS[traffic] : 'bg-line'}`} />
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`min-h-11 w-full rounded-xl border border-line bg-panel-2 px-3 text-ink ${props.className ?? ''}`} />
}

export function NumberInput({ value, onChange, ...rest }: { value: number | undefined; onChange: (v: number | undefined) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      {...rest}
    />
  )
}

/** Auswahl 1–5 als Buttons (Gefühl, Schlafqualität). */
export function Rating({ value, onChange, label }: { value?: number; onChange: (v: 1 | 2 | 3 | 4 | 5) => void; label: string }) {
  return (
    <div role="group" aria-label={label}>
      <span className="mb-1 block text-sm text-muted">{label}</span>
      <div className="grid grid-cols-5 gap-2">
        {([1, 2, 3, 4, 5] as const).map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            onClick={() => onChange(n)}
            className={`min-h-11 rounded-xl border text-sm ${value === n ? 'border-accent bg-accent/20 text-accent' : 'border-line bg-panel-2'}`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Disclaimer() {
  return (
    <p className="text-xs leading-relaxed text-muted" data-testid="disclaimer">
      Der Plan ist eine automatische Empfehlung und ersetzt keine Beratung durch Trainer oder Arzt. Bei Schmerzen, Krankheit oder anhaltend
      schlechten Erholungswerten hat Pause Vorrang.
    </p>
  )
}
