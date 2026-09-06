'use client'

import { useState } from 'react'

import {
  UNDER_ALLOCATION_REASON_CODES,
  OVER_ALLOCATION_REASON_CODES,
  JUSTIFICATION_MIN_LENGTH,
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
 */

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

export interface OverrideModalProps {
  type: OverridableType
  affected: OverrideModalAffectedMember[]
  onCancel: () => void
  onSubmit: (input: OverrideModalSubmitInput) => void
}

export function OverrideModal({ type, affected, onCancel, onSubmit }: OverrideModalProps) {
  const codes = type === 'over_allocation' ? OVER_ALLOCATION_REASON_CODES : UNDER_ALLOCATION_REASON_CODES
  const [reasonCode, setReasonCode] = useState<string>(codes[0])
  const [justification, setJustification] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)

  const validation = validateJustification(justification)
  const requiresAcknowledgement = type === 'over_allocation'
  const canSubmit = validation.valid && (!requiresAcknowledgement || acknowledged)

  return (
    <div
      role="dialog"
      aria-labelledby="override-modal-title"
      className="flex w-full max-w-md flex-col gap-3 rounded-md border border-border bg-background p-4 text-sm"
    >
      <h2 id="override-modal-title" className="text-sm font-semibold">
        {standupStrings.override.title({ type })}
      </h2>

      <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
        {affected.map((member) => (
          <li key={member.memberId}>{standupStrings.override.gapLine(member)}</li>
        ))}
      </ul>

      <label className="flex flex-col gap-1">
        <span>{standupStrings.override.reasonLabel({ code: reasonCode })}</span>
        <select
          value={reasonCode}
          onChange={(event) => setReasonCode(event.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2"
        >
          {codes.map((code) => (
            <option key={code} value={code}>
              {standupStrings.override.reasonLabel({ code })}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span>{standupStrings.override.justificationLabel()}</span>
        <textarea
          value={justification}
          onChange={(event) => setJustification(event.target.value)}
          placeholder={standupStrings.override.justificationPlaceholder()}
          className="min-h-20 w-full rounded-md border border-border bg-background px-2 py-1"
        />
      </label>

      {!validation.valid && justification.length > 0 && (
        <p role="alert" className="text-xs text-destructive">
          {standupStrings.override.validationError({
            code: validation.code,
            minLength: JUSTIFICATION_MIN_LENGTH
          })}
        </p>
      )}

      {requiresAcknowledgement && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          {standupStrings.override.acknowledgement()}
        </label>
      )}

      <p className="text-xs text-muted-foreground">{standupStrings.override.attributionNotice()}</p>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-3 py-1 text-xs"
        >
          {standupStrings.override.cancel()}
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() =>
            onSubmit({ reasonCode, justification, memberAcknowledged: acknowledged })
          }
          className="rounded-md border border-border bg-primary px-3 py-1 text-xs text-primary-foreground disabled:opacity-50"
        >
          {standupStrings.override.submit()}
        </button>
      </div>
    </div>
  )
}
