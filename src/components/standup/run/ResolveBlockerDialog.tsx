'use client'

import { useState } from 'react'

import { PlanButton } from '../planning/ui'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { standupStrings } from '@/lib/standup/strings'

/**
 * The "resolve a blocker" confirm-with-note flow (§13, RUN-14..18, Task 5).
 *
 * Mirrors `RaiseBlockerModal`'s shape (controlled fields, one
 * disabled-until-valid submit button) — `updateBlocker`
 * (`blocker-service.ts:135`) throws `VALIDATION_FAILED` if `resolutionNote`
 * is under 10 characters when closing a blocker, so a bare confirm() is not
 * enough here.
 */

const SELECT_CLASS =
  'plan-select h-8 w-full rounded-[var(--apple-radius-sm)] border border-[var(--plan-border)] bg-[var(--plan-raised)] px-2.5 apple-type-subheadline text-[var(--plan-text)] transition-all focus-visible:border-[var(--plan-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--plan-accent)]/40 disabled:cursor-not-allowed disabled:opacity-50'

const MIN_RESOLUTION_NOTE_LENGTH = 10

export interface ResolveBlockerSubmitInput {
  blockerId: string
  status: 'resolved' | 'wont_resolve'
  resolutionNote: string
}

export interface ResolveBlockerDialogProps {
  blockerId: string
  onConfirm: (input: ResolveBlockerSubmitInput) => void
  onCancel: () => void
}

export function ResolveBlockerDialog({ blockerId, onConfirm, onCancel }: ResolveBlockerDialogProps) {
  const [status, setStatus] = useState<'resolved' | 'wont_resolve'>('resolved')
  const [note, setNote] = useState('')

  const canSubmit = note.trim().length >= MIN_RESOLUTION_NOTE_LENGTH

  return (
    <div className="flex w-full flex-col gap-4 p-5">
      <h2 id="resolve-blocker-title" className="apple-type-body font-semibold text-[var(--plan-text)]">
        Resolve blocker
      </h2>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="resolve-outcome">Outcome</Label>
        <select
          id="resolve-outcome"
          value={status}
          onChange={(event) => setStatus(event.target.value as 'resolved' | 'wont_resolve')}
          className={SELECT_CLASS}
        >
          <option value="resolved">Resolved</option>
          <option value="wont_resolve">Won&apos;t resolve</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="resolution-note">Resolution note</Label>
        <Textarea
          id="resolution-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <PlanButton tone="secondary" onClick={onCancel}>
          Cancel
        </PlanButton>
        <PlanButton tone="primary"
          type="button"
          disabled={!canSubmit}
          onClick={() => onConfirm({ blockerId, status, resolutionNote: note.trim() })}
        >
          {standupStrings.blocker.resolve()}
        </PlanButton>
      </div>
    </div>
  )
}
