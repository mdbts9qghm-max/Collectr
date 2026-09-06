import { useId } from 'react';

/* ------------------------------------------------------------------ *
 * Ring — the primary score display
 * ------------------------------------------------------------------ */

export function Ring({
  value,
  max = 100,
  size = 132,
  stroke = 11,
  color = 'var(--accent)',
  label,
  sublabel,
  trackColor,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  color?: string;
  label?: string;
  sublabel?: string;
  trackColor?: string;
}) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;

  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle
          className="ring-track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke={trackColor ?? 'var(--surface-3)'}
        />
        <circle
          className="ring-value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
        }}
      >
        {label && (
          <span
            className="t-num"
            style={{ fontSize: size * 0.28, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}
          >
            {label}
          </span>
        )}
        {sublabel && (
          <span className="t-caption muted" style={{ fontSize: Math.max(10, size * 0.083) }}>
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}

/** Concentric rings, one per pillar — the score breakdown at a glance. */
export function MultiRing({
  rings,
  size = 150,
  gap = 4,
  stroke = 8,
}: {
  rings: { value: number; color: string; label: string }[];
  size?: number;
  gap?: number;
  stroke?: number;
}) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {rings.map((ring, i) => {
          const r = (size - stroke) / 2 - i * (stroke + gap);
          if (r <= 2) return null;
          const c = 2 * Math.PI * r;
          const pct = Math.min(1, Math.max(0, ring.value / 100));
          return (
            <g key={ring.label}>
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                strokeWidth={stroke}
                stroke="var(--surface-3)"
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                strokeWidth={stroke}
                stroke={ring.color}
                strokeDasharray={c}
                strokeDashoffset={c * (1 - pct)}
                strokeLinecap="round"
                className="ring-value"
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * Bars
 * ------------------------------------------------------------------ */

export interface BarDatum {
  label: string;
  value: number;
  color?: string;
  /** Optional stacked segments; when present `value` is ignored. */
  segments?: { value: number; color: string }[];
  highlight?: boolean;
}

export function BarChart({
  data,
  height = 120,
  target,
  targetLabel,
  valueFormat,
  showValues,
}: {
  data: BarDatum[];
  height?: number;
  target?: number;
  targetLabel?: string;
  valueFormat?: (v: number) => string;
  showValues?: boolean;
}) {
  const totals = data.map((d) => (d.segments ? d.segments.reduce((s, x) => s + x.value, 0) : d.value));
  const max = Math.max(...totals, target ?? 0, 1);

  return (
    <div className="chart-wrap">
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 6,
          height,
          position: 'relative',
          borderBottom: '1px solid var(--border)',
          paddingBottom: 1,
        }}
      >
        {target != null && target > 0 && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: `${(target / max) * 100}%`,
              borderTop: '1px dashed var(--border-strong)',
              pointerEvents: 'none',
            }}
          >
            {targetLabel && (
              <span
                className="t-caption muted"
                style={{ position: 'absolute', right: 0, top: -15, background: 'var(--surface)', padding: '0 4px' }}
              >
                {targetLabel}
              </span>
            )}
          </div>
        )}
        {data.map((d, i) => {
          const total = totals[i];
          const heightPct = max > 0 ? (total / max) * 100 : 0;
          return (
            <div
              key={`${d.label}-${i}`}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%', minWidth: 0 }}
              title={`${d.label}: ${valueFormat ? valueFormat(total) : total}`}
            >
              {showValues && total > 0 && (
                <span className="t-caption muted center t-num" style={{ marginBottom: 3, fontSize: 10 }}>
                  {valueFormat ? valueFormat(total) : Math.round(total)}
                </span>
              )}
              <div
                style={{
                  height: `${Math.max(total > 0 ? 3 : 0, heightPct)}%`,
                  borderRadius: '5px 5px 2px 2px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column-reverse',
                  background: d.segments ? 'transparent' : (d.color ?? 'var(--accent)'),
                  outline: d.highlight ? '1.5px solid var(--accent)' : 'none',
                  outlineOffset: 1,
                  transition: 'height 380ms cubic-bezier(0.22,1,0.36,1)',
                }}
              >
                {d.segments?.map((s, j) => (
                  <div key={j} style={{ height: `${total > 0 ? (s.value / total) * 100 : 0}%`, background: s.color }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        {data.map((d, i) => (
          <div
            key={`${d.label}-label-${i}`}
            className="t-caption muted center truncate"
            style={{ flex: 1, fontSize: 10, fontWeight: d.highlight ? 700 : 500, color: d.highlight ? 'var(--text)' : undefined }}
          >
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Line / area
 * ------------------------------------------------------------------ */

export interface LineSeries {
  points: (number | null)[];
  color: string;
  label: string;
  fill?: boolean;
  dashed?: boolean;
}

export function LineChart({
  series,
  labels,
  height = 140,
  min,
  max,
  zeroLine,
  valueFormat,
}: {
  series: LineSeries[];
  labels?: string[];
  height?: number;
  min?: number;
  max?: number;
  /** Draws a horizontal reference at this value (e.g. 0 for training form). */
  zeroLine?: number;
  valueFormat?: (v: number) => string;
}) {
  const gradientId = useId();
  const width = 320;
  const padTop = 8;
  const padBottom = 18;
  const chartHeight = height - padTop - padBottom;

  const all = series.flatMap((s) => s.points).filter((v): v is number => v != null);
  if (all.length === 0) {
    return (
      <div className="center muted t-small" style={{ height, display: 'grid', placeItems: 'center' }}>
        Noch keine Daten
      </div>
    );
  }
  const lo = min ?? Math.min(...all, zeroLine ?? Infinity);
  const hi = max ?? Math.max(...all, zeroLine ?? -Infinity);
  const range = hi - lo || 1;

  const count = Math.max(...series.map((s) => s.points.length));
  const x = (i: number) => (count <= 1 ? width / 2 : (i / (count - 1)) * width);
  const y = (v: number) => padTop + chartHeight - ((v - lo) / range) * chartHeight;

  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        role="img"
        aria-label={series.map((s) => s.label).join(', ')}
      >
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={`${gradientId}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            className="chart-grid-line"
            x1={0}
            x2={width}
            y1={padTop + chartHeight * f}
            y2={padTop + chartHeight * f}
          />
        ))}

        {zeroLine != null && zeroLine >= lo && zeroLine <= hi && (
          <line
            x1={0}
            x2={width}
            y1={y(zeroLine)}
            y2={y(zeroLine)}
            stroke="var(--border-strong)"
            strokeDasharray="3 3"
          />
        )}

        {series.map((s, si) => {
          const segments: string[] = [];
          let current: string[] = [];
          s.points.forEach((v, i) => {
            if (v == null) {
              if (current.length) segments.push(current.join(' '));
              current = [];
              return;
            }
            current.push(`${current.length === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`);
          });
          if (current.length) segments.push(current.join(' '));
          const d = segments.join(' ');

          const firstIdx = s.points.findIndex((v) => v != null);
          const lastIdx = s.points.length - 1 - [...s.points].reverse().findIndex((v) => v != null);
          const areaPath =
            s.fill && firstIdx >= 0
              ? `${d} L${x(lastIdx).toFixed(2)},${padTop + chartHeight} L${x(firstIdx).toFixed(2)},${padTop + chartHeight} Z`
              : null;

          return (
            <g key={s.label}>
              {areaPath && <path d={areaPath} fill={`url(#${gradientId}-${si})`} />}
              <path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={s.dashed ? '4 3' : undefined}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      </svg>

      <div className="row between mt-2">
        <div className="row gap-3 wrap">
          {series.map((s) => (
            <span key={s.label} className="row gap-2 t-caption muted">
              <span
                style={{
                  width: 10,
                  height: 3,
                  borderRadius: 2,
                  background: s.color,
                  display: 'inline-block',
                }}
              />
              {s.label}
            </span>
          ))}
        </div>
        <span className="t-caption muted t-num">
          {valueFormat ? `${valueFormat(lo)} – ${valueFormat(hi)}` : `${Math.round(lo)} – ${Math.round(hi)}`}
        </span>
      </div>
      {labels && (
        <div className="row between t-caption muted mt-2">
          <span>{labels[0]}</span>
          <span>{labels[labels.length - 1]}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Sparkline & heatmap
 * ------------------------------------------------------------------ */

export function Sparkline({
  values,
  color = 'var(--accent)',
  height = 32,
  width = 90,
}: {
  values: (number | null)[];
  color?: string;
  height?: number;
  width?: number;
}) {
  const present = values.filter((v): v is number => v != null);
  if (present.length < 2) return <div style={{ height, width }} />;
  const lo = Math.min(...present);
  const hi = Math.max(...present);
  const range = hi - lo || 1;
  const d = values
    .map((v, i) =>
      v == null
        ? null
        : `${(i / (values.length - 1)) * width},${height - ((v - lo) / range) * (height - 4) - 2}`,
    )
    .filter(Boolean)
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p}`)
    .join(' ');
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** GitHub-style consistency grid — one square per day. */
export function Heatmap({
  cells,
  columns = 7,
  cellSize = 13,
  gap = 3,
}: {
  cells: { date: string; intensity: number; title: string; color?: string }[];
  columns?: number;
  cellSize?: number;
  gap?: number;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, ${cellSize}px)`,
        gap,
        justifyContent: 'space-between',
      }}
    >
      {cells.map((c) => (
        <div
          key={c.date}
          title={c.title}
          style={{
            width: cellSize,
            height: cellSize,
            borderRadius: 3,
            background:
              c.intensity <= 0
                ? 'var(--surface-3)'
                : `color-mix(in srgb, ${c.color ?? 'var(--accent)'} ${Math.round(Math.min(1, c.intensity) * 100)}%, var(--surface-3))`,
          }}
        />
      ))}
    </div>
  );
}

/** Horizontal distribution bar with labels — used for sport and zone splits. */
export function DistributionBar({
  items,
  formatValue,
}: {
  items: { label: string; value: number; color: string }[];
  formatValue?: (v: number) => string;
}) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total <= 0) {
    return <div className="t-small muted center" style={{ padding: '12px 0' }}>Noch keine Daten</div>;
  }
  return (
    <div className="col gap-3">
      <div className="segmented-bar">
        {items
          .filter((i) => i.value > 0)
          .map((i) => (
            <span key={i.label} style={{ width: `${(i.value / total) * 100}%`, background: i.color }} />
          ))}
      </div>
      <div className="col gap-2">
        {items
          .filter((i) => i.value > 0)
          .sort((a, b) => b.value - a.value)
          .map((i) => (
            <div className="row gap-2" key={i.label}>
              <span className="dot" style={{ background: i.color }} />
              <span className="grow truncate t-small">{i.label}</span>
              <span className="t-small t-num muted">
                {formatValue ? formatValue(i.value) : i.value}
              </span>
              <span className="t-small t-num" style={{ minWidth: 38, textAlign: 'right' }}>
                {Math.round((i.value / total) * 100)} %
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
