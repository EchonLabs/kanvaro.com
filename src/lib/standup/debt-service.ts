/**
 * The PM-facing debt actions (spec VAR-5, VAR-8, VAR-9, NFR-9).
 *
 * Three things a person can do to a ledger that is otherwise written only by
 * the classifier: read it, write debt off, and carry it into a new sprint.
 * All three append; none of them edits (DAT-4).
 *
 * **A write-off is an act with consequences**, so it costs twenty characters of
 * justification (VAR-8), lands in the audit trail, and notifies the project
 * admin. It also cannot exceed what is outstanding — writing off debt that does
 * not exist would manufacture a surplus, and surplus is a claim about
 * estimating well that nobody earned.
 *
 * **Carry-in is opt-in and confirmed** (VAR-9). Debt never follows somebody
 * into a new sprint silently; the project has to have asked for it, and the PM
 * is shown who carries what before it is posted.
 */
import { notificationService } from '@/lib/notification-service'
import { EstimateDebtLedger, WRITEOFF_REASON_MIN_LENGTH } from '@/models/EstimateDebtLedger'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Project } from '@/models/Project'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { User } from '@/models/User'

import { recordAudit, type AuditActor } from './audit'
import { computeDebtPosition, type DebtPosition } from './debt'
import { refreshDebtSummary, rebuildDebtSummaries } from './debt-summary'
import { StandupError } from './errors'
import { minutes, type Minutes } from './minutes'
import { standupStrings } from './strings'

export { refreshDebtSummary, rebuildDebtSummaries }
export { WRITEOFF_REASON_MIN_LENGTH }

export interface LedgerEntryView {
  entryId: string
  entryType: string
  minutes: Minutes
  createdAt: Date
  reason?: string
  sourceAllocationId?: string
  sourceStandupId: string
  sourceSprintId?: string
  createdById: string
}

export interface LedgerView {
  entries: LedgerEntryView[]
  position: DebtPosition
}

/** One member's ledger on one sprint, oldest first — the drawer's read. */
export async function loadLedger(input: {
  sprintId: string
  memberId: string
}): Promise<LedgerView> {
  const rows = (await EstimateDebtLedger.find({
    sprint: input.sprintId,
    member: input.memberId
  })
    .sort({ createdAt: 1 })
    .lean()) as any[]

  const entries: LedgerEntryView[] = rows.map((row) => ({
    entryId: String(row._id),
    entryType: row.entryType,
    minutes: minutes(row.minutes),
    createdAt: row.createdAt,
    ...(row.reason ? { reason: row.reason } : {}),
    ...(row.sourceAllocation ? { sourceAllocationId: String(row.sourceAllocation) } : {}),
    sourceStandupId: String(row.sourceStandup),
    ...(row.sourceSprint ? { sourceSprintId: String(row.sourceSprint) } : {}),
    createdById: String(row.createdBy)
  }))

  return {
    entries,
    position: computeDebtPosition(
      entries.map((entry) => ({ entryType: entry.entryType as any, minutes: entry.minutes }))
    )
  }
}

export interface WriteOffInput {
  sprintId: string
  memberId: string
  standupId: string
  minutes: Minutes | number
  reason: string
  actor: { userId: string }
}

/** VAR-8 / E44. Appends a `writeoff`, audits it, and tells the project admin. */
export async function writeOffDebt(input: WriteOffInput): Promise<DebtPosition> {
  const reason = (input.reason ?? '').trim()
  if (reason.length < WRITEOFF_REASON_MIN_LENGTH) {
    throw new StandupError(
      'INVALID_JUSTIFICATION',
      standupStrings.debt.writeOffReasonTooShort({ minLength: WRITEOFF_REASON_MIN_LENGTH }),
      { field: 'reason', minLength: WRITEOFF_REASON_MIN_LENGTH }
    )
  }

  const amount = Number(input.minutes)
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'A write-off must be a positive whole number of minutes.',
      { field: 'minutes', value: input.minutes }
    )
  }

  const { position } = await loadLedger({ sprintId: input.sprintId, memberId: input.memberId })
  if (amount > position.outstandingMinutes) {
    // Writing off more than is owed would produce a surplus nobody earned, and
    // surplus is a public claim about estimating well.
    throw new StandupError(
      'VALIDATION_FAILED',
      standupStrings.debt.writeOffTooLarge({ outstanding: position.outstandingMinutes }),
      { outstandingMinutes: position.outstandingMinutes, requestedMinutes: amount }
    )
  }

  const standup = (await Standup.findById(input.standupId).lean()) as any
  if (!standup) {
    throw new StandupError('NOT_FOUND', 'That stand-up no longer exists.', {
      standupId: input.standupId
    })
  }

  await EstimateDebtLedger.create({
    project: standup.project,
    sprint: input.sprintId,
    organization: standup.organization,
    member: input.memberId,
    entryType: 'writeoff',
    minutes: amount,
    sourceStandup: standup._id,
    reason,
    createdBy: input.actor.userId
  })

  const updated = await refreshDebtSummary({
    projectId: String(standup.project),
    sprintId: input.sprintId,
    organizationId: String(standup.organization),
    memberId: input.memberId
  })

  await recordAudit({
    actor: userActor(input.actor),
    organizationId: String(standup.organization),
    projectId: String(standup.project),
    action: 'debt_written_off',
    entityType: 'standup',
    entityId: String(standup._id),
    before: { outstandingMinutes: position.outstandingMinutes },
    after: { outstandingMinutes: updated.outstandingMinutes },
    context: { memberId: input.memberId, sprintId: input.sprintId, minutes: amount, reason }
  })

  await notifyAdminsOfWriteOff({
    projectId: String(standup.project),
    organizationId: String(standup.organization),
    memberId: input.memberId,
    minutes: minutes(amount),
    reason,
    actorId: input.actor.userId
  }).catch(() => {
    // The write-off is already recorded and audited. A downed transport must
    // not surface to the PM as "the write-off failed", because it did not.
  })

  return updated
}

export interface CarryInCandidate {
  memberId: string
  memberName: string
  minutes: Minutes
}

/**
 * VAR-9's confirmation list: who carries what out of the finished sprint.
 *
 * Read-only. Nothing is posted until the PM has seen this and said yes.
 */
export async function previewCarryIn(input: {
  fromSprintId: string
  toSprintId: string
}): Promise<CarryInCandidate[]> {
  const rows = (await EstimateDebtLedger.find({ sprint: input.fromSprintId }).lean()) as any[]

  const byMember = new Map<string, { entryType: any; minutes: Minutes }[]>()
  for (const row of rows) {
    const key = String(row.member)
    const list = byMember.get(key) ?? []
    list.push({ entryType: row.entryType, minutes: minutes(row.minutes) })
    byMember.set(key, list)
  }

  const candidates: CarryInCandidate[] = []
  const memberIds = Array.from(byMember.keys())
  const people = (await User.find({ _id: { $in: memberIds } })
    .select('firstName lastName email')
    .lean()) as any[]
  const nameById = new Map(
    people.map((person) => [
      String(person._id),
      [person.firstName, person.lastName].filter(Boolean).join(' ') || person.email
    ])
  )

  for (const memberId of memberIds) {
    const position = computeDebtPosition(byMember.get(memberId) ?? [])
    if (position.outstandingMinutes <= 0) continue
    candidates.push({
      memberId,
      memberName: nameById.get(memberId) ?? memberId,
      minutes: position.outstandingMinutes
    })
  }

  return candidates
}

/**
 * Posts the carry-in entries VAR-9 describes.
 *
 * Idempotent on `(sourceStandup, member, carry_in)`: the ledger's partial index
 * refuses a second one, so re-running a planning completion cannot double a
 * member's opening balance.
 */
export async function postCarryIn(input: {
  fromSprintId: string
  toSprintId: string
  actor: { userId: string }
}): Promise<{ posted: number }> {
  const sprint = (await Sprint.findById(input.toSprintId).lean()) as any
  if (!sprint) {
    throw new StandupError('NOT_FOUND', 'That sprint no longer exists.', {
      sprintId: input.toSprintId
    })
  }

  const settings = (await ProjectStandupSettings.findOne({ project: sprint.project }).lean()) as any
  if (!settings?.carryDebtBetweenSprints) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'This project does not carry estimate debt between sprints.',
      { projectId: String(sprint.project) }
    )
  }

  // The carry-in belongs to the sprint's first stand-up, which is the moment
  // the balance becomes visible to anybody.
  const firstStandup = (await Standup.findOne({ sprint: input.toSprintId })
    .sort({ sprintDayNumber: 1 })
    .lean()) as any
  if (!firstStandup) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'That sprint has no stand-ups yet, so there is nothing to carry debt into.',
      { sprintId: input.toSprintId }
    )
  }

  const candidates = await previewCarryIn(input)
  let posted = 0

  for (const candidate of candidates) {
    try {
      await EstimateDebtLedger.create({
        project: sprint.project,
        sprint: input.toSprintId,
        organization: sprint.organization,
        member: candidate.memberId,
        entryType: 'carry_in',
        minutes: candidate.minutes,
        sourceStandup: firstStandup._id,
        sourceSprint: input.fromSprintId,
        createdBy: input.actor.userId
      })
      posted += 1
    } catch (error) {
      // The unique partial index is the authority on "already carried in".
      if (!isDuplicateKey(error)) throw error
    }

    await refreshDebtSummary({
      projectId: String(sprint.project),
      sprintId: input.toSprintId,
      organizationId: String(sprint.organization),
      memberId: candidate.memberId
    })
  }

  if (posted > 0) {
    await recordAudit({
      actor: userActor(input.actor),
      organizationId: String(sprint.organization),
      projectId: String(sprint.project),
      action: 'debt_entry_posted',
      entityType: 'sprint',
      entityId: String(sprint._id),
      before: null,
      after: { carriedIn: posted, fromSprintId: input.fromSprintId },
      context: { sprintId: input.toSprintId }
    })
  }

  return { posted }
}

// --- internals --------------------------------------------------------------

async function notifyAdminsOfWriteOff(input: {
  projectId: string
  organizationId: string
  memberId: string
  minutes: Minutes
  reason: string
  actorId: string
}): Promise<number> {
  const project = (await Project.findById(input.projectId)
    .select('name createdBy projectRoles')
    .lean()) as any
  const member = (await User.findById(input.memberId)
    .select('firstName lastName email')
    .lean()) as any

  const memberName = member
    ? [member.firstName, member.lastName].filter(Boolean).join(' ') || member.email
    : 'a team member'

  // "The project admin" (VAR-8) is the project's creator plus anybody holding
  // the project-manager role on it. Ordinary members are not told: VAR-10 and
  // NFR-13 keep one person's debt out of the team's view.
  const managers = (project?.projectRoles ?? [])
    .filter((entry: any) => entry?.role === 'project_manager')
    .map((entry: any) => String(entry.user))

  const recipients = Array.from(
    new Set(
      [String(project?.createdBy ?? ''), ...managers]
        .filter(Boolean)
        // The person who did it does not need telling they did it.
        .filter((id) => id !== input.actorId)
    )
  )

  let sent = 0
  for (const userId of recipients) {
    const notification = await notificationService.createNotification(
      userId,
      input.organizationId,
      {
        type: 'standup',
        title: standupStrings.debt.writeOff(),
        message: `${standupStrings.debt.outstanding({ minutes: input.minutes })} of ${memberName}'s estimate debt was written off. ${input.reason}`,
        data: {
          entityType: 'standup',
          entityId: input.projectId,
          action: 'updated',
          priority: 'medium',
          projectName: project?.name,
          url: `/projects/${input.projectId}`,
          metadata: { notificationId: 'N12', memberId: input.memberId, minutes: input.minutes }
        }
      }
    )
    if (notification) sent += 1
  }

  return sent
}

const userActor = (actor: { userId: string }): AuditActor => ({
  type: 'user',
  userId: actor.userId
})

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    ((error as { code?: number }).code === 11000 ||
      /E11000/.test(String((error as { message?: string }).message ?? '')))
  )
}
