import { useState } from 'react'
import { TrendingDown } from 'lucide-react'

import { planPillClass } from '@/components/standup/planning/ui'
import { SummarySection } from '@/components/standup/summary/SummarySection'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import { Figure, hours, hoursOrDash, shortDate } from './format'
import { RowsTable, ShowRows } from './RowsTable'
import type { AnalyticsPayload, SprintLinkContext } from './types'

const s = standupStrings.analytics

/** Keeps the line and its points off the chart's edges, so a dot is never clipped. */
const X_MARGIN = 4
const Y_TOP = 8
const Y_BOTTOM = 92

/**
 * §15.15 "Estimate debt trend": total outstanding debt per sprint day.
 *
 * The line is a stretched SVG (so it fills the card at any width without
 * letterboxing); the points are real buttons laid over it by percentage, so
 * they stay round, are easy to hit, and can take keyboard focus. Hover *and*
 * focus show the date and the debt in a tooltip — the figure is never
 * reachable by hovering alone (NFR-A1) — and the latest figure is written in
 * the badge, so the headline never depends on reading the line's height.
 *
 * Height: the two cards share a stretched grid row, so they always end level.
 * The chart is sized so their contents line up too — Allocation health is a
 * 10rem bar area plus a legend row; this is a 10.75rem chart plus a date row.
 */
export function DebtTrendCard({ payload }: { payload: AnalyticsPayload; link: SprintLinkContext }) {
  const points = payload.debtTrend
  const [active, setActive] = useState<number | null>(null)

  const peak = Math.max(1, ...points.map((point) => point.outstandingMinutes))
  const xPercent = (index: number) =>
    points.length > 1 ? X_MARGIN + (index * (100 - X_MARGIN * 2)) / (points.length - 1) : 50
  const yPercent = (value: number) => Y_BOTTOM - (value / peak) * (Y_BOTTOM - Y_TOP)
  const latest = points[points.length - 1]
  const hovered = active === null ? null : points[active]

  return (
    <SummarySection
      id="analytics-debt-trend"
      title={s.sectionDebtTrend()}
      icon={TrendingDown}
      isEmpty={points.length === 0}
      emptyText={s.emptyDebtTrend()}
      badge={latest ? <span className={planPillClass('accent')}>{hoursOrDash(latest.outstandingMinutes)}</span> : undefined}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <div
            data-testid="debt-trend-chart"
            className="relative h-[10.75rem] w-full"
            onMouseLeave={() => setActive(null)}
          >
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
              aria-hidden="true"
            >
              <line
                x1={0}
                x2={100}
                y1={Y_BOTTOM}
                y2={Y_BOTTOM}
                stroke="var(--plan-border)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              {points.length > 1 && (
                <polyline
                  fill="none"
                  stroke="var(--plan-accent-ink)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  points={points
                    .map((point, index) => `${xPercent(index)},${yPercent(point.outstandingMinutes)}`)
                    .join(' ')}
                />
              )}
            </svg>

            {points.map((point, index) => {
              const label = s.debtPointLabel({ date: shortDate(point.date), debt: hours(point.outstandingMinutes) })
              return (
                <button
                  key={point.date}
                  type="button"
                  aria-label={label}
                  onMouseEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                  className="group absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-none"
                  style={{ left: `${xPercent(index)}%`, top: `${yPercent(point.outstandingMinutes)}%` }}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'apple-transition block rounded-full bg-[var(--plan-accent-ink)] ring-2 ring-[var(--plan-surface)]',
                      active === index ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5'
                    )}
                  />
                </button>
              )
            })}

            {hovered && active !== null && (
              <div
                role="tooltip"
                className={cn(
                  'pointer-events-none absolute z-10 flex -translate-x-1/2 flex-col items-center whitespace-nowrap rounded-[var(--apple-radius-sm)] border border-[var(--plan-border)] bg-[var(--plan-surface)] px-2.5 py-1.5 shadow-[var(--plan-shadow)]',
                  // Below the point when it is near the top, so the tip is never clipped by the card.
                  yPercent(hovered.outstandingMinutes) < 30 ? 'translate-y-4' : '-translate-y-[calc(100%+0.75rem)]'
                )}
                style={{
                  // Held inside the chart so the first and last tips do not hang off its edges.
                  left: `${Math.min(88, Math.max(12, xPercent(active)))}%`,
                  top: `${yPercent(hovered.outstandingMinutes)}%`
                }}
              >
                <span className="apple-type-caption text-[var(--plan-muted)]">{shortDate(hovered.date)}</span>
                <span className="font-apple-mono apple-type-footnote font-semibold tabular-nums text-[var(--plan-text)]">
                  {hours(hovered.outstandingMinutes)}
                </span>
              </div>
            )}
          </div>

          <div className="apple-type-caption flex justify-between text-[var(--plan-muted)]" aria-hidden="true">
            <span>{shortDate(points[0]?.date ?? '')}</span>
            {points.length > 1 && <span>{shortDate(latest.date)}</span>}
          </div>
        </div>

        <ShowRows>
          <RowsTable
            caption={s.sectionDebtTrend()}
            columns={[
              { key: 'date', label: s.columnDate() },
              { key: 'debt', label: s.columnDebt(), align: 'right' }
            ]}
            rows={points.map((point) => ({
              key: point.date,
              cells: {
                date: shortDate(point.date),
                debt: <Figure value={hoursOrDash(point.outstandingMinutes)} />
              }
            }))}
          />
        </ShowRows>
      </div>
    </SummarySection>
  )
}
