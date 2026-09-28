import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import type { TrafficLight } from '../../core/types'

export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={`rounded-2xl border border-line bg-panel p-4 ${className}`} {...rest}>
      {children}
    </section>
  )
}

export function H2({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{children}</h2>
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
