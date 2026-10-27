'use client'

import { useState } from 'react'

import { PlanButton } from '../planning/ui'
import { Checkbox } from '@/components/ui/Checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  JUSTIFICATION_MIN_LENGTH,
  reasonCodesFor,
  validateJustification
} from '@/lib/standup/override'
import { standupStrings } from '@/lib/standup/strings'

/**
 * The override modal (§15.12, OVR-1..7).
 *
 * `override.ts` has no server-only imports, so importing its reason-code
 * lists and `validateJustification` directly is safe here — the same pattern
 * `CarryForwardPanel.tsx` already uses importing from `carry-forward.ts`. The
 * client validates with the exact function the route validates with, so the
 * button's disabled state can never promise something the server refuses.
 *
 * The acknowledgement checkbox is rendered only for `over_allocation`
 * (OVR-6) — every other overridable type has no member consent to collect,
 * and showing an unused checkbox would suggest one is needed everywhere.
 *
 * Plain `<select>`, styled to match the app's `Select` component rather than
 * swapped for it — `override-modal.test.tsx` asserts against a native
 * `<select>`/`<option>` DOM (`querySelectorAll('option')`), which the
 * Radix-based `Select` does not render.
 *
 * The modal opens on what the override *does* and what the usual fix would be,
 * before asking for anything: "Override" on its own reads as "make the error
 * go away", and a PM should only reach for it once they know it is the
 * exception rather than the way through. CC-3 and CC-10 are task-scoped, so
 * they list tasks rather than the capacity gap line, which would read
 * "0h of 0h planned" for them — a number that means nothing for a deferred
 * re-estimate.
 */

const SELECT_CLASS =
  'plan-select h-8 w-full rounded-[var(--apple-radius-sm)] border border-[var(--plan-border)] bg-[var(--plan-raised)] px-2.5 apple-type-subheadline text-[var(--plan-text)] transition-all focus-visible:border-[var(--plan-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--plan-accent)]/40 disabled:cursor-not-allowed disabled:opacity-50'

export type OverridableType =
  | 'under_allocation'
  | 'over_allocation'
  | 'skip_reestimate'
  | 'duplicate_allocation'

export interface OverrideModalAffectedMember {
  memberId: string
  name: string
  gapMinutes: number
  effectiveMinutes: number
  allocatedMinutes: number
}

export interface OverrideModalSubmitInput {
  reasonCode: string
  justification: string
  memberAcknowledged: boolean
}

export interface OverrideModalAffectedTask {
  taskId: string
  label: string
}

export interface OverrideModalProps {
  type: OverridableType
  affected: OverrideModalAffectedMember[]
  /** CC-3/CC-10 only: the tasks the override covers. */
  affectedTasks?: OverrideModalAffectedTask[]
  onCancel: () => void
  onSubmit: (input: OverrideModalSubmitInput) => void
  /** The server's refusal, shown inside the modal rather than behind it. */
  error?: string | null
  saving?: boolean
}

const MEMBER_SCOPED: readonly OverridableType[] = ['under_allocation', 'over_allocation']

export function OverrideModal({
  type,
  affected,
  affectedTasks = [],
  onCancel,
  onSubmit,
  error,
  saving = false
}: OverrideModalProps) {
  const codes = reasonCodesFor(type)
  const memberScoped = MEMBER_SCOPED.includes(type)
  const [reasonCode, setReasonCode] = useState<string>(codes[0])
  const [justification, setJustification] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)

  const validation = validateJustification(justification)
  const requiresAcknowledgement = type === 'over_allocation'
  const canSubmit = validation.valid && (!requiresAcknowledgement || acknowledged) && !saving

  return (
    <div className="flex w-full flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h2 id="override-modal-title" className="apple-type-body font-semibold text-[var(--plan-text)]">
          {standupStrings.override.title({ type })}
        </h2>
        <p className="apple-type-subheadline text-[var(--plan-secondary)]">
          {standupStrings.override.explanation({ type })}
        </p>
        <p className="apple-type-caption text-[var(--plan-muted)]">
          {standupStrings.override.usualFix({ type })}
        </p>
      </div>

      <div className="flex flex-col gap-1.5 rounded-[var(--apple-radius-md)] border border-[var(--plan-border)] bg-[var(--plan-raised)] p-3">
        <p className="apple-type-caption font-semibold text-[var(--plan-muted)]">
          {memberScoped
            ? standupStrings.override.affectedMembers()
            : standupStrings.override.affectedTasks()}
        </p>
        <ul className="flex flex-col gap-1 apple-type-subheadline text-[var(--plan-text)]">
          {memberScoped
            ? affected.map((member) => (
                <li key={member.memberId}>{standupStrings.override.gapLine(member)}</li>
              ))
            : affectedTasks.map((task) => (
                <li key={task.taskId}>
                  {task.label}
                </li>
              ))}
        </ul>
        {!memberScoped && affected.length > 0 && (
          <p className="apple-type-caption text-[var(--plan-muted)]">
            {affected.map((member) => member.name).join(', ')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="override-reason">Reason</Label>
        <select
          id="override-reason"
          value={reasonCode}
          onChange={(event) => setReasonCode(event.target.value)}
          className={SELECT_CLASS}
        >
          {codes.map((code) => (
            <option key={code} value={code}>
              {standupStrings.override.reasonLabel({ code })}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="override-justification">{standupStrings.override.justificationLabel()}</Label>
        <Textarea
          id="override-justification"
          value={justification}
          onChange={(event) => setJustification(event.target.value)}
          placeholder={standupStrings.override.justificationPlaceholder()}
          rows={3}
        />
      </div>

      {!validation.valid && justification.length > 0 && (
        <p role="alert" className="apple-type-caption text-[var(--plan-danger)]">
          {standupStrings.override.validationError({
            code: validation.code,
            minLength: JUSTIFICATION_MIN_LENGTH
          })}
        </p>
      )}

      {requiresAcknowledgement && (
        <label className="flex cursor-pointer items-center gap-2.5 apple-type-subheadline text-[var(--plan-text)]">
          <Checkbox
            checked={acknowledged}
            onCheckedChange={setAcknowledged}
          />
          {standupStrings.override.acknowledgement()}
        </label>
      )}

      <p className="apple-type-caption text-[var(--plan-muted)]">{standupStrings.override.attributionNotice()}</p>

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
          {standupStrings.override.cancel()}
        </PlanButton>
        <PlanButton tone="primary"
          type="button"
          disabled={!canSubmit}
          onClick={() =>
            onSubmit({ reasonCode, justification, memberAcknowledged: acknowledged })
          }
        >
          {standupStrings.override.submit()}
        </PlanButton>
      </div>
    </div>
  )
}
