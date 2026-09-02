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
  for (const row of summary.varianceTable) lines.push(`- ${JSON.stringify(row)}`)
  lines.push('')

  lines.push('## Estimate debt movements')
  if (summary.debtMovements.length === 0) lines.push('Nothing recorded.')
  for (const row of summary.debtMovements) lines.push(`- ${JSON.stringify(row)}`)
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
  for (const row of summary.blockersRaised) lines.push(`- ${JSON.stringify(row)}`)
  lines.push('')

  lines.push('## Blockers resolved')
  if (summary.blockersResolved.length === 0) lines.push('None.')
  for (const row of summary.blockersResolved) lines.push(`- ${JSON.stringify(row)}`)
  lines.push('')

  lines.push('## Carry forward')
  if (summary.carryForwardState.length === 0) lines.push('Nothing carried forward.')
  for (const row of summary.carryForwardState) lines.push(`- ${JSON.stringify(row)}`)
  lines.push('')

  lines.push('## Overrides issued')
  if (summary.overridesIssued.length === 0) lines.push('None.')
  for (const o of summary.overridesIssued) lines.push(`- ${JSON.stringify(o)}`)

  if (summary.pmNotes) {
    lines.push('')
    lines.push('## Notes')
    lines.push(summary.pmNotes)
  }

  return lines.join('\n')
}
