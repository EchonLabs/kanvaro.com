'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
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
 *
 * The Reason field stays a plain `<select>`, styled to match the app's
 * `Select` component rather than swapped for it — `variance-panel.test.tsx`
 * drives it with `fireEvent.change(getByLabelText('Reason'), { target:
 * { value } })`, which only works on a native form control.
 *
 * Unlike `RaiseBlockerModal`/`ResolveBlockerDialog`/`OverrideModal`, nothing
 * currently mounts this inside `ModalOverlay` (grep confirms no import in
 * `StandupRunScreen.tsx` or `VariancePanel.tsx` — `onRevise` there calls the
 * API directly), so its own root keeps a self-contained card shell rather
 * than assuming a wrapper supplies one.
 */

const SELECT_CLASS =
  'h-8 w-full rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)] px-2.5 text-[13px] text-[var(--apple-label)] transition-all focus-visible:border-[var(--apple-system-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--apple-system-blue)]/40 disabled:cursor-not-allowed disabled:opacity-50'

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
    <div className="flex w-full flex-col gap-4 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-5 shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none">
      <div>
        <h3 id="revise-title" className="text-[15px] font-semibold text-[var(--apple-label)]">
          {standupStrings.variance.reviseTitle()}
        </h3>
        <p className="mt-1 text-[13px] text-[var(--apple-secondary-label)]">
          <span className="font-medium text-[var(--apple-label)]">{target.taskKey}</span> {target.title}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] p-3 text-[12.5px]">
        <dt className="text-[var(--apple-tertiary-label)]">Original estimate</dt>
        <dd data-testid="revise-original" className="text-right font-apple-mono tabular-nums text-[var(--apple-label)]">
          {formatMinutesAsHours(target.originalEstimateMinutes, { locale })}
        </dd>
        <dt className="text-[var(--apple-tertiary-label)]">Total logged so far</dt>
        <dd data-testid="revise-logged" className="text-right font-apple-mono tabular-nums text-[var(--apple-label)]">
          {formatMinutesAsHours(target.totalLoggedMinutesOnTask, { locale })}
        </dd>
        {target.taskVarianceMinutes > 0 && (
          <>
            <dt className="text-[var(--apple-system-orange)]">Currently over by</dt>
            <dd
              data-testid="revise-over"
              className="text-right font-apple-mono tabular-nums text-[var(--apple-system-orange)]"
            >
              {formatMinutesAsHours(target.taskVarianceMinutes, { locale })}
            </dd>
          </>
        )}
      </dl>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="revise-hours">{standupStrings.variance.reviseHoursLabel()}</Label>
        <Input
          id="revise-hours"
          type="number"
          min={0}
          max={999}
          step={0.25}
          value={hours}
          onChange={(event) => setHours(event.target.value)}
          className="w-28"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="revise-reason">Reason</Label>
        <select
          id="revise-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value as RevisionReason)}
          className={SELECT_CLASS}
        >
          {REVISION_REASONS.map((option) => (
            <option key={option} value={option}>
              {option.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      {reason === 'other' && (
        <div className="flex flex-col gap-1.5">
          {/* The hint sits outside the label: nesting it would fold the whole
              sentence into the field's accessible name. */}
          <Label htmlFor="revise-detail">Detail</Label>
          <Input
            id="revise-detail"
            type="text"
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            aria-describedby="revise-detail-hint"
          />
          <span id="revise-detail-hint" className="text-[12px] text-[var(--apple-tertiary-label)]">
            {standupStrings.variance.reviseDetailRequired({
              minLength: MIN_REVISION_DETAIL_LENGTH
            })}
          </span>
        </div>
      )}

      <p className="text-[12px] text-[var(--apple-tertiary-label)]">
        {standupStrings.variance.reviseOriginalUnchanged()}
      </p>

      {hasHours && (
        <p data-testid="revise-projected" className="text-[13px] text-[var(--apple-label)]">
          {standupStrings.variance.reviseProjectedTotal({
            name: target.memberName,
            total: projectedTotal,
            locale
          })}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
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
        >
          Save
        </Button>
      </div>
    </div>
  )
}
