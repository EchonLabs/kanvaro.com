'use client'

import { useState } from 'react'
import { AlertTriangle, XCircle } from 'lucide-react'

import type { AttendanceStatus } from '@/lib/standup/capacity'
import type { CompletionCheckResult } from '@/lib/standup/completion-checks'
import { Checkbox } from '@/components/ui/Checkbox'
import { backfillNeedsMemberConfirmation, validateJustification } from '@/lib/standup/override'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import { planButtonClass, planFieldClass, planInsetClass } from '../planning/ui'

/**
 * The backfill dialog (E49, SCH-14, Ruling 21).
 *
 * Moved out of `StandupRunScreen`, where it was a `max-w-sm` card drawn inside
 * `ModalOverlay`'s own `max-w-md` card — two borders, a ragged right edge, and
 * a team list squeezed into 24rem. The overlay now supplies the one shell and
 * this lays out header, scrolling body and a pinned footer inside it.
 *
 * Three things it has to make obvious, because each used to be a dead end:
 *
 * - **Why Backfill is disabled.** The footer always says what is still missing
 *   — attendance for N members, the attestation, or a check to fix first —
 *   rather than leaving a greyed button to be puzzled over.
 * - **How to clear a check a backfill cannot attest to.** Ruling 21 keeps CC-3
 *   (unanswered re-estimates) and CC-6 out of the attestation, so they used to
 *   be listed under "no attestation can clear them" with no way forward. Each
 *   now carries a Fix button that closes the dialog on the panel that clears
 *   it — and CC-3's answers are accepted on a `Missed` stand-up for exactly
 *   this reason (`revision-service`'s `MUTABLE_STATUSES`).
 * - **The room.** "Mark everyone present" fills the common case in one click;
 *   the per-member selects stay native so each keeps its own accessible name.
 */

export interface BackfillDialogMember {
  memberId: string
  name: string
  /**
   * What is already on record for the day. A recorded state is shown as it
   * stands and locked: the server fills gaps and never rewrites a record
   * (SCH-14), so a select that offered to change it would be a promise the
   * save quietly breaks. The dialog used to ignore this and ask for the whole
   * room again.
   */
  attendance?: AttendanceStatus
}

export interface BackfillDialogSubmitInput {
  /** Only the members who had no record — recorded ones are not re-sent. */
  attendance: { memberId: string; state: AttendanceStatus }[]
  justification: string
  /** CC-6: the facilitator's confirmation that the affected members agreed. */
  memberAcknowledged: boolean
  notes: string
}

export interface BackfillDialogProps {
  members: readonly BackfillDialogMember[]
  /** Failing checks the facilitator may attest to (`isCheckAcknowledgeableByBackfill`). */
  attestable: readonly CompletionCheckResult[]
  /** Failing checks nothing in this dialog can clear; each gets a Fix action. */
  unwaivable: readonly CompletionCheckResult[]
  submitting: boolean
  /** The server's refusal, shown here rather than in a banner behind the overlay. */
  error?: string | null
  onCancel: () => void
  onSubmit: (input: BackfillDialogSubmitInput) => void
  /** Closes the dialog and takes the PM to the panel that clears `checkId`. */
  onFix: (checkId: string) => void
}

export function BackfillDialog({
  members,
  attestable,
  unwaivable,
  submitting,
  error,
  onCancel,
  onSubmit,
  onFix
}: BackfillDialogProps) {
  // Keyed by memberId; a member missing from the map is simply unrecorded,
  // which the Backfill button refuses to submit (CC-7 would reject it anyway,
  // and a 422 after the fact is a worse way to learn it).
  const [chosen, setChosen] = useState<Record<string, AttendanceStatus>>({})
  const [justification, setJustification] = useState('')
  const [membersAgreed, setMembersAgreed] = useState(false)
  const [notes, setNotes] = useState('')

  // The record wins over anything chosen here. It matters after a refused
  // attempt: the server writes the room before it runs the checks, so the
  // board reloads with those members recorded while this dialog is still open.
  const stateOf = (member: BackfillDialogMember) => member.attendance ?? chosen[member.memberId]
  const isRecorded = (member: BackfillDialogMember) => member.attendance !== undefined

  const unrecorded = members.filter((member) => !stateOf(member)).length
  const justificationValid = validateJustification(justification).valid
  const attestationReady = attestable.length === 0 || justificationValid
  const needsMemberConfirmation = attestable.some((check) =>
    backfillNeedsMemberConfirmation(check.checkId)
  )

  const blockedReason =
    unwaivable.length > 0
      ? standupStrings.run.backfillFixFirst()
      : unrecorded > 0
        ? standupStrings.run.backfillAttendanceRemaining({ count: unrecorded })
        : !attestationReady
          ? standupStrings.run.backfillJustificationNeeded()
          : needsMemberConfirmation && !membersAgreed
            ? standupStrings.run.backfillConfirmNeeded()
            : null

  // Fills only the gaps: a recorded member keeps what is on record.
  const markAllPresent = () =>
    setChosen((current) => ({
      ...current,
      ...Object.fromEntries(
        members
          .filter((member) => !isRecorded(member))
          .map((member) => [member.memberId, 'present' as AttendanceStatus])
      )
    }))

  return (
    <div className="flex max-h-[90vh] flex-col">
      <div className="flex flex-col gap-1 px-5 pb-4 pt-5">
        <h3
          id="backfill-title"
          className="apple-type-headline font-semibold text-[var(--plan-text)]"
        >
          {standupStrings.run.backfillTitle()}
        </h3>
        <p className="apple-type-subheadline text-[var(--plan-secondary)]">
          {standupStrings.run.backfillDescription()}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-5">
        {unwaivable.length > 0 && (
          <section
            aria-labelledby="backfill-blocked-heading"
            className="flex flex-col gap-2 rounded-[var(--apple-radius-md)] border border-[var(--plan-danger)] bg-[var(--plan-danger-bg)] p-3"
          >
            <p
              id="backfill-blocked-heading"
              className="flex items-start gap-2 apple-type-subheadline font-semibold text-[var(--plan-text)]"
            >
              <XCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--plan-danger)]"
                strokeWidth={2}
                aria-hidden="true"
              />
              {standupStrings.run.backfillBlockedByChecks()}
            </p>
            <ul className="flex flex-col gap-2">
              {unwaivable.map((check) => (
                <li
                  key={check.checkId}
                  className="flex items-center justify-between gap-3 apple-type-subheadline text-[var(--plan-text)]"
                >
                  <span className="min-w-0">{check.message}</span>
                  <button
                    type="button"
                    onClick={() => onFix(check.checkId)}
                    className={planButtonClass('secondary', 'h-7 px-3', 'sm')}
                  >
                    {standupStrings.run.backfillGoFix()}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <fieldset className="flex flex-col gap-2">
          {/* The legend stays the fieldset's first child (and its accessible
              name); the visible heading row beside the bulk action is a copy
              hidden from assistive tech, so it is not announced twice. */}
          <legend className="sr-only">{standupStrings.run.backfillAttendanceLegend()}</legend>
          <div className="flex w-full items-center justify-between gap-3">
            <p
              aria-hidden="true"
              className="apple-type-subheadline font-semibold text-[var(--plan-text)]"
            >
              {standupStrings.run.backfillAttendanceLegend()}
            </p>
            <button
              type="button"
              onClick={markAllPresent}
              disabled={submitting || unrecorded === 0}
              className={planButtonClass('secondary', 'h-7 px-3', 'sm')}
            >
              {standupStrings.run.backfillMarkAllPresent()}
            </button>
          </div>
          <ul className={cn(planInsetClass, 'flex flex-col divide-y divide-[var(--plan-border)]')}>
            {members.map((member) => (
              <li key={member.memberId}>
                <label className="flex items-center justify-between gap-3 px-3 py-2 apple-type-subheadline text-[var(--plan-text)]">
                  <span className="min-w-0 truncate">{member.name}</span>
                  <select
                    aria-label={standupStrings.run.backfillAttendanceFor(member.name)}
                    value={stateOf(member) ?? ''}
                    onChange={(event) =>
                      setChosen((current) => ({
                        ...current,
                        [member.memberId]: event.target.value as AttendanceStatus
                      }))
                    }
                    className={cn(
                      planFieldClass,
                      'w-44 shrink-0 px-2',
                      !stateOf(member) && 'text-[var(--plan-muted)]'
                    )}
                    disabled={submitting || isRecorded(member)}
                  >
                    <option value="" disabled>
                      {standupStrings.run.backfillAttendanceUnrecorded()}
                    </option>
                    <option value="present">{standupStrings.run.statePresent()}</option>
                    <option value="absent_planned">
                      {standupStrings.run.stateAbsentPlanned()}
                    </option>
                    <option value="absent_unplanned">
                      {standupStrings.run.stateAbsentUnplanned()}
                    </option>
                    {/* Never offered to choose — a partial day's hours cannot be
                        reconstructed — but shown when it is what is on record. */}
                    {member.attendance === 'partial' && (
                      <option value="partial">{standupStrings.run.statePartial()}</option>
                    )}
                  </select>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        {attestable.length > 0 && (
          // The tinted box is a wrapper, not the fieldset: a bordered fieldset
          // draws its legend on the border line, cutting the box's top edge.
          <div className="rounded-[var(--apple-radius-md)] border border-[var(--plan-warning)] bg-[var(--plan-warning-bg)] p-3">
            <fieldset className="flex flex-col gap-2">
              <legend className="flex w-full items-start gap-2 apple-type-subheadline font-semibold text-[var(--plan-text)]">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-[var(--plan-warning)]"
                  strokeWidth={2}
                  aria-hidden="true"
                />
                {standupStrings.run.backfillChecksLegend()}
              </legend>
              <p className="apple-type-footnote text-[var(--plan-secondary)]">
                {standupStrings.run.backfillChecksDescription()}
              </p>
              <ul className="flex list-disc flex-col gap-1 pl-5 apple-type-footnote text-[var(--plan-text)]">
                {attestable.map((check) => (
                  <li key={check.checkId}>{check.message}</li>
                ))}
              </ul>
              <label className="flex flex-col gap-1.5 apple-type-subheadline text-[var(--plan-text)]">
                {standupStrings.run.backfillJustificationLabel()}
                <textarea
                  value={justification}
                  onChange={(event) => setJustification(event.target.value)}
                  className={cn(planFieldClass, 'h-auto min-h-20 px-2.5 py-2')}
                  disabled={submitting}
                />
              </label>
              {!justificationValid && (
                <p className="apple-type-footnote text-[var(--plan-secondary)]">
                  {standupStrings.run.backfillJustificationHint()}
                </p>
              )}
              {/* CC-6. A backfill cannot get the member's own tick, so the
                  facilitator says it in their own name — recorded as theirs. */}
              {needsMemberConfirmation && (
                <label className="flex cursor-pointer items-start gap-2.5 apple-type-subheadline text-[var(--plan-text)]">
                  <Checkbox
                    checked={membersAgreed}
                    onCheckedChange={setMembersAgreed}
                    disabled={submitting}
                  />
                  {standupStrings.run.backfillMembersAgreed()}
                </label>
              )}
            </fieldset>
          </div>
        )}

        <label className="flex flex-col gap-1.5 apple-type-subheadline text-[var(--plan-text)]">
          {standupStrings.run.backfillNotesLabel()}
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className={cn(planFieldClass, 'h-auto min-h-16 px-2.5 py-2')}
            disabled={submitting}
          />
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-[var(--apple-radius-md)] border border-[var(--plan-danger)] bg-[var(--plan-danger-bg)] px-3 py-2 apple-type-subheadline text-[var(--plan-danger)]"
          >
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--plan-border)] px-5 py-4">
        <p
          id="backfill-status"
          className={cn(
            'apple-type-footnote',
            blockedReason ? 'text-[var(--plan-secondary)]' : 'text-[var(--plan-success)]'
          )}
        >
          {blockedReason ?? standupStrings.run.backfillReady()}
        </p>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className={planButtonClass('secondary')}
          >
            {standupStrings.run.backfillCancel()}
          </button>
          <button
            type="button"
            aria-describedby="backfill-status"
            onClick={() =>
              onSubmit({
                attendance: members
                  .filter((member) => !isRecorded(member) && chosen[member.memberId])
                  .map((member) => ({
                    memberId: member.memberId,
                    state: chosen[member.memberId]
                  })),
                justification: justification.trim(),
                memberAcknowledged: needsMemberConfirmation && membersAgreed,
                notes: notes.trim()
              })
            }
            disabled={submitting || blockedReason !== null}
            className={planButtonClass('danger')}
          >
            {standupStrings.run.backfillConfirm()}
          </button>
        </div>
      </div>
    </div>
  )
}
