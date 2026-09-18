/**
 * Shared shapes for the planning screen.
 *
 * In their own module rather than exported from `PlanningWorkspace`, so the
 * step components can import them without importing the 1000-line workspace
 * that renders them.
 */

/** A task in the sprint's scope, as `GET /api/tasks?sprint=…` returns it. */
export interface ScopeTask {
  _id: string
  displayId?: string
  title: string
  originalEstimateMinutes?: number
  estimatedHours?: number
  estimateMethod?: 'poker' | 'manual' | null
  /** DAT-6. Set means a previous planning round froze this estimate. */
  estimateLockedAt?: string | null
  assignedTo?: Array<{
    user?:
      | string
      | { _id?: string; firstName?: string; lastName?: string; email?: string }
  }>
}

/** Somebody a sprint task can be assigned to. */
export interface AssignableMember {
  memberId: string
  name: string
  /** Already on `Sprint.teamMembers`, so no roster change is needed. */
  onSprintTeam: boolean
  /** Project role, used to group QA separately in the picker. */
  role?: string | null
  assignedMinutes?: number
  capacityMinutes?: number
}

const QA_ROLES = ['project_qa_lead', 'project_tester']

export function isQaRole(role?: string | null): boolean {
  return !!role && QA_ROLES.includes(role)
}

/** The single assignee id on a task, in whichever shape the API returned. */
export function assigneeIdOf(task: ScopeTask): string | null {
  const entry = task.assignedTo?.[0]?.user
  if (!entry) return null
  if (typeof entry === 'string') return entry
  return entry._id ?? null
}

/** Display names for everyone a task is assigned to. */
export function assigneeNamesOf(task?: ScopeTask): string[] {
  return (task?.assignedTo ?? [])
    .map((entry) => entry?.user)
    .filter(Boolean)
    .map((user) => {
      if (typeof user === 'string') return ''
      return [user!.firstName, user!.lastName].filter(Boolean).join(' ') || user!.email || ''
    })
    .filter(Boolean) as string[]
}

/** Tasks still needing a poker round: not frozen, and not already covered. */
export function unpokeredTasks(
  scope: ScopeTask[],
  pokerCoveredIds: Set<string>
): ScopeTask[] {
  return scope.filter((task) => !task.estimateLockedAt && !pokerCoveredIds.has(task._id))
}
