import { useId } from 'react'
import Link from 'next/link'
import { Gauge } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps
} from 'recharts'

import { SummarySection } from '@/components/standup/summary/SummarySection'
import { planLinkClass } from '@/components/standup/planning/ui'
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
import { Figure, hours, hoursOrDash, shortDate, standupHref } from './format'
import { RowsTable, ShowRows } from './RowsTable'
import type { AnalyticsPayload, SprintLinkContext } from './types'

const s = standupStrings.analytics

type SegmentKey = 'full' | 'under' | 'over'

/** Bottom to top: the order the segments stack in, and the legend reads in. */
const SEGMENT_ORDER: SegmentKey[] = ['full', 'under', 'over']

/** The space between stacked segments, in the surface colour (no strokes). */
const SEGMENT_GAP = 2
const CORNER = 4

interface DayDatum {
  standupId: string
  label: string
  title: string
  full: number
  under: number
  over: number
  fullMinutes: number
  underMinutes: number
  overMinutes: number
  capacityMinutes: number
}

/**
 * Each segment has its own ink and the under segment also has its own texture
 * (hatched, reading as "capacity left empty"), so the bar still reads in
 * greyscale or for a reader who cannot tell amber from red (NFR-A1). The
 * legend repeats the distinction in words.
 */
const SEGMENTS: Record<SegmentKey, { label: () => string; short: () => string; swatchClass: string }> = {
  full: { label: s.legendFull, short: s.columnWithin, swatchClass: 'bg-[var(--plan-success)]' },
  under: {
    label: s.legendUnder,
    short: s.columnUnder,
    swatchClass:
      'bg-[var(--plan-warning-bg)] [background-image:repeating-linear-gradient(135deg,var(--plan-warning)_0_1.5px,transparent_1.5px_4px)]'
  },
  over: { label: s.legendOver, short: s.columnOver, swatchClass: 'bg-[var(--plan-danger)]' }
}

function Swatch({ segment }: { segment: SegmentKey }) {
  return <span className={cn('h-2.5 w-2.5 shrink-0 rounded-[3px]', SEGMENTS[segment].swatchClass)} aria-hidden="true" />
}

/** An SVG path for a rectangle whose top corners are rounded and bottom is square. */
function topRoundedRect(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, width / 2, height))
  return [
    `M${x},${y + height}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `L${x + width - r},${y}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `L${x + width},${y + height}`,
    'Z'
  ].join(' ')
}

/**
 * The segment shape: only the topmost non-empty segment of a day gets rounded
 * corners, and every segment with one above it gives up a 2px gap at its top.
 */
function segmentShape(key: SegmentKey, fill: string) {
  const SegmentShape = (props: { x?: number; y?: number; width?: number; height?: number; payload?: DayDatum }) => {
    const { x = 0, y = 0, width = 0, height = 0, payload } = props
    if (!payload || height <= 0) return <g />
    const above = SEGMENT_ORDER.slice(SEGMENT_ORDER.indexOf(key) + 1).some((next) => payload[next] > 0)
    const gap = above ? Math.min(SEGMENT_GAP, height / 2) : 0
    const top = y + gap
    const tall = height - gap
    return <path d={topRoundedRect(x, top, width, tall, above ? 0 : CORNER)} fill={fill} />
  }
  SegmentShape.displayName = `AllocationSegment(${key})`
  return SegmentShape
}

/** The hover / keyboard-focus card: each segment's hours and the day's capacity. */
export function AllocationTooltip({ active, payload }: TooltipProps<number, string>) {
  const day = active ? (payload?.[0]?.payload as DayDatum | undefined) : undefined
  if (!day) return null
  return (
    <ChartTooltipCard title={day.title}>
      {[...SEGMENT_ORDER].reverse().map((key) => (
        <ChartTooltipRow
          key={key}
          swatch={<Swatch segment={key} />}
          label={SEGMENTS[key].label()}
          value={hoursOrDash(day[`${key}Minutes`])}
        />
      ))}
      <div className="my-0.5 h-px bg-[var(--plan-border)]" />
      <ChartTooltipRow label={s.columnCapacity()} value={hoursOrDash(day.capacityMinutes)} emphasis />
    </ChartTooltipCard>
  )
}

/** §15.15 "Allocation health": one stacked bar per stand-up day — within, under, over. */
export function AllocationHealthCard({ payload, link }: { payload: AnalyticsPayload; link: SprintLinkContext }) {
  const days = payload.allocationHealth
  const statusOf = new Map(payload.discipline.standups.map((row) => [row.standupId, row.status]))
  const hatchId = `alloc-hatch-${useId().replace(/:/g, '')}`

  const data: DayDatum[] = days.map((day) => ({
    standupId: day.standupId,
    label: `D${day.dayNumber}`,
    title: `${s.dayLabel({ day: day.dayNumber })} · ${shortDate(day.standupDate)}`,
    full: day.fullMinutes / 60,
    under: day.underMinutes / 60,
    over: day.overMinutes / 60,
    fullMinutes: day.fullMinutes,
    underMinutes: day.underMinutes,
    overMinutes: day.overMinutes,
    capacityMinutes: day.effectiveMinutes
  }))

  const fills: Record<SegmentKey, string> = {
    full: 'var(--plan-success)',
    under: `url(#${hatchId})`,
    over: 'var(--plan-danger)'
  }

  return (
    <SummarySection
      id="analytics-allocation-health"
      title={s.sectionAllocationHealth()}
      icon={Gauge}
      isEmpty={days.length === 0}
      emptyText={s.emptyAllocationHealth()}
    >
      <div className="flex flex-col gap-4">
        {/* Short labels keep the key on one line, level with the trend chart's; the tooltip gives the full names. */}
        <ul className="flex h-5 items-center gap-x-4">
          {SEGMENT_ORDER.map((key) => (
            <li
              key={key}
              title={SEGMENTS[key].label()}
              className="apple-type-footnote flex items-center gap-1.5 whitespace-nowrap text-[var(--plan-muted)]"
            >
              <Swatch segment={key} />
              <span aria-hidden="true">{SEGMENTS[key].short()}</span>
              <span className="sr-only">{SEGMENTS[key].label()}</span>
            </li>
          ))}
        </ul>

        <div
          data-testid="allocation-health-bars"
          className={cn('w-full', CHART_HEIGHT_CLASS)}
          role="figure"
          aria-label={s.sectionAllocationHealth()}
        >
          <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL_DIMENSION}>
            <BarChart data={data} margin={CHART_MARGIN} barCategoryGap="28%" accessibilityLayer>
              <defs>
                <pattern id={hatchId} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="5" height="5" style={{ fill: 'var(--plan-warning-bg)' }} />
                  <line x1="0" y1="0" x2="0" y2="5" style={{ stroke: 'var(--plan-warning)', strokeWidth: 1.5, strokeOpacity: 0.75 }} />
                </pattern>
              </defs>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...xAxisProps} />
              <YAxis {...yAxisProps} tickFormatter={hourTick} />
              <Tooltip
                content={<AllocationTooltip />}
                cursor={{ fill: 'var(--plan-track)', radius: 6 } as object}
                isAnimationActive={false}
              />
              {SEGMENT_ORDER.map((key) => (
                <Bar
                  key={key}
                  dataKey={key}
                  name={SEGMENTS[key].label()}
                  stackId="day"
                  maxBarSize={24}
                  fill={fills[key]}
                  shape={segmentShape(key, fills[key])}
                  animationDuration={600}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* The chart's SVG is not readable by a screen reader; each day is written out here (NFR-A1). */}
        <ul className="sr-only">
          {days.map((day) => (
            <li key={day.standupId}>
              {s.dayHealthLabel({
                day: day.dayNumber,
                full: hours(day.fullMinutes),
                under: hours(day.underMinutes),
                over: hours(day.overMinutes)
              })}
            </li>
          ))}
        </ul>

        <ShowRows>
          <RowsTable
            caption={s.sectionAllocationHealth()}
            columns={[
              { key: 'day', label: s.columnDay() },
              { key: 'capacity', label: s.columnCapacity(), align: 'right' },
              { key: 'within', label: s.columnWithin(), align: 'right' },
              { key: 'under', label: s.columnUnder(), align: 'right' },
              { key: 'over', label: s.columnOver(), align: 'right' }
            ]}
            rows={days.map((day) => ({
              key: day.standupId,
              cells: {
                day: (
                  <Link className={planLinkClass} href={standupHref(link.projectId, link.sprintId, day.standupId, statusOf.get(day.standupId) ?? '')}>
                    {s.dayLabel({ day: day.dayNumber })} · {shortDate(day.standupDate)}
                  </Link>
                ),
                capacity: <Figure value={hoursOrDash(day.effectiveMinutes)} />,
                within: <Figure value={hoursOrDash(day.fullMinutes)} />,
                under: <Figure value={hoursOrDash(day.underMinutes)} />,
                over: <Figure value={hoursOrDash(day.overMinutes)} />
              }
            }))}
          />
        </ShowRows>
      </div>
    </SummarySection>
  )
}
