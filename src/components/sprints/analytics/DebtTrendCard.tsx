import { useId } from 'react'
import { TrendingDown } from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps
} from 'recharts'

import { planPillClass } from '@/components/standup/planning/ui'
import { SummarySection } from '@/components/standup/summary/SummarySection'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import {
  CHART_HEIGHT_CLASS,
  CHART_INITIAL_DIMENSION,
  CHART_MARGIN,
  ChartTooltipCard,
  ChartTooltipRow,
  gridProps,
  hourTick,
  xAxisProps,
  yAxisProps
} from './chart-theme'
import { Figure, hours, hoursOrDash, shortDate } from './format'
import { RowsTable, ShowRows } from './RowsTable'
import type { AnalyticsPayload, SprintLinkContext } from './types'

const s = standupStrings.analytics

const INK = 'var(--plan-accent-ink)'

interface DebtDatum {
  date: string
  label: string
  minutes: number
  hours: number
}

/** The hover / keyboard-focus card: the day and the debt outstanding on it. */
export function DebtTooltip({ active, payload }: TooltipProps<number, string>) {
  const datum = active ? (payload?.[0]?.payload as DebtDatum | undefined) : undefined
  if (!datum) return null
  return (
    <ChartTooltipCard title={datum.label}>
      <ChartTooltipRow
        swatch={<span className="h-2 w-2 rounded-full bg-[var(--plan-accent-ink)]" aria-hidden="true" />}
        label={s.columnDebt()}
        value={hours(datum.minutes)}
        emphasis
      />
    </ChartTooltipCard>
  )
}

/**
 * §15.15 "Estimate debt trend": total outstanding debt per sprint day.
 *
 * A single series, so no legend: the card title names it and the badge carries
 * the latest figure, so the headline never depends on reading the line. The
 * chart has recharts' accessibility layer on, so it takes keyboard focus and
 * the arrow keys walk the tooltip point by point (NFR-A1); every value is also
 * in the rows table (UI-13).
 */
export function DebtTrendCard({ payload }: { payload: AnalyticsPayload; link: SprintLinkContext }) {
  const gradientId = `debt-fill-${useId().replace(/:/g, '')}`
  const data: DebtDatum[] = payload.debtTrend.map((point) => ({
    date: point.date,
    label: shortDate(point.date),
    minutes: point.outstandingMinutes,
    hours: point.outstandingMinutes / 60
  }))
  const latest = data[data.length - 1]
  const peak = Math.max(0, ...data.map((point) => point.minutes))

  return (
    <SummarySection
      id="analytics-debt-trend"
      title={s.sectionDebtTrend()}
      icon={TrendingDown}
      isEmpty={data.length === 0}
      emptyText={s.emptyDebtTrend()}
      badge={latest ? <span className={planPillClass('accent')}>{hoursOrDash(latest.minutes)}</span> : undefined}
    >
      <div className="flex flex-col gap-4">
        {/* The series key and its peak, one line, level with the allocation chart's legend. */}
        <div className="apple-type-footnote flex h-5 items-center justify-between text-[var(--plan-muted)]">
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="h-0.5 w-3 rounded-full bg-[var(--plan-accent-ink)]" aria-hidden="true" />
            {s.columnDebt()}
          </span>
          <span className="whitespace-nowrap">
            {s.debtPeak()}{' '}
            <span className="font-apple-mono font-semibold tabular-nums text-[var(--plan-text)]">{hoursOrDash(peak)}</span>
          </span>
        </div>
        <div
          data-testid="debt-trend-chart"
          className={cn('w-full', CHART_HEIGHT_CLASS)}
          role="figure"
          aria-label={s.sectionDebtTrend()}
        >
          <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL_DIMENSION}>
            <AreaChart data={data} margin={CHART_MARGIN} accessibilityLayer>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" style={{ stopColor: INK, stopOpacity: 0.22 }} />
                  <stop offset="100%" style={{ stopColor: INK, stopOpacity: 0 }} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...xAxisProps} interval="preserveStartEnd" padding={{ left: 8, right: 8 }} />
              <YAxis {...yAxisProps} tickFormatter={hourTick} domain={[0, 'auto']} />
              <Tooltip
                content={<DebtTooltip />}
                cursor={{ stroke: 'var(--plan-border)', strokeWidth: 1 }}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="hours"
                name={s.columnDebt()}
                stroke={INK}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 5, fill: INK, stroke: 'var(--plan-surface)', strokeWidth: 2 }}
                animationDuration={600}
              />
              {latest && (
                <ReferenceDot
                  x={latest.label}
                  y={latest.hours}
                  r={4}
                  fill={INK}
                  stroke="var(--plan-surface)"
                  strokeWidth={2}
                  ifOverflow="extendDomain"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <ShowRows>
          <RowsTable
            caption={s.sectionDebtTrend()}
            columns={[
              { key: 'date', label: s.columnDate() },
              { key: 'debt', label: s.columnDebt(), align: 'right' }
            ]}
            rows={data.map((point) => ({
              key: point.date,
              cells: {
                date: point.label,
                debt: <Figure value={hoursOrDash(point.minutes)} />
              }
            }))}
          />
        </ShowRows>
      </div>
    </SummarySection>
  )
}
