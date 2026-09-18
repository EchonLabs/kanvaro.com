/**
 * Canonical assignable-task/member shapes shared by the split-screen
 * task-assignment redesign (Tasks 6-8).
 *
 * Two existing drag-and-drop surfaces disagree on shape: the planning
 * screen's `ScopeTask`/`AssignableMember` (`../planning/types`) carries
 * estimate + capacity numbers but no priority/skills; the run screen's
 * `PoolTask`/`BoardMemberView` (`@/lib/standup/allocation`,
 * `../run/CapacityBoard`) carries priority/type/labels and a full
 * `CapacityBreakdown` but no avatar/role. `AssignableTaskView` and
 * `AssignableMemberView` are the one shape both contexts adapt into, with
 * the richer fields optional so a context that lacks them simply omits
 * them rather than faking a value.
 *
 * Pure types and adapter functions only — no JSX/React, no rendering. Not
 * wired into any component yet.
 */
import type { CapacityBreakdown } from '@/lib/standup/capacity'
import type { PoolTask } from '@/lib/standup/allocation'

import type { AssignableMember, ScopeTask } from '../planning/types'
import { assigneeIdOf } from '../planning/types'
import type { BoardAllocationView, BoardMemberView } from '../run/CapacityBoard'

export interface AssignableTaskView {
  id: string
  displayId?: string
  title: string
  priority?: 'critical' | 'high' | 'medium' | 'low'
  estimateMinutes?: number
  /** Stand-in: `PoolTask.labels` where available; omitted for planning-context tasks. */
  skills?: string[]
  assigneeId?: string | null
}

export interface AssignableMemberView {
  id: string
  name: string
  role?: string | null
  avatarUrl?: string
  assignedMinutes?: number
  capacityMinutes?: number
  capacityBreakdown?: CapacityBreakdown
  tasks: AssignableTaskView[]
}

/** Adapts a planning-screen scope task. Priority and skills have no source here. */
export function fromScopeTask(t: ScopeTask): AssignableTaskView {
  const estimateMinutes =
    t.originalEstimateMinutes ??
    (t.estimatedHours !== undefined ? t.estimatedHours * 60 : undefined)

  return {
    id: t._id,
    displayId: t.displayId,
    title: t.title,
    estimateMinutes,
    assigneeId: assigneeIdOf(t)
  }
}

/** Adapts a run-screen pool task. */
export function fromPoolTask(t: PoolTask): AssignableTaskView {
  return {
    id: t.taskId,
    displayId: t.key,
    title: t.title,
    priority: t.priority as AssignableTaskView['priority'],
    estimateMinutes: t.remainingEstimateMinutes,
    skills: t.labels.length > 0 ? t.labels : undefined,
    assigneeId: t.assigneeIds[0] ?? null
  }
}

/**
 * Adapts a planning-screen member. `tasks` is supplied already converted —
 * the caller derives which tasks belong to this member, mirroring
 * `AssignmentBoard.tsx`'s `byAssignee` grouping.
 */
export function fromAssignableMember(
  m: AssignableMember,
  tasks: AssignableTaskView[]
): AssignableMemberView {
  return {
    id: m.memberId,
    name: m.name,
    role: m.role,
    assignedMinutes: m.assignedMinutes,
    capacityMinutes: m.capacityMinutes,
    tasks
  }
}

/** Adapts a run-screen board member, including its capacity breakdown and allocations. */
export function fromBoardMemberView(m: BoardMemberView): AssignableMemberView {
  return {
    id: m.memberId,
    name: m.name,
    assignedMinutes: m.capacity.allocatedMinutes,
    capacityMinutes: m.capacity.effectiveMinutes,
    capacityBreakdown: m.capacity,
    tasks: m.allocations.map((allocation) => fromBoardAllocationView(allocation, m.memberId))
  }
}

/**
 * `BoardAllocationView` has no priority/labels, so this is a direct mapping
 * rather than a reuse of `fromPoolTask`. The allocation belongs to the
 * member it came from, so that member's id is the task's assignee here.
 */
function fromBoardAllocationView(
  allocation: BoardAllocationView,
  memberId: string
): AssignableTaskView {
  return {
    id: allocation.taskId,
    displayId: allocation.taskKey,
    title: allocation.title,
    estimateMinutes: allocation.remainingEstimateMinutes,
    assigneeId: memberId
  }
}
