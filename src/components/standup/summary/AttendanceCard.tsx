import { AlertTriangle, Users } from 'lucide-react'

import {
  PLAN_SCROLL_MAX_NESTED,
  PlanAvatar,
  planPillClass,
  type PlanPillTone
} from '@/components/standup/planning/ui'
import { RingGauge } from '@/components/standup/my/shared/RingGauge'
import { formatMinutesAsHours, minutes as toMinutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import { SummarySection } from './SummarySection'
import { committedMinutesByMember, type SummaryStats } from './stats'
import { avatarMember } from './rows'
import type { AttendanceRow, MemberCommitment } from './types'

const s = standupStrings.summary

/**
 * The three states the run screen records, under the labels it already uses —
 * so "Absent (planned)" means the same thing on both screens — and each one's
 * tone on the app's own status scale: present is green, a planned absence is
 * orange (expected, but worth seeing), an unplanned one red.
 *
 * A status outside this map renders as stored, in the neutral tone, rather
 * than being dropped or relabelled: these are historical documents, and an
 * unrecognised value is information, not a bug to hide.
 */
const STATUS: Record<string, { label: () => string; tone: PlanPillTone }> = {
  present: { label: standupStrings.run.statePresent, tone: 'success' },
  absent_planned: { label: standupStrings.run.stateAbsentPlanned, tone: 'warning' },
  absent_unplanned: { label: standupStrings.run.stateAbsentUnplanned, tone: 'danger' }
}

function statusLabel(status: string): string {
  return STATUS[status]?.label() ?? status
}

function statusTone(status: string): PlanPillTone {
  return STATUS[status]?.tone ?? 'neutral'
}

function isAbsent(status: string): boolean {
  return status.startsWith('absent')
}

/**
 * One member's row: face, name, what their day holds, and their state.
 *
 * The second line is the point of the row. A roster that says only
 * "Present / Absent" repeats the ratio directly above it; what a reader
 * actually needs from an absence is whether it left work stranded, so the
 * line reads off the commitments the same stand-up recorded. An absent member
 * still holding commitments is the one case worth an alarm — red card, red
 * rule, warning icon — because it is the only one anybody has to act on.
 * Being out with nothing assigned is a fact, not a problem, and stays quiet.
 *
 * The status reads as a pill on a quiet card and as plain text on an alerting
 * one: a red pill on a red-tinted card is a shape you cannot see.
 */
function AttendanceMemberRow({
  member,
  committedMinutes
}: {
  member: AttendanceRow
  committedMinutes: number
}) {
  const absent = isAbsent(member.status)
  const stranded = absent && committedMinutes > 0
  const hours = formatMinutesAsHours(toMinutes(Math.round(committedMinutes)))

  const secondLine = absent
    ? 'Nothing to reassign'
    : committedMinutes > 0
      ? 'Committed ' + hours + ' today'
      : 'Nothing committed'

  return (
    <li
      data-testid="attendance-member"
      className={cn(
        'flex items-center gap-3.5 rounded-[var(--apple-radius-lg)] border p-3.5',
        stranded
          ? 'border-[var(--plan-danger)] bg-[var(--plan-danger-bg)]'
          : 'border-[var(--plan-border)] bg-[var(--plan-surface)]'
      )}
    >
      <span data-testid="member-avatar" title={member.name} className="inline-flex shrink-0">
        <PlanAvatar member={avatarMember(member, member.name)} size={44} />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="apple-type-body truncate font-semibold text-[var(--plan-text)]">
          {member.name}
        </span>
        {stranded ? (
          <span
            data-testid="attendance-alert"
            className="flex items-center gap-1.5 apple-type-subheadline font-semibold text-[var(--plan-danger)]"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
            Reassignment required ({hours})
          </span>
        ) : (
          <span className="apple-type-subheadline truncate text-[var(--plan-muted)]">{secondLine}</span>
        )}
      </span>

      {/* Colour is never the only carrier of meaning (NFR-A1) — the label is
          the message either way, the tone only reinforces it. */}
      {stranded ? (
        <span className="apple-type-caption shrink-0 font-bold uppercase tracking-[0.06em] text-[var(--plan-danger)]">
          {statusLabel(member.status)}
        </span>
      ) : (
        <span className={planPillClass(statusTone(member.status))}>
          {statusLabel(member.status)}
        </span>
      )}
    </li>
  )
}

export function AttendanceCard({
  attendance,
  commitments,
  stats
}: {
  attendance: AttendanceRow[]
  /** Today's allocations, for each row's second line — see `AttendanceMemberRow`. */
  commitments: MemberCommitment[]
  stats: SummaryStats
}) {
  const absentCount = stats.attendanceTotal - stats.presentCount
  const committed = committedMinutesByMember(commitments)

  return (
    <SummarySection
      id="attendance-section"
      title={s.sectionAttendance()}
      icon={Users}
      isEmpty={attendance.length === 0}
      emptyText={s.emptyAttendance()}
      badge={
        attendance.length > 0 ? (
          <span
            data-testid="attendance-verdict"
            className={planPillClass(stats.fullAttendance ? 'success' : 'warning')}
          >
            {stats.fullAttendance ? 'Full attendance' : `${absentCount} absent`}
          </span>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex flex-col gap-1">
            <span className="apple-section-label text-[var(--plan-muted)]">Attended</span>
            <span
              data-testid="attendance-ratio"
              className="apple-type-title2 font-apple-mono font-bold leading-none tabular-nums text-[var(--plan-text)]"
            >
              {stats.presentCount}/{stats.attendanceTotal}
            </span>
            <span className="apple-type-caption text-[var(--plan-muted)]">
              {stats.fullAttendance
                ? 'Everyone joined'
                : `${absentCount} ${absentCount === 1 ? 'person' : 'people'} missing`}
            </span>
          </div>

          {/* Full attendance is the expected case, not a celebration — the
              ring stays neutral there and only turns when somebody is out. */}
          <RingGauge
            percentage={stats.attendancePercent}
            tone={stats.fullAttendance ? 'neutral' : 'red'}
            size={72}
            strokeWidth={7}
          >
            <span className="apple-type-caption font-semibold text-[var(--plan-muted)]">
              {stats.fullAttendance ? 'Full' : `${stats.attendancePercent}%`}
            </span>
          </RingGauge>
        </div>

        {/* Rows on a grid rather than pills on a wrap line: a pill sizes itself
            to the name inside it, so a roster of eight ragged widths reads as
            decoration, and the status hides at the end of a variable-length
            run. On a grid every member occupies the same box, the names start
            on the same x and the statuses end on it, so "who was out" is one
            vertical scan down the right-hand edge.

            Capped rather than `scroll` on the section, because only the roster
            grows with the team — the ratio and ring above it are fixed height
            and should stay in view while it scrolls. */}
        <ul
          className={cn(
            'plan-scroll',
            PLAN_SCROLL_MAX_NESTED,
            'grid grid-cols-1 gap-2.5 pr-1.5 xl:grid-cols-2'
          )}
        >
          {attendance.map((member) => (
            <AttendanceMemberRow
              key={member.memberId}
              member={member}
              committedMinutes={committed.get(String(member.memberId)) ?? 0}
            />
          ))}
        </ul>
      </div>
    </SummarySection>
  )
}
