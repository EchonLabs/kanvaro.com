'use client'

/**
 * One assignable task, as the split-screen's left panel shows it (Task 6).
 *
 * Shared by both drag-and-drop surfaces — sprint planning and the stand-up
 * run — through `AssignableTaskView`, so it renders only what that shape
 * guarantees and omits the rest rather than printing an empty label. A
 * planning-context task has no priority and no skills; a run-context one has
 * both. Neither leaves a hole on the card.
 *
 * Two ways to assign, not one and a fallback — the same rule `AssignmentBoard`
 * already follows. Dragging is the fast path; the per-card picker is the one
 * that works without a pointer, and both hand the caller the identical
 * `(memberId | null)`.
 *
 * Sprint information is deliberately absent: both contexts operate inside one
 * sprint, so it is stated once in the split-screen header rather than repeated
 * on every row.
 */
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { formatMinutesAsHours, type Minutes } from '@/lib/standup/minutes'
import { cn } from '@/lib/utils'

import type { AssignableTaskView } from './AssignableTask'

/** The dnd-kit draggable id for a task. Kept next to the parser that reads it back. */
export function taskDraggableId(taskId: string): string {
  return `task-${taskId}`
}

/** Inverse of `taskDraggableId`. Null when the id did not come from a task card. */
export function taskIdFromDraggableId(draggableId: string): string | null {
  return draggableId.startsWith('task-') ? draggableId.slice('task-'.length) : null
}

/**
 * The id for a *read-only* copy of a task — the rows `ExpandableMemberCard`
 * shows for work a member already holds.
 *
 * These still call `useDraggable` (hooks cannot be conditional) and dnd-kit's
 * `disabled` option does not unregister the node from `DndContext`'s
 * id-keyed registry. So a task that is both in the left panel and inside an
 * expanded member card would register the same id twice, and the second mount
 * would overwrite the first's node ref — corrupting the real card's drag rect.
 * A separate namespace keeps the two apart; it deliberately does not start
 * with `task-`, so `taskIdFromDraggableId` rejects it and no drop can ever
 * resolve through one of these rows.
 */
export function readOnlyTaskDraggableId(scopeId: string, taskId: string): string {
  return `readonly-${scopeId}-${taskId}`
}

/**
 * Apple-theme tones for priority.
 *
 * The brief pointed at `UnassignedPool`'s `PoolCard` for an existing mapping,
 * but that card renders priority as plain secondary-label text with no colour
 * at all, and the only coloured mapping in the codebase (`KanbanBoard`'s
 * `getPriorityColor`) is raw Tailwind palette classes that predate the Apple
 * tokens. So this follows `CapacityMeter`'s `TONE` convention instead — the
 * established way this module expresses severity — rather than importing a
 * non-theme palette into the redesign.
 *
 * Colour is never the only carrier: the word itself is the badge's content.
 */
const PRIORITY_BADGE: Record<NonNullable<AssignableTaskView['priority']>, string> = {
  critical: 'bg-[var(--apple-system-red)]/15 text-[var(--apple-system-red)]',
  high: 'bg-[var(--apple-system-orange)]/15 text-[var(--apple-system-orange)]',
  medium: 'bg-[var(--apple-system-blue)]/15 text-[var(--apple-system-blue)]',
  low: 'bg-[var(--apple-secondary-fill)] text-[var(--apple-secondary-label)]'
}

export interface AssignOption {
  id: string
  name: string
  /** Renders this option inside an `<optgroup>` carrying this label. */
  group?: string
}

/** Ungrouped options first, then one `<optgroup>` per label, in first-seen order. */
function groupAssignOptions(
  options: AssignOption[]
): { ungrouped: AssignOption[]; groups: Array<{ label: string; options: AssignOption[] }> } {
  const ungrouped: AssignOption[] = []
  const groups: Array<{ label: string; options: AssignOption[] }> = []

  for (const option of options) {
    if (!option.group) {
      ungrouped.push(option)
      continue
    }
    const existing = groups.find((group) => group.label === option.group)
    if (existing) existing.options.push(option)
    else groups.push({ label: option.group, options: [option] })
  }

  return { ungrouped, groups }
}

export interface TaskCardProps {
  task: AssignableTaskView
  /** Forces the dragged-ghost treatment — set by `DragOverlay` clones. */
  isDragging?: boolean
  /** The keyboard equivalent of a drop. `null` clears the assignment. */
  onAssignVia?: (memberId: string | null) => void
  /**
   * An option with a `group` is rendered inside an `<optgroup>` of that label,
   * after the ungrouped ones. Planning uses it for people who are not on the
   * sprint team yet — picking them changes the roster, so the picker says so
   * instead of listing them beside everyone else.
   */
  assignOptions?: AssignOption[]
  /**
   * False turns the card into a read-only row: no grip, no drag listeners.
   * `ExpandableMemberCard` uses it for the tasks a member already owns —
   * those are shown, not re-dragged from inside the card they landed in.
   */
  draggable?: boolean
  /**
   * Overrides the dnd-kit draggable id. Callers that render a second copy of
   * a task already shown elsewhere (`ExpandableMemberCard`) must pass a
   * namespaced id — see `readOnlyTaskDraggableId` for why.
   */
  dragId?: string
  /** Tighter row used inside an expanded member card. */
  compact?: boolean
  disabled?: boolean
  locale?: string
  className?: string
}

export function TaskCard({
  task,
  isDragging = false,
  onAssignVia,
  assignOptions,
  draggable = true,
  dragId,
  compact = false,
  disabled = false,
  locale,
  className
}: TaskCardProps) {
  const draggableId = dragId ?? taskDraggableId(task.id)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging: dragActive
  } = useDraggable({
    id: draggableId,
    data: { task },
    disabled: !draggable || disabled
  })

  const dragging = isDragging || dragActive
  const showPicker = Boolean(onAssignVia && assignOptions && assignOptions.length > 0)
  const { ungrouped, groups } = groupAssignOptions(assignOptions ?? [])

  return (
    <div
      ref={setNodeRef}
      data-testid="task-card"
      data-drag-id={draggableId}
      style={{
        transform: transform ? CSS.Translate.toString(transform) : undefined,
        touchAction: draggable ? 'none' : undefined
      }}
      className={cn(
        'apple-transition group flex items-start gap-2 rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-background text-[13px]',
        compact ? 'p-2' : 'p-2.5',
        draggable &&
          !disabled &&
          'hover:border-[var(--apple-system-blue)]/40 hover:shadow-[0_1px_4px_rgba(0,0,0,0.06)]',
        dragging && 'z-50 opacity-50 shadow-[0_8px_24px_rgba(0,0,0,0.18)]',
        className
      )}
    >
      {draggable && (
        <span
          {...listeners}
          {...attributes}
          className={cn(
            'mt-0.5 shrink-0',
            disabled ? 'cursor-default' : 'cursor-grab'
          )}
        >
          <GripVertical
            className="h-3.5 w-3.5 text-[var(--apple-tertiary-label)] opacity-0 group-hover:opacity-100"
            aria-hidden="true"
          />
        </span>
      )}

      <div className="min-w-0 flex-1">
        {/* Key and title stay separate elements so each is independently
            queryable — a single text node containing both matches neither. */}
        <p className="truncate text-[var(--apple-label)]" title={task.title}>
          {task.displayId && (
            <span className="font-apple-mono text-[11px] text-[var(--apple-tertiary-label)]">
              {task.displayId}{' '}
            </span>
          )}
          <span>{task.title}</span>
        </p>

        {(task.priority || task.estimateMinutes !== undefined) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {task.priority && (
              <Badge
                data-testid="task-priority"
                className={cn('capitalize', PRIORITY_BADGE[task.priority])}
              >
                {task.priority}
              </Badge>
            )}
            {task.estimateMinutes !== undefined && (
              <span
                data-testid="task-estimate"
                className="font-apple-mono text-[11px] tabular-nums text-[var(--apple-secondary-label)]"
              >
                {formatMinutesAsHours(task.estimateMinutes as Minutes, { locale })}
              </span>
            )}
          </div>
        )}

        {task.skills && task.skills.length > 0 && (
          <ul
            data-testid="task-skills"
            className="mt-1 flex flex-wrap gap-1"
            aria-label="Required skills"
          >
            {task.skills.map((skill) => (
              <li key={skill}>
                <Badge variant="outline" className="px-2 py-0 text-[10.5px]">
                  {skill}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* The keyboard path to the same result as a drag, matching
          `AssignmentBoard`'s per-row picker. */}
      {showPicker && (
        <>
          <label className="sr-only" htmlFor={`assign-${task.id}`}>
            Assign {task.title} to
          </label>
          <select
            id={`assign-${task.id}`}
            disabled={disabled}
            value={task.assigneeId ?? ''}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => {
              const next = event.target.value || null
              if (next === (task.assigneeId ?? null)) return
              onAssignVia!(next)
            }}
            className="h-7 max-w-[8rem] shrink-0 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-transparent px-1.5 text-[11px] text-[var(--apple-label)]"
          >
            <option value="">Unassigned</option>
            {ungrouped.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
            {groups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </>
      )}
    </div>
  )
}

/** The ghost rendered inside `DragOverlay` while a card is in flight. */
export function TaskCardPreview({
  task,
  locale
}: {
  task: AssignableTaskView
  locale?: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-[var(--apple-radius-md)] border border-[var(--apple-system-blue)]/40 bg-card px-2.5 py-2 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.22)]">
      <GripVertical
        className="h-3.5 w-3.5 shrink-0 text-[var(--apple-system-blue)]"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="truncate text-[var(--apple-label)]">
          {task.displayId && (
            <span className="font-apple-mono text-[11px] text-[var(--apple-tertiary-label)]">
              {task.displayId}{' '}
            </span>
          )}
          <span>{task.title}</span>
        </p>
        {task.estimateMinutes !== undefined && (
          <span className="font-apple-mono text-[11px] tabular-nums text-[var(--apple-secondary-label)]">
            {formatMinutesAsHours(task.estimateMinutes as Minutes, { locale })}
          </span>
        )}
      </div>
    </div>
  )
}
