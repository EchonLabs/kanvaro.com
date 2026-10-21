'use client'

import { useState } from 'react'

import { PlanButton } from '../planning/ui'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MIN_NOT_STARTED_REASON_LENGTH } from '@/lib/standup/estimates'
import { formatMinutesAsHours, type Minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'

/**
 * AC-18's dialog — "why did the planned time not happen?".
 *
 * This replaced an unstyled form the route page rendered inline. That one let
 * Save through on a single character, the server then refused anything under
 * `MIN_NOT_STARTED_REASON_LENGTH`, and the refusal went to a banner hidden
 * behind the overlay — so the button looked broken. The floor is checked here
 * with the server's own constant, and any refusal that still happens is shown
 * inside the dialog via `error`.
 *
 * Mounted inside `ModalOverlay`, which supplies the card shell.
 */

export interface NotStartedReasonTarget {
  allocationId: string
  taskKey?: string
  title: string
  memberName: string
  plannedMinutes: Minutes
}

export interface NotStartedReasonModalProps {
  target: NotStartedReasonTarget
  onSave: (input: { allocationId: string; reason: string }) => void
  onCancel: () => void
  error?: string | null
  saving?: boolean
  locale?: string
}

export function NotStartedReasonModal({
  target,
  onSave,
  onCancel,
  error,
  saving = false,
  locale
}: NotStartedReasonModalProps) {
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()
  const remaining = Math.max(0, MIN_NOT_STARTED_REASON_LENGTH - trimmed.length)
  const canSave = remaining === 0 && !saving

  return (
    <div className="flex w-full flex-col gap-4 p-5">
      <div>
        <h3 id="reason-title" className="apple-type-body font-semibold text-[var(--plan-text)]">
          {standupStrings.variance.notStartedTitle()}
        </h3>
        <p className="mt-1 apple-type-subheadline text-[var(--plan-secondary)]">
          {target.taskKey && (
            <span className="font-medium text-[var(--plan-text)]">{target.taskKey} </span>
          )}
          {target.title}
        </p>
        <p className="mt-0.5 apple-type-caption text-[var(--plan-muted)]">
          {target.memberName} · Planned {formatMinutesAsHours(target.plannedMinutes, { locale })}, nothing logged
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="not-started-reason">{standupStrings.variance.notStartedLabel()}</Label>
        <Textarea
          id="not-started-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={standupStrings.variance.notStartedPlaceholder()}
          aria-describedby="not-started-reason-hint"
          rows={3}
        />
        <span
          id="not-started-reason-hint"
          className="apple-type-caption text-[var(--plan-muted)]"
        >
          {standupStrings.variance.notStartedHint({
            minLength: MIN_NOT_STARTED_REASON_LENGTH,
            remaining
          })}
        </span>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-[var(--apple-radius-md)] border border-[var(--plan-danger)] bg-[var(--plan-danger-bg)] px-3 py-2 apple-type-subheadline text-[var(--plan-danger)]"
        >
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <PlanButton tone="secondary" onClick={onCancel}>
          Cancel
        </PlanButton>
        <PlanButton
          tone="primary"
          disabled={!canSave}
          onClick={() => onSave({ allocationId: target.allocationId, reason: trimmed })}
        >
          Save
        </PlanButton>
      </div>
    </div>
  )
}
