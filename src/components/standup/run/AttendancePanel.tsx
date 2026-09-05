'use client'

import { useState } from 'react'

import type { AttendanceStatus } from '@/lib/standup/capacity'
import { formatMinutesAsHours, hoursToMinutes, type Minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'

/**
 * Panel 1 — attendance, and RUN-7's prompt (§15.8.3).
 *
 * Everyone defaults to present (RUN-6); the PM only touches the exceptions.
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

  const stateOf = (member: AttendanceMember): AttendanceStatus =>
    draftStates[member.memberId] ?? member.attendance ?? 'present'

  const promptMember = prompt
    ? members.find((member) => member.memberId === prompt.memberId)
    : undefined

  return (
    <section id="panel-1" aria-labelledby="panel-1-heading" className="flex flex-col gap-3">
      <h3 id="panel-1-heading" className="text-sm font-semibold">
        {standupStrings.run.attendanceTitle()}
      </h3>

      <ul className="flex flex-wrap gap-3">
        {members.map((member) => {
          const state = stateOf(member)
          return (
            <li key={member.memberId} className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground" htmlFor={`att-${member.memberId}`}>
                {member.name}
              </label>
              <select
                id={`att-${member.memberId}`}
                aria-label={standupStrings.run.attendanceFor({ name: member.name })}
                value={state}
                disabled={disabled}
                onChange={(event) => {
                  const next = event.target.value as AttendanceStatus
                  setDraftStates((current) => ({ ...current, [member.memberId]: next }))
                  // A partial day needs its hours before the write means
                  // anything, so that one waits for the second field.
                  if (next !== 'partial') {
                    onSetAttendance({ memberId: member.memberId, state: next })
                  }
                }}
                className="h-8 rounded-md border border-border bg-background px-2 text-sm"
              >
                {STATES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label()}
                  </option>
                ))}
              </select>

              {state === 'partial' && (
                <input
                  type="number"
                  step={0.25}
                  min={0.25}
                  aria-label={standupStrings.run.partialHoursFor({ name: member.name })}
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
                  className="h-8 w-20 rounded-md border border-border bg-background px-2 text-sm"
                />
              )}

              {(state === 'absent_planned' || state === 'absent_unplanned') && (
                <input
                  type="text"
                  aria-label={standupStrings.run.absenceReasonFor({ name: member.name })}
                  disabled={disabled}
                  onBlur={(event) => {
                    const reason = event.target.value.trim()
                    if (!reason) return
                    onSetAttendance({ memberId: member.memberId, state, reason })
                  }}
                  className="h-8 w-40 rounded-md border border-border bg-background px-2 text-sm"
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
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm"
        >
          <p className="flex-1">
            {standupStrings.run.reassignPrompt({
              name: promptMember.name,
              count: prompt.taskCount
            })}
          </p>

          <label className="sr-only" htmlFor="reassign-to">
            {standupStrings.run.reassignTo()}
          </label>
          <select
            id="reassign-to"
            aria-label={standupStrings.run.reassignTo()}
            value={reassignTo}
            onChange={(event) => setReassignTo(event.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
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
            className="rounded-md border border-border bg-background px-2 py-1 text-xs disabled:opacity-40"
          >
            {standupStrings.run.reassignConfirm()}
          </button>
          <button
            type="button"
            onClick={onDismissPrompt}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground"
          >
            {standupStrings.run.reassignDismiss()}
          </button>
        </div>
      )}
    </section>
  )
}
