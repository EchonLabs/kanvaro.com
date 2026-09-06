'use client'

import { useState } from 'react'

import { WRITEOFF_REASON_MIN_LENGTH, type DebtPosition } from '@/lib/standup/debt'
import { formatMinutesAsHours, hoursToMinutes, type Minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'

/**
 * The estimate-debt ledger, and the write-off dialog (§15.8.5, VAR-5, VAR-8).
 *
 * The ledger is shown as entries rather than a single number because the number
 * on its own invites argument: "you owe two hours" is contestable, "you went
 * two hours over on KAN-214 on the 19th" is a fact somebody can check.
 *
 * The write-off is deliberately awkward. Twenty characters of justification
 * (VAR-8) is not a formality — the entry is permanent, appears in analytics,
 * and notifies the project's manager, so the dialog makes the PM write a
 * sentence rather than click through.
 */

export interface LedgerEntryView {
  entryId: string
  entryType: 'accrual' | 'credit' | 'settlement' | 'writeoff' | 'carry_in'
  minutes: Minutes
  createdAt: string | Date
  reason?: string
}

export interface DebtLedgerDrawerProps {
  memberName: string
  position: DebtPosition
  entries: LedgerEntryView[]
  /** VAR-8 is PM-only. Without the permission there is no control at all. */
  canWriteOff: boolean
  onWriteOff: (input: { minutes: Minutes; reason: string }) => void
  onClose: () => void
  locale?: string
}

export function DebtLedgerDrawer({
  memberName,
  position,
  entries,
  canWriteOff,
  onWriteOff,
  onClose,
  locale
}: DebtLedgerDrawerProps) {
  const [writingOff, setWritingOff] = useState(false)
  const [hours, setHours] = useState('')
  const [reason, setReason] = useState('')

  const parsed = Number(hours)
  const amount = Number.isFinite(parsed) && parsed > 0 ? hoursToMinutes(parsed) : null
  const canSubmit = amount !== null && reason.trim().length >= WRITEOFF_REASON_MIN_LENGTH

  return (
    <aside
      aria-labelledby="debt-ledger-title"
      className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4"
    >
      <h3 id="debt-ledger-title" className="text-sm font-semibold">
        {standupStrings.debt.ledgerTitle()} — {memberName}
      </h3>

      {/* VAR-6 / E42: a negative balance is surplus and says so. */}
      <p data-testid="debt-balance" className="text-sm">
        {position.surplusMinutes > 0
          ? standupStrings.variance.surplus({ minutes: position.surplusMinutes, locale })
          : standupStrings.debt.outstanding({ minutes: position.outstandingMinutes, locale })}
      </p>

      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">{standupStrings.debt.empty()}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {entries.map((entry) => (
            <li
              key={entry.entryId}
              data-testid={`ledger-entry-${entry.entryId}`}
              className="flex items-baseline justify-between gap-3"
            >
              <span>{standupStrings.debt.entryType[entry.entryType]()}</span>
              <span>
                {reducesDebt(entry.entryType) ? '−' : '+'}
                {formatMinutesAsHours(entry.minutes, { locale })}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canWriteOff && !writingOff && (
        <button
          type="button"
          onClick={() => setWritingOff(true)}
          className="self-start rounded-md border border-border px-2 py-1 text-xs"
        >
          {standupStrings.debt.writeOff()}
        </button>
      )}

      {canWriteOff && writingOff && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <label className="flex flex-col gap-1 text-sm" htmlFor="writeoff-hours">
            Hours to write off
            <input
              id="writeoff-hours"
              type="number"
              min={0.25}
              step={0.25}
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              className="h-8 w-24 rounded-md border border-border bg-background px-2"
            />
          </label>

          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor="writeoff-reason">{standupStrings.debt.writeOffReasonLabel()}</label>
            <textarea
              id="writeoff-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-describedby="writeoff-hint"
              className="min-h-16 rounded-md border border-border bg-background px-2 py-1 text-sm"
            />
            <span id="writeoff-hint" className="text-xs text-muted-foreground">
              {standupStrings.debt.writeOffReasonTooShort({
                minLength: WRITEOFF_REASON_MIN_LENGTH
              })}
            </span>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setWritingOff(false)}
              className="rounded-md border border-border px-3 py-1 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => amount !== null && onWriteOff({ minutes: amount, reason: reason.trim() })}
              className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
            >
              {standupStrings.debt.writeOffConfirm()}
            </button>
          </div>
        </div>
      )}

      <button type="button" onClick={onClose} className="self-start text-xs underline">
        Close
      </button>
    </aside>
  )
}

const reducesDebt = (entryType: LedgerEntryView['entryType']) =>
  entryType === 'credit' || entryType === 'settlement' || entryType === 'writeoff'
