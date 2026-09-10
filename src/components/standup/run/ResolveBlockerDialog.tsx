'use client'

import { useState } from 'react'

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
    <div className="flex w-full max-w-md flex-col gap-3 p-4 text-sm">
      <h2 id="resolve-blocker-title" className="text-sm font-semibold">
        Resolve blocker
      </h2>

      <label className="flex flex-col gap-1">
        <span>Outcome</span>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as 'resolved' | 'wont_resolve')}
          className="h-8 rounded-md border border-border bg-background px-2"
        >
          <option value="resolved">Resolved</option>
          <option value="wont_resolve">Won&apos;t resolve</option>
        </select>
      </label>

      <label className="flex flex-col gap-1" htmlFor="resolution-note">
        Resolution note
        <textarea
          id="resolution-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="min-h-16 rounded-md border border-border bg-background px-2 py-1"
        />
      </label>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-border px-3 py-1 text-xs">
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => onConfirm({ blockerId, status, resolutionNote: note.trim() })}
          className="rounded-md border border-border bg-primary px-3 py-1 text-xs text-primary-foreground disabled:opacity-50"
        >
          {standupStrings.blocker.resolve()}
        </button>
      </div>
    </div>
  )
}
