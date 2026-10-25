import { TrendingDown } from 'lucide-react'

import { planPillClass } from '@/components/standup/planning/ui'
import { SummarySection } from '@/components/standup/summary/SummarySection'
import { standupStrings } from '@/lib/standup/strings'

import { Figure, hours, hoursOrDash, shortDate } from './format'
import { RowsTable, ShowRows } from './RowsTable'
import type { AnalyticsPayload, SprintLinkContext } from './types'

const s = standupStrings.analytics

const WIDTH = 320
const HEIGHT = 120
const PAD = 8

/**
 * §15.15 "Estimate debt trend": total outstanding debt per sprint day.
 *
 * A plain SVG line rather than a charting library — one series, a handful of
 * points — with every point carrying its own accessible name, and the latest
 * figure written out in the badge so the headline never depends on reading
 * the line's height.
 */
export function DebtTrendCard({ payload }: { payload: AnalyticsPayload; link: SprintLinkContext }) {
  const points = payload.debtTrend
  const peak = Math.max(1, ...points.map((point) => point.outstandingMinutes))
  const step = points.length > 1 ? (WIDTH - PAD * 2) / (points.length - 1) : 0
  const x = (index: number) => (points.length > 1 ? PAD + index * step : WIDTH / 2)
  const y = (value: number) => HEIGHT - PAD - (value / peak) * (HEIGHT - PAD * 2)
  const latest = points[points.length - 1]

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
        <div className="flex flex-col gap-1">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-32 w-full overflow-visible"
            role="group"
            aria-label={s.sectionDebtTrend()}
          >
            <line
              x1={PAD}
              x2={WIDTH - PAD}
              y1={HEIGHT - PAD}
              y2={HEIGHT - PAD}
              stroke="var(--plan-border)"
              strokeWidth={1}
            />
            {points.length > 1 && (
              <polyline
                fill="none"
                stroke="var(--plan-accent-ink)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={points.map((point, index) => `${x(index)},${y(point.outstandingMinutes)}`).join(' ')}
              />
            )}
            {points.map((point, index) => (
              <circle
                key={point.date}
                cx={x(index)}
                cy={y(point.outstandingMinutes)}
                r={3.5}
                fill="var(--plan-accent-ink)"
                role="img"
                aria-label={s.debtPointLabel({ date: shortDate(point.date), debt: hours(point.outstandingMinutes) })}
              >
                <title>{s.debtPointLabel({ date: shortDate(point.date), debt: hours(point.outstandingMinutes) })}</title>
              </circle>
            ))}
          </svg>
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
