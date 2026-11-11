import type { ReactNode } from 'react'
import { COLOR } from '../theme'

// Kennzahl-Ring (Apple-Aktivitätsringe als Vorbild): Fortschritt 0–1, Wert in der Mitte, Beschriftung darunter.
// Die Ampel bleibt grün/gelb/rot (Apple-Farbtöne), Schlaf blau, Training orange.
export const RING_COLOR = {
  green: COLOR.green,
  yellow: COLOR.yellow,
  red: COLOR.red,
  sleep: COLOR.blue,
  training: COLOR.accent,
  none: COLOR.line,
} as const

export function Ring({
  progress,
  color,
  value,
  unit,
  label,
  sub,
  onClick,
  testId,
  valueTestId,
}: {
  progress: number
  color: string
  value: ReactNode
  unit?: string
  label: string
  sub?: ReactNode
  onClick?: () => void
  testId?: string
  valueTestId?: string
}) {
  const size = 96
  const stroke = 10
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(1, progress))
  const body = (
    <>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
          {/* Spur in derselben Farbe, abgedunkelt wie bei den Aktivitätsringen */}
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color === RING_COLOR.none ? COLOR.line : color} strokeOpacity={color === RING_COLOR.none ? 1 : 0.22} strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold leading-none" data-testid={valueTestId}>
            {value}
          </span>
          {unit && <span className="mt-0.5 text-[10px] text-muted">{unit}</span>}
        </div>
      </div>
      <div className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      {sub !== undefined && <div className="text-center text-[11px] leading-tight text-muted">{sub}</div>}
    </>
  )
  const cls = 'flex min-w-0 flex-col items-center'
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} data-testid={testId} aria-label={`${label}: ${typeof value === 'string' ? value : ''} ändern`}>
      {body}
    </button>
  ) : (
    <div className={cls} data-testid={testId}>
      {body}
    </div>
  )
}
