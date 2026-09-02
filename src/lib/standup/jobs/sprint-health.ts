/**
 * §18.1 `standup:sprint-health` — CC-11 / N12.
 *
 * Runs on each completion and daily. `checkSprintHealth` is the per-sprint unit
 * of work — the completion saga (Task 14) calls it directly for one sprint the
 * moment its stand-up completes; `runSprintHealthJob` is the daily sweep
 * registered against the scheduler, which just calls it for every active
 * sprint in turn.
 *
 * Emits N12 once per sprint per detection, not once per stand-up — a sprint
 * whose scope already exceeds capacity does not need to be told again every
 * single day. `sendStandupNotificationOnce`'s ledger lives on a stand-up
 * document, so this job anchors the claim to the sprint's current live
 * stand-up (falling back to its most recent one), the same anchor a PM
 * actually looking at N12 would land on.
 *
 * `loadSprintHealthTotals` is a fresh aggregate, not a reuse. Nothing in
 * `capacity-context.ts`, `capacity.ts` or `debt-position.ts` computes a
 * sprint-wide remaining-capacity total — they all compute one stand-up's (or
 * one member's) capacity for one date. What *is* reused: `resolveWorkingDays`
 * (`calendar-service.ts`, CAL-1 — the only place remaining working days may be
 * counted), `selectCapacityAsOf` (`capacity.ts`, DAT-1 — the only place a
 * dated capacity row may be picked), and `resolveStatusSets` (`debt-position.ts`
 * — the same "which statuses count as done" resolution the debt classifier
 * uses, so a task open for capacity purposes is open for debt purposes too).
 * The remaining-capacity total below is
 * deliberately a simpler figure than `computeCapacity`'s per-day breakdown: it
 * is each member's current nominal `dailyCapacityMinutes` times the sprint's
 * remaining working days, without re-running leave, attendance or ceremony
 * deductions for every future day. CC-11/N12 is a soft, directional warning
 * ("scope now exceeds capacity"), not a hard check, so that approximation is
 * an intentional scope cut, not an oversight — a full projection would need to
 * re-derive attendance and leave for dates that have not happened yet, which
 * is a forecast, not a fact this job can safely assert.
 */
import { MemberCapacity } from '@/models/MemberCapacity'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { Task } from '@/models/Task'
import { Project } from '@/models/Project'
import { WorkingCalendar } from '@/models/WorkingCalendar'

import { resolveStatusSets } from '../debt-position'
import { selectCapacityAsOf } from '../capacity'
import { isoOfStoredDate, todayInTimezone } from '../calendar-dates'
import { resolveWorkingDays } from '../calendar-service'
import { minutes } from '../minutes'
import { computeSprintHealth, type SprintHealthInput } from '../sprint-health'
import { sendStandupNotificationOnce } from './notify'
import { emptyResult, type JobResult } from './result'

/** Stand-ups a sprint's N12 may anchor to, live ones preferred. */
const LIVE_STATUSES = ['Scheduled', 'Ready', 'In_Progress']

export interface SprintHealthOutcome {
  sent: number
  exceedsCapacity: boolean
}

/**
 * Checks one sprint and, if its remaining scope exceeds remaining capacity,
 * sends N12 (deduplicated per sprint via `sendStandupNotificationOnce`'s
 * ledger). Safe to call repeatedly — a completion saga invoking this on every
 * stand-up completion and the daily sweep below both land on the same
 * `variantKey`, so only the first detection ever sends.
 */
export async function checkSprintHealth(
  sprintId: string,
  now: Date = new Date()
): Promise<SprintHealthOutcome> {
  const sprint = (await Sprint.findById(sprintId)
    .select('project organization endDate')
    .lean()) as any
  if (!sprint) return { sent: 0, exceedsCapacity: false }

  const projectId = String(sprint.project)
  const organizationId = String(sprint.organization)

  const anchor = await loadAnchorStandup(sprintId)
  if (!anchor) return { sent: 0, exceedsCapacity: false }

  const totals = await loadSprintHealthTotals(sprint, now)
  const health = computeSprintHealth(totals)
  if (!health.exceedsCapacity) return { sent: 0, exceedsCapacity: false }

  const admins = await loadProjectAdmins(projectId)
  const recipients = Array.from(new Set([...admins, String(anchor.facilitator)].filter(Boolean)))
  if (recipients.length === 0) return { sent: 0, exceedsCapacity: true }

  const overageHours = (health.overageMinutes / 60).toFixed(1)

  const sent = await sendStandupNotificationOnce({
    standupId: String(anchor._id),
    projectId,
    organizationId,
    notificationId: 'N12',
    variantKey: `N12:${sprintId}`,
    recipientIds: recipients,
    title: 'Sprint scope now exceeds remaining capacity',
    message: `Remaining sprint scope exceeds remaining capacity by ${overageHours}h.`,
    url: `/standups/${String(anchor._id)}`,
    priority: 'high'
  })

  return { sent, exceedsCapacity: true }
}

/** The daily scheduler tick (§18.1): runs {@link checkSprintHealth} over every active sprint. */
export async function runSprintHealthJob(now: Date = new Date()): Promise<JobResult> {
  const result = emptyResult('sprint-health')

  const sprints = (await Sprint.find({ status: 'active' }).select('project').lean()) as any[]
  if (sprints.length === 0) return result

  result.scannedProjects = new Set(sprints.map((sprint) => String(sprint.project))).size

  for (const sprint of sprints) {
    const sprintId = String(sprint._id)
    const projectId = String(sprint.project)

    try {
      const outcome = await checkSprintHealth(sprintId, now)
      result.created += outcome.sent
      if (outcome.sent === 0) result.skipped += 1
    } catch (error) {
      result.errors.push({ projectId, message: (error as Error).message })
    }
  }

  return result
}

/**
 * The stand-up N12's ledger key anchors to: the sprint's earliest still-live
 * stand-up, or — once the sprint has none left running — its most recent one.
 * Either way it is a real document a PM completing this sprint would open.
 */
async function loadAnchorStandup(sprintId: string): Promise<any | null> {
  const live = (await Standup.findOne({ sprint: sprintId, status: { $in: LIVE_STATUSES } })
    .sort({ standupDate: 1 })
    .select('_id facilitator')
    .lean()) as any
  if (live) return live

  return (await Standup.findOne({ sprint: sprintId })
    .sort({ standupDate: -1 })
    .select('_id facilitator')
    .lean()) as any
}

/**
 * CC-11's two totals, assembled fresh (see the module docblock for why no
 * existing loader covers this).
 */
async function loadSprintHealthTotals(
  sprint: { _id: unknown; project: unknown; endDate: Date },
  now: Date
): Promise<SprintHealthInput> {
  const projectId = String(sprint.project)
  const sprintId = String(sprint._id)
  const endDateIso = isoOfStoredDate(sprint.endDate)

  const [calendarRow, settings, tasks, capacities] = await Promise.all([
    WorkingCalendar.findOne({ project: projectId, scope: 'project' }).select('timezone').lean() as Promise<any>,
    ProjectStandupSettings.findOne({ project: projectId }).lean() as Promise<any>,
    Task.find({ sprint: sprintId }).select('status remainingEstimateMinutes').lean() as Promise<any[]>,
    MemberCapacity.find({ project: projectId, isActive: true })
      .select('member dailyCapacityMinutes effectiveFrom effectiveTo isActive')
      .lean() as Promise<any[]>
  ])

  const timezone = calendarRow?.timezone ?? 'UTC'
  const todayIso = todayInTimezone(timezone, now)

  const statusSets = resolveStatusSets(settings)
  const remainingEstimateMinutes = tasks
    .filter((task) => statusSets.done.indexOf(task.status) === -1)
    .reduce((sum, task) => sum + (task.remainingEstimateMinutes ?? 0), 0)

  let remainingCapacityMinutes = 0

  if (todayIso <= endDateIso) {
    const resolutions = await resolveWorkingDays(projectId, todayIso, endDateIso)
    const remainingWorkingDays = resolutions.filter((resolution) => resolution.isWorkingDay).length

    if (remainingWorkingDays > 0) {
      const byMember = new Map<string, any[]>()
      for (const record of capacities) {
        const key = String(record.member)
        const existing = byMember.get(key)
        if (existing) existing.push(record)
        else byMember.set(key, [record])
      }

      for (const records of Array.from(byMember.values())) {
        const current = selectCapacityAsOf<any>(records, todayIso)
        if (current) {
          remainingCapacityMinutes += current.dailyCapacityMinutes * remainingWorkingDays
        }
      }
    }
  }

  return {
    remainingEstimateMinutes: minutes(remainingEstimateMinutes),
    remainingCapacityMinutes: minutes(remainingCapacityMinutes)
  }
}

/** VAR-8's "the project admin", reused: the project's creator plus its project managers. */
async function loadProjectAdmins(projectId: string): Promise<string[]> {
  const project = (await Project.findById(projectId).select('createdBy projectRoles').lean()) as any
  if (!project) return []

  const managers = (project.projectRoles ?? [])
    .filter((entry: any) => entry?.role === 'project_manager')
    .map((entry: any) => String(entry.user))

  return Array.from(new Set([String(project.createdBy ?? ''), ...managers].filter(Boolean)))
}
