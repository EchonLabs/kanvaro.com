/**
 * Cross-project stand-up oversight for org admins.
 *
 * The spec never specs this screen by name, but it repeatedly assumes one
 * exists — "the delivery lead's dashboard" (E41, E63, PLN-conf-277) is where
 * chronic carry-forward items, override records and capacity overages are
 * supposed to surface, and §15.15's Stand-up Analytics is scoped to one
 * sprint at a time, opened by someone who already knows which sprint to look
 * at. An org admin, who per this app's own seed data is deliberately not a
 * member of any project's stand-up rotation, has no such starting point —
 * this rolls the same signals up across every active sprint so "what needs
 * attention" is answerable without picking a project first.
 *
 * Deliberately reuses the exact health computation `schedule.ts` already
 * uses for the Schedule hub's health strip (`loadSprintHealthTotals` +
 * `computeSprintHealth`), rather than a second copy of the same arithmetic —
 * this file adds the org-wide rollup and the escalation flags on top, it
 * does not recompute capacity balance differently.
 */
import mongoose from 'mongoose'

import { CarryForwardItem, OPEN_CARRY_FORWARD_STATUSES } from '@/models/CarryForwardItem'
import { MemberSprintDebtSummary } from '@/models/MemberSprintDebtSummary'
import { Project } from '@/models/Project'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { StandupBlocker } from '@/models/StandupBlocker'
import { StandupOverride } from '@/models/StandupOverride'

import { loadSprintHealthTotals } from './jobs/sprint-health'
import { minutes, type Minutes } from './minutes'
import { computeSprintHealth } from './sprint-health'

/** SCH-15: three consecutive misses is the threshold that escalates to the admin. */
const CONSECUTIVE_MISS_ESCALATION_THRESHOLD = 3
/** §13.4 / E63: age 8 is "chronic", already the convention `schedule.ts` uses. */
const CHRONIC_CARRY_FORWARD_AGE = 8
/**
 * §13.3's age bands, at their documented defaults. Per-project settings can move
 * the note (3) and escalation (5) thresholds, but a cross-project histogram has
 * to pick one scale to bucket every project's items onto — otherwise the same
 * bar means "3 days old" for one project and "5 days old" for another, and the
 * distribution stops being readable. The spec defaults are that scale.
 */
const NOTE_REQUIRED_AGE = 3
const ESCALATED_AGE = 5

/** §15.15's "carry forward ageing, with the chronic band highlighted". */
export interface CarryForwardAgeBands {
  normal: number
  noteRequired: number
  escalated: number
  chronic: number
}

function ageBandOf(age: number): keyof CarryForwardAgeBands {
  if (age >= CHRONIC_CARRY_FORWARD_AGE) return 'chronic'
  if (age >= ESCALATED_AGE) return 'escalated'
  if (age >= NOTE_REQUIRED_AGE) return 'noteRequired'
  return 'normal'
}

const emptyAgeBands = (): CarryForwardAgeBands => ({
  normal: 0,
  noteRequired: 0,
  escalated: 0,
  chronic: 0
})

/**
 * One scheduled day of a sprint, reduced to the four states the board draws.
 * Deliberately the same partition `discipline` counts on, so a ribbon and the
 * figure beside it can never disagree: ran = Completed, missed = Missed,
 * off = never a working day, ahead = still to come (or reopened, which is
 * not yet a clean completion).
 */
export type CadenceState = 'ran' | 'missed' | 'ahead' | 'off'

export interface CadenceDay {
  date: string
  state: CadenceState
}

function cadenceStateOf(status: string): CadenceState {
  if (status === 'Completed') return 'ran'
  if (status === 'Missed') return 'missed'
  if (status === 'Skipped_Holiday' || status === 'Cancelled') return 'off'
  return 'ahead'
}

export type OversightFlag =
  | 'over_capacity'
  | 'chronic_carry_forward'
  | 'consecutive_misses'
  | 'open_blockers'

export interface SprintOversightRow {
  sprintId: string
  sprintName: string
  projectId: string
  projectName: string
  estimateDebtMinutes: Minutes
  carryForward: {
    openCount: number
    oldestAgeInStandups: number
    chronicCount: number
    ageBands: CarryForwardAgeBands
  }
  overridesCount: number
  /**
   * Carried per sprint, not only rolled up, so the screen's project filter can
   * re-rank OVR-8's reason codes against the visible slice instead of showing
   * an org-wide ranking beside per-project charts.
   */
  overrideReasonCounts: Array<{ type: string; reasonCode: string; count: number }>
  openBlockersCount: number
  /**
   * G1's "a stand-up exists for every working day" made measurable: how many of
   * this sprint's stand-ups actually ran, how many were missed, and how many are
   * still ahead. The three sum to the sprint's working days.
   */
  discipline: {
    completedDays: number
    missedDays: number
    remainingDays: number
    totalWorkingDays: number
  }
  /** CC-11 / N12 — raw both sides, so the chart can show headroom as well as overage. */
  capacityBalance: {
    remainingEstimateMinutes: Minutes
    remainingCapacityMinutes: Minutes
    overageMinutes: Minutes
    exceedsCapacity: boolean
  }
  /**
   * The sprint's working days in order, one entry each. `discipline` counts
   * these; this keeps the *sequence*, which is the thing an aggregate throws
   * away — three misses scattered across a fortnight and three in a row at
   * the end are the same count and completely different situations (SCH-15).
   */
  cadence: CadenceDay[]
  consecutiveMissedDays: number
  flags: OversightFlag[]
}

/** PLN-16/18 — a waiver is the one thing on this screen only an Org Admin can issue or revoke. */
export interface ActiveWaiverRow {
  sprintId: string
  sprintName: string
  projectId: string
  projectName: string
  waivedCheckIds: string[]
  justification: string
  expiresAt: string
  expired: boolean
}

export interface OrgStandupOversight {
  sprints: SprintOversightRow[]
  /** OVR-8 — "the top three reason codes", org-wide rather than per sprint. */
  overrideReasons: Array<{ reasonCode: string; type: string; count: number }>
  carryForwardAgeBands: CarryForwardAgeBands
  waivers: ActiveWaiverRow[]
  totals: {
    activeSprints: number
    sprintsNeedingAttention: number
    sprintsExceedingCapacity: number
    chronicCarryForwardItems: number
    openBlockers: number
    overridesIssued: number
    outstandingDebtMinutes: Minutes
  }
}

/** The trailing run of `Missed` days at the end of the sprint's own day list. */
function trailingMissedRun(standupStatuses: string[]): number {
  let run = 0
  for (let i = standupStatuses.length - 1; i >= 0; i -= 1) {
    if (standupStatuses[i] !== 'Missed') break
    run += 1
  }
  return run
}

/**
 * The row plus the raw override reasons behind its count — the org-level
 * rollup needs the individual reason codes for OVR-8's "top three", but a
 * per-sprint reason list on the public row would just be the same data twice.
 */
type BuiltRow = SprintOversightRow & {
  overrideReasonRows: Array<{ type: string; reasonCode: string }>
}

async function buildOversightRow(sprint: any, projectNameById: Map<string, string>): Promise<BuiltRow> {
  const sprintId = String(sprint._id)
  const sprintObjectId = new mongoose.Types.ObjectId(sprintId)
  const projectId = String(sprint.project)

  const [debtSummaries, cfwItems, overrideRows, openBlockersCount, standups] = await Promise.all([
    MemberSprintDebtSummary.find({ sprint: sprintObjectId }).select('outstandingMinutes').lean() as Promise<any[]>,
    CarryForwardItem.find({ sprint: sprintObjectId, status: { $in: OPEN_CARRY_FORWARD_STATUSES } })
      .select('ageInStandups tags')
      .lean() as Promise<any[]>,
    StandupOverride.find({ sprint: sprintObjectId }).select('type reasonCode').lean() as Promise<any[]>,
    StandupBlocker.countDocuments({ sprint: sprintObjectId, status: 'open' }),
    Standup.find({ sprint: sprintObjectId }).sort({ standupDate: 1 }).select('status standupDate').lean() as Promise<any[]>
  ])

  const estimateDebtMinutes = debtSummaries.reduce(
    (total, row) => total + Math.max(0, row.outstandingMinutes ?? 0),
    0
  )

  const openCount = cfwItems.length
  let oldestAgeInStandups = 0
  let chronicCount = 0
  const ageBands = emptyAgeBands()
  for (const item of cfwItems) {
    const age = item.ageInStandups ?? 0
    if (age > oldestAgeInStandups) oldestAgeInStandups = age
    const tagged = (item.tags ?? []).includes('chronic')
    if (tagged || age >= CHRONIC_CARRY_FORWARD_AGE) chronicCount += 1
    ageBands[tagged ? 'chronic' : ageBandOf(age)] += 1
  }

  let capacityBalance = {
    remainingEstimateMinutes: minutes(0),
    remainingCapacityMinutes: minutes(0),
    overageMinutes: minutes(0),
    exceedsCapacity: false
  }
  try {
    const totals = await loadSprintHealthTotals(sprint, new Date())
    const health = computeSprintHealth(totals)
    capacityBalance = {
      remainingEstimateMinutes: totals.remainingEstimateMinutes,
      remainingCapacityMinutes: totals.remainingCapacityMinutes,
      overageMinutes: health.overageMinutes,
      exceedsCapacity: health.exceedsCapacity
    }
  } catch {
    // Same graceful fallback `schedule.ts` uses — an uninitialised working
    // calendar must not break the whole rollup for every other sprint.
  }

  const statuses = standups.map((s) => s.status)
  const consecutiveMissedDays = trailingMissedRun(statuses)

  const cadence: CadenceDay[] = standups.map((row) => ({
    date: new Date(row.standupDate).toISOString().slice(0, 10),
    state: cadenceStateOf(String(row.status))
  }))

  // Skipped and cancelled days were never working days, so they are not part of
  // the denominator — G1 measures stand-ups against working days, not dates.
  const scheduledDays = statuses.filter(
    (status) => status !== 'Skipped_Holiday' && status !== 'Cancelled'
  )
  const completedDays = scheduledDays.filter((status) => status === 'Completed').length
  const missedDays = scheduledDays.filter((status) => status === 'Missed').length

  const overridesCount = overrideRows.length

  const reasonCountsForSprint = new Map<string, { type: string; reasonCode: string; count: number }>()
  for (const row of overrideRows) {
    const type = String(row.type ?? 'override')
    const reasonCode = String(row.reasonCode ?? 'unspecified')
    const key = `${type}:${reasonCode}`
    const existing = reasonCountsForSprint.get(key)
    if (existing) existing.count += 1
    else reasonCountsForSprint.set(key, { type, reasonCode, count: 1 })
  }

  const flags: OversightFlag[] = []
  if (capacityBalance.exceedsCapacity) flags.push('over_capacity')
  if (chronicCount > 0) flags.push('chronic_carry_forward')
  if (consecutiveMissedDays >= CONSECUTIVE_MISS_ESCALATION_THRESHOLD) flags.push('consecutive_misses')
  if (openBlockersCount > 0) flags.push('open_blockers')

  return {
    sprintId,
    sprintName: sprint.name,
    projectId,
    projectName: projectNameById.get(projectId) ?? 'Unknown project',
    estimateDebtMinutes: minutes(estimateDebtMinutes),
    carryForward: { openCount, oldestAgeInStandups, chronicCount, ageBands },
    overridesCount,
    overrideReasonCounts: Array.from(reasonCountsForSprint.values()),
    openBlockersCount,
    discipline: {
      completedDays,
      missedDays,
      remainingDays: Math.max(0, scheduledDays.length - completedDays - missedDays),
      totalWorkingDays: scheduledDays.length
    },
    cadence,
    capacityBalance,
    consecutiveMissedDays,
    flags,
    overrideReasonRows: overrideRows.map((row) => ({
      type: String(row.type ?? 'override'),
      reasonCode: String(row.reasonCode ?? 'unspecified')
    }))
  }
}

/**
 * Every active sprint across the organisation, health-scored and flagged.
 * Sorted worst-first (most flags, then largest capacity overage) so the
 * dashboard's "needs attention" list never requires the admin to scan past
 * healthy sprints to find the ones that matter.
 */
export async function getOrgStandupOversight(organizationId: string): Promise<OrgStandupOversight> {
  const projects = await Project.find({ organization: organizationId, archived: { $ne: true } })
    .select('name')
    .lean() as any[]
  const projectIds = projects.map((project) => project._id)
  const projectNameById = new Map(projects.map((project) => [String(project._id), project.name as string]))

  const sprints = await Sprint.find({ project: { $in: projectIds }, status: 'active' })
    .select('name project endDate planningWaiver')
    .lean() as any[]

  const built = await Promise.all(sprints.map((sprint) => buildOversightRow(sprint, projectNameById)))

  built.sort((a, b) => {
    if (a.flags.length !== b.flags.length) return b.flags.length - a.flags.length
    return b.capacityBalance.overageMinutes - a.capacityBalance.overageMinutes
  })

  // OVR-8's "top three reason codes", counted across every active sprint.
  const reasonCounts = new Map<string, { reasonCode: string; type: string; count: number }>()
  for (const row of built) {
    for (const override of row.overrideReasonRows) {
      const key = `${override.type}:${override.reasonCode}`
      const existing = reasonCounts.get(key)
      if (existing) existing.count += 1
      else reasonCounts.set(key, { reasonCode: override.reasonCode, type: override.type, count: 1 })
    }
  }
  const overrideReasons = Array.from(reasonCounts.values()).sort((a, b) => b.count - a.count)

  const carryForwardAgeBands = built.reduce((acc, row) => {
    acc.normal += row.carryForward.ageBands.normal
    acc.noteRequired += row.carryForward.ageBands.noteRequired
    acc.escalated += row.carryForward.ageBands.escalated
    acc.chronic += row.carryForward.ageBands.chronic
    return acc
  }, emptyAgeBands())

  const now = Date.now()
  const waivers: ActiveWaiverRow[] = sprints
    .filter((sprint) => sprint.planningWaiver && !sprint.planningWaiver.revokedAt)
    .map((sprint) => ({
      sprintId: String(sprint._id),
      sprintName: sprint.name,
      projectId: String(sprint.project),
      projectName: projectNameById.get(String(sprint.project)) ?? 'Unknown project',
      waivedCheckIds: sprint.planningWaiver.waivedCheckIds ?? [],
      justification: sprint.planningWaiver.justification ?? '',
      expiresAt: new Date(sprint.planningWaiver.expiresAt).toISOString(),
      expired: new Date(sprint.planningWaiver.expiresAt).getTime() < now
    }))

  const rows: SprintOversightRow[] = built.map(({ overrideReasonRows, ...row }) => row)

  const totals = rows.reduce(
    (acc, row) => ({
      activeSprints: acc.activeSprints + 1,
      sprintsNeedingAttention: acc.sprintsNeedingAttention + (row.flags.length > 0 ? 1 : 0),
      sprintsExceedingCapacity: acc.sprintsExceedingCapacity + (row.capacityBalance.exceedsCapacity ? 1 : 0),
      chronicCarryForwardItems: acc.chronicCarryForwardItems + row.carryForward.chronicCount,
      openBlockers: acc.openBlockers + row.openBlockersCount,
      overridesIssued: acc.overridesIssued + row.overridesCount,
      outstandingDebtMinutes: minutes(acc.outstandingDebtMinutes + row.estimateDebtMinutes)
    }),
    {
      activeSprints: 0,
      sprintsNeedingAttention: 0,
      sprintsExceedingCapacity: 0,
      chronicCarryForwardItems: 0,
      openBlockers: 0,
      overridesIssued: 0,
      outstandingDebtMinutes: minutes(0)
    }
  )

  return { sprints: rows, overrideReasons, carryForwardAgeBands, waivers, totals }
}
