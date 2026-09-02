'use client'

/**
 * The read-only stand-up summary screen (§15.13, UI-10/UI-11).
 *
 * Thin, matching the run screen's own conventions (`.../[standupId]/page.tsx`):
 * loads one payload, keeps `use client` state for loading/error, and adapts
 * nothing beyond what the route already returns — `GET /summary` is already
 * shaped as the `StandupSummary` document.
 *
 * Every §15.13 section renders, even the commonly-empty ones (blockers,
 * overrides): an omitted heading reads as "not built" rather than "nothing
 * happened", per this module's established convention (see `strings.ts`'s
 * `yesterday` namespace docblock).
 *
 * UI-10's two export actions live here rather than on a shared component:
 * "Copy as text" calls the export route and writes its markdown to the
 * clipboard; "Print / Save as PDF" is `window.print()` against the
 * `@media print` stylesheet below, which hides everything but the summary
 * itself — the actual PDF path per this plan's Architecture note.
 */
import { useCallback, useEffect, useState } from 'react'

import { MainLayout } from '@/components/layout/MainLayout'
import { standupStrings } from '@/lib/standup/strings'

interface HeaderFacts {
  standupDate: string
  dayNumber: number
  totalDays: number
  facilitatorName: string
  durationMinutes: number
}

interface AttendanceRow {
  memberId: string
  name: string
  status: string
}

interface CompletedYesterdayRow {
  taskId: string
  taskKey?: string
  title?: string
}

interface MemberCommitment {
  memberId: string
  name: string
  allocations: Array<{ taskId: string; taskKey?: string; plannedMinutes: number }>
}

interface SummaryPayload {
  headerFacts: HeaderFacts
  attendance: AttendanceRow[]
  completedYesterday: CompletedYesterdayRow[]
  varianceTable: Array<Record<string, unknown>>
  debtMovements: Array<Record<string, unknown>>
  memberCommitments: MemberCommitment[]
  blockersRaised: Array<Record<string, unknown>>
  blockersResolved: Array<Record<string, unknown>>
  carryForwardState: Array<Record<string, unknown>>
  overridesIssued: Array<Record<string, unknown>>
  pmNotes?: string
}

const s = standupStrings.summary

export default function StandupSummaryPage({
  params
}: {
  params: { id: string; sprintId: string; standupId: string }
}) {
  const { standupId } = params

  const [summary, setSummary] = useState<SummaryPayload | null>(null)
  const [notAvailable, setNotAvailable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copyNotice, setCopyNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const response = await fetch(`/api/standups/${standupId}/summary`)
        if (!cancelled && response.status === 404) {
          setNotAvailable(true)
          return
        }
        if (!response.ok) throw new Error('failed')
        const payload = await response.json()
        if (!cancelled) setSummary(payload.data ?? payload)
      } catch {
        if (!cancelled) setError(s.loadFailed())
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [standupId])

  const copyAsText = useCallback(async () => {
    try {
      const response = await fetch(`/api/standups/${standupId}/summary/export?format=markdown`)
      if (!response.ok) throw new Error('failed')
      const text = await response.text()
      await navigator.clipboard.writeText(text)
      setCopyNotice(s.copied())
    } catch {
      setCopyNotice(s.copyFailed())
    }
  }, [standupId])

  const printSummary = useCallback(() => {
    window.print()
  }, [])

  return (
    <MainLayout>
      <style>{`
        @media print {
          .standup-summary-no-print {
            display: none !important;
          }
        }
      `}</style>
      <div className="mx-auto w-full max-w-4xl space-y-5 p-4 md:p-6">
        <div className="standup-summary-no-print flex items-center justify-between">
          <h1 className="text-lg font-semibold">{s.title()}</h1>
          {summary && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={copyAsText}
                className="rounded-md border border-border px-3 py-1 text-sm"
              >
                {s.copyAsText()}
              </button>
              <button
                type="button"
                onClick={printSummary}
                className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground"
              >
                {s.printOrSave()}
              </button>
            </div>
          )}
        </div>

        {copyNotice && (
          <p role="status" className="standup-summary-no-print text-sm text-muted-foreground">
            {copyNotice}
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">
            {error}
          </p>
        )}

        {notAvailable && (
          <p role="status" className="rounded-md border border-border p-3 text-sm">
            {s.notAvailable()}
          </p>
        )}

        {!summary && !error && !notAvailable && (
          <p className="text-sm text-muted-foreground">{s.loading()}</p>
        )}

        {summary && (
          <div className="space-y-6">
            <header className="space-y-1 border-b border-border pb-3">
              <h2 className="text-base font-semibold">
                {summary.headerFacts.standupDate} —{' '}
                {s.dayOf({ day: summary.headerFacts.dayNumber, total: summary.headerFacts.totalDays })}
              </h2>
              <p className="text-sm text-muted-foreground">
                {s.facilitator({ name: summary.headerFacts.facilitatorName })} ·{' '}
                {s.duration({ minutes: summary.headerFacts.durationMinutes })}
              </p>
            </header>

            <Section title={s.sectionAttendance()}>
              {summary.attendance.length === 0 ? (
                <Empty text={s.emptyAttendance()} />
              ) : (
                <ul className="space-y-1 text-sm">
                  {summary.attendance.map((row) => (
                    <li key={row.memberId}>
                      {row.name}: {row.status}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title={s.sectionCompletedYesterday()}>
              {summary.completedYesterday.length === 0 ? (
                <Empty text={s.emptyCompletedYesterday()} />
              ) : (
                <ul className="space-y-1 text-sm">
                  {summary.completedYesterday.map((row) => (
                    <li key={row.taskId}>
                      {row.taskKey ?? row.taskId} {row.title ?? ''}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title={s.sectionVariance()}>
              {summary.varianceTable.length === 0 ? (
                <Empty text={s.emptyVariance()} />
              ) : (
                <RawRows rows={summary.varianceTable} />
              )}
            </Section>

            <Section title={s.sectionDebtMovements()}>
              {summary.debtMovements.length === 0 ? (
                <Empty text={s.emptyDebtMovements()} />
              ) : (
                <RawRows rows={summary.debtMovements} />
              )}
            </Section>

            <Section title={s.sectionCommitments()}>
              {summary.memberCommitments.length === 0 ? (
                <Empty text={s.emptyCommitments()} />
              ) : (
                <div className="space-y-3 text-sm">
                  {summary.memberCommitments.map((member) => (
                    <div key={member.memberId}>
                      <p className="font-medium">{member.name}</p>
                      <ul className="space-y-1 pl-4">
                        {member.allocations.map((allocation, index) => (
                          <li key={`${member.memberId}-${index}`}>
                            {allocation.taskKey ?? allocation.taskId} (
                            {(allocation.plannedMinutes / 60).toFixed(1)}h)
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title={s.sectionBlockersRaised()}>
              {summary.blockersRaised.length === 0 ? (
                <Empty text={s.emptyBlockersRaised()} />
              ) : (
                <RawRows rows={summary.blockersRaised} />
              )}
            </Section>

            <Section title={s.sectionBlockersResolved()}>
              {summary.blockersResolved.length === 0 ? (
                <Empty text={s.emptyBlockersResolved()} />
              ) : (
                <RawRows rows={summary.blockersResolved} />
              )}
            </Section>

            <Section title={s.sectionCarryForward()}>
              {summary.carryForwardState.length === 0 ? (
                <Empty text={s.emptyCarryForward()} />
              ) : (
                <RawRows rows={summary.carryForwardState} />
              )}
            </Section>

            <Section title={s.sectionOverrides()}>
              {summary.overridesIssued.length === 0 ? (
                <Empty text={s.emptyOverrides()} />
              ) : (
                <RawRows rows={summary.overridesIssued} />
              )}
            </Section>

            {summary.pmNotes && (
              <Section title={s.sectionNotes()}>
                <p className="whitespace-pre-wrap text-sm">{summary.pmNotes}</p>
              </Section>
            )}
          </div>
        )}
      </div>
    </MainLayout>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>
}

/**
 * Overrides, variance rows, blockers etc. are stored as loosely-typed
 * `Record<string, unknown>` rows (see `StandupSummary.ts`'s own docblock) —
 * they carry whatever shape the completion saga wrote at the time. This
 * screen surfaces them faithfully rather than guessing at a stricter shape;
 * a JSON dump preserves override justification text in full, which UI-10
 * requires ("overrides issued with full justification text").
 */
function RawRows({ rows }: { rows: Array<Record<string, unknown>> }) {
  return (
    <ul className="space-y-1 text-sm">
      {rows.map((row, index) => (
        <li key={index} className="whitespace-pre-wrap break-words">
          {JSON.stringify(row)}
        </li>
      ))}
    </ul>
  )
}
