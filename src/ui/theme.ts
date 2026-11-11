// Farben für Diagramme und SVG (Recharts braucht feste Werte). Gleiche Werte wie die Tokens in index.css.

export const COLOR = {
  bg: '#000000',
  panel: '#1c1c1e',
  panel2: '#2c2c2e',
  line: '#38383a',
  ink: '#ffffff',
  muted: '#98989f',
  accent: '#ff9f0a',
  green: '#30d158',
  yellow: '#ffd60a',
  red: '#ff453a',
  blue: '#0a84ff',
} as const

/** Einheitlicher Tooltip-Stil der Diagramme. */
export const TOOLTIP_STYLE = {
  contentStyle: { background: COLOR.panel2, border: 'none', borderRadius: 12, fontSize: 12 },
  labelStyle: { color: COLOR.ink },
  itemStyle: { color: COLOR.ink },
} as const
