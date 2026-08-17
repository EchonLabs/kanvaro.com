'use client'

/**
 * The live planning checklist (spec §15.5, UI-4, UI-5, PLN-6/7).
 *
 * Two requirements shape this component and neither is cosmetic:
 *
 * **UI-4** — the checklist is live. Fixing a task updates it with no page
 * refresh, so the PM can work the list top to bottom instead of reloading.
 *
 * **UI-5** — each failing mandatory item expands into the *specific* offending
 * tasks, each with an inline fix control. "3 tasks have no estimate" without
 * saying which three is exactly the hunting the spec exists to eliminate, so a
 * failing row that cannot expand is a bug, not a styling choice.
 */
import { useState } from 'react'
import { AlertTriangle, Check, ChevronRight, Loader2, X } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'

export interface ChecklistItemView {
  checkId: string
  kind: 'mandatory' | 'advisory'
  passed: boolean
  message?: string
  offendingIds?: string[]
}

export interface OffendingTask {
  id: string
  key: string
  title: string
  type?: string
  priority?: string
  originalEstimateMinutes?: number
  hasDescription: boolean
}

export interface OffendingMember {
  id: string
  name: string
}

interface Props {
  items: ChecklistItemView[]
  offendingTasks: OffendingTask[]
  offendingMembers: OffendingMember[]
  acknowledged: string[]
  onAcknowledge: (checkId: string, next: boolean) => void
  /** Sets an estimate inline (PC-3). Resolves when the checklist has refreshed. */
  onEstimateTask: (taskId: string, hours: number) => Promise<void>
  /** Opens the task for the fixes an inline control cannot do (PC-4, PC-5). */
  onOpenTask: (taskId: string) => void
  busy?: boolean
}

/** Human labels; the spec's own message carries the detail. */
const CHECK_LABELS: Record<string, string> = {
  'PC-1': 'Sprint goal set',
  'PC-2': 'Sprint has tasks',
  'PC-3': 'Every task estimated',
  'PC-4': 'Every task says what done means',
  'PC-5': 'Type and priority set',
  'PC-6': 'Team assigned',
  'PC-7': 'Sprint has working days',
  'PA-1': 'Scope within capacity',
  'PA-2': 'Scope uses the team',
  'PA-3': 'Tasks fit inside a day',
  'PA-4': 'Estimates were voted on',
  'PA-5': 'Nobody over-committed',
  'PA-6': 'Everybody has work'
}

export function PlanningChecklist({
  items,
  offendingTasks,
  offendingMembers,
  acknowledged,
  onAcknowledge,
  onEstimateTask,
  onOpenTask,
  busy
}: Props) {
  const mandatory = items.filter((item) => item.kind === 'mandatory')
  const advisory = items.filter((item) => item.kind === 'advisory')

  return (
    <div className="space-y-5" aria-busy={busy}>
      <Section
        title="Must pass"
        description="Planning cannot complete while any of these fails."
        items={mandatory}
        offendingTasks={offendingTasks}
        offendingMembers={offendingMembers}
        onEstimateTask={onEstimateTask}
        onOpenTask={onOpenTask}
      />

      <Section
        title="Worth knowing"
        description="These never block. Tick to confirm you have seen them."
        items={advisory}
        offendingTasks={offendingTasks}
        offendingMembers={offendingMembers}
        acknowledged={acknowledged}
        onAcknowledge={onAcknowledge}
        onEstimateTask={onEstimateTask}
        onOpenTask={onOpenTask}
      />
    </div>
  )
}

function Section({
  title,
  description,
  items,
  offendingTasks,
  offendingMembers,
  acknowledged,
  onAcknowledge,
  onEstimateTask,
  onOpenTask
}: {
  title: string
  description: string
  items: ChecklistItemView[]
  offendingTasks: OffendingTask[]
  offendingMembers: OffendingMember[]
  acknowledged?: string[]
  onAcknowledge?: (checkId: string, next: boolean) => void
  onEstimateTask: (taskId: string, hours: number) => Promise<void>
  onOpenTask: (taskId: string) => void
}) {
  if (items.length === 0) return null

  return (
    <section className="space-y-2">
      <div>
        <h3 className="apple-section-label text-[var(--apple-secondary-label)]">{title}</h3>
        <p className="text-[12px] text-[var(--apple-tertiary-label)]">{description}</p>
      </div>

      <ul className="divide-y divide-[var(--apple-separator)] overflow-hidden rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)]">
        {items.map((item) => (
          <ChecklistRow
            key={item.checkId}
            item={item}
            offendingTasks={offendingTasks}
            offendingMembers={offendingMembers}
            acknowledged={acknowledged?.includes(item.checkId)}
            onAcknowledge={onAcknowledge}
            onEstimateTask={onEstimateTask}
            onOpenTask={onOpenTask}
          />
        ))}
      </ul>
    </section>
  )
}

function ChecklistRow({
  item,
  offendingTasks,
  offendingMembers,
  acknowledged,
  onAcknowledge,
  onEstimateTask,
  onOpenTask
}: {
  item: ChecklistItemView
  offendingTasks: OffendingTask[]
  offendingMembers: OffendingMember[]
  acknowledged?: boolean
  onAcknowledge?: (checkId: string, next: boolean) => void
  onEstimateTask: (taskId: string, hours: number) => Promise<void>
  onOpenTask: (taskId: string) => void
}) {
  // Failing rows start open. The PM opened this screen to fix things, and a
  // collapsed failure is one more click between them and the problem.
  const [expanded, setExpanded] = useState(!item.passed)

  const tasks = offendingTasks.filter((task) => item.offendingIds?.includes(task.id))
  const members = offendingMembers.filter((member) => item.offendingIds?.includes(member.id))
  const canExpand = tasks.length > 0 || members.length > 0

  return (
    <li className={cn('bg-card', !item.passed && 'bg-[var(--apple-system-orange)]/[0.03]')}>
      <div className="flex items-start gap-3 p-3">
        <StatusIcon passed={item.passed} kind={item.kind} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-apple-mono text-[11px]">
              {item.checkId}
            </Badge>
            <span className="text-[13px] font-medium text-[var(--apple-label)]">
              {CHECK_LABELS[item.checkId] ?? item.checkId}
            </span>
          </div>

          {item.message && (
            <p className="mt-1 text-[13px] text-[var(--apple-secondary-label)]">{item.message}</p>
          )}

          {canExpand && expanded && (
            <div className="mt-2.5 space-y-1.5">
              {tasks.map((task) => (
                <OffendingTaskRow
                  key={task.id}
                  task={task}
                  checkId={item.checkId}
                  onEstimateTask={onEstimateTask}
                  onOpenTask={onOpenTask}
                />
              ))}
              {members.map((member) => (
                <div
                  key={member.id}
                  className="rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] px-2.5 py-1.5 text-[13px] text-[var(--apple-label)]"
                >
                  {member.name}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {canExpand && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((current) => !current)}
              aria-expanded={expanded}
            >
              <ChevronRight
                className={cn('h-4 w-4 apple-transition', expanded && 'rotate-90')}
              />
              <span className="sr-only">
                {expanded ? 'Hide' : 'Show'} the items failing {item.checkId}
              </span>
            </Button>
          )}

          {/* PLN-7 — an advisory needs an explicit tick, never a silent pass. */}
          {item.kind === 'advisory' && !item.passed && onAcknowledge && (
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[var(--apple-secondary-label)]">
              <Checkbox
                checked={!!acknowledged}
                onCheckedChange={(checked) => onAcknowledge(item.checkId, checked === true)}
              />
              Seen
            </label>
          )}
        </div>
      </div>
    </li>
  )
}

/**
 * One offending task with the fix that check actually needs (UI-5).
 *
 * PC-3 gets an inline estimate field, because that is a single number and
 * bouncing to the task screen for it would be absurd. PC-4 and PC-5 need real
 * editing, so they link out rather than pretending a one-field control is
 * enough.
 */
function OffendingTaskRow({
  task,
  checkId,
  onEstimateTask,
  onOpenTask
}: {
  task: OffendingTask
  checkId: string
  onEstimateTask: (taskId: string, hours: number) => Promise<void>
  onOpenTask: (taskId: string) => void
}) {
  const [hours, setHours] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const value = Number(hours)
  const valid = hours !== '' && Number.isFinite(value) && value > 0

  const save = async () => {
    if (!valid) return
    setSaving(true)
    setError(null)
    try {
      await onEstimateTask(task.id, value)
      setHours('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the estimate')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-card px-2.5 py-1.5">
      <button
        type="button"
        onClick={() => onOpenTask(task.id)}
        className="font-apple-mono text-[12px] text-[var(--apple-system-blue)] hover:underline"
      >
        {task.key}
      </button>
      <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--apple-label)]">
        {task.title}
      </span>

      {checkId === 'PC-3' ? (
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            min="0.25"
            step="0.25"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') save()
            }}
            placeholder="hours"
            aria-label={`Estimate for ${task.key} in hours`}
            className="h-7 w-[86px] text-[13px]"
          />
          <Button size="sm" onClick={save} disabled={!valid || saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Set'}
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => onOpenTask(task.id)}>
          Fix
        </Button>
      )}

      {error && (
        <p className="w-full text-[12px] text-[var(--apple-system-red)]" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * NFR-A1 in spirit: state is carried by an icon and a label, never by colour
 * alone. A failing mandatory check and a failing advisory are different things
 * and must not look identical in greyscale.
 */
function StatusIcon({ passed, kind }: { passed: boolean; kind: 'mandatory' | 'advisory' }) {
  if (passed) {
    return (
      <span
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--apple-system-green)]/15"
        aria-label="Passed"
      >
        <Check className="h-3 w-3 text-[var(--apple-system-green)]" />
      </span>
    )
  }

  if (kind === 'advisory') {
    return (
      <AlertTriangle
        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--apple-system-orange)]"
        aria-label="Warning"
      />
    )
  }

  return (
    <span
      className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--apple-system-red)]/15"
      aria-label="Blocking"
    >
      <X className="h-3 w-3 text-[var(--apple-system-red)]" />
    </span>
  )
}
