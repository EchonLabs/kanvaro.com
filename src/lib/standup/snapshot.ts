/**
 * The pre-stand-up snapshot (spec SCH-9, SCH-10, SCH-11).
 *
 * Built when a stand-up becomes Ready, so the meeting opens on numbers that
 * were computed before anyone was waiting for them. SCH-11 makes it strictly a
 * read: nothing here writes to a task, and the only document it may touch is
 * the stand-up's own `snapshot` field, and only when asked.
 *
 * Release-one content is what release one can honestly compute. Allocations,
 * variance and the carry-forward register arrive in Phases 7, 8 and 9; their
 * keys exist here as declared empties rather than absent fields, so the API
 * shape does not change when they are filled and no consumer has to special-case
 * "the key is missing" today and "the key is empty" later.
 */
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { Task } from '@/models/Task'

import type { CapacityAdjustment } from './capacity'
import { loadCapacityContext } from './capacity-context'
import { checkHolidayCoverage } from './calendar-service'
import type { IsoDate } from './calendar-dates'
import { StandupError } from './errors'
import type { Minutes } from './minutes'

/** SCH-10: a snapshot older than this is rebuilt before the stand-up starts. */
export const SNAPSHOT_MAX_AGE_MINUTES = 30

/** D-K: the pool paginates rather than loading an unbounded sprint. */
export const UNASSIGNED_POOL_PAGE_SIZE = 50

export interface SnapshotMember {
  memberId: string
  nominalMinutes: Minutes
  adjustments: CapacityAdjustment[]
  effectiveMinutes: Minutes
  /** Phase 8 fills this from the debt ledger; zero until then. */
  outstandingDebtMinutes: Minutes
}

export interface SnapshotTask {
  taskId: string
  key?: string
  title: string
  status: string
  originalEstimateMinutes?: number
  remainingEstimateMinutes?: number
}

export interface StandupSnapshot {
  standupId: string
  date: IsoDate
  sprintDayNumber: number
  totalSprintDays: number
  shape: string
  members: SnapshotMember[]
  unassignedPool: SnapshotTask[]
  /** Total before pagination, so the UI can say "50 of 55". */
  unassignedPoolTotal: number
  /**
   * DN-6: false means ceremony minutes were deliberately not deducted, and the
   * capacity board must say so. Carried on the snapshot rather than re-read by
   * the UI, because the setting can change after the snapshot was frozen and
   * the breakdown has to explain the numbers it is actually showing.
   */
  ceremoniesConsumeCapacity: boolean
  /** Register row 12: the sprint runs past the loaded holiday data. */
  coverageWarning?: string

  // --- Declared seams -------------------------------------------------------
  /** Phase 7: yesterday's allocations with final status and logged hours. */
  previousAllocations: unknown[]
  /** Phase 9: the open carry-forward set with ages. */
  carryForward: unknown[]
  /** Phase 7: pre-filled allocations for carried remaining work. */
  prefilledAllocations: unknown[]
}

export interface BuildSnapshotOptions {
  /** Writes the result onto the stand-up. The promote-to-ready job sets this. */
  persist?: boolean
}

export async function buildStandupSnapshot(
  standupId: string,
  options: BuildSnapshotOptions = {}
): Promise<StandupSnapshot> {
  const standup = (await Standup.findById(standupId).lean()) as any
  if (!standup) {
    throw new StandupError('NOT_FOUND', 'That stand-up no longer exists.', { standupId })
  }

  const projectId = standup.project.toString()
  const date: IsoDate = standup.standupDate

  // The whole capacity assembly — dated member rows, the calendar resolution,
  // ceremony deductions, the project's tolerances — lives in one place so the
  // snapshot and every allocation write compute the same numbers from the same
  // inputs. See `capacity-context.ts`.
  const [sprint, capacity] = await Promise.all([
    Sprint.findById(standup.sprint).lean() as Promise<any>,
    loadCapacityContext(standupId, standup)
  ])

  const members: SnapshotMember[] = capacity.memberIds.map((memberId) => {
    const breakdown = capacity.computeFor(memberId)

    return {
      memberId,
      nominalMinutes: breakdown.nominalMinutes,
      adjustments: breakdown.adjustments,
      effectiveMinutes: breakdown.effectiveMinutes,
      // Phase 8 supplies the ledger. Zero is the truth until it exists.
      outstandingDebtMinutes: breakdown.outstandingDebtMinutes
    }
  })

  const ceremoniesConsumeCapacity = capacity.ceremoniesConsumeCapacity

  const poolFilter = {
    sprint: standup.sprint,
    archived: { $ne: true },
    status: { $nin: ['done', 'cancelled'] },
    $or: [{ assignedTo: { $size: 0 } }, { assignedTo: { $exists: false } }]
  }

  const [poolDocs, unassignedPoolTotal, coverage] = await Promise.all([
    Task.find(poolFilter)
      .select('displayId title status originalEstimateMinutes remainingEstimateMinutes')
      .sort({ createdAt: 1 })
      .limit(UNASSIGNED_POOL_PAGE_SIZE)
      .lean() as Promise<any[]>,
    Task.countDocuments(poolFilter),
    checkHolidayCoverage(
      projectId,
      date,
      sprint ? new Date(sprint.endDate).toISOString().slice(0, 10) : date
    )
  ])

  const snapshot: StandupSnapshot = {
    standupId: String(standup._id),
    date,
    sprintDayNumber: standup.sprintDayNumber,
    totalSprintDays: standup.totalSprintDays,
    shape: standup.shape,
    members,
    unassignedPool: poolDocs.map((task) => ({
      taskId: String(task._id),
      key: task.displayId,
      title: task.title,
      status: task.status,
      originalEstimateMinutes: task.originalEstimateMinutes,
      remainingEstimateMinutes: task.remainingEstimateMinutes
    })),
    unassignedPoolTotal,
    ceremoniesConsumeCapacity,
    ...(coverage ? { coverageWarning: coverage.message } : {}),

    previousAllocations: [],
    carryForward: [],
    prefilledAllocations: []
  }

  if (options.persist) {
    await Standup.updateOne(
      { _id: standupId },
      { $set: { snapshot, snapshotBuiltAt: new Date() } }
    )
  }

  return snapshot
}

/**
 * SCH-10: more than thirty minutes between Ready and Start and the numbers are
 * rebuilt. A snapshot that was never built counts as stale, so the caller
 * builds rather than opening an empty stand-up.
 */
export function snapshotIsStale(builtAt: Date | undefined | null, now: Date): boolean {
  if (!builtAt) return true
  return now.getTime() - builtAt.getTime() > SNAPSHOT_MAX_AGE_MINUTES * 60_000
}
