/**
 * The carry-forward register's writer (spec §13, CFW-1..11, RUN-17, SCH-13).
 *
 * **Two sources feed the register, on two different clocks, and that is by
 * design rather than an inconsistency.** `unfinished_task`, `open_blocker`,
 * `owner_absent` and `unassigned_task` are facts about the stand-up that is
 * *closing right now* — a task's live status, an allocation's live blocked
 * flag, a live detachment — so they are read straight off today's board.
 * `unrevised_estimate` and `not_started_commitment` are §12.2 outcomes (V5/V6
 * and V7), and VAR-2 fixes those a day behind: they become knowable only when
 * the *next* stand-up completes and classifies today, which is exactly when
 * this function also runs. Forcing both onto the same clock would mean either
 * inventing variance a day early or delaying the board-level facts a day for
 * no reason — the lag belongs to the classifier, not to this file, so this
 * file mirrors it rather than hiding it.
 *
 * **Idempotency is structural, the same way `variance-service.ts`'s is.**
 * `buildCarryForwardSet` may be called twice for the same stand-up — a
 * crashed completion saga re-run, most obviously — and must leave identical
 * state. The ageing pass only ever touches items whose `currentStandup` is
 * still *this* stand-up, and it moves them off in the same write that ages
 * them, so a second run finds nothing left to age. The discovery pass looks
 * for an already-open item on `(sprint, type, task, member)` before creating
 * one, so a second run finds its own row and leaves it alone.
 *
 * **This is Phase 10's seam, exposed early.** `classifyAndPost` has its own
 * route so Panel 3 is real before the completion saga exists; this has the
 * same shape and the same reason. Phase 10's saga calls both, in sequence,
 * from `runSaga`.
 */
import { Allocation } from '@/models/Allocation'
import {
  CarryForwardItem,
  OPEN_CARRY_FORWARD_STATUSES,
  type CarryForwardItemType,
  type CarryForwardResolutionType,
  type CarryForwardStatus,
  type CarryForwardTag,
  type ICarryForwardItem
} from '@/models/CarryForwardItem'
import {
  DEFAULT_ESCALATION_THRESHOLD,
  DEFAULT_NOTE_THRESHOLD,
  ProjectStandupSettings
} from '@/models/ProjectStandupSettings'
import { Standup } from '@/models/Standup'
import { Task } from '@/models/Task'
import { User } from '@/models/User'

import {
  ageBandFor,
  isResolutionValidForType,
  requiresNoteToday,
  sortByAgeDescending,
  summarise,
  validateCarryForwardNote,
  VALID_RESOLUTIONS_BY_TYPE,
  withChronicTag,
  type AgeThresholds,
  type CarryForwardSummary
} from './carry-forward'
import { assembleClassifyInputs } from './debt-position'
import { recordAudit, type AuditActor } from './audit'
import { StandupError } from './errors'
import { isoOfStoredDate, type IsoDate } from './calendar-dates'
import type { CarryForwardMove } from './reconcile'
import type { MissedRollForward } from './jobs/mark-missed'
import { classifyAll } from './variance'

const DONE_STATUSES = ['done', 'cancelled', 'released', 'completed']

interface UpsertTarget {
  type: CarryForwardItemType
  taskId?: string
  memberId?: string
  tags?: CarryForwardTag[]
}

export interface BuildCarryForwardResult {
  standupId: string
  created: number
  aged: number
  autoClosed: number
  totalOpen: number
}

/**
 * CFW-6. Builds the carry-forward set that the *next* stand-up in the sprint
 * opens with, from `standupId`'s own board plus its previous day's freshly
 * classified variance. A no-op, safely, if `standupId` has no sprint context
 * left to build into (`STANDUP_NOT_STARTABLE` cannot occur here — the function
 * is read-tolerant of a missing standup only via `NOT_FOUND`).
 */
export async function buildCarryForwardSet(input: {
  standupId: string
  actor: AuditActor
}): Promise<BuildCarryForwardResult> {
  const standup = (await Standup.findById(input.standupId).lean()) as any
  if (!standup) {
    throw new StandupError('NOT_FOUND', 'That stand-up no longer exists.', {
      standupId: input.standupId
    })
  }

  const settings = (await ProjectStandupSettings.findOne({ project: standup.project }).lean()) as any
  const thresholds: AgeThresholds = {
    noteThreshold: settings?.carryForwardNoteThreshold ?? DEFAULT_NOTE_THRESHOLD,
    escalationThreshold: settings?.carryForwardEscalationThreshold ?? DEFAULT_ESCALATION_THRESHOLD
  }

  const next = (await Standup.findOne({
    sprint: standup.sprint,
    standupDate: { $gt: standup.standupDate },
    status: { $in: ['Scheduled', 'Ready'] }
  })
    .sort({ standupDate: 1 })
    .select('_id')
    .lean()) as any
  const nextStandupId = next ? String(next._id) : null

  let aged = 0
  let autoClosed = 0
  let created = 0

  // --- 1. Age or auto-close what was already showing on this board ---------
  const openHere = (await CarryForwardItem.find({
    sprint: standup.sprint,
    currentStandup: standup._id,
    status: { $in: OPEN_CARRY_FORWARD_STATUSES }
  }).lean()) as any[]

  if (openHere.length > 0) {
    const taskIds = Array.from(
      new Set(openHere.filter((item) => item.task).map((item) => String(item.task)))
    )
    const tasks = taskIds.length
      ? ((await Task.find({ _id: { $in: taskIds } })
          .select('status descopedAt assignedTo totalLoggedMinutes')
          .lean()) as any[])
      : []
    const taskById = new Map(tasks.map((task) => [String(task._id), task]))

    for (const item of openHere) {
      const closeAs = autoCloseResolution(item, taskById)

      if (closeAs) {
        await CarryForwardItem.updateOne(
          { _id: item._id },
          {
            $set: {
              status: closeAs.status,
              resolution: {
                resolvedAt: new Date(),
                resolvedBy: systemUserPlaceholder(input.actor),
                resolutionType: closeAs.resolutionType,
                comment: closeAs.comment
              }
            }
          }
        )
        autoClosed += 1
        continue
      }

      const newAge = item.ageInStandups + 1
      const escalated = ageBandFor(newAge, thresholds) === 'escalated' || ageBandFor(newAge, thresholds) === 'chronic'

      await CarryForwardItem.updateOne(
        { _id: item._id },
        {
          $set: {
            ageInStandups: newAge,
            status: escalated ? 'escalated' : 'open',
            currentStandup: nextStandupId ?? standup._id,
            tags: withChronicTag(item.tags ?? [], newAge)
          }
        }
      )
      aged += 1
    }
  }

  // --- 2. Discover new obligations from this board's own allocations -------
  const allocations = (await Allocation.find({ standup: standup._id }).lean()) as any[]

  if (allocations.length > 0) {
    const taskIds = Array.from(new Set(allocations.map((row) => String(row.task))))
    const tasks = (await Task.find({ _id: { $in: taskIds } })
      .select('status descopedAt assignedTo')
      .lean()) as any[]
    const taskById = new Map(tasks.map((task) => [String(task._id), task]))

    for (const allocation of allocations) {
      const task = taskById.get(String(allocation.task))
      if (!task) continue

      const isOpenTask = !DONE_STATUSES.includes(task.status) && !task.descopedAt

      if (allocation.detachedReason === 'owner_absent') {
        created += await upsertOpenItem(standup, {
          type: 'owner_absent',
          taskId: String(allocation.task),
          memberId: String(allocation.member),
          tags: ['owner_absent']
        }, nextStandupId)
        continue
      }

      if (isOpenTask) {
        created += await upsertOpenItem(standup, {
          type: 'unfinished_task',
          taskId: String(allocation.task),
          memberId: String(allocation.member)
        }, nextStandupId)
      }

      if (allocation.isBlocked && allocation.allocatedDespiteBlocked) {
        created += await upsertOpenItem(standup, {
          type: 'open_blocker',
          taskId: String(allocation.task),
          memberId: String(allocation.member)
        }, nextStandupId)
      }
    }
  }

  // Sprint tasks nobody picked up. RUN-17/CFW-1's `unassigned_task`.
  const unassignedTasks = (await Task.find({
    sprint: standup.sprint,
    descopedAt: { $exists: false },
    status: { $nin: DONE_STATUSES },
    $or: [{ assignedTo: { $exists: false } }, { assignedTo: { $size: 0 } }]
  })
    .select('_id')
    .lean()) as any[]

  for (const task of unassignedTasks) {
    created += await upsertOpenItem(standup, { type: 'unassigned_task', taskId: String(task._id) }, nextStandupId)
  }

  // --- 3. Yesterday's freshly classified variance (V5/V6/V7, unanswered) ---
  const assembled = await assembleClassifyInputs(standup._id.toString())
  if (assembled.previousStandupId && assembled.inputs.length > 0) {
    const computations = classifyAll(assembled.inputs)

    for (const computed of computations) {
      const row = assembled.inputs.find((candidate) => candidate.allocationId === computed.allocationId)!
      const allocation = assembled.context.allocationById.get(computed.allocationId)

      if (computed.requiresRevision && allocation?.revisedRemainingMinutes === undefined) {
        created += await upsertOpenItem(
          standup,
          { type: 'unrevised_estimate', taskId: row.taskId, memberId: row.memberId },
          nextStandupId
        )
      }
      if (computed.requiresReason && !(allocation?.notStartedReason ?? '').trim()) {
        created += await upsertOpenItem(
          standup,
          { type: 'not_started_commitment', taskId: row.taskId, memberId: row.memberId },
          nextStandupId
        )
      }
    }
  }

  // --- 4. VAR-14's spill counter, kept live for the panel to read. ---------
  const spillItems = (await CarryForwardItem.find({
    sprint: standup.sprint,
    type: 'unfinished_task',
    status: { $in: OPEN_CARRY_FORWARD_STATUSES },
    task: { $ne: null }
  })
    .select('task ageInStandups')
    .lean()) as any[]

  await Promise.all(
    spillItems.map((item) =>
      Task.updateOne({ _id: item.task }, { $set: { standupSpillCount: item.ageInStandups } })
    )
  )

  const totalOpen = await CarryForwardItem.countDocuments({
    sprint: standup.sprint,
    status: { $in: OPEN_CARRY_FORWARD_STATUSES }
  })

  if (created + aged + autoClosed > 0) {
    await recordAudit({
      actor: input.actor,
      organizationId: String(standup.organization),
      projectId: String(standup.project),
      action: 'carry_forward_created',
      entityType: 'carry_forward_item',
      entityId: String(standup._id),
      before: null,
      after: { created, aged, autoClosed, totalOpen },
      context: { standupId: String(standup._id), sprintId: String(standup.sprint) }
    })
  }

  return { standupId: String(standup._id), created, aged, autoClosed, totalOpen }
}

/**
 * The three automatic "closes when" conditions we can check without a human
 * (§13.2). Everything else — `owner_absent`, `open_blocker`,
 * `missed_standup_rollup`, `override_followup` — waits for CFW-7's manual
 * resolve, because the closing condition genuinely needs a person's judgment
 * (a reassignment, a blocker's real-world resolution, an acknowledgement).
 */
function autoCloseResolution(
  item: any,
  taskById: Map<string, any>
): { status: CarryForwardStatus; resolutionType: CarryForwardResolutionType; comment: string } | null {
  const task = item.task ? taskById.get(String(item.task)) : undefined

  if (task?.descopedAt) {
    return { status: 'closed_descoped', resolutionType: 'descoped', comment: 'The task was descoped.' }
  }

  switch (item.type as CarryForwardItemType) {
    case 'unfinished_task':
      if (task && DONE_STATUSES.includes(task.status)) {
        return { status: 'resolved', resolutionType: 'done', comment: 'The task reached done.' }
      }
      return null
    case 'not_started_commitment':
      if (task && Number(task.totalLoggedMinutes ?? 0) > 0) {
        return { status: 'resolved', resolutionType: 'done', comment: 'Time was logged against the task.' }
      }
      return null
    case 'unrevised_estimate': {
      const hasRevision = (task?.estimateRevisions ?? []).length > 0
      if (hasRevision) {
        return { status: 'resolved', resolutionType: 'done', comment: 'The remaining estimate was revised.' }
      }
      return null
    }
    case 'unassigned_task':
      if (task && (task.assignedTo ?? []).length > 0) {
        return { status: 'resolved', resolutionType: 'done', comment: 'The task was assigned.' }
      }
      return null
    default:
      return null
  }
}

/** Finds an already-open item for this obligation, or creates one at age 1. */
async function upsertOpenItem(
  standup: any,
  target: UpsertTarget,
  nextStandupId: string | null
): Promise<number> {
  const query: Record<string, unknown> = {
    sprint: standup.sprint,
    type: target.type,
    status: { $in: OPEN_CARRY_FORWARD_STATUSES }
  }
  if (target.taskId) query.task = target.taskId
  if (target.memberId) query.member = target.memberId

  const existing = await CarryForwardItem.findOne(query).select('_id').lean()
  if (existing) return 0

  await CarryForwardItem.create({
    sprint: standup.sprint,
    project: standup.project,
    organization: standup.organization,
    type: target.type,
    ...(target.taskId ? { task: target.taskId } : {}),
    ...(target.memberId ? { member: target.memberId } : {}),
    originStandup: standup._id,
    originDate: standup.standupDate,
    currentStandup: nextStandupId ?? standup._id,
    ageInStandups: 1,
    status: 'open',
    tags: target.tags ?? []
  })

  return 1
}

/**
 * The one field `AuditActor` cannot supply directly: an auto-close needs a
 * `resolvedBy` user id, and a system actor has none. Falls back to the
 * standup's facilitator, which is the closest thing this module has to "who
 * is responsible for this stand-up" when nobody clicked the button.
 */
function systemUserPlaceholder(actor: AuditActor): string | undefined {
  return actor.type === 'user' ? actor.userId : undefined
}

export interface CreateOverrideFollowupItemInput {
  taskId: string
  standupId: string
  sprintId: string
  projectId: string
  organizationId: string
}

/**
 * OVR-7. The carry-forward register's one deliberately manual row (the
 * exception `CarryForwardItem.ts` carves out in its own doc comment): a
 * deferred re-estimate is an obligation the override itself creates, not
 * something a board-discovery pass like `upsertOpenItem` can infer, and there
 * is no `Standup` document guaranteed loaded at the call site the way
 * `buildCarryForwardSet` has one throughout — so this stays a small sibling
 * of `upsertOpenItem` rather than a forced reuse of it. Same shape otherwise:
 * age starts at 1, the item opens directly onto the stand-up that issued the
 * override.
 */
export async function createOverrideFollowupItem(
  input: CreateOverrideFollowupItemInput
): Promise<ICarryForwardItem> {
  return CarryForwardItem.create({
    sprint: input.sprintId,
    project: input.projectId,
    organization: input.organizationId,
    type: 'override_followup',
    task: input.taskId,
    originStandup: input.standupId,
    originDate: isoOfStoredDate(new Date()),
    currentStandup: input.standupId,
    ageInStandups: 1,
    status: 'open',
    tags: []
  })
}

export interface CreateOpenBlockerItemInput {
  standupId: string
  sprintId: string
  projectId: string
  organizationId: string
  taskId?: string
}

/**
 * RUN-17. Opens the `open_blocker` carry-forward register row a freshly
 * raised blocker requires. The same small sibling of `upsertOpenItem` that
 * `createOverrideFollowupItem` (OVR-7) already established: `raiseBlocker`
 * has its own `standupId` in hand but, like `issueOverride`, no `Standup`
 * document loaded the way `buildCarryForwardSet` keeps one throughout, so
 * this stays a light peer of `upsertOpenItem` rather than a forced reuse of
 * it. Same shape otherwise: age starts at 1, the item opens directly onto
 * the stand-up that raised the blocker.
 *
 * The link back to the `StandupBlocker` that caused this row lives only on
 * the blocker side (`StandupBlocker.linkedCarryForwardId`) — the register's
 * schema (`CarryForwardItem.ts`, out of this task's scope) has no reverse
 * pointer, the same one-directional shape `linkedOverride` already uses.
 */
export async function createOpenBlockerItem(
  input: CreateOpenBlockerItemInput
): Promise<ICarryForwardItem> {
  return CarryForwardItem.create({
    sprint: input.sprintId,
    project: input.projectId,
    organization: input.organizationId,
    type: 'open_blocker',
    ...(input.taskId ? { task: input.taskId } : {}),
    originStandup: input.standupId,
    originDate: isoOfStoredDate(new Date()),
    currentStandup: input.standupId,
    ageInStandups: 1,
    status: 'open',
    tags: []
  })
}

export interface ResolveLinkedOpenBlockerItemInput {
  itemId: string
  resolvedBy: string
  resolutionType: CarryForwardResolutionType
  comment?: string
}

/**
 * RUN-18/CFW-7's manual-close path for the one `open_blocker` row a raised
 * blocker links to. Adapted from `resolveCarryForwardItem` below, reusing
 * its `RESOLUTION_STATUS` map and `isResolutionValidForType` check, but
 * trimmed for this call site: `updateBlocker` already knows the blocker's
 * outcome and returns the `StandupBlocker` itself, not a panel view, so
 * there is no `loadCarryForwardPanel` read-back here.
 */
export async function resolveLinkedOpenBlockerItem(
  input: ResolveLinkedOpenBlockerItemInput
): Promise<void> {
  const item = (await CarryForwardItem.findById(input.itemId)) as ICarryForwardItem | null
  if (!item) {
    throw new StandupError('NOT_FOUND', 'That carry-forward item no longer exists.', {
      itemId: input.itemId
    })
  }

  if (!isResolutionValidForType(item.type, input.resolutionType)) {
    throw new StandupError(
      'VALIDATION_FAILED',
      `"${input.resolutionType}" is not a valid resolution for a ${item.type} item.`,
      { itemId: input.itemId, type: item.type, resolutionType: input.resolutionType }
    )
  }

  item.status = RESOLUTION_STATUS[input.resolutionType]
  item.resolution = {
    resolvedAt: new Date(),
    resolvedBy: input.resolvedBy as any,
    resolutionType: input.resolutionType,
    ...(input.comment ? { comment: input.comment } : {})
  }
  await item.save()
}

// --- CFW-6's two upstream seams (reconcile.ts, jobs/mark-missed.ts) --------

/**
 * Fills `reconcile.ts`'s `CarryForwardMover` seam (CAL-12, AC-3): when a
 * scheduled day is skipped (declared a holiday after generation), its
 * prepared carry-forward set moves to the next working day rather than
 * vanishing. No ageing — CFW-2 is explicit that a day nothing ran on does not
 * age the register.
 */
export async function moveCarryForwardOnSkip(move: CarryForwardMove): Promise<void> {
  await CarryForwardItem.updateMany(
    { currentStandup: move.fromStandupId, status: { $in: OPEN_CARRY_FORWARD_STATUSES } },
    { $set: { currentStandup: move.toStandupId } }
  )
}

/** Fills `reconcile.ts`'s `CarryForwardCounter` seam, for the reconcile plan's `carryForwardCount`. */
export async function countOpenCarryForwardItems(standupId: string): Promise<number> {
  return CarryForwardItem.countDocuments({
    currentStandup: standupId,
    status: { $in: OPEN_CARRY_FORWARD_STATUSES }
  })
}

/**
 * Fills `jobs/mark-missed.ts`'s `MissedRollForwardHandler` seam (SCH-13, N8,
 * E47). A missed stand-up's whole prepared set — everything already tagged
 * onto it, plus whatever the last completed stand-up left open — rolls into
 * the next stand-up, tagged `from_missed_standup` so the register visibly
 * shows there was a gap.
 *
 * §13.2's `missed_standup_rollup` row is a distinct item type, not just a tag:
 * the day itself is the obligation, separate from whatever it happened to be
 * carrying, and it closes only when a PM explicitly acknowledges it — a team
 * that missed a stand-up with nothing outstanding that day must still see that
 * a gap occurred, not have it vanish for lack of any other item to tag.
 */
export async function rollForwardMissedStandup(input: MissedRollForward): Promise<void> {
  const openOnMissed = (await CarryForwardItem.find({
    currentStandup: input.missedStandupId,
    status: { $in: OPEN_CARRY_FORWARD_STATUSES }
  })
    .select('_id tags')
    .lean()) as any[]

  await Promise.all(
    openOnMissed.map((item) =>
      CarryForwardItem.updateOne(
        { _id: item._id },
        {
          $set: {
            currentStandup: input.toStandupId,
            tags: Array.from(new Set([...(item.tags ?? []), 'from_missed_standup']))
          }
        }
      )
    )
  )

  // Idempotent the same way `upsertOpenItem` is: a re-run of this job for the
  // same missed stand-up (SCH-17) must not create a second rollup row.
  const alreadyRolled = await CarryForwardItem.findOne({
    type: 'missed_standup_rollup',
    originStandup: input.missedStandupId
  })
    .select('_id')
    .lean()

  if (!alreadyRolled) {
    await CarryForwardItem.create({
      sprint: input.sprintId,
      project: input.projectId,
      organization: input.organizationId,
      type: 'missed_standup_rollup',
      originStandup: input.missedStandupId,
      originDate: input.missedDate,
      currentStandup: input.toStandupId,
      ageInStandups: 1,
      status: 'open',
      tags: ['from_missed_standup']
    })
  }
}

// --- Panel 4 read model, note and resolve (CFW-5, CFW-7, CFW-10, CFW-11) --

export interface CarryForwardItemView {
  itemId: string
  type: CarryForwardItemType
  status: CarryForwardStatus
  taskId?: string
  taskKey?: string
  taskTitle?: string
  memberId?: string
  memberName?: string
  originDate: IsoDate
  ageInStandups: number
  ageBand: 'normal' | 'note_required' | 'escalated' | 'chronic'
  requiresNoteToday: boolean
  /** Whether the newest note in the thread was written for *this* stand-up (CC-4). */
  notedToday: boolean
  tags: CarryForwardTag[]
  notes: Array<{ standupDate: string; authorId: string; authorName?: string; text: string; createdAt: string }>
  resolution?: {
    resolvedAt: string
    resolvedById: string
    resolutionType: CarryForwardResolutionType
    comment?: string
  }
  validResolutions: string[]
}

export interface CarryForwardPanelView {
  standupId: string
  items: CarryForwardItemView[]
  summary: CarryForwardSummary
  noteThreshold: number
  escalationThreshold: number
}

/** Panel 4's read (CFW-10/11). Everything currently showing on this stand-up's board. */
export async function loadCarryForwardPanel(standupId: string): Promise<CarryForwardPanelView> {
  const standup = (await Standup.findById(standupId).lean()) as any
  if (!standup) {
    throw new StandupError('NOT_FOUND', 'That stand-up no longer exists.', { standupId })
  }

  const settings = (await ProjectStandupSettings.findOne({ project: standup.project }).lean()) as any
  const thresholds: AgeThresholds = {
    noteThreshold: settings?.carryForwardNoteThreshold ?? DEFAULT_NOTE_THRESHOLD,
    escalationThreshold: settings?.carryForwardEscalationThreshold ?? DEFAULT_ESCALATION_THRESHOLD
  }

  const items = (await CarryForwardItem.find({ currentStandup: standup._id }).lean()) as any[]

  const taskIds = Array.from(new Set(items.filter((item) => item.task).map((item) => String(item.task))))
  const memberIds = Array.from(new Set(items.filter((item) => item.member).map((item) => String(item.member))))
  const noteAuthorIds = Array.from(
    new Set(items.flatMap((item) => (item.notes ?? []).map((note: any) => String(note.author))))
  )

  const [tasks, people] = await Promise.all([
    taskIds.length
      ? (Task.find({ _id: { $in: taskIds } }).select('displayId title').lean() as Promise<any[]>)
      : Promise.resolve([]),
    memberIds.length || noteAuthorIds.length
      ? (User.find({ _id: { $in: Array.from(new Set([...memberIds, ...noteAuthorIds])) } })
          .select('firstName lastName email')
          .lean() as Promise<any[]>)
      : Promise.resolve([])
  ])

  const taskById = new Map(tasks.map((task) => [String(task._id), task]))
  const nameById = new Map(
    people.map((person) => [
      String(person._id),
      [person.firstName, person.lastName].filter(Boolean).join(' ') || person.email
    ])
  )

  const views: CarryForwardItemView[] = items.map((item) => {
    const task = item.task ? taskById.get(String(item.task)) : undefined
    return {
      itemId: String(item._id),
      type: item.type,
      status: item.status,
      ...(item.task ? { taskId: String(item.task), taskKey: task?.displayId, taskTitle: task?.title } : {}),
      ...(item.member
        ? { memberId: String(item.member), memberName: nameById.get(String(item.member)) }
        : {}),
      originDate: item.originDate,
      ageInStandups: item.ageInStandups,
      ageBand: ageBandFor(item.ageInStandups, thresholds),
      requiresNoteToday: requiresNoteToday(item.ageInStandups, thresholds),
      notedToday:
        (item.notes ?? []).length > 0 &&
        item.notes[item.notes.length - 1].standupDate === standup.standupDate,
      tags: item.tags ?? [],
      notes: (item.notes ?? []).map((note: any) => ({
        standupDate: note.standupDate,
        authorId: String(note.author),
        authorName: nameById.get(String(note.author)),
        text: note.text,
        createdAt: note.createdAt?.toISOString?.() ?? String(note.createdAt)
      })),
      ...(item.resolution
        ? {
            resolution: {
              resolvedAt: item.resolution.resolvedAt?.toISOString?.() ?? String(item.resolution.resolvedAt),
              resolvedById: String(item.resolution.resolvedBy),
              resolutionType: item.resolution.resolutionType,
              comment: item.resolution.comment
            }
          }
        : {}),
      validResolutions: validResolutionsFor(item.type)
    }
  })

  return {
    standupId,
    items: sortByAgeDescending(views.map((view) => ({ ...view, id: view.itemId }))),
    summary: summarise(
      views.map((view) => ({
        status: view.status,
        ageInStandups: view.ageInStandups,
        notedToday: view.notedToday,
        resolvedOnDate: view.resolution ? standup.standupDate : undefined
      })),
      thresholds,
      standup.standupDate
    ),
    noteThreshold: thresholds.noteThreshold,
    escalationThreshold: thresholds.escalationThreshold
  }
}

function validResolutionsFor(type: CarryForwardItemType): string[] {
  return [...(VALID_RESOLUTIONS_BY_TYPE[type] ?? [])]
}

export interface AddNoteInput {
  itemId: string
  standupId: string
  text: string
  actor: { userId: string }
}

/** CFW-4/CFW-5. Appends a note to the item's thread; the note itself is never editable. */
export async function addCarryForwardNote(input: AddNoteInput): Promise<CarryForwardItemView> {
  const item = (await CarryForwardItem.findById(input.itemId)) as ICarryForwardItem | null
  if (!item) {
    throw new StandupError('NOT_FOUND', 'That carry-forward item no longer exists.', {
      itemId: input.itemId
    })
  }
  if (String(item.currentStandup) !== input.standupId) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'That item is not on this stand-up.',
      { itemId: input.itemId, standupId: input.standupId }
    )
  }

  const standup = (await Standup.findById(input.standupId).select('standupDate organization project').lean()) as any
  const previousNoteText = item.notes.length > 0 ? item.notes[item.notes.length - 1].text : undefined

  const validation = validateCarryForwardNote({ text: input.text, previousNoteText })
  if (!validation.valid) {
    if (validation.code === 'NOTE_UNCHANGED') {
      throw new StandupError('NOTE_UNCHANGED', validation.message, { itemId: input.itemId })
    }
    throw new StandupError('VALIDATION_FAILED', validation.message, { itemId: input.itemId, field: 'text' })
  }

  item.notes.push({
    standup: item.currentStandup as any,
    standupDate: standup.standupDate,
    author: input.actor.userId as any,
    text: input.text.trim(),
    createdAt: new Date()
  })
  if (item.status !== 'escalated') item.status = 'noted'
  await item.save()

  await recordAudit({
    actor: { type: 'user', userId: input.actor.userId },
    organizationId: String(standup.organization),
    projectId: String(standup.project),
    action: 'carry_forward_noted',
    entityType: 'carry_forward_item',
    entityId: String(item._id),
    before: null,
    after: { text: input.text.trim() },
    context: { standupId: input.standupId }
  })

  const panel = await loadCarryForwardPanel(input.standupId)
  return panel.items.find((view) => view.itemId === input.itemId)!
}

export interface ResolveItemInput {
  itemId: string
  standupId: string
  resolutionType: CarryForwardResolutionType
  comment?: string
  actor: { userId: string }
}

const RESOLUTION_STATUS: Record<CarryForwardResolutionType, CarryForwardStatus> = {
  done: 'resolved',
  reassigned: 'closed_reassigned',
  descoped: 'closed_descoped',
  sprint_end_moved: 'closed_sprint_end',
  sprint_end_descoped: 'closed_sprint_end',
  sprint_end_closed: 'closed_sprint_end',
  acknowledged: 'resolved',
  other: 'resolved'
}

/** CFW-7. Resolves an item directly from the register row. */
export async function resolveCarryForwardItem(input: ResolveItemInput): Promise<CarryForwardItemView> {
  const item = (await CarryForwardItem.findById(input.itemId)) as ICarryForwardItem | null
  if (!item) {
    throw new StandupError('NOT_FOUND', 'That carry-forward item no longer exists.', {
      itemId: input.itemId
    })
  }

  if (!isResolutionValidForType(item.type, input.resolutionType)) {
    throw new StandupError(
      'VALIDATION_FAILED',
      `"${input.resolutionType}" is not a valid resolution for a ${item.type} item.`,
      { itemId: input.itemId, type: item.type, resolutionType: input.resolutionType }
    )
  }

  const standup = (await Standup.findById(input.standupId).select('organization project').lean()) as any

  item.status = RESOLUTION_STATUS[input.resolutionType]
  item.resolution = {
    resolvedAt: new Date(),
    resolvedBy: input.actor.userId as any,
    resolutionType: input.resolutionType,
    ...(input.comment ? { comment: input.comment } : {})
  }
  await item.save()

  await recordAudit({
    actor: { type: 'user', userId: input.actor.userId },
    organizationId: String(standup.organization),
    projectId: String(standup.project),
    action: 'carry_forward_resolved',
    entityType: 'carry_forward_item',
    entityId: String(item._id),
    before: null,
    after: { status: item.status, resolutionType: input.resolutionType },
    context: { standupId: input.standupId }
  })

  const panel = item.currentStandup ? await loadCarryForwardPanel(String(item.currentStandup)) : null
  const view = panel?.items.find((candidate) => candidate.itemId === String(item._id))
  if (!view) {
    // The item resolved successfully but no longer shows on any board (it was
    // the sprint's last stand-up). The caller gets the facts that matter —
    // what it resolved to — reconstructed rather than a lookup that cannot
    // succeed by definition.
    return {
      itemId: String(item._id),
      type: item.type,
      status: item.status,
      ...(item.task ? { taskId: String(item.task) } : {}),
      ...(item.member ? { memberId: String(item.member) } : {}),
      originDate: item.originDate,
      ageInStandups: item.ageInStandups,
      ageBand: 'normal',
      requiresNoteToday: false,
      notedToday: false,
      tags: item.tags ?? [],
      notes: [],
      resolution: {
        resolvedAt: item.resolution!.resolvedAt.toISOString(),
        resolvedById: input.actor.userId,
        resolutionType: input.resolutionType,
        comment: input.comment
      },
      validResolutions: []
    }
  }
  return view
}
