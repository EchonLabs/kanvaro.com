import type { ReactNode } from 'react'

/**
 * The shared look of the analytics charts (recharts): recessive hairline grid,
 * muted tick text, no axis lines, and one tooltip card. Text always wears the
 * text tokens, never a series colour; colour lives on the marks only.
 */

/** Plot height shared by the two side-by-side charts, so their cards end level. */
export const CHART_HEIGHT_CLASS = 'h-56'

/** jsdom has no layout; recharts falls back to this until it can measure. */
export const CHART_INITIAL_DIMENSION = { width: 520, height: 224 }

export const CHART_MARGIN = { top: 8, right: 8, bottom: 0, left: 0 }

const TICK = { fill: 'var(--plan-muted)', fontSize: 11 }

export const gridProps = {
  vertical: false,
  stroke: 'var(--plan-border)',
  strokeDasharray: undefined
} as const

export const xAxisProps = {
  axisLine: false,
  tickLine: false,
  tick: TICK,
  tickMargin: 8,
  minTickGap: 16
} as const

export const yAxisProps = {
  axisLine: false,
  tickLine: false,
  tick: TICK,
  tickMargin: 6,
  width: 40,
  allowDecimals: false
} as const

/** Clean hour ticks: "0h", "4h", "12h". */
export function hourTick(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}h`
}

/** The one tooltip card every analytics chart uses. */
export function ChartTooltipCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      role="tooltip"
      className="min-w-[10rem] rounded-[var(--apple-radius-sm)] border border-[var(--plan-border)] bg-[var(--plan-surface)] px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
    >
      <p className="apple-type-caption mb-1.5 font-semibold text-[var(--plan-text)]">{title}</p>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  )
}

/** One "swatch · label ........ value" line inside a tooltip card. */
export function ChartTooltipRow({
  swatch,
  label,
  value,
  emphasis = false
}: {
  swatch?: ReactNode
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div className="apple-type-caption flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-[var(--plan-muted)]">
        {swatch}
        {label}
      </span>
      <span
        className={
          emphasis
            ? 'font-apple-mono font-semibold tabular-nums text-[var(--plan-text)]'
            : 'font-apple-mono tabular-nums text-[var(--plan-text)]'
        }
      >
        {value}
      </span>
    </div>
  )
}
