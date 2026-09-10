'use client'

import { useState } from 'react'

import { standupStrings } from '@/lib/standup/strings'

/**
 * The "raise a blocker" form (§15.8.8, RUN-14).
 *
 * Mirrors `OverrideModal`'s shape (controlled fields, one disabled-until-valid
 * submit button) rather than inventing a new form pattern.
 */

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
    <div className="flex w-full max-w-md flex-col gap-3 p-4 text-sm">
      <h2 id="raise-blocker-title" className="text-sm font-semibold">
        {standupStrings.blocker.raise()}
      </h2>

      <label className="flex flex-col gap-1">
        <span>Linked task (optional)</span>
        <select
          value={taskId}
          onChange={(event) => setTaskId(event.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2"
        >
          <option value="">General blocker, not tied to one task</option>
          {tasks.map((task) => (
            <option key={task.taskId} value={task.taskId}>
              {task.key ? `${task.key} — ${task.title}` : task.title}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1" htmlFor="blocker-description">
        Description
        <textarea
          id="blocker-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="min-h-20 rounded-md border border-border bg-background px-2 py-1"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span>Type</span>
        <select
          value={blockerType}
          onChange={(event) => setBlockerType(event.target.value as (typeof BLOCKER_TYPES)[number])}
          className="h-8 rounded-md border border-border bg-background px-2"
        >
          {BLOCKER_TYPES.map((type) => (
            <option key={type} value={type}>
              {type.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span>Severity</span>
        <select
          value={severity}
          onChange={(event) => setSeverity(event.target.value as (typeof SEVERITIES)[number])}
          className="h-8 rounded-md border border-border bg-background px-2"
        >
          {SEVERITIES.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </label>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-border px-3 py-1 text-xs">
          Cancel
        </button>
        <button
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
          className="rounded-md border border-border bg-primary px-3 py-1 text-xs text-primary-foreground disabled:opacity-50"
        >
          {standupStrings.blocker.raise()}
        </button>
      </div>
    </div>
  )
}
