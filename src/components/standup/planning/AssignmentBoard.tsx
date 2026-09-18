'use client'

/**
 * Step 2 of planning: give every sprint task exactly one owner (PC-8).
 *
 * This is where the double assignment stops. Ownership used to be guessed at
 * task creation and then decided again on the day-one stand-up board; it is
 * settled here instead, with each member's load against their own sprint
 * capacity visible while the PM does it.
 *
 * The layout itself is no longer this file's business. The lanes/chips grid it
 * used to own became `TaskAssignmentSplitScreen` (Task 6), shared with the
 * stand-up run, so what is left here is the planning-specific part: the
 * `ScopeTask`/`AssignableMember` → canonical-view conversion, the "still needs
 * an assignee" gate line, and the one affordance the run screen has no
 * equivalent of — a QA who is not on the sprint team yet can be picked, and
 * the picker says that choosing them admits them to it.
 *
 * Two equal ways to assign, not one and a fallback: dragging a task onto a
 * member card, and the per-card picker. The picker is not a courtesy — this
 * screen is a hard gate on starting the sprint, and a gate that can only be
 * passed with a mouse is a gate some people cannot pass.
 *
 * Confirmation toasts are deliberately not raised here: `PlanningWorkspace`'s
 * `assignTask` already notifies on success and failure, and it is the layer
 * that knows whether the server admitted anyone to the sprint team.
 */
import { useMemo } from 'react'

import {
  fromAssignableMember,
  fromScopeTask,
  type AssignableMemberView,
  type AssignableTaskView
} from '../shared/AssignableTask'
import { TaskAssignmentSplitScreen } from '../shared/TaskAssignmentSplitScreen'
import type { AssignOption } from '../shared/TaskCard'
import { cn } from '@/lib/utils'

import {
  assigneeIdOf,
  isQaRole,
  type AssignableMember,
  type ScopeTask
} from './types'

const UNASSIGNED_LANE = 'unassigned'

/** Says out loud that picking one of these people changes the sprint roster. */
const QA_GROUP_LABEL = 'QA — will be added to the sprint team'

export interface AssignmentBoardProps {
  tasks: ScopeTask[]
  members: AssignableMember[]
  busy: boolean
  /** `null` clears the assignment. Resolves once the server has agreed. */
  onAssign: (taskId: string, assigneeId: string | null, member?: AssignableMember) => Promise<void>
}

/**
 * Resolves a drag to the lane it landed on.
 *
 * Pure and exported for the same reason `resolveDrop` is: the mapping from a
 * drop target to an assignee is the part worth testing, and it needs no DOM.
 */
export function resolveAssignmentDrop(
  overId: string,
  currentAssigneeId: string | null
): { assigneeId: string | null } | null {
  const target = overId === UNASSIGNED_LANE ? null : overId
  // Dropping a task back where it already was is not a change, and firing a
  // request for it would notify the assignee that they had been assigned work
  // they already had.
  if (target === currentAssigneeId) return null
  return { assigneeId: target }
}

export function AssignmentBoard({ tasks, members, busy, onAssign }: AssignmentBoardProps) {
  // The canonical view of the same data the lanes used to group by hand. A
  // task whose assignee is not on the board is parked as unassigned: PC-8
  // blocks on it either way, and hiding it in a lane nobody can see would
  // leave the PM with a blocking check and no row to fix it on.
  //
  // Deliberate divergence from the stand-up-run context: `taskViews` below is
  // built from *every* scope task, assigned ones included, so the left-hand
  // Task Repository lists the whole sprint scope. The run screen's
  // `UnassignedPool` instead feeds the left panel only genuinely unassigned /
  // not-yet-planned tasks. The reason is that planning is where assignments
  // are *made and changed*: an already-assigned task has to stay draggable so
  // the PM can move it to someone else, and a task that vanished from the left
  // panel the moment it was assigned could never be reassigned by drag. The
  // visible consequence — an assigned task appearing both in the left panel
  // and inside its assignee's expanded member card at the same time — is
  // intended, not a duplication bug. Do not "align" this with UnassignedPool
  // in either direction without replacing the reassignment affordance first.
  const { taskViews, memberViews, unassignedCount } = useMemo(() => {
    const byAssignee = new Map<string, AssignableTaskView[]>()
    for (const member of members) byAssignee.set(member.memberId, [])

    const views: AssignableTaskView[] = []
    let unassigned = 0

    for (const task of tasks) {
      const view = fromScopeTask(task)
      const assigneeId = view.assigneeId
      const lane = assigneeId && byAssignee.has(assigneeId) ? assigneeId : null
      if (lane === null) {
        unassigned += 1
        // The picker's value has to match an option it actually offers, or the
        // browser shows the first one instead and the row lies about its state.
        views.push({ ...view, assigneeId: null })
      } else {
        byAssignee.get(lane)!.push(view)
        views.push(view)
      }
    }

    return {
      taskViews: views,
      memberViews: members.map<AssignableMemberView>((member) =>
        fromAssignableMember(member, byAssignee.get(member.memberId) ?? [])
      ),
      unassignedCount: unassigned
    }
  }, [tasks, members])

  // Everyone already on the sprint team, then the QA who are not: assigning to
  // one of those admits them, so they are offered under a label that says so
  // rather than sitting anonymously in the same list. Anybody else off the
  // team is a drop target but not a picker option, exactly as before.
  const assignOptions = useMemo<AssignOption[]>(
    () => [
      ...members
        .filter((member) => member.onSprintTeam)
        .map((member) => ({ id: member.memberId, name: member.name })),
      ...members
        .filter((member) => !member.onSprintTeam && isQaRole(member.role))
        .map((member) => ({
          id: member.memberId,
          name: member.name,
          group: QA_GROUP_LABEL
        }))
    ],
    [members]
  )

  /**
   * The split screen speaks `(taskId, memberId | null)`; this board's contract
   * adds the member object, which is what makes the workspace send
   * `addToSprintTeam` — an assignee missing from `Sprint.teamMembers` would
   * have their minutes vanish from every capacity figure on this screen.
   *
   * The no-op guard that `resolveAssignmentDrop` enforces for drags lives in
   * `resolveMemberDrop`/`TaskCard` for this path, and both are checked again
   * here against the task's real assignee, so a task parked as unassigned
   * because its owner left the board can still be reassigned to that owner.
   */
  const handleAssign = async (taskId: string, memberId: string | null) => {
    const task = tasks.find((candidate) => candidate._id === taskId)
    if (!task) return

    const action = resolveAssignmentDrop(memberId ?? UNASSIGNED_LANE, assigneeIdOf(task))
    if (!action) return

    await onAssign(
      taskId,
      action.assigneeId,
      members.find((member) => member.memberId === action.assigneeId)
    )
  }

  return (
    <section
      className="space-y-3 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none"
      aria-label="Task assignment"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="apple-section-label text-[var(--apple-secondary-label)]">
          Assign the work
        </h3>
        <p
          role="status"
          className={cn(
            'text-[12px]',
            unassignedCount > 0
              ? 'text-[var(--apple-system-orange)]'
              : 'text-[var(--apple-secondary-label)]'
          )}
        >
          {unassignedCount > 0
            ? `${unassignedCount} ${unassignedCount === 1 ? 'task still needs' : 'tasks still need'} an assignee`
            : 'Every task has an owner.'}
        </p>
      </div>

      <TaskAssignmentSplitScreen
        tasks={taskViews}
        members={memberViews}
        busy={busy}
        assignOptions={assignOptions}
        onAssign={handleAssign}
      />
    </section>
  )
}
