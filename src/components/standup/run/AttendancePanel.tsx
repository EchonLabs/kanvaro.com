'use client'

import { useState } from 'react'
import { AlertTriangle, ChevronDown } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar'
import type { AttendanceStatus } from '@/lib/standup/capacity'
import { formatMinutesAsHours, hoursToMinutes, type Minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import {
  PLAN_SCROLL_MAX,
  PlanBanner,
  PlanCount,
  initialsOf,
  planButtonClass,
  planFieldClass,
  type PlanPillTone
} from '../planning/ui'

/**
 * Panel 1 — attendance, and RUN-7's prompt (§15.8.3).
 *
 * Everyone defaults to present (RUN-6), and that default is PERSISTED when the
 * stand-up starts (start-service) — so the PM only touches the exceptions. A
 * member with no record at all (for example one added to the sprint after the
 * stand-up began) is rendered as unset, the truthful fallback, rather than
 * being shown as present.
 *
 * The prompt is the visible half of the RUN-7 seam. Detaching an absent
 * member's allocations is loud on the server — the rows are tagged, the hours
 * become `strandedMinutes`, the board raises an alert — but none of that helps
 * if the PM is not *asked*, on the spot, who is picking the work up. That is
 * what this panel does with the payload the attendance route returns.
 */

export interface AttendanceMember {
  memberId: string
  name: string
  attendance?: AttendanceStatus
  partialMinutes?: Minutes
  /**
   * The server's capacity for the day, for the card's "Full capacity
   * available (8h)" line and the "Reassignment Required" flag. Optional so a
   * caller without a board behind it still compiles.
   */
  capacity?: { effectiveMinutes: Minutes; strandedMinutes: Minutes }
  /** Profile photo (`User.avatar`); initials stand in without one. */
  avatarUrl?: string
}

export interface ReassignPromptView {
  memberId: string
  taskCount: number
  totalMinutes: Minutes
  tasks: { taskId: string; key?: string; plannedMinutes: Minutes }[]
}

export interface AttendancePanelProps {
  members: AttendanceMember[]
  prompt: ReassignPromptView | null
  onSetAttendance: (input: {
    memberId: string
    state: AttendanceStatus
    partialMinutes?: Minutes
    reason?: string
  }) => void
  onReassign: (fromMemberId: string, toMemberId: string) => void
  onDismissPrompt: () => void
  disabled?: boolean
  locale?: string
}

const STATES: { value: AttendanceStatus; label: () => string }[] = [
  { value: 'present', label: standupStrings.run.statePresent },
  { value: 'absent_planned', label: standupStrings.run.stateAbsentPlanned },
  { value: 'absent_unplanned', label: standupStrings.run.stateAbsentUnplanned },
  { value: 'partial', label: standupStrings.run.statePartial }
]

export function AttendancePanel({
  members,
  prompt,
  onSetAttendance,
  onReassign,
  onDismissPrompt,
  disabled = false,
  locale
}: AttendancePanelProps) {
  const [draftStates, setDraftStates] = useState<Record<string, AttendanceStatus>>({})
  const [reassignTo, setReassignTo] = useState('')

  // Nobody having recorded attendance is `''`, not "present": the select must
  // not claim a full room while CC-7 is about to block completion.
  const stateOf = (member: AttendanceMember): AttendanceStatus | '' =>
    draftStates[member.memberId] ?? member.attendance ?? ''

  const promptMember = prompt
    ? members.find((member) => member.memberId === prompt.memberId)
    : undefined

  // The same condition each card uses for its own red "Reassignment Required"
  // line, counted across the row — read from the draft state, so the badge
  // drops the moment the PM marks somebody back as present rather than waiting
  // for the server round-trip.
  const issues = members.filter((member) => {
    const state = stateOf(member)
    const absent = state === 'absent_planned' || state === 'absent_unplanned'
    return (
      absent &&
      ((member.capacity?.strandedMinutes ?? 0) > 0 || prompt?.memberId === member.memberId)
    )
  }).length

  return (
    <section
      id="panel-1"
      aria-labelledby="panel-1-heading"
      className="scroll-mt-6 flex flex-col gap-3"
    >
      {/* The blueprint's attendance row carries no visible title — the cards
          are self-evident — but the section still needs a name to be landed
          on by heading navigation and the `panel-1` jump. */}
      <h3 id="panel-1-heading" className="sr-only">
        {standupStrings.run.attendanceTitle()}
      </h3>

      {/* The count is worth stating in words as well as in the pill, because
          the grid below now scrolls: the card that needs attention can be
          below the fold, and until this line existed nothing at the top of the
          section said so. */}
      {issues > 0 && (
        <p className="apple-type-subheadline flex items-center gap-2 font-semibold text-[var(--plan-danger)]">
          <PlanCount
            count={issues}
            decorative
            label={standupStrings.run.attendanceIssueCount({ count: issues })}
          />
          {standupStrings.run.attendanceIssueCount({ count: issues })}
        </p>
      )}

      {/* A thirty-person team is six rows of cards, which buries Panel 5 — the
          block the meeting actually works from — below the fold. Capped at
          roughly three rows; a smaller team never reaches the cap and never
          sees a scrollbar. */}
      <ul
        className={cn(
          'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3',
          'plan-scroll',
          PLAN_SCROLL_MAX,
          'p-0.5'
        )}
      >
        {members.map((member) => {
          const state = stateOf(member)
          const absent = state === 'absent_planned' || state === 'absent_unplanned'
          const tone = state ? TONE_FOR[state] : 'neutral'
          const stranded = (member.capacity?.strandedMinutes ?? 0) > 0
          const needsReassign = absent && (stranded || prompt?.memberId === member.memberId)

          return (
            <li
              key={member.memberId}
              data-testid={`attendance-card-${member.memberId}`}
              className={cn(
                'flex flex-col gap-3 rounded-[var(--apple-radius-lg)] border p-4',
                absent
                  ? 'border-[var(--plan-danger)] bg-[var(--plan-danger-bg)]'
                  : 'border-[var(--plan-border)] bg-[var(--plan-surface)]'
              )}
            >
              <div className="flex items-center gap-4">
                {/* The member's real photo; Radix only swaps it in once it has
                    loaded, so a missing or broken image leaves the initials. */}
                <Avatar aria-hidden="true" className="h-10 w-10">
                  {member.avatarUrl && (
                    <AvatarImage src={member.avatarUrl} alt="" className="object-cover" />
                  )}
                  <AvatarFallback
                    className={cn('apple-type-subheadline font-semibold', AVATAR_TONE[tone])}
                  >
                    {initialsOf(member.name)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      className="truncate apple-type-body font-semibold text-[var(--plan-text)]"
                      htmlFor={`att-${member.memberId}`}
                    >
                      {member.name}
                    </label>

                    {/* The badge *is* the control: the blueprint puts the
                        member's state top-right as a pill, and a pill that
                        opens the four states is one control rather than a
                        badge plus a redundant dropdown under it. */}
                    <span className="relative inline-flex shrink-0">
                      <select
                        id={`att-${member.memberId}`}
                        aria-label={standupStrings.run.attendanceFor({ name: member.name })}
                        value={state}
                        disabled={disabled}
                        onChange={(event) => {
                          if (!event.target.value) return
                          const next = event.target.value as AttendanceStatus
                          setDraftStates((current) => ({ ...current, [member.memberId]: next }))
                          // A partial day needs its hours before the write means
                          // anything, so that one waits for the second field.
                          if (next !== 'partial') {
                            onSetAttendance({ memberId: member.memberId, state: next })
                          }
                        }}
                        // A solid field with a status dot, not a tinted pill: the
                        // 12% tint read as nearly blank on both themes, and its
                        // coloured ink leaked into the opened option list.
                        className={cn(
                          'plan-select apple-transition apple-type-caption h-7 cursor-pointer appearance-none rounded-[var(--apple-radius-pill)] border border-[var(--plan-border)] bg-[var(--plan-surface)] pl-6 pr-7 font-semibold text-[var(--plan-text)] shadow-[var(--plan-shadow)] hover:border-[var(--plan-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--plan-accent)] disabled:cursor-default disabled:opacity-60',
                          !state && 'text-[var(--plan-muted)]'
                        )}
                      >
                        <option value="" disabled>
                          Not recorded
                        </option>
                        {STATES.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label()}
                          </option>
                        ))}
                      </select>
                      <span
                        aria-hidden="true"
                        className={cn(
                          'pointer-events-none absolute left-2.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full',
                          DOT_TONE[tone]
                        )}
                      />
                      <ChevronDown
                        aria-hidden="true"
                        strokeWidth={2.5}
                        className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--plan-muted)]"
                      />
                    </span>
                  </div>

                  {needsReassign ? (
                    <p className={cn('apple-type-caption flex items-center gap-1 font-semibold text-[var(--plan-danger)]')}>
                      <AlertTriangle className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
                      {standupStrings.run.attendanceReassignRequired()}
                    </p>
                  ) : (
                    <p className={cn('apple-type-caption truncate text-[var(--plan-secondary)]')}>
                      {capacityLine(member, state, locale)}
                    </p>
                  )}
                </div>
              </div>

              {state === 'partial' && (
                <input
                  type="number"
                  step={0.25}
                  min={0.25}
                  aria-label={standupStrings.run.partialHoursFor({ name: member.name })}
                  placeholder={standupStrings.run.partialHoursFor({ name: member.name })}
                  defaultValue={
                    member.partialMinutes
                      ? formatMinutesAsHours(member.partialMinutes, { locale, withUnit: false })
                      : ''
                  }
                  disabled={disabled}
                  onBlur={(event) => {
                    const hours = Number(event.target.value)
                    if (!Number.isFinite(hours) || hours <= 0) return
                    onSetAttendance({
                      memberId: member.memberId,
                      state: 'partial',
                      partialMinutes: hoursToMinutes(hours)
                    })
                  }}
                  className={cn(planFieldClass, 'w-full')}
                />
              )}

              {absent && (
                <input
                  type="text"
                  placeholder={standupStrings.run.absenceReasonFor({ name: member.name })}
                  aria-label={standupStrings.run.absenceReasonFor({ name: member.name })}
                  disabled={disabled}
                  onBlur={(event) => {
                    const reason = event.target.value.trim()
                    if (!reason) return
                    onSetAttendance({ memberId: member.memberId, state: state as AttendanceStatus, reason })
                  }}
                  className={cn(planFieldClass, 'w-full')}
                />
              )}
            </li>
          )
        })}
      </ul>

      {/* RUN-7. Raised the moment the server reports detached rows, with the
          bulk action attached — the whole point is that the PM answers it now,
          in the meeting, rather than discovering it at completion. */}
      {prompt && promptMember && (
        <PlanBanner
          tone="warning"
          bordered
          role="alert"
          icon={<AlertTriangle strokeWidth={2} />}
          actions={
            <>
              <label className="sr-only" htmlFor="reassign-to">
                {standupStrings.run.reassignTo()}
              </label>
              <select
                id="reassign-to"
                aria-label={standupStrings.run.reassignTo()}
                value={reassignTo}
                onChange={(event) => setReassignTo(event.target.value)}
                className={planFieldClass}
              >
                <option value="">{standupStrings.run.reassignTo()}</option>
                {members
                  .filter((member) => member.memberId !== prompt.memberId)
                  .map((member) => (
                    <option key={member.memberId} value={member.memberId}>
                      {member.name}
                    </option>
                  ))}
              </select>

              <button
                type="button"
                disabled={!reassignTo}
                onClick={() => onReassign(prompt.memberId, reassignTo)}
                className={planButtonClass('primary', cn('h-8', !reassignTo && 'opacity-40'))}
              >
                {standupStrings.run.reassignConfirm()}
              </button>
              <button
                type="button"
                onClick={onDismissPrompt}
                className={planButtonClass('secondary', undefined, 'sm')}
              >
                {standupStrings.run.reassignDismiss()}
              </button>
            </>
          }
        >
          {standupStrings.run.reassignPrompt({
            name: promptMember.name,
            count: prompt.taskCount
          })}
        </PlanBanner>
      )}
    </section>
  )
}

const TONE_FOR: Record<AttendanceStatus, PlanPillTone> = {
  present: 'success',
  partial: 'warning',
  absent_planned: 'danger',
  absent_unplanned: 'danger'
}

const AVATAR_TONE: Record<PlanPillTone, string> = {
  success: 'bg-[var(--plan-success-bg)] text-[var(--plan-success)]',
  warning: 'bg-[var(--plan-warning-bg)] text-[var(--plan-warning)]',
  danger: 'bg-[var(--plan-surface)] text-[var(--plan-danger)]',
  accent: 'bg-[var(--plan-info-bg)] text-[var(--plan-accent-ink)]',
  neutral: 'bg-[var(--plan-track)] text-[var(--plan-muted)]'
}

/** The attendance field's status dot — the one place its state is coloured. */
const DOT_TONE: Record<PlanPillTone, string> = {
  success: 'bg-[var(--plan-success)]',
  warning: 'bg-[var(--plan-warning)]',
  danger: 'bg-[var(--plan-danger)]',
  accent: 'bg-[var(--plan-accent)]',
  neutral: 'bg-[var(--plan-idle)]'
}

/**
 * The card's second line. Reads the server's effective capacity when the
 * caller supplied it; a caller that did not (a test harness, say) just gets
 * the state's own words, never a made-up number.
 */
function capacityLine(
  member: AttendanceMember,
  state: AttendanceStatus | '',
  locale?: string
): string {
  // No recorded state means no capacity claim either way.
  if (!state) return 'Not recorded'

  if (state === 'absent_planned' || state === 'absent_unplanned') {
    return standupStrings.run.attendanceOut()
  }

  const minutes =
    member.capacity?.effectiveMinutes ?? (state === 'partial' ? member.partialMinutes : undefined)

  if (minutes === undefined) {
    return state === 'partial'
      ? standupStrings.run.statePartial()
      : standupStrings.run.statePresent()
  }

  const hours = formatMinutesAsHours(minutes, { locale })
  return state === 'partial'
    ? standupStrings.run.attendancePartialCapacity({ hours })
    : standupStrings.run.attendanceFullCapacity({ hours })
}
