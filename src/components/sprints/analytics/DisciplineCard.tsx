import Link from 'next/link'
import { CalendarCheck } from 'lucide-react'

import { planInsetClass, planLinkClass, planPillClass } from '@/components/standup/planning/ui'
import { SummarySection } from '@/components/standup/summary/SummarySection'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import { DASH, Figure, percentOrDash, shortDate, standupHref } from './format'
import { RowsTable, ShowRows } from './RowsTable'
import type { AnalyticsPayload, SprintLinkContext } from './types'

const s = standupStrings.analytics

/**
 * §15.15 "Stand-up discipline": on-time completion rate, missed count and
 * median actual duration. "On time" is completed live — a backfilled
 * stand-up completed, but after the fact (see `computeDiscipline`).
 */
export function DisciplineCard({ payload, link }: { payload: AnalyticsPayload; link: SprintLinkContext }) {
  const { discipline } = payload

  const figures = [
    { label: s.disciplineOnTime(), value: percentOrDash(discipline.onTimeRate) },
    { label: s.disciplineMissed(), value: discipline.missedCount === 0 ? DASH : String(discipline.missedCount) },
    {
      label: s.disciplineMedian(),
      value:
        discipline.medianDurationMinutes === null
          ? DASH
          : s.minutesValue({ minutes: discipline.medianDurationMinutes })
    }
  ]

  return (
    <SummarySection
      id="analytics-discipline"
      title={s.sectionDiscipline()}
      icon={CalendarCheck}
      isEmpty={discipline.standups.length === 0}
      emptyText={s.emptyDiscipline()}
    >
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {figures.map((figure) => (
            <div key={figure.label} className={cn(planInsetClass, 'flex flex-col gap-1 p-3')}>
              <dt className="apple-type-footnote text-[var(--plan-muted)]">{figure.label}</dt>
              <dd>
                <Figure value={figure.value} className="apple-type-title3 font-bold" />
              </dd>
            </div>
          ))}
        </dl>

        <ShowRows>
          <RowsTable
            caption={s.sectionDiscipline()}
            columns={[
              { key: 'day', label: s.columnDay() },
              { key: 'status', label: s.columnStatus() },
              { key: 'duration', label: s.columnDuration(), align: 'right' }
            ]}
            rows={discipline.standups.map((row) => ({
              key: row.standupId,
              cells: {
                day: (
                  <Link className={planLinkClass} href={standupHref(link.projectId, link.sprintId, row.standupId, row.status)}>
                    {s.dayLabel({ day: row.dayNumber })} · {shortDate(row.standupDate)}
                  </Link>
                ),
                status: (
                  <span className="flex flex-wrap items-center gap-1.5">
                    {s.standupStatus({ status: row.status })}
                    {row.backfilled && <span className={planPillClass('warning')}>{s.backfilled()}</span>}
                  </span>
                ),
                duration: (
                  <Figure value={row.durationMinutes === null ? DASH : s.minutesValue({ minutes: row.durationMinutes })} />
                )
              }
            }))}
          />
        </ShowRows>
      </div>
    </SummarySection>
  )
}
