'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
 *
 * Plain `<select>`, styled to match the app's `Select` component rather than
 * swapped for it — `override-modal.test.tsx` asserts against a native
 * `<select>`/`<option>` DOM (`querySelectorAll('option')`), which the
 * Radix-based `Select` does not render.
 */

const SELECT_CLASS =
  'h-8 w-full rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)] px-2.5 text-[13px] text-[var(--apple-label)] transition-all focus-visible:border-[var(--apple-system-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--apple-system-blue)]/40 disabled:cursor-not-allowed disabled:opacity-50'

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
    <div className="flex w-full flex-col gap-4 p-5">
      <h2 id="override-modal-title" className="text-[15px] font-semibold text-[var(--apple-label)]">
        {standupStrings.override.title({ type })}
      </h2>

      <ul className="flex flex-col gap-1 text-[13px] text-[var(--apple-secondary-label)]">
        {affected.map((member) => (
          <li key={member.memberId}>{standupStrings.override.gapLine(member)}</li>
        ))}
      </ul>

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
        <p role="alert" className="text-[12px] text-[var(--apple-system-red)]">
          {standupStrings.override.validationError({
            code: validation.code,
            minLength: JUSTIFICATION_MIN_LENGTH
          })}
        </p>
      )}

      {requiresAcknowledgement && (
        <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-[var(--apple-label)]">
          <Checkbox
            checked={acknowledged}
            onCheckedChange={setAcknowledged}
          />
          {standupStrings.override.acknowledgement()}
        </label>
      )}

      <p className="text-[12px] text-[var(--apple-tertiary-label)]">{standupStrings.override.attributionNotice()}</p>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel}>
          {standupStrings.override.cancel()}
        </Button>
        <Button
          type="button"
          disabled={!canSubmit}
          onClick={() =>
            onSubmit({ reasonCode, justification, memberAcknowledged: acknowledged })
          }
        >
          {standupStrings.override.submit()}
        </Button>
      </div>
    </div>
  )
}
