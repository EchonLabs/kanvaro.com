'use client'

import { useState } from 'react'

import { MIN_REVISION_DETAIL_LENGTH, REVISION_REASONS, type RevisionReason } from '@/lib/standup/estimates'
import { formatMinutesAsHours, hoursToMinutes, minutes, type Minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'

/**
 * The revise-remaining-estimate modal (§15.11).
 *
 * Two lines in this dialog are requirements rather than decoration, and both
 * exist to make the PM confront the same number:
 *
 *   "This will not change the original estimate."  — VAR-16 in one sentence,
 *   so nobody believes revising is rewriting history.
 *
 *   "Kasun's new total on this task would be 11.0h."  — the spec calls this out
 *   explicitly: seeing eleven hours against a six-hour estimate is the moment a
 *   PM decides whether to split the task or descope it. Without it the dialog
 *   asks for a number in a vacuum.
 */

export interface ReviseEstimateTarget {
  allocationId: string
  taskKey?: string
  title: string
  memberName: string
  originalEstimateMinutes: Minutes
  totalLoggedMinutesOnTask: Minutes
  /** Signed: negative means the task is still inside its estimate. */
  taskVarianceMinutes: Minutes
}

export interface ReviseEstimateModalProps {
  target: ReviseEstimateTarget
  onSave: (input: {
    allocationId: string
    newRemainingMinutes: Minutes
    reason: RevisionReason
    detail?: string
  }) => void
  onCancel: () => void
  locale?: string
}

export function ReviseEstimateModal({
  target,
  onSave,
  onCancel,
  locale
}: ReviseEstimateModalProps) {
  const [hours, setHours] = useState('')
  const [reason, setReason] = useState<RevisionReason>('underestimated')
  const [detail, setDetail] = useState('')

  const parsed = Number(hours)
  const hasHours = hours.trim() !== '' && Number.isFinite(parsed) && parsed >= 0
  const remaining = hasHours ? hoursToMinutes(parsed) : minutes(0)

  // VAR-15: `other` is the escape hatch, so it has to say something.
  const detailOk = reason !== 'other' || detail.trim().length >= MIN_REVISION_DETAIL_LENGTH
  const canSave = hasHours && detailOk

  const projectedTotal = minutes(target.totalLoggedMinutesOnTask + remaining)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="revise-title"
      className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4"
    >
      <h3 id="revise-title" className="text-sm font-semibold">
        {standupStrings.variance.reviseTitle()}
      </h3>

      <p className="text-sm">
        <span className="font-medium">{target.taskKey}</span> {target.title}
      </p>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <dt>Original estimate</dt>
        <dd data-testid="revise-original">
          {formatMinutesAsHours(target.originalEstimateMinutes, { locale })}
        </dd>
        <dt>Total logged so far</dt>
        <dd data-testid="revise-logged">
          {formatMinutesAsHours(target.totalLoggedMinutesOnTask, { locale })}
        </dd>
        {target.taskVarianceMinutes > 0 && (
          <>
            <dt>Currently over by</dt>
            <dd data-testid="revise-over">
              {formatMinutesAsHours(target.taskVarianceMinutes, { locale })}
            </dd>
          </>
        )}
      </dl>

      <label className="flex flex-col gap-1 text-sm" htmlFor="revise-hours">
        {standupStrings.variance.reviseHoursLabel()}
        <input
          id="revise-hours"
          type="number"
          min={0}
          max={999}
          step={0.25}
          value={hours}
          onChange={(event) => setHours(event.target.value)}
          className="h-8 w-24 rounded-md border border-border bg-background px-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm" htmlFor="revise-reason">
        Reason
        <select
          id="revise-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value as RevisionReason)}
          className="h-8 rounded-md border border-border bg-background px-2"
        >
          {REVISION_REASONS.map((option) => (
            <option key={option} value={option}>
              {option.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </label>

      {reason === 'other' && (
        <div className="flex flex-col gap-1 text-sm">
          {/* The hint sits outside the label: nesting it would fold the whole
              sentence into the field's accessible name. */}
          <label htmlFor="revise-detail">Detail</label>
          <input
            id="revise-detail"
            type="text"
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            aria-describedby="revise-detail-hint"
            className="h-8 rounded-md border border-border bg-background px-2"
          />
          <span id="revise-detail-hint" className="text-xs text-muted-foreground">
            {standupStrings.variance.reviseDetailRequired({
              minLength: MIN_REVISION_DETAIL_LENGTH
            })}
          </span>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {standupStrings.variance.reviseOriginalUnchanged()}
      </p>

      {hasHours && (
        <p data-testid="revise-projected" className="text-sm">
          {standupStrings.variance.reviseProjectedTotal({
            name: target.memberName,
            total: projectedTotal,
            locale
          })}
        </p>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-border px-3 py-1 text-sm">
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={() =>
            onSave({
              allocationId: target.allocationId,
              newRemainingMinutes: remaining,
              reason,
              ...(detail.trim() ? { detail: detail.trim() } : {})
            })
          }
          className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  )
}
