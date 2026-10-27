import Link from 'next/link'
import { AlertTriangle, CheckCircle2, CircleDashed, Gauge, type LucideIcon } from 'lucide-react'

import { SummarySection } from '@/components/standup/summary/SummarySection'
import { planLinkClass } from '@/components/standup/planning/ui'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import { Figure, hours, hoursOrDash, shortDate, standupHref } from './format'
import { RowsTable, ShowRows } from './RowsTable'
import type { AnalyticsPayload, SprintLinkContext } from './types'

const s = standupStrings.analytics

/**
 * The three segments, each with its own ink *and* its own texture: under is
 * hatched-outline and over is striped, so the bar still reads in greyscale
 * or for a reader who cannot tell amber from red (NFR-A1). The legend repeats
 * the distinction with an icon and a word.
 */
const SEGMENTS: { key: 'fullMinutes' | 'underMinutes' | 'overMinutes'; label: () => string; icon: LucideIcon; className: string }[] = [
  {
    key: 'fullMinutes',
    label: s.legendFull,
    icon: CheckCircle2,
    className: 'bg-[var(--plan-success)]'
  },
  {
    key: 'underMinutes',
    label: s.legendUnder,
    icon: CircleDashed,
    className:
      'border border-dashed border-[var(--plan-warning)] bg-[var(--plan-warning-bg)]'
  },
  {
    key: 'overMinutes',
    label: s.legendOver,
    icon: AlertTriangle,
    className:
      'bg-[var(--plan-danger)] [background-image:repeating-linear-gradient(135deg,transparent_0_4px,rgba(255,255,255,0.35)_4px_7px)]'
  }
]

const LEGEND_INK: Record<string, string> = {
  fullMinutes: 'text-[var(--plan-success)]',
  underMinutes: 'text-[var(--plan-warning)]',
  overMinutes: 'text-[var(--plan-danger)]'
}

/** §15.15 "Allocation health": one stacked bar per stand-up day — within, under, over. */
export function AllocationHealthCard({ payload, link }: { payload: AnalyticsPayload; link: SprintLinkContext }) {
  const days = payload.allocationHealth
  const statusOf = new Map(payload.discipline.standups.map((row) => [row.standupId, row.status]))
  const tallest = Math.max(1, ...days.map((day) => day.fullMinutes + day.underMinutes + day.overMinutes))

  return (
    <SummarySection
      id="analytics-allocation-health"
      title={s.sectionAllocationHealth()}
      icon={Gauge}
      isEmpty={days.length === 0}
      emptyText={s.emptyAllocationHealth()}
    >
      <div className="flex flex-col gap-4">
        <div className="flex h-40 items-end gap-1.5 overflow-x-auto pb-1" data-testid="allocation-health-bars">
          {days.map((day) => (
            <div key={day.standupId} className="flex min-w-[1.75rem] flex-1 flex-col items-center gap-1.5">
              <div
                role="img"
                aria-label={s.dayHealthLabel({
                  day: day.dayNumber,
                  full: hours(day.fullMinutes),
                  under: hours(day.underMinutes),
                  over: hours(day.overMinutes)
                })}
                title={s.dayHealthLabel({
                  day: day.dayNumber,
                  full: hours(day.fullMinutes),
                  under: hours(day.underMinutes),
                  over: hours(day.overMinutes)
                })}
                className="flex h-32 w-full max-w-[2.5rem] flex-col-reverse overflow-hidden rounded-t-[var(--apple-radius-sm)] bg-[var(--plan-track)]"
              >
                {SEGMENTS.map((segment) =>
                  day[segment.key] > 0 ? (
                    <span
                      key={segment.key}
                      className={cn('block w-full', segment.className)}
                      style={{ height: `${(day[segment.key] / tallest) * 100}%` }}
                    />
                  ) : null
                )}
              </div>
              <span className="apple-type-caption text-[var(--plan-muted)]" aria-hidden="true">
                {`D${day.dayNumber}`}
              </span>
            </div>
          ))}
        </div>

        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {SEGMENTS.map(({ key, label, icon: Icon }) => (
            <li key={key} className="apple-type-footnote flex items-center gap-1.5 text-[var(--plan-muted)]">
              <Icon className={cn('h-3.5 w-3.5', LEGEND_INK[key])} strokeWidth={2.25} aria-hidden="true" />
              {label()}
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
