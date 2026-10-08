'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { formatMinutesAsHours, minutes as toMinutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'

import { asMinutes, field } from './rows'
import { committedMinutesByMember, type SummaryStats } from './stats'
import type { LooseRow, SummaryPayload } from './types'

const s = standupStrings.summary

const STATUS_LABEL: Record<string, string> = {
  present: 'Present',
  absent_planned: 'Absent (planned)',
  absent_unplanned: 'Absent (unplanned)'
}

const hours = (value: unknown) => formatMinutesAsHours(asMinutes(value))

/**
 * The document "Print / Save as PDF" produces.
 *
 * Printing the interactive screen cannot work: the app shell is a fixed-height
 * scroll container and every section caps its own height, so the browser
 * prints only what was visible and clips the rest. This renders the same
 * summary a second time as plain flowing tables — no scroll boxes, no chrome —
 * and the print stylesheet below shows *only* this and hides everything else.
 *
 * It is portalled to `document.body` so that hiding "everything but this" is
 * one selector (`body > :not(.standup-print-root)`) rather than a fight with
 * the layout's overflow and positioning. On screen it is `display: none`.
 */
export function SummaryPrintDocument({
  summary,
  stats,
  heading
}: {
  summary: SummaryPayload
  stats: SummaryStats
  heading: string
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  const { headerFacts: facts } = summary
  const committed = committedMinutesByMember(summary.memberCommitments)
  const debtOwed = summary.debtMovements.reduce(
    (total, row) => total + Number(row.outstandingDebtMinutes || 0),
    0
  )

  return createPortal(
    <div className="standup-print-root">
      <style>{PRINT_CSS}</style>

      <header className="sp-header">
        <div>
          <p className="sp-eyebrow">Stand-up summary</p>
          <h1>{heading}</h1>
          <p className="sp-meta">
            {s.dayOf({ day: facts.dayNumber, total: facts.totalDays })} · Facilitator:{' '}
            <strong>{facts.facilitatorName}</strong> · Duration:{' '}
            <strong>{s.duration({ minutes: facts.durationMinutes })}</strong>
          </p>
        </div>
      </header>

      <div className="sp-stats">
        <Stat label="Attendance" value={`${stats.presentCount}/${stats.attendanceTotal}`} sub={`${stats.attendancePercent}%`} />
        <Stat label="Completed yesterday" value={String(stats.completedCount)} />
        <Stat label="Ran over / blocked" value={String(stats.overEstimatedCount)} />
        <Stat label="Estimate debt" value={formatMinutesAsHours(toMinutes(Math.round(debtOwed)))} />
        <Stat label="Open blockers" value={String(stats.openBlockerCount)} />
        <Stat label="Carried forward" value={String(stats.carryForwardCount)} />
      </div>

      <Block title={s.sectionAttendance()} empty={summary.attendance.length === 0} emptyText={s.emptyAttendance()}>
        <table>
          <thead>
            <tr>
              <th>Member</th>
              <th>Status</th>
              <th className="r">Committed today</th>
            </tr>
          </thead>
          <tbody>
            {summary.attendance.map((row) => (
              <tr key={row.memberId}>
                <td>{row.name}</td>
                <td className={row.status.startsWith('absent') ? 'bad' : undefined}>
                  {STATUS_LABEL[row.status] ?? row.status}
                </td>
                <td className="r mono">
                  {hours(committed.get(String(row.memberId)) ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Block>

      <Block
        title={s.sectionCompletedYesterday()}
        empty={summary.completedYesterday.length === 0}
        emptyText={s.emptyCompletedYesterday()}
      >
        <table>
          <thead>
            <tr>
              <th className="key">Task</th>
              <th>Title</th>
            </tr>
          </thead>
          <tbody>
            {summary.completedYesterday.map((row) => (
              <tr key={row.taskId}>
                <td className="mono">{row.taskKey ?? '—'}</td>
                <td>{row.title ?? row.taskKey ?? row.taskId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Block>

      <Block title={s.sectionVariance()} empty={summary.varianceTable.length === 0} emptyText={s.emptyVariance()}>
        <table>
          <thead>
            <tr>
              <th className="key">Task</th>
              <th>Member</th>
              <th>Outcome</th>
              <th className="r">Day variance</th>
            </tr>
          </thead>
          <tbody>
            {summary.varianceTable.map((row, index) => {
              const variance = asMinutes(row.dayVarianceMinutes)
              return (
                <tr key={index}>
                  <td className="mono">{field(row, 'taskKey') ?? field(row, 'allocationId') ?? 'Task'}</td>
                  <td>{field(row, 'name') ?? '—'}</td>
                  <td className="cap">{field(row, 'outcome') ?? '—'}</td>
                  <td className={`r mono${variance > 0 ? ' bad' : ''}`}>
                    {formatMinutesAsHours(variance, { signed: true })}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Block>

      <Block
        title={s.sectionCommitments()}
        empty={summary.memberCommitments.length === 0}
        emptyText={s.emptyCommitments()}
      >
        {summary.memberCommitments.map((member) => (
          <table key={member.memberId} className="sp-group">
            <caption>
              {member.name}
              <span>
                {member.allocations.length} {member.allocations.length === 1 ? 'task' : 'tasks'} ·{' '}
                {hours(committed.get(String(member.memberId)) ?? 0)}
              </span>
            </caption>
            <tbody>
              {member.allocations.map((allocation, index) => (
                <tr key={`${allocation.taskId}-${index}`}>
                  <td className="mono key">{allocation.taskKey ?? '—'}</td>
                  <td>{allocation.taskTitle ?? ''}</td>
                  <td className="r mono">{hours(allocation.plannedMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </Block>

      <Block title={s.sectionDebtMovements()} empty={summary.debtMovements.length === 0} emptyText={s.emptyDebtMovements()}>
        <table>
          <thead>
            <tr>
              <th>Member</th>
              <th className="r">Debt</th>
              <th className="r">Surplus</th>
            </tr>
          </thead>
          <tbody>
            {summary.debtMovements.map((row, index) => (
              <tr key={index}>
                <td>{field(row, 'name') ?? field(row, 'memberId') ?? '—'}</td>
                <td className="r mono">{hours(row.outstandingDebtMinutes)}</td>
                <td className="r mono">{hours(row.surplusMinutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Block>

      <Block title={s.sectionBlockersRaised()} empty={summary.blockersRaised.length === 0} emptyText={s.emptyBlockersRaised()}>
        <ul>
          {summary.blockersRaised.map((row, index) => (
            <li key={index}>
              {field(row, 'description') ?? 'Blocker'}
              <Tags row={row} keys={['blockerType', 'severity', 'status']} />
            </li>
          ))}
        </ul>
      </Block>

      <Block title={s.sectionBlockersResolved()} empty={summary.blockersResolved.length === 0} emptyText={s.emptyBlockersResolved()}>
        <ul>
          {summary.blockersResolved.map((row, index) => {
            const by = field(row, 'name') ?? field(row, 'resolvedByName')
            return (
              <li key={index}>
                {field(row, 'resolutionNote') ?? 'Resolved.'}
                {by && <span className="tag">Resolved by {by}</span>}
              </li>
            )
          })}
        </ul>
      </Block>

      <Block title={s.sectionCarryForward()} empty={summary.carryForwardState.length === 0} emptyText={s.emptyCarryForward()}>
        <ul>
          {summary.carryForwardState.map((row, index) => (
            <li key={index}>
              {field(row, 'taskKey') ??
                field(row, 'taskTitle') ??
                field(row, 'memberName') ??
                standupStrings.carryForward.itemTypeLabel(field(row, 'type') ?? '')}
              <Tags row={row} keys={['ageBand', 'status']} />
            </li>
          ))}
        </ul>
      </Block>

      <Block title={s.sectionOverrides()} empty={summary.overridesIssued.length === 0} emptyText={s.emptyOverrides()}>
        <ul>
          {summary.overridesIssued.map((row, index) => {
            const approver = field(row, 'name') ?? field(row, 'approvedByName')
            return (
              <li key={index}>
                <strong className="cap">{field(row, 'type') ?? 'override'}</strong>
                <Tags row={row} keys={['reasonCode']} />
                {approver && <span className="tag">Approved by {approver}</span>}
                {field(row, 'justification') && <div className="note">{field(row, 'justification')}</div>}
              </li>
            )
          })}
        </ul>
      </Block>

      {summary.pmNotes && (
        <Block title={s.sectionNotes()}>
          <p className="sp-notes">{summary.pmNotes}</p>
        </Block>
      )}

      <footer className="sp-footer">
        Kanvaro · Stand-up summary · {heading} · Printed {new Date().toLocaleString()}
      </footer>
    </div>,
    document.body
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="sp-stat">
      <span className="v">
        {value}
        {sub && <small>{sub}</small>}
      </span>
      <span className="l">{label}</span>
    </div>
  )
}

function Block({
  title,
  empty,
  emptyText,
  children
}: {
  title: string
  empty?: boolean
  emptyText?: string
  children?: React.ReactNode
}) {
  return (
    <section className="sp-block">
      <h2>{title}</h2>
      {empty ? <p className="sp-empty">{emptyText}</p> : children}
    </section>
  )
}

function Tags({ row, keys }: { row: LooseRow; keys: string[] }) {
  return (
    <>
      {keys.map((key) => {
        const value = field(row, key)
        return value ? (
          <span key={key} className="tag cap">
            {value}
          </span>
        ) : null
      })}
    </>
  )
}

/**
 * Fixed light colours on purpose: a printout is white paper whatever theme the
 * app is in, so none of the `--plan-*` tokens (which follow dark mode) apply.
 */
const PRINT_CSS = `
  @media screen { .standup-print-root { display: none; } }
  @media print {
    @page { size: A4; margin: 14mm 12mm; }
    html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
    body > *:not(.standup-print-root) { display: none !important; }
    .standup-print-root {
      display: block; color: #1c1c1e; background: #fff;
      font: 10.5pt/1.45 -apple-system, 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .standup-print-root * { box-sizing: border-box; }
    .sp-header { border-bottom: 2px solid #007aff; padding-bottom: 10px; margin-bottom: 14px; }
    .sp-eyebrow { margin: 0; font-size: 8.5pt; letter-spacing: .08em; text-transform: uppercase; color: #007aff; font-weight: 700; }
    .sp-header h1 { margin: 2px 0 4px; font-size: 20pt; line-height: 1.15; }
    .sp-meta { margin: 0; color: #636366; font-size: 10pt; }
    .sp-stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 14px; }
    .sp-stat { border: 1px solid #d1d1d6; border-radius: 6px; padding: 8px 10px; background: #f7f7f9; break-inside: avoid; }
    .sp-stat .v { display: block; font-size: 15pt; font-weight: 700; font-variant-numeric: tabular-nums; }
    .sp-stat small { font-size: 8.5pt; color: #636366; margin-left: 5px; font-weight: 600; }
    .sp-stat .l { display: block; font-size: 7.5pt; color: #636366; text-transform: uppercase; letter-spacing: .04em; margin-top: 2px; }
    .sp-block { margin: 0 0 14px; }
    .sp-block h2 { margin: 0 0 6px; padding-bottom: 3px; border-bottom: 1px solid #d1d1d6; font-size: 11.5pt; break-after: avoid; }
    .sp-empty { margin: 0; color: #8e8e93; font-style: italic; }
    .standup-print-root table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    .standup-print-root th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; color: #636366; padding: 4px 8px; border-bottom: 1px solid #aeaeb2; }
    .standup-print-root td { padding: 4px 8px; border-bottom: 1px solid #e5e5ea; vertical-align: top; }
    .standup-print-root tr { break-inside: avoid; }
    .standup-print-root thead { display: table-header-group; }
    .standup-print-root .r { text-align: right; white-space: nowrap; }
    .standup-print-root .key { width: 90px; white-space: nowrap; }
    .standup-print-root .mono { font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: 9.5pt; font-variant-numeric: tabular-nums; }
    .standup-print-root .bad { color: #d70015; font-weight: 600; }
    .standup-print-root .cap { text-transform: capitalize; }
    .sp-group caption { caption-side: top; text-align: left; font-weight: 700; padding: 6px 8px 3px; background: #f2f2f7; break-after: avoid; }
    .sp-group caption span { float: right; font-weight: 500; color: #636366; font-size: 9pt; }
    .standup-print-root ul { margin: 0; padding: 0; list-style: none; }
    .standup-print-root li { padding: 5px 0; border-bottom: 1px solid #e5e5ea; break-inside: avoid; }
    .standup-print-root .tag { display: inline-block; margin-left: 6px; padding: 0 7px; border: 1px solid #c7c7cc; border-radius: 99px; font-size: 8.5pt; color: #48484a; }
    .standup-print-root .note { margin-top: 3px; color: #48484a; }
    .sp-notes { margin: 0; white-space: pre-wrap; }
    .sp-footer { margin-top: 16px; padding-top: 6px; border-top: 1px solid #d1d1d6; color: #8e8e93; font-size: 8pt; }
  }
`
