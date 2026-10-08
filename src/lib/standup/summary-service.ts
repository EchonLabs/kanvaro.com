/**
 * The §15.13 summary read path.
 *
 * Task 14 built `StandupSummary` (the persisted document) and `summary.ts`
 * (the pure assembler the completion saga calls once, on write). This file is
 * the other half: loading that document back for the summary screen and the
 * export routes, and rendering it as the plain-text/markdown UI-10 promises.
 *
 * Deliberately thin. `getSummary` does exactly one query and one shape check;
 * `renderSummaryMarkdown` does no querying at all, so it stays unit-testable
 * against a fixture the way `summary.ts`'s own tests are.
 */
import { StandupSummary, type IStandupSummary } from '@/models/StandupSummary'
import { Task } from '@/models/Task'
import { User } from '@/models/User'
import { StandupError } from './errors'
import { standupStrings } from './strings'

export type SummaryDocument = Awaited<ReturnType<typeof getSummary>>

/**
 * What the read path adds to a persisted row that names a member.
 *
 * Everything here is optional: a member who has since been deleted, or a row
 * from an older document whose `memberId` no longer resolves, keeps whatever
 * name it was written with and simply gains nothing — never disappears.
 */
export interface MemberIdentity {
  name?: string
  firstName?: string
  lastName?: string
  email?: string
  avatar?: string
}

export type HydratedSummary = Omit<
  IStandupSummary,
  'attendance' | 'memberCommitments' | 'debtMovements'
> & {
  attendance: Array<IStandupSummary['attendance'][number] & MemberIdentity>
  memberCommitments: Array<
    Omit<IStandupSummary['memberCommitments'][number], 'allocations'> &
      MemberIdentity & {
        allocations: Array<
          IStandupSummary['memberCommitments'][number]['allocations'][number] & { taskTitle?: string }
        >
      }
  >
  debtMovements: Array<Record<string, unknown> & MemberIdentity>
}

/**
 * The persisted summary stores only `{ memberId, name, status }` per member —
 * enough for the markdown export, not enough to draw a face. Rather than
 * widening what the completion saga writes, the identity fields the screen
 * needs are joined on read: a summary written last sprint then shows avatars
 * the same as one written today, and a member who changes their photo is not
 * frozen at the one they had on the day.
 */
async function hydrateMembers(summary: IStandupSummary): Promise<HydratedSummary> {
  const rowsWithMembers = [
    ...(summary.attendance ?? []),
    ...(summary.memberCommitments ?? []),
    ...((summary.debtMovements ?? []) as unknown as Record<string, unknown>[])
  ]

  const memberIds = Array.from(
    new Set(
      rowsWithMembers
        .map((row) => (row as Record<string, unknown>).memberId)
        .filter((id): id is NonNullable<typeof id> => id !== undefined && id !== null)
        .map((id) => String(id))
    )
  )

  if (memberIds.length === 0) return summary as HydratedSummary

  const users = await User.find({ _id: { $in: memberIds } })
    .select('firstName lastName email avatar')
    .lean<Array<{ _id: unknown; firstName?: string; lastName?: string; email?: string; avatar?: string }>>()

  const identityById = new Map<string, MemberIdentity>(
    users.map((user) => [
      String(user._id),
      {
        // Only the parts that exist: `toMatchObject`-visible `undefined` keys
        // would override a row's own stored `name` with nothing.
        ...(user.firstName || user.lastName
          ? { name: [user.firstName, user.lastName].filter(Boolean).join(' ') }
          : {}),
        ...(user.firstName ? { firstName: user.firstName } : {}),
        ...(user.lastName ? { lastName: user.lastName } : {}),
        ...(user.email ? { email: user.email } : {}),
        ...(user.avatar ? { avatar: user.avatar } : {})
      }
    ])
  )

  /**
   * The stored `name` wins over the joined one where both exist: it is what
   * the stand-up was actually run with, and a rename since then should not
   * quietly rewrite the historical record. The join only fills gaps (the debt
   * rows carry no name at all) and supplies the identity fields.
   */
  const merge = <T extends object>(row: T): T & MemberIdentity => {
    const fields = row as Record<string, unknown>
    const identity = identityById.get(String(fields.memberId))
    if (!identity) return row
    return { ...identity, ...row, name: (fields.name as string | undefined) ?? identity.name }
  }

  // Allocations persist only `{ taskId, taskKey, plannedMinutes }`, so a
  // commitment can name its task by key and nothing else. The title is joined
  // on read, for the same reason the identity is: it is current, and older
  // summaries gain it without being rewritten.
  const taskIds = Array.from(
    new Set(
      (summary.memberCommitments ?? [])
        .flatMap((member) => member.allocations ?? [])
        .map((allocation) => allocation?.taskId)
        .filter(Boolean)
        .map(String)
    )
  )
  const tasks = taskIds.length
    ? await Task.find({ _id: { $in: taskIds } })
        .select('title')
        .lean<Array<{ _id: unknown; title?: string }>>()
    : []
  const titleById = new Map(tasks.map((task) => [String(task._id), task.title]))
  const withTitles = <T extends { allocations?: Array<{ taskId: unknown }> }>(member: T): T => ({
    ...member,
    allocations: (member.allocations ?? []).map((allocation) => {
      const taskTitle = titleById.get(String(allocation.taskId))
      return taskTitle ? { ...allocation, taskTitle } : allocation
    })
  })

  return {
    ...summary,
    attendance: (summary.attendance ?? []).map(merge),
    memberCommitments: (summary.memberCommitments ?? []).map((member) => withTitles(merge(member))),
    debtMovements: ((summary.debtMovements ?? []) as unknown as Record<string, unknown>[]).map(merge)
  } as HydratedSummary
}

/**
 * Reads a field off a row typed as `Record<string, unknown>` in the schema
 * (variance, debt, blockers, carry-forward, overrides all are — see
 * `StandupSummary.ts`'s own docblock) without `any` spreading through every
 * call site. The persisted shape is concrete as of the completion route
 * (`src/app/api/standups/[id]/complete/route.ts`'s `summaryInputs`), but this
 * stays defensive — a `String()`/fallback rather than a throw — so an older
 * or hand-seeded summary document renders something readable instead of
 * crashing the export.
 */
function field(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key]
  if (value === undefined || value === null) return undefined
  return String(value)
}

function minutesToHours(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? (n / 60).toFixed(1) : '0.0'
}

/**
 * Loads the persisted summary for a stand-up.
 *
 * Throws `NOT_FOUND` when none exists yet — a stand-up that has not been
 * completed has no summary, and that is the caller's cue to show "not
 * completed yet" rather than a blank screen (`toErrorResponse` turns this
 * into the catalogued 404 envelope for both routes below).
 *
 * Rows naming a member come back hydrated with that member's identity — see
 * `hydrateMembers` for why the join lives on the read side.
 */
export async function getSummary(standupId: string): Promise<HydratedSummary> {
  const summary = await StandupSummary.findOne({ standup: standupId }).lean<IStandupSummary>()
  if (!summary) {
    throw new StandupError('NOT_FOUND', 'This stand-up has no summary yet.')
  }
  return hydrateMembers(summary)
}

/**
 * UI-10's "copyable as formatted text for pasting into a chat tool," and the
 * export route's `?format=markdown` body.
 *
 * Every §15.13 section gets a heading, even ones that are commonly empty
 * (blockers, overrides) — an omitted heading reads as "this was never built"
 * rather than "nothing happened today," the same reasoning
 * `yesterday.bucketBlocked` etc. apply in the run screen.
 */
export function renderSummaryMarkdown(summary: SummaryDocument): string {
  const lines: string[] = []
  const nameById = new Map(
    (summary.attendance ?? []).map((row: any) => [String(row.memberId), row.name])
  )
  const nameFor = (memberId: unknown) => nameById.get(String(memberId)) ?? String(memberId ?? '')

  lines.push(
    `# Stand-up — ${summary.headerFacts.standupDate} (Day ${summary.headerFacts.dayNumber} of ${summary.headerFacts.totalDays})`
  )
  lines.push(`Facilitator: ${summary.headerFacts.facilitatorName}`)
  lines.push(`Duration: ${summary.headerFacts.durationMinutes} minutes`)
  lines.push('')

  lines.push('## Attendance')
  if (summary.attendance.length === 0) lines.push('Nothing recorded.')
  for (const row of summary.attendance) lines.push(`- ${row.name}: ${row.status}`)
  lines.push('')

  lines.push('## Completed yesterday')
  if (summary.completedYesterday.length === 0) lines.push('Nothing completed.')
  for (const row of summary.completedYesterday) {
    lines.push(`- ${row.taskKey ?? row.taskId} ${row.title ?? ''}`.trimEnd())
  }
  lines.push('')

  lines.push('## Variance')
  if (summary.varianceTable.length === 0) lines.push('Nothing recorded.')
  for (const row of summary.varianceTable as unknown as Record<string, unknown>[]) {
    const taskKey = field(row, 'taskKey') ?? field(row, 'allocationId') ?? 'Task'
    const memberName = nameFor(row.memberId)
    const outcome = field(row, 'outcome') ?? 'unknown'
    const variance = minutesToHours(row.dayVarianceMinutes)
    lines.push(`- ${taskKey} (${memberName}): ${outcome}, ${variance}h day variance`)
  }
  lines.push('')

  lines.push('## Estimate debt movements')
  if (summary.debtMovements.length === 0) lines.push('Nothing recorded.')
  for (const row of summary.debtMovements as unknown as Record<string, unknown>[]) {
    const memberName = nameFor(row.memberId)
    const debt = minutesToHours(row.outstandingDebtMinutes)
    const surplus = minutesToHours(row.surplusMinutes)
    lines.push(`- ${memberName}: ${debt}h outstanding debt, ${surplus}h surplus`)
  }
  lines.push('')

  lines.push('## Today’s commitments')
  if (summary.memberCommitments.length === 0) lines.push('Nothing planned.')
  for (const member of summary.memberCommitments) {
    lines.push(`**${member.name}**`)
    for (const a of member.allocations) {
      const title = (a as { taskTitle?: string }).taskTitle
      lines.push(
        `- ${a.taskKey ?? a.taskId}${title ? ` ${title}` : ''} (${(a.plannedMinutes / 60).toFixed(1)}h)`
      )
    }
  }
  lines.push('')

  lines.push('## Blockers raised')
  if (summary.blockersRaised.length === 0) lines.push('None.')
  for (const row of summary.blockersRaised as unknown as Record<string, unknown>[]) {
    const description = field(row, 'description') ?? 'Blocker'
    const blockerType = field(row, 'blockerType')
    const severity = field(row, 'severity')
    const status = field(row, 'status')
    const meta = [blockerType, severity].filter(Boolean).join(', ')
    lines.push(`- ${description}${meta ? ` (${meta})` : ''}${status ? ` — ${status}` : ''}`)
  }
  lines.push('')

  lines.push('## Blockers resolved')
  if (summary.blockersResolved.length === 0) lines.push('None.')
  for (const row of summary.blockersResolved as unknown as Record<string, unknown>[]) {
    const note = field(row, 'resolutionNote')
    lines.push(`- ${note ?? 'Resolved.'}`)
  }
  lines.push('')

  lines.push('## Carry forward')
  if (summary.carryForwardState.length === 0) lines.push('Nothing carried forward.')
  for (const row of summary.carryForwardState as unknown as Record<string, unknown>[]) {
    const label =
      field(row, 'taskKey') ??
      field(row, 'taskTitle') ??
      field(row, 'memberName') ??
      standupStrings.carryForward.itemTypeLabel(field(row, 'type') ?? '')
    const ageBand = field(row, 'ageBand')
    const status = field(row, 'status')
    lines.push(`- ${label}${ageBand ? ` (${ageBand})` : ''}${status ? ` — ${status}` : ''}`)
  }
  lines.push('')

  lines.push('## Overrides issued')
  if (summary.overridesIssued.length === 0) lines.push('None.')
  for (const row of summary.overridesIssued as unknown as Record<string, unknown>[]) {
    const type = field(row, 'type') ?? 'override'
    const reasonCode = field(row, 'reasonCode')
    const justification = field(row, 'justification')
    lines.push(
      `- **${type}**${reasonCode ? ` (${reasonCode})` : ''}${justification ? `: ${justification}` : ''}`
    )
  }

  if (summary.pmNotes) {
    lines.push('')
    lines.push('## Notes')
    lines.push(summary.pmNotes)
  }

  return lines.join('\n')
}
