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
import { StandupError } from './errors'

export type SummaryDocument = Awaited<ReturnType<typeof getSummary>>

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
 */
export async function getSummary(standupId: string): Promise<IStandupSummary> {
  const summary = await StandupSummary.findOne({ standup: standupId }).lean<IStandupSummary>()
  if (!summary) {
    throw new StandupError('NOT_FOUND', 'This stand-up has no summary yet.')
  }
  return summary
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
      lines.push(`- ${a.taskKey ?? a.taskId} (${(a.plannedMinutes / 60).toFixed(1)}h)`)
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
    const taskKey = field(row, 'taskKey') ?? field(row, 'itemId') ?? 'Item'
    const ageBand = field(row, 'ageBand')
    const status = field(row, 'status')
    lines.push(`- ${taskKey}${ageBand ? ` (${ageBand})` : ''}${status ? ` — ${status}` : ''}`)
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
