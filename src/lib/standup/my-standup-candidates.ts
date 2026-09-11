/**
 * UI-12's redirect target, and the "also today" banner both need the exact
 * same organisation-wide query — a member can hold a sprint-team seat on more
 * than one project, and both can have a stand-up open on the same day. This
 * used to live only inside the redirector page and silently discarded every
 * candidate past the first; extracting it is what lets the destination screen
 * see the ones it used to drop.
 */
import { Project } from '@/models/Project'
import { Standup } from '@/models/Standup'

export interface StandupCandidate {
  standupId: string
  status: string
  scheduledStartAt: string
  projectId: string
  projectName: string
}

const PRIORITY = ['In_Progress', 'Ready', 'Scheduled']

export async function findOpenStandupCandidates(input: {
  organizationId: string
  userId: string
}): Promise<StandupCandidate[]> {
  const rows = (await Standup.find({
    organization: input.organizationId,
    expectedAttendees: input.userId,
    status: { $in: PRIORITY }
  })
    .select('status scheduledStartAt project')
    .sort({ scheduledStartAt: 1 })
    .lean()) as any[]

  if (rows.length === 0) return []

  const projectIds = Array.from(new Set(rows.map((row) => String(row.project))))
  const projects = (await Project.find({ _id: { $in: projectIds } })
    .select('name')
    .lean()) as any[]
  const projectNameById = new Map(projects.map((project) => [String(project._id), project.name]))

  const byPriorityThenTime = [...rows].sort((a, b) => {
    const priorityDiff = PRIORITY.indexOf(a.status) - PRIORITY.indexOf(b.status)
    if (priorityDiff !== 0) return priorityDiff
    return new Date(a.scheduledStartAt).getTime() - new Date(b.scheduledStartAt).getTime()
  })

  return byPriorityThenTime.map((row) => ({
    standupId: String(row._id),
    status: row.status,
    scheduledStartAt: new Date(row.scheduledStartAt).toISOString(),
    projectId: String(row.project),
    projectName: projectNameById.get(String(row.project)) ?? ''
  }))
}
