'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { standupStrings } from '@/lib/standup/strings'

/**
 * The "raise a blocker" form (§15.8.8, RUN-14).
 *
 * Mirrors `OverrideModal`'s shape (controlled fields, one disabled-until-valid
 * submit button) rather than inventing a new form pattern.
 *
 * Plain `<select>` elements, styled to match the app's `Select` component
 * rather than swapped for it — `override-modal.test.tsx` asserts against a
 * native `<select>`/`<option>` DOM (`querySelectorAll('option')`), which the
 * Radix-based `Select` does not render, so switching would be a behavior
 * change disguised as a style pass.
 */

const SELECT_CLASS =
  'h-8 w-full rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)] px-2.5 text-[13px] text-[var(--apple-label)] transition-all focus-visible:border-[var(--apple-system-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--apple-system-blue)]/40 disabled:cursor-not-allowed disabled:opacity-50'

const BLOCKER_TYPES = [
  'dependency',
  'external_party',
  'technical',
  'resource',
  'decision_needed',
  'environment',
  'other'
] as const

const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const

export interface RaiseBlockerTaskOption {
  taskId: string
  key?: string
  title: string
  allocationId?: string
}

export interface RaiseBlockerSubmitInput {
  taskId?: string
  linkedAllocationId?: string
  description: string
  blockerType: (typeof BLOCKER_TYPES)[number]
  severity: (typeof SEVERITIES)[number]
}

export interface RaiseBlockerModalProps {
  tasks: RaiseBlockerTaskOption[]
  onSubmit: (input: RaiseBlockerSubmitInput) => void
  onCancel: () => void
}

const MIN_DESCRIPTION_LENGTH = 10

export function RaiseBlockerModal({ tasks, onSubmit, onCancel }: RaiseBlockerModalProps) {
  const [taskId, setTaskId] = useState('')
  const [description, setDescription] = useState('')
  const [blockerType, setBlockerType] = useState<(typeof BLOCKER_TYPES)[number]>('dependency')
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>('medium')

  const canSubmit = description.trim().length >= MIN_DESCRIPTION_LENGTH

  return (
    <div className="flex w-full flex-col gap-4 p-5">
      <h2 id="raise-blocker-title" className="text-[15px] font-semibold text-[var(--apple-label)]">
        {standupStrings.blocker.raise()}
      </h2>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="blocker-task">Linked task (optional)</Label>
        <select
          id="blocker-task"
          value={taskId}
          onChange={(event) => setTaskId(event.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">General blocker, not tied to one task</option>
          {tasks.map((task) => (
            <option key={task.taskId} value={task.taskId}>
              {task.key ? `${task.key} — ${task.title}` : task.title}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="blocker-description">Description</Label>
        <Textarea
          id="blocker-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="blocker-type">Type</Label>
          <select
            id="blocker-type"
            value={blockerType}
            onChange={(event) => setBlockerType(event.target.value as (typeof BLOCKER_TYPES)[number])}
            className={SELECT_CLASS}
          >
            {BLOCKER_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="blocker-severity">Severity</Label>
          <select
            id="blocker-severity"
            value={severity}
            onChange={(event) => setSeverity(event.target.value as (typeof SEVERITIES)[number])}
            className={SELECT_CLASS}
          >
            {SEVERITIES.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!canSubmit}
          onClick={() => {
            const selected = tasks.find((task) => task.taskId === taskId)
            onSubmit({
              taskId: taskId || undefined,
              linkedAllocationId: selected?.allocationId,
              description: description.trim(),
              blockerType,
              severity
            })
          }}
        >
          {standupStrings.blocker.raise()}
        </Button>
      </div>
    </div>
  )
}
