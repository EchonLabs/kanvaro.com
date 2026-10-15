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

import { formatMinutesAsHours, type Minutes } from '@/lib/standup/minutes'
import { cn } from '@/lib/utils'

import { MovePicker, PlanTaskCard, planPillClass, type PlanPillTone } from '../planning/ui'

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
 * Most urgent reads as danger, least as neutral. Never colour alone: the chip
 * always carries the priority's name as text.
 */
const PRIORITY_TONE: Record<string, PlanPillTone> = {
  critical: 'danger',
  high: 'warning',
  medium: 'accent',
  low: 'neutral'
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
   * Options with a `group` are listed after the ungrouped ones, flattened into
   * `MovePicker`'s single QA optgroup — the group's own label is not used, and
   * `MovePicker` currently supports only that one group label. Planning uses
   * it for people who are not on the sprint team yet — picking them changes
   * the roster, so the picker says so instead of listing them beside everyone
   * else.
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
  // `AssignOption` carries { id, name }; MovePicker needs only an id and a name.
  const teamOptions = ungrouped.map((o) => ({ memberId: o.id, name: o.name }))
  const qaOptions = groups
    .flatMap((group) => group.options)
    .map((o) => ({ memberId: o.id, name: o.name }))

  return (
    <PlanTaskCard
      ref={setNodeRef}
      {...(draggable && !disabled ? { ...listeners, ...attributes } : {})}
      data-testid="task-card"
      data-drag-id={draggableId}
      style={{
        transform: transform ? CSS.Translate.toString(transform) : undefined,
        touchAction: draggable && !disabled ? 'none' : undefined
      }}
      taskKey={task.displayId}
      title={task.title}
      grip={draggable && !disabled}
      dragging={dragging}
      className={cn(
        'apple-transition',
        draggable && !disabled && 'cursor-grab',
        dragging && 'z-50 shadow-[0_8px_24px_rgba(0,0,0,0.18)]',
        className
      )}
      action={
        showPicker ? (
          <MovePicker
            task={{ _id: task.id, title: task.title }}
            value={task.assigneeId ?? null}
            teamOptions={teamOptions}
            qaOptions={qaOptions}
            busy={disabled}
            onChange={(memberId) => {
              if (memberId === (task.assigneeId ?? null)) return
              onAssignVia!(memberId)
            }}
          />
        ) : undefined
      }
      footer={
        task.priority || task.estimateMinutes !== undefined || task.skills?.length ? (
          <>
            {task.priority && (
              <span
                data-testid="task-priority"
                className={planPillClass(PRIORITY_TONE[task.priority] ?? 'neutral', 'capitalize')}
              >
                {task.priority}
              </span>
            )}
            {task.estimateMinutes !== undefined && (
              <span
                data-testid="task-estimate"
                className="apple-type-caption tabular-nums text-[var(--plan-muted)]"
              >
                {formatMinutesAsHours(task.estimateMinutes as Minutes, { locale })}
              </span>
            )}
            {task.skills && task.skills.length > 0 && (
              <ul
                data-testid="task-skills"
                className="flex flex-wrap gap-1"
                aria-label="Required skills"
              >
                {task.skills.map((skill) => (
                  <li key={skill}>
                    <span className={planPillClass('neutral')}>{skill}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null
      }
    />
  )
}
