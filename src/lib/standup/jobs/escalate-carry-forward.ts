/**
 * The nightly carry-forward reconciliation and escalation job (spec §18.1,
 * NFR-8, CFW-3, N9).
 *
 * Two unrelated jobs share one registration because they read the same
 * collection and the spec names them together (§18.1's row is
 * `standup:escalate-carry-forward`, "daily after the last stand-up"):
 *
 *   A. **NFR-8's safety net.** "The system must never lose a carry-forward
 *      item." `buildCarryForwardSet` is the only writer that is supposed to
 *      move an item off a stand-up, and it always moves an open item forward
 *      — never leaves it pointing at a stand-up that has finished being
 *      current. If one is ever found stuck there anyway (a bug, a crash
 *      mid-build, a manual database fix gone wrong), this is what notices and
 *      re-attaches it to the sprint's next live stand-up, rather than letting
 *      it silently vanish from every board.
 *   B. **CFW-3's escalation.** An item is notified once, on the tick where it
 *      crosses the escalation threshold — not every night after — because the
 *      spec's "Project admin is notified" reads as an event, and renotifying
 *      every night about the same aged item is exactly the noise that trains
 *      people to ignore the channel.
 */
import { CarryForwardItem, OPEN_CARRY_FORWARD_STATUSES } from '@/models/CarryForwardItem'
import {
  DEFAULT_ESCALATION_THRESHOLD,
  ProjectStandupSettings
} from '@/models/ProjectStandupSettings'
import { Project } from '@/models/Project'
import { Standup } from '@/models/Standup'
import { Task } from '@/models/Task'

import { CHRONIC_AGE_THRESHOLD } from '../carry-forward'
import { standupStrings } from '../strings'
import { sendStandupNotificationOnce } from './notify'
import { emptyResult, type JobResult } from './result'

/** Stand-ups an item may legitimately still be sitting on. */
const LIVE_STATUSES = ['Scheduled', 'Ready', 'In_Progress']

export async function escalateCarryForward(now: Date = new Date()): Promise<JobResult> {
  const result = emptyResult('escalate-carry-forward')

  const openItems = (await CarryForwardItem.find({
    status: { $in: OPEN_CARRY_FORWARD_STATUSES }
  }).lean()) as any[]

  if (openItems.length === 0) return result

  const sprintIds = Array.from(new Set(openItems.map((item) => String(item.sprint))))
  result.scannedProjects = new Set(openItems.map((item) => String(item.project))).size

  const standups = (await Standup.find({ sprint: { $in: sprintIds } })
    .select('sprint status standupDate')
    .sort({ standupDate: 1 })
    .lean()) as any[]

  const liveBySprintDate = new Map<string, string[]>() // sprintId -> live standupIds, date order
  const standupById = new Map<string, any>()
  for (const standup of standups) {
    standupById.set(String(standup._id), standup)
    if (LIVE_STATUSES.indexOf(standup.status) === -1) continue
    const key = String(standup.sprint)
    const list = liveBySprintDate.get(key) ?? []
    list.push(String(standup._id))
    liveBySprintDate.set(key, list)
  }

  const settingsRows = (await ProjectStandupSettings.find({
    project: { $in: Array.from(new Set(openItems.map((item) => String(item.project)))) }
  }).lean()) as any[]
  const escalationThresholdByProject = new Map(
    settingsRows.map((row) => [
      String(row.project),
      row.carryForwardEscalationThreshold ?? DEFAULT_ESCALATION_THRESHOLD
    ])
  )

  const adminsByProject = new Map<string, string[]>()

  for (const item of openItems) {
    const projectId = String(item.project)

    try {
      // --- A. NFR-8: is this item still attached to a stand-up that can show it? ---
      const currentId = item.currentStandup ? String(item.currentStandup) : null
      const currentStandup = currentId ? standupById.get(currentId) : null
      const isStuck = !currentStandup || LIVE_STATUSES.indexOf(currentStandup.status) === -1

      if (isStuck) {
        const live = liveBySprintDate.get(String(item.sprint)) ?? []
        const target = live[0] ?? null

        if (target && target !== currentId) {
          await CarryForwardItem.updateOne({ _id: item._id }, { $set: { currentStandup: target } })
          result.repaired += 1
        } else {
          // No live stand-up left in this sprint (it closed) — Phase 11's
          // sprint-close disposition owns this item now, not a repair.
          result.skipped += 1
        }
      }

      // --- B. CFW-3: notify once, on the crossing tick. ---
      const escalationThreshold =
        escalationThresholdByProject.get(projectId) ?? DEFAULT_ESCALATION_THRESHOLD
      const justEscalated = item.ageInStandups === escalationThreshold
      const justTurnedChronic = item.ageInStandups === CHRONIC_AGE_THRESHOLD

      if (justEscalated || justTurnedChronic) {
        if (!adminsByProject.has(projectId)) {
          adminsByProject.set(projectId, await loadProjectAdmins(projectId))
        }
        const recipients = adminsByProject.get(projectId) ?? []

        if (recipients.length > 0) {
          const label = await describeItem(item)
          const sent = await sendStandupNotificationOnce({
            standupId: String(item.originStandup),
            projectId,
            organizationId: String(item.organization),
            notificationId: 'N9',
            variantKey: justTurnedChronic ? `N9_chronic_${item._id}` : `N9_escalated_${item._id}`,
            recipientIds: recipients,
            title: justTurnedChronic
              ? standupStrings.notifications.carryForwardChronicTitle()
              : standupStrings.notifications.carryForwardEscalatedTitle(),
            message: justTurnedChronic
              ? standupStrings.notifications.carryForwardChronicMessage({
                  label,
                  age: item.ageInStandups
                })
              : standupStrings.notifications.carryForwardEscalatedMessage({
                  label,
                  age: item.ageInStandups
                }),
            url: `/standups/${String(item.originStandup)}`,
            priority: 'high'
          })
          result.created += sent
        }
      }
    } catch (error) {
      result.errors.push({ projectId, message: (error as Error).message })
    }
  }

  return result
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

async function describeItem(item: any): Promise<string> {
  if (item.task) {
    const task = (await Task.findById(item.task).select('displayId title').lean()) as any
    if (task) return task.displayId ? `${task.displayId} — ${task.title}` : task.title
  }
  return standupStrings.carryForward.itemTypeLabel(item.type)
}
