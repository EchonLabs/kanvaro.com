import { Sunset } from 'lucide-react'

import { PlanAvatar, planInsetClass } from '@/components/standup/planning/ui'
import { formatMinutesAsHours } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import { SummarySection } from './SummarySection'
import { formatStandupDate } from './SummaryHero'
import { asMinutes, avatarMember } from './rows'
import type { DayOutcome } from './types'

const s = standupStrings.summary

const headerCellClass =
  'apple-type-caption sticky top-0 z-[1] bg-[var(--plan-surface)] pb-2 font-bold uppercase tracking-wide text-[var(--plan-muted)]'

/**
 * How the day this stand-up planned actually went.
 *
 * The rest of the record is frozen when the meeting completes, at the start
 * of the day, so it can only hold the plan. The result arrives later: the
 * next stand-up classifies these allocations and writes `dayOutcome` back.
 * Until then the section says so, rather than disappearing, for the same
 * reason every other section renders when empty.
 */
export function DayOutcomeCard({
  outcome,
  isFinalDay
}: {
  outcome?: DayOutcome
  isFinalDay: boolean
}) {
  if (!outcome) {
    return (
      <SummarySection
        id="day-outcome-section"
        title={s.sectionDayOutcome()}
        icon={Sunset}
        isEmpty
        emptyText={isFinalDay ? s.dayOutcomeFinalDay() : s.dayOutcomePending()}
      />
    )
  }

  const recordedDate =
    formatStandupDate(outcome.recordedByStandupDate) ?? outcome.recordedByStandupDate
  const completed = outcome.completedTasks ?? []
  const members = outcome.memberTotals ?? []

  return (
    <SummarySection
      id="day-outcome-section"
      title={s.sectionDayOutcome()}
      icon={Sunset}
      badge={
        <span className="apple-type-caption text-[var(--plan-muted)]">
          {s.dayOutcomeRecorded({ date: recordedDate })}
        </span>
      }
    >
      <div className="flex flex-col gap-4">
        {members.length > 0 && (
          <div className={cn('plan-scroll', '-mr-1.5 pr-1.5')}>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={cn(headerCellClass, 'text-left')}>
                    {s.dayOutcomeMember()}
                  </th>
                  <th scope="col" className={cn(headerCellClass, 'w-[80px] text-right')}>
                    {s.dayOutcomePlanned()}
                  </th>
                  <th scope="col" className={cn(headerCellClass, 'w-[80px] text-right')}>
                    {s.dayOutcomeLogged()}
                  </th>
                  <th scope="col" className={cn(headerCellClass, 'w-[80px] text-right')}>
                    {s.dayOutcomeVariance()}
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((row) => {
                  const name = row.name ?? row.memberId
                  const variance = asMinutes(row.dayVarianceMinutes)
                  return (
                    <tr
                      key={row.memberId}
                      data-testid="day-outcome-row"
                      className="border-b border-[var(--plan-border)] last:border-b-0"
                    >
                      <td className="apple-type-subheadline py-2.5 pr-3 font-medium text-[var(--plan-text)]">
                        <span className="flex items-center gap-2">
                          <span title={name} className="inline-flex shrink-0">
                            <PlanAvatar member={avatarMember(row, name)} size={22} />
                          </span>
                          <span className="min-w-0 truncate">{name}</span>
                        </span>
                      </td>
                      <td className="apple-type-subheadline font-apple-mono py-2.5 text-right tabular-nums text-[var(--plan-muted)]">
                        {formatMinutesAsHours(asMinutes(row.plannedMinutes))}
                      </td>
                      <td className="apple-type-subheadline font-apple-mono py-2.5 text-right tabular-nums text-[var(--plan-text)]">
                        {formatMinutesAsHours(asMinutes(row.loggedMinutesOnDay))}
                      </td>
                      <td
                        className={cn(
                          'apple-type-subheadline font-apple-mono py-2.5 text-right font-semibold tabular-nums',
                          variance > 0 ? 'text-[var(--plan-danger)]' : 'text-[var(--plan-text)]'
                        )}
                      >
                        {formatMinutesAsHours(variance, { signed: true })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <p className="apple-type-caption font-bold uppercase tracking-wide text-[var(--plan-muted)]">
            {completed.length === 0
              ? s.dayOutcomeNothingCompleted()
              : s.dayOutcomeCompleted({ count: completed.length })}
          </p>
          {completed.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {completed.map((row) => (
                <li
                  key={String(row.taskId)}
                  data-testid="day-outcome-completed-row"
                  className={cn(planInsetClass, 'flex items-center gap-2 px-4 py-2.5')}
                >
                  {row.taskKey && (
                    <span className="apple-type-caption font-apple-mono shrink-0 rounded-[var(--apple-radius-sm)] bg-[var(--plan-track)] px-2 py-0.5 font-bold text-[var(--plan-muted)]">
                      {row.taskKey}
                    </span>
                  )}
                  <span className="apple-type-subheadline min-w-0 truncate text-[var(--plan-text)]">
                    {row.title ?? row.taskKey ?? String(row.taskId)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SummarySection>
  )
}
