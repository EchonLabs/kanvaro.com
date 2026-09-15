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
 *
 * Visuals reuse the My Stand-up redesign's shared primitives
 * (`SectionCard`/`IconChip`/`StatusPill`/`HoursValue`/`TaskRow`) rather than
 * inventing a second bare-bullet-list style for the same module.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowRight,
  Box,
  CalendarClock,
  CheckCircle2,
  ChevronsRight,
  ClipboardCopy,
  Clock,
  CornerDownRight,
  ListChecks,
  MessageSquare,
  Pencil,
  Printer,
  ShieldAlert,
  ShieldCheck,
  Users,
  Wallet,
  Wrench,
  Zap
} from 'lucide-react'

import { MainLayout } from '@/components/layout/MainLayout'
import { Button } from '@/components/ui/Button'
import { standupStrings } from '@/lib/standup/strings'
import { minutes as toMinutes, sumMinutes, type Minutes } from '@/lib/standup/minutes'
import { SectionCard } from '@/components/standup/my/shared/SectionCard'
import { StatusPill, type StatusPillTone } from '@/components/standup/my/shared/StatusPill'
import { HoursValue } from '@/components/standup/my/shared/HoursValue'
import { TaskRow } from '@/components/standup/my/shared/TaskRow'
import { RingGauge, type RingGaugeTone } from '@/components/standup/my/shared/RingGauge'
import { StatCard } from '@/components/standup/my/shared/StatCard'
import { AttendanceAvatar } from '@/components/standup/my/shared/AttendanceAvatar'

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

/**
 * Reads a field off a row typed as `Record<string, unknown>` in the payload
 * (variance, debt, blockers, carry-forward, overrides all are — the schema
 * stores them as Mixed). Mirrors `summary-service.ts`'s own `field` helper so
 * the screen and the markdown export never disagree about what a missing
 * field renders as.
 */
function field(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key]
  if (value === undefined || value === null) return undefined
  return String(value)
}

/**
 * A tolerant `Minutes` cast for this screen only. The payload's variance/debt
 * rows are `Record<string, unknown>` (Mixed in the schema) — historical
 * documents, not a value this page computed — so this rounds and defaults
 * rather than throwing the way `minutes()` does for live arithmetic.
 */
function asMinutes(value: unknown): Minutes {
  const n = typeof value === 'number' ? value : Number(value)
  return toMinutes(Number.isFinite(n) ? Math.round(n) : 0)
}

/**
 * The detail sections below the hero keep the original two-tone vocabulary —
 * neutral or red, nothing else — because a dense list is where an extra hue
 * per row would read as noise and bury what actually needs attention.
 * (Attendance itself is no longer a list here — see `AttendanceAvatar` — so
 * status now shows as a dot badge instead of this tone map.) The hero's own
 * stat grid is the deliberate exception: those tiles mirror the reference
 * design's fixed category colours (green/blue/red) rather than this rule,
 * since they're a glanceable summary strip, not a scan-for-problems list.
 */
function outcomeTone(outcome: string): StatusPillTone {
  const lower = outcome.toLowerCase()
  if (lower.includes('blocked') || lower.includes('over')) return 'red'
  return 'neutral'
}

function varianceTone(minutesValue: number): 'neutral' | 'red' {
  return minutesValue > 0 ? 'red' : 'neutral'
}

export default function StandupSummaryPage({
  params
}: {
  params: { id: string; sprintId: string; standupId: string }
}) {
  const { id: projectId, sprintId, standupId } = params
  const router = useRouter()

  const [summary, setSummary] = useState<SummaryPayload | null>(null)
  const [notAvailable, setNotAvailable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copyNotice, setCopyNotice] = useState<string | null>(null)

  // Without this, "summary" is dropped by the auto-generator (it follows the
  // standup id), leaving this screen breadcrumb-identical to the run screen
  // it summarizes — no way to tell, from the trail alone, which one you're
  // on. The "Stand-up" crumb links back to the run screen itself. Passed as
  // a prop, not via `useBreadcrumb()` — see the run screen page for why that
  // hook silently no-ops when called from a page component.
  const breadcrumbItems = [
    { label: 'Projects', href: '/projects' },
    { label: 'View Project', href: `/projects/${projectId}` },
    { label: 'View Sprint', href: `/sprints/${sprintId}` },
    {
      label: 'Stand-up',
      href: `/projects/${projectId}/sprints/${sprintId}/standups/${standupId}`
    },
    { label: 'Summary' }
  ]

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

  const nameFor = (memberId: unknown): string => {
    const match = summary?.attendance.find((row) => row.memberId === memberId)
    return match?.name ?? String(memberId ?? '')
  }

  // The hero's big calendar figure reads the date apart into day/month/weekday
  // — `standupDate` itself is only ever an ISO calendar date (`YYYY-MM-DD`),
  // so there's no timezone to reconcile here, just a local parse.
  const dateParts = useMemo(() => {
    if (!summary) return null
    const parsed = new Date(`${summary.headerFacts.standupDate}T00:00:00`)
    if (Number.isNaN(parsed.getTime())) return null
    return {
      day: parsed.getDate(),
      month: parsed.toLocaleDateString(undefined, { month: 'long' }),
      weekday: parsed.toLocaleDateString(undefined, { weekday: 'long' })
    }
  }, [summary])

  const stats = useMemo(() => {
    if (!summary) return null

    const presentCount = summary.attendance.filter((row) => row.status === 'present').length
    const totalAttendance = summary.attendance.length
    const attendancePercent = totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : 0
    // Full attendance is the expected case, not a celebration — it stays
    // neutral. Anything less is the one thing worth a glance.
    const attendanceTone: RingGaugeTone =
      totalAttendance === 0 || presentCount === totalAttendance ? 'neutral' : 'red'

    const openBlockers = Math.max(0, summary.blockersRaised.length - summary.blockersResolved.length)
    const carryForwardCount = summary.carryForwardState.length
    const overridesCount = summary.overridesIssued.length
    const totalDebt = sumMinutes(summary.debtMovements, (row) => asMinutes(row.outstandingDebtMinutes))
    const varianceOverCount = summary.varianceTable.filter(
      (row) => outcomeTone(field(row, 'outcome') ?? 'unknown') === 'red'
    ).length

    return {
      presentCount,
      totalAttendance,
      attendancePercent,
      attendanceTone,
      completedCount: summary.completedYesterday.length,
      openBlockers,
      carryForwardCount,
      overridesCount,
      totalDebt,
      varianceOverCount
    }
  }, [summary])

  return (
    <MainLayout breadcrumbItems={breadcrumbItems}>
      <style>{`
        @media print {
          .standup-summary-no-print {
            display: none !important;
          }
        }
      `}</style>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="standup-summary-no-print flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Box className="h-5 w-5 text-[var(--apple-label)]" strokeWidth={1.75} />
            <h1 className="text-[20px] font-semibold text-[var(--apple-label)]">{s.title()}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                router.push(`/projects/${projectId}/sprints/${sprintId}/standups/${standupId}`)
              }
            >
              <Zap className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
              View stand-up
            </Button>
            {summary && (
              <>
                <Button variant="outline" size="sm" onClick={copyAsText}>
                  <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
                  {s.copyAsText()}
                </Button>
                <Button size="sm" onClick={printSummary}>
                  <Printer className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
                  {s.printOrSave()}
                </Button>
              </>
            )}
          </div>
        </div>

        {copyNotice && (
          <p role="status" className="standup-summary-no-print text-[13px] text-[var(--apple-secondary-label)]">
            {copyNotice}
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-system-red)]/30 bg-[var(--apple-system-red)]/10 p-3 text-[13px] text-[var(--apple-system-red)]"
          >
            {error}
          </p>
        )}

        {notAvailable && (
          <p className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-3 text-[15px] text-[var(--apple-secondary-label)]">
            {s.notAvailable()}
          </p>
        )}

        {!summary && !error && !notAvailable && (
          <p className="text-[15px] text-[var(--apple-secondary-label)]">{s.loading()}</p>
        )}

        {summary && stats && (
          <div className="flex flex-col gap-4">
            {/* Hero — the one large visual on this screen, same instrument the
                My Stand-up capacity card uses, so a summary reads as native to
                this module rather than as a plain document dump. */}
            <div className="flex flex-wrap items-center gap-6 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-6">
              {dateParts ? (
                <div className="flex flex-col items-start">
                  <span className="font-apple-mono text-[52px] font-bold leading-none tabular-nums text-[var(--apple-label)]">
                    {dateParts.day}
                  </span>
                  <span className="text-[15px] font-semibold text-[var(--apple-label)]">{dateParts.month}</span>
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">{dateParts.weekday}</span>
                </div>
              ) : null}

              <div className="flex min-w-[220px] flex-1 flex-col gap-2">
                <span className="flex items-center gap-1.5 text-[13px] text-[var(--apple-secondary-label)]">
                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                  {s.dayOf({ day: summary.headerFacts.dayNumber, total: summary.headerFacts.totalDays })}
                </span>
                <span className="flex items-center gap-1.5 text-[13px] text-[var(--apple-secondary-label)]">
                  <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.75} />
                  {s.facilitator({ name: summary.headerFacts.facilitatorName })}
                </span>
                <span className="flex items-center gap-1.5 text-[13px] text-[var(--apple-secondary-label)]">
                  <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
                  {s.duration({ minutes: summary.headerFacts.durationMinutes })}
                </span>
              </div>

              <RingGauge percentage={stats.attendancePercent} tone={stats.attendanceTone} size={112} strokeWidth={9}>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="font-apple-mono text-[24px] font-bold leading-none tabular-nums text-[var(--apple-label)]">
                    {stats.presentCount}
                    <span className="text-[14px] font-medium text-[var(--apple-secondary-label)]">
                      /{stats.totalAttendance}
                    </span>
                  </span>
                  <span className="text-center text-[10px] leading-tight text-[var(--apple-tertiary-label)]">
                    participants
                    <br />
                    attended
                  </span>
                </div>
              </RingGauge>
            </div>

            {/* Stat grid — mirrors the hero's own card language: an icon
                circle, one big figure, its label underneath. Each tile still
                jumps to its own section below, so the grid doubles as a table
                of contents for a document this long. */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard
                href="#completed-yesterday-section"
                icon={<CheckCircle2 strokeWidth={1.75} />}
                tone="green"
                value={stats.completedCount}
                label={s.sectionCompletedYesterday()}
              />
              <StatCard
                href="#variance-section"
                icon={<AlertTriangle strokeWidth={1.75} />}
                tone="red"
                value={stats.varianceOverCount}
                label="Over estimated tasks"
              />
              <StatCard
                href="#debt-section"
                icon={<ArrowRight strokeWidth={1.75} />}
                tone="blue"
                value={<HoursValue minutes={stats.totalDebt} />}
                label={s.sectionDebtMovements()}
              />
              <StatCard
                href="#blockers-raised-section"
                icon={<ShieldCheck strokeWidth={1.75} />}
                tone="blue"
                value={stats.openBlockers}
                label="Open blockers"
              />
              <StatCard
                href="#carry-forward-section"
                icon={<ChevronsRight strokeWidth={1.75} />}
                tone="red"
                value={stats.carryForwardCount}
                label={s.sectionCarryForward()}
              />
              <StatCard
                href="#overrides-section"
                icon={<Wrench strokeWidth={1.75} />}
                tone="red"
                value={stats.overridesCount}
                label={s.sectionOverrides()}
              />
            </div>

            <div
              id="attendance-section"
              className="flex flex-col gap-4 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-5"
            >
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[var(--apple-secondary-label)]" strokeWidth={1.75} />
                <span className="text-[15px] font-semibold text-[var(--apple-label)]">{s.sectionAttendance()}</span>
              </div>
              {summary.attendance.length === 0 ? (
                <Empty text={s.emptyAttendance()} />
              ) : (
                <div className="flex flex-wrap gap-4">
                  {summary.attendance.map((row, index) => (
                    <AttendanceAvatar key={row.memberId} name={row.name} status={row.status} colorIndex={index} />
                  ))}
                </div>
              )}
            </div>

            <SectionCard
              id="completed-yesterday-section"
              accent
              tone="neutral"
              title={s.sectionCompletedYesterday()}
              icon={<CheckCircle2 strokeWidth={1.75} />}
            >
              {summary.completedYesterday.length === 0 ? (
                <Empty text={s.emptyCompletedYesterday()} />
              ) : (
                <ul className="flex flex-col gap-2">
                  {summary.completedYesterday.map((row) => (
                    <li key={row.taskId}>
                      <TaskRow taskKey={row.taskKey} title={row.title ?? row.taskId} />
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard
              id="variance-section"
              accent
              tone={stats.varianceOverCount > 0 ? 'red' : 'neutral'}
              title={s.sectionVariance()}
              icon={<ListChecks strokeWidth={1.75} />}
            >
              {summary.varianceTable.length === 0 ? (
                <Empty text={s.emptyVariance()} />
              ) : (
                <ul className="flex flex-col gap-2">
                  {summary.varianceTable.map((row, index) => {
                    const taskKey = field(row, 'taskKey') ?? field(row, 'allocationId') ?? 'Task'
                    const outcome = field(row, 'outcome') ?? 'unknown'
                    const dayVariance = asMinutes(row.dayVarianceMinutes)
                    return (
                      <li
                        key={index}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-card p-3"
                      >
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-[15px] font-medium text-[var(--apple-label)]">
                            {nameFor(row.memberId)}
                          </span>
                          <span className="font-apple-mono text-[13px] text-[var(--apple-tertiary-label)]">
                            {taskKey}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusPill tone={outcomeTone(outcome)}>{outcome}</StatusPill>
                          <HoursValue minutes={dayVariance} signed tone={varianceTone(dayVariance)} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </SectionCard>

            <SectionCard title={s.sectionCommitments()} icon={<ListChecks strokeWidth={1.75} />} accent tone="neutral">
              {summary.memberCommitments.length === 0 ? (
                <Empty text={s.emptyCommitments()} />
              ) : (
                <div className="flex flex-col gap-4">
                  {summary.memberCommitments.map((member) => (
                    <div key={member.memberId} className="flex flex-col gap-2">
                      <span className="text-[13px] font-semibold text-[var(--apple-label)]">{member.name}</span>
                      <ul className="flex flex-col gap-2">
                        {member.allocations.map((allocation, index) => (
                          <li key={`${member.memberId}-${index}`}>
                            <TaskRow
                              taskKey={allocation.taskKey}
                              title={allocation.taskKey ?? allocation.taskId}
                              plannedMinutes={toMinutes(allocation.plannedMinutes)}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Lighter, naturally-paired sections share a row on desktop rather
                than each claiming a full-width card for a handful of lines. */}
            <div className="grid gap-4 md:grid-cols-2">
              <SectionCard
                id="debt-section"
                accent
                tone={stats.totalDebt > 0 ? 'red' : 'neutral'}
                title={s.sectionDebtMovements()}
                icon={<Wallet strokeWidth={1.75} />}
              >
                {summary.debtMovements.length === 0 ? (
                  <Empty text={s.emptyDebtMovements()} />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {summary.debtMovements.map((row, index) => {
                      const outstanding = asMinutes(row.outstandingDebtMinutes)
                      const surplus = asMinutes(row.surplusMinutes)
                      return (
                        <li
                          key={index}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-card p-3"
                        >
                          <span className="text-[15px] text-[var(--apple-label)]">{nameFor(row.memberId)}</span>
                          <div className="flex items-center gap-4">
                            <span className="flex flex-col items-end gap-0.5">
                              <span className="apple-section-label text-[var(--apple-tertiary-label)]">Debt</span>
                              <HoursValue minutes={outstanding} tone={outstanding > 0 ? 'red' : 'neutral'} />
                            </span>
                            <span className="flex flex-col items-end gap-0.5">
                              <span className="apple-section-label text-[var(--apple-tertiary-label)]">Surplus</span>
                              <HoursValue minutes={surplus} tone="neutral" />
                            </span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </SectionCard>

              <SectionCard
                id="carry-forward-section"
                accent
                tone={summary.carryForwardState.length > 0 ? 'red' : 'neutral'}
                title={s.sectionCarryForward()}
                icon={<CornerDownRight strokeWidth={1.75} />}
              >
              {summary.carryForwardState.length === 0 ? (
                <Empty text={s.emptyCarryForward()} />
              ) : (
                <ul className="flex flex-col gap-2">
                  {summary.carryForwardState.map((row, index) => {
                    const taskKey = field(row, 'taskKey')
                    const label =
                      taskKey ??
                      field(row, 'taskTitle') ??
                      field(row, 'memberName') ??
                      standupStrings.carryForward.itemTypeLabel(field(row, 'type') ?? '')
                    const ageBand = field(row, 'ageBand')
                    const status = field(row, 'status')
                    return (
                      <li
                        key={index}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-card p-3"
                      >
                        <span
                          className={
                            taskKey
                              ? 'font-apple-mono text-[13px] text-[var(--apple-label)]'
                              : 'text-[15px] text-[var(--apple-label)]'
                          }
                        >
                          {label}
                        </span>
                        <div className="flex items-center gap-2">
                          {ageBand ? <StatusPill tone="neutral">{ageBand}</StatusPill> : null}
                          {status ? <StatusPill tone="neutral">{status}</StatusPill> : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
              </SectionCard>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <SectionCard
                id="blockers-raised-section"
                accent
                tone={stats.openBlockers > 0 ? 'red' : 'neutral'}
                title={s.sectionBlockersRaised()}
                icon={<AlertTriangle strokeWidth={1.75} />}
              >
                {summary.blockersRaised.length === 0 ? (
                  <Empty text={s.emptyBlockersRaised()} />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {summary.blockersRaised.map((row, index) => {
                      const description = field(row, 'description') ?? 'Blocker'
                      const meta = [field(row, 'blockerType'), field(row, 'severity')].filter(Boolean).join(', ')
                      const status = field(row, 'status')
                      return (
                        <li
                          key={index}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-card p-3"
                        >
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-[15px] text-[var(--apple-label)]">{description}</span>
                            {meta ? (
                              <span className="text-[13px] text-[var(--apple-tertiary-label)]">{meta}</span>
                            ) : null}
                          </div>
                          {status ? <StatusPill tone="neutral">{status}</StatusPill> : null}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </SectionCard>

              <SectionCard
                id="blockers-resolved-section"
                accent
                tone="neutral"
                title={s.sectionBlockersResolved()}
                icon={<ShieldCheck strokeWidth={1.75} />}
              >
                {summary.blockersResolved.length === 0 ? (
                  <Empty text={s.emptyBlockersResolved()} />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {summary.blockersResolved.map((row, index) => (
                      <li
                        key={index}
                        className="rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-card p-3 text-[15px] text-[var(--apple-label)]"
                      >
                        {field(row, 'resolutionNote') ?? 'Resolved.'}
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>

            <div className={summary.pmNotes ? 'grid gap-4 md:grid-cols-2' : undefined}>
              <SectionCard
                id="overrides-section"
                accent
                tone="neutral"
                title={s.sectionOverrides()}
                icon={<ShieldAlert strokeWidth={1.75} />}
              >
              {summary.overridesIssued.length === 0 ? (
                <Empty text={s.emptyOverrides()} />
              ) : (
                <ul className="flex flex-col gap-2">
                  {summary.overridesIssued.map((row, index) => {
                    const type = field(row, 'type') ?? 'override'
                    const reasonCode = field(row, 'reasonCode')
                    const justification = field(row, 'justification')
                    return (
                      <li
                        key={index}
                        className="flex flex-col gap-1 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-card p-3"
                      >
                        <div className="flex items-center gap-2">
                          <StatusPill tone="neutral">{type}</StatusPill>
                          {reasonCode ? (
                            <span className="text-[13px] text-[var(--apple-tertiary-label)]">{reasonCode}</span>
                          ) : null}
                        </div>
                        {justification ? (
                          <p className="text-[13px] text-[var(--apple-secondary-label)]">{justification}</p>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              )}
              </SectionCard>

              {summary.pmNotes && (
                <SectionCard id="notes-section" accent tone="neutral" title={s.sectionNotes()} icon={<MessageSquare strokeWidth={1.75} />}>
                  <p className="whitespace-pre-wrap text-[15px] text-[var(--apple-label)]">{summary.pmNotes}</p>
                </SectionCard>
              )}
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-[15px] text-[var(--apple-secondary-label)]">{text}</p>
}
