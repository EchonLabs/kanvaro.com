'use client'

import { useState } from 'react'

import { WRITEOFF_REASON_MIN_LENGTH, type DebtPosition } from '@/lib/standup/debt'
import { formatMinutesAsHours, hoursToMinutes, type Minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import { planButtonClass, planFieldClass, planInsetClass } from '../planning/ui'

/**
 * The estimate-debt ledger, and the write-off dialog (§15.8.5, VAR-5, VAR-8).
 *
 * The ledger is shown as entries rather than a single number because the number
 * on its own invites argument: "you owe two hours" is contestable, "you went
 * two hours over on KAN-214 on the 19th" is a fact somebody can check — which
 * is why each entry carries its date and, where there is one, its reason.
 *
 * The write-off is deliberately awkward. Twenty characters of justification
 * (VAR-8) is not a formality — the entry is permanent, appears in analytics,
 * and notifies the project's manager, so the dialog makes the PM write a
 * sentence rather than click through.
 *
 * Mounted inside `ModalOverlay`, which supplies the card shell, so this root
 * draws none of its own.
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
  /** The server's refusal of a write-off, shown inside the dialog. */
  error?: string | null
  saving?: boolean
  locale?: string
}

export function DebtLedgerDrawer({
  memberName,
  position,
  entries,
  canWriteOff,
  onWriteOff,
  onClose,
  error,
  saving = false,
  locale
}: DebtLedgerDrawerProps) {
  const [writingOff, setWritingOff] = useState(false)
  const [hours, setHours] = useState('')
  const [reason, setReason] = useState('')

  const parsed = Number(hours)
  const amount = Number.isFinite(parsed) && parsed > 0 ? hoursToMinutes(parsed) : null
  const canSubmit =
    amount !== null && reason.trim().length >= WRITEOFF_REASON_MIN_LENGTH && !saving
  const inDebt = position.surplusMinutes === 0 && position.outstandingMinutes > 0

  return (
    <div aria-labelledby="debt-ledger-title" className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h3 id="debt-ledger-title" className="apple-type-body font-semibold text-[var(--plan-text)]">
          {standupStrings.debt.ledgerTitle()} — {memberName}
        </h3>

        {/* VAR-6 / E42: a negative balance is surplus and says so. */}
        <p
          data-testid="debt-balance"
          className={cn(
            'apple-type-title3 font-semibold tabular-nums',
            inDebt ? 'text-[var(--plan-danger)]' : 'text-[var(--plan-text)]'
          )}
        >
          {position.surplusMinutes > 0
            ? standupStrings.variance.surplus({ minutes: position.surplusMinutes, locale })
            : standupStrings.debt.outstanding({ minutes: position.outstandingMinutes, locale })}
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="apple-type-subheadline text-[var(--plan-muted)]">{standupStrings.debt.empty()}</p>
      ) : (
        <ul
          className={cn(
            planInsetClass,
            'plan-scroll flex max-h-[16rem] flex-col divide-y divide-[var(--plan-border)]'
          )}
        >
          {entries.map((entry) => (
            <li
              key={entry.entryId}
              data-testid={`ledger-entry-${entry.entryId}`}
              className="flex items-start justify-between gap-3 px-3 py-2"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="apple-type-subheadline text-[var(--plan-text)]">
                  {standupStrings.debt.entryType[entry.entryType]()}
                </span>
                <span className="apple-type-caption text-[var(--plan-muted)]">
                  {formatEntryDate(entry.createdAt, locale)}
                  {entry.reason ? ` · ${entry.reason}` : ''}
                </span>
              </span>
              <span
                className={cn(
                  'shrink-0 apple-type-subheadline font-semibold tabular-nums',
                  reducesDebt(entry.entryType)
                    ? 'text-[var(--plan-success)]'
                    : 'text-[var(--plan-text)]'
                )}
              >
                {reducesDebt(entry.entryType) ? '−' : '+'}
                {formatMinutesAsHours(entry.minutes, { locale })}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canWriteOff && writingOff && (
        <div className={cn(planInsetClass, 'flex flex-col gap-3 p-3')}>
          <label
            className="apple-type-subheadline flex flex-col gap-1 text-[var(--plan-text)]"
            htmlFor="writeoff-hours"
          >
            {standupStrings.debt.writeOffHoursLabel()}
            <input
              id="writeoff-hours"
              type="number"
              min={0.25}
              step={0.25}
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              className={`${planFieldClass} w-24 tabular-nums`}
            />
          </label>

          <div className="apple-type-subheadline flex flex-col gap-1 text-[var(--plan-text)]">
            <label htmlFor="writeoff-reason">{standupStrings.debt.writeOffReasonLabel()}</label>
            <textarea
              id="writeoff-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-describedby="writeoff-hint"
              className={`${planFieldClass} h-auto min-h-16 py-1.5`}
            />
            <span id="writeoff-hint" className="apple-type-caption text-[var(--plan-muted)]">
              {standupStrings.debt.writeOffReasonTooShort({
                minLength: WRITEOFF_REASON_MIN_LENGTH
              })}
            </span>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-[var(--apple-radius-md)] border border-[var(--plan-danger)] bg-[var(--plan-danger-bg)] px-3 py-2 apple-type-subheadline text-[var(--plan-danger)]"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {canWriteOff && !writingOff && (
          <button
            type="button"
            onClick={() => setWritingOff(true)}
            disabled={position.outstandingMinutes <= 0}
            className={planButtonClass('secondary', 'mr-auto')}
          >
            {standupStrings.debt.writeOff()}
          </button>
        )}

        {canWriteOff && writingOff ? (
          <>
            <button
              type="button"
              onClick={() => setWritingOff(false)}
              className={planButtonClass('secondary')}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() =>
                amount !== null && onWriteOff({ minutes: amount, reason: reason.trim() })
              }
              className={planButtonClass('primary')}
            >
              {standupStrings.debt.writeOffConfirm()}
            </button>
          </>
        ) : (
          <button type="button" onClick={onClose} className={planButtonClass('primary')}>
            {standupStrings.debt.close()}
          </button>
        )}
      </div>
    </div>
  )
}

const reducesDebt = (entryType: LedgerEntryView['entryType']) =>
  entryType === 'credit' || entryType === 'settlement' || entryType === 'writeoff'

function formatEntryDate(value: string | Date, locale?: string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
}
