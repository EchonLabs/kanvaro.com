/**
 * UI-12's redirect target, and the "also today" banner both need the exact
 * same organisation-wide query — a member can hold a sprint-team seat on more
 * than one project, and both can have a stand-up open on the same day. This
 * used to live only inside the redirector page and silently discarded every
 * candidate past the first; extracting it is what lets the destination screen
 * see the ones it used to drop.
 */
import { Project } from '@/models/Project'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'

export interface StandupCandidate {
  standupId: string
  status: string
  scheduledStartAt: string
  projectId: string
  projectName: string
  sprintId: string
  /** Empty string if the sprint record could not be found. */
  sprintName: string
}

const PRIORITY = ['In_Progress', 'Ready', 'Scheduled']

export async function findOpenStandupCandidates(input: {
  organizationId: string
  userId: string
}): Promise<StandupCandidate[]> {
  const rows = (await Standup.find({
    organization: input.organizationId,
    // A PM who facilitates a sprint's stand-up is often not on its team
    // (`expectedAttendees` mirrors `sprint.teamMembers`), and was otherwise
    // left with the empty state. They are routed to the run screen instead of
    // the member view — see `MyStandupDetailPage`.
    $or: [{ expectedAttendees: input.userId }, { facilitator: input.userId }],
    status: { $in: PRIORITY }
  })
    .select('status scheduledStartAt project sprint')
    .sort({ scheduledStartAt: 1 })
    .lean()) as any[]

  if (rows.length === 0) return []

  const projectIds = Array.from(new Set(rows.map((row) => String(row.project))))
  const projects = (await Project.find({ _id: { $in: projectIds } })
    .select('name')
    .lean()) as any[]
  const projectNameById = new Map(projects.map((project) => [String(project._id), project.name]))

  // My Stand-up's relocated project/sprint filter (beside "Open full
  // stand-up") needs this to label each option; nothing read it before.
  const sprintIds = Array.from(new Set(rows.map((row) => String(row.sprint))))
  const sprints = (await Sprint.find({ _id: { $in: sprintIds } })
    .select('name')
    .lean()) as any[]
  const sprintNameById = new Map(sprints.map((sprint) => [String(sprint._id), sprint.name]))

  // A stand-up outlives a deleted project. Nobody can open it — the project
  // permission check has nothing to resolve against and answers 403 — and an
  // In_Progress one outranks every live stand-up in PRIORITY, so the
  // redirector would land every attendee on that dead end every day. (A
  // missing sprint is tolerated: the project still resolves.)
  const live = rows.filter((row) => projectNameById.has(String(row.project)))

  const byPriorityThenTime = [...live].sort((a, b) => {
    const priorityDiff = PRIORITY.indexOf(a.status) - PRIORITY.indexOf(b.status)
    if (priorityDiff !== 0) return priorityDiff
    return new Date(a.scheduledStartAt).getTime() - new Date(b.scheduledStartAt).getTime()
  })

  return byPriorityThenTime.map((row) => ({
    standupId: String(row._id),
    status: row.status,
    scheduledStartAt: new Date(row.scheduledStartAt).toISOString(),
    projectId: String(row.project),
    projectName: projectNameById.get(String(row.project)) ?? '',
    sprintId: String(row.sprint),
    sprintName: sprintNameById.get(String(row.sprint)) ?? ''
  }))
}
