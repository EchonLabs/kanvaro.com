import { useId } from 'react'
import { CornerDownRight } from 'lucide-react'
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ReferenceArea,
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
  CHART_INITIAL_DIMENSION,
  ChartTooltipCard,
  ChartTooltipRow,
  xAxisProps
} from './chart-theme'
import { Figure } from './format'
import { RowsTable, ShowRows } from './RowsTable'
import type { AnalyticsPayload, SprintLinkContext } from './types'

const s = standupStrings.analytics

const CORNER = 4
const OPEN_FILL = 'var(--plan-accent-ink)'

interface BucketDatum {
  label: string
  count: number
  chronic: boolean
}

const OPEN_SWATCH = 'bg-[var(--plan-accent-ink)]'
const CHRONIC_SWATCH =
  'bg-[var(--plan-danger)] [background-image:repeating-linear-gradient(135deg,transparent_0_2px,rgba(255,255,255,0.45)_2px_3.5px)]'

/** Rounded at the data end, square at the baseline; a zero bucket draws nothing. */
function BucketShape(props: { x?: number; y?: number; width?: number; height?: number; fill?: string }) {
  const { x = 0, y = 0, width = 0, height = 0, fill } = props
  if (height <= 0) return <g />
  const r = Math.min(CORNER, width / 2, height)
  const d = [
    `M${x},${y + height}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `L${x + width - r},${y}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `L${x + width},${y + height}`,
    'Z'
  ].join(' ')
  return <path d={d} fill={fill} />
}

/** The hover / keyboard-focus card: the age band and how many items sit in it. */
export function AgeingTooltip({ active, payload }: TooltipProps<number, string>) {
  const bucket = active ? (payload?.[0]?.payload as BucketDatum | undefined) : undefined
  if (!bucket) return null
  return (
    <ChartTooltipCard title={s.ageingTooltipTitle({ label: bucket.label })}>
      <ChartTooltipRow
        swatch={<span className={cn('h-2.5 w-2.5 rounded-[3px]', bucket.chronic ? CHRONIC_SWATCH : OPEN_SWATCH)} aria-hidden="true" />}
        label={bucket.chronic ? s.ageingKeyChronic() : s.ageingItems()}
        value={String(bucket.count)}
        emphasis
      />
    </ChartTooltipCard>
  )
}

/**
 * §15.15 "Carry forward ageing": open items by age in stand-ups. The chronic
 * band (E63, age 8+) sits in a shaded, labelled zone and its bar is red *and*
 * striped, and the badge says "N chronic" in text, so the band is never told
 * apart by colour alone (NFR-A1). Each bar carries its count at the tip, so
 * the chart needs no value axis.
 */
export function AgeingCard({ payload }: { payload: AnalyticsPayload; link: SprintLinkContext }) {
  const { buckets, chronicCount } = payload.ageing
  const items = payload.ageingItems
  const stripeId = `ageing-stripe-${useId().replace(/:/g, '')}`

  const data: BucketDatum[] = buckets.map((bucket) => ({
    label: bucket.label,
    count: bucket.count,
    chronic: bucket.chronic
  }))
  const chronicLabels = data.filter((bucket) => bucket.chronic).map((bucket) => bucket.label)
  const total = data.reduce((sum, bucket) => sum + bucket.count, 0)

  return (
    <SummarySection
      id="analytics-ageing"
      title={s.sectionAgeing()}
      icon={CornerDownRight}
      isEmpty={items.length === 0}
      emptyText={s.emptyAgeing()}
      badge={
        chronicCount > 0 ? (
          <span className={planPillClass('danger')}>{s.chronicBand({ count: chronicCount })}</span>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <div className="apple-type-footnote flex h-5 items-center justify-between text-[var(--plan-muted)]">
          <ul className="flex items-center gap-x-4">
            <li className="flex items-center gap-1.5 whitespace-nowrap">
              <span className={cn('h-2.5 w-2.5 rounded-[3px]', OPEN_SWATCH)} aria-hidden="true" />
              {s.ageingKeyOpen()}
            </li>
            {chronicLabels.length > 0 && (
              <li className="flex items-center gap-1.5 whitespace-nowrap">
                <span className={cn('h-2.5 w-2.5 rounded-[3px]', CHRONIC_SWATCH)} aria-hidden="true" />
                {s.ageingKeyChronic()}
              </li>
            )}
          </ul>
          <span className="font-apple-mono font-semibold tabular-nums text-[var(--plan-text)]">
            {s.ageingTotal({ count: total })}
          </span>
        </div>

        <div data-testid="ageing-chart" className="h-48 w-full" role="figure" aria-label={s.sectionAgeing()}>
          <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL_DIMENSION}>
            <BarChart data={data} margin={{ top: 20, right: 4, bottom: 0, left: 4 }} barCategoryGap="30%" accessibilityLayer>
              <defs>
                <pattern id={stripeId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="6" height="6" style={{ fill: 'var(--plan-danger)' }} />
                  <line x1="0" y1="0" x2="0" y2="6" style={{ stroke: 'rgba(255,255,255,0.4)', strokeWidth: 2 }} />
                </pattern>
              </defs>
              {chronicLabels.length > 0 && (
                <ReferenceArea
                  x1={chronicLabels[0]}
                  x2={chronicLabels[chronicLabels.length - 1]}
                  fill="var(--plan-danger)"
                  fillOpacity={0.07}
                  stroke="none"
                  ifOverflow="visible"
                  label={{
                    value: s.ageingZoneChronic(),
                    position: 'insideTopRight',
                    fill: 'var(--plan-danger)',
                    fontSize: 11,
                    fontWeight: 600
                  }}
                />
              )}
              <XAxis dataKey="label" {...xAxisProps} axisLine={{ stroke: 'var(--plan-border)' }} minTickGap={0} />
              <YAxis hide allowDecimals={false} domain={[0, (max: number) => Math.max(1, max)]} />
              <Tooltip
                content={<AgeingTooltip />}
                cursor={{ fill: 'var(--plan-track)', radius: 6 } as object}
                isAnimationActive={false}
              />
              <Bar dataKey="count" name={s.ageingItems()} maxBarSize={28} shape={<BucketShape />} animationDuration={600}>
                {data.map((bucket) => (
                  <Cell key={bucket.label} fill={bucket.chronic ? `url(#${stripeId})` : OPEN_FILL} />
                ))}
                <LabelList
                  dataKey="count"
                  position="top"
                  offset={6}
                  formatter={(value: number) => (value > 0 ? value : '')}
                  style={{ fill: 'var(--plan-text)', fontSize: 12, fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* The chart's SVG is not readable by a screen reader; each band is written out here (NFR-A1). */}
        <ul className="sr-only">
          {data.map((bucket) => (
            <li key={bucket.label}>
              {s.ageBucketLabel({ label: bucket.label, count: bucket.count, chronic: bucket.chronic })}
            </li>
          ))}
        </ul>

        <ShowRows>
          <RowsTable
            caption={s.sectionAgeing()}
            columns={[
              { key: 'task', label: s.columnTask() },
              { key: 'age', label: s.columnAge(), align: 'right' },
              { key: 'status', label: s.columnStatus() },
              ...(payload.view === 'full' ? [{ key: 'owner', label: s.columnOwner() }] : [])
            ]}
            rows={items.map((item) => ({
              key: item.itemId,
              cells: {
                task: item.taskKey ? `${item.taskKey} ${item.title ?? ''}`.trim() : (item.title ?? 'N/A'),
                age: <Figure value={s.ageInStandups({ age: item.ageInStandups })} />,
                status: <span className="capitalize">{item.status}</span>,
                owner: 'memberName' in item ? (item.memberName ?? 'N/A') : undefined
              }
            }))}
          />
        </ShowRows>
      </div>
    </SummarySection>
  )
}
