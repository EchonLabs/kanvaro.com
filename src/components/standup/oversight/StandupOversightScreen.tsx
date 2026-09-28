'use client'

/**
 * Cross-project stand-up oversight, for an org admin with no project of their
 * own to land on (per `/my/standup/page.tsx`'s branch that renders this in
 * place of the plain "no stand-up" empty state).
 *
 * The spec never names this screen, but it repeatedly assumes one exists —
 * "the delivery lead's dashboard" that chronic carry-forward items, override
 * records and capacity overages surface on (E41, E63, OVR-9). §15.15's
 * Stand-up Analytics is its closest specced relative, scoped to one sprint at
 * a time by someone who already knows which sprint to look at. An org admin
 * has no such starting point, so this answers the question they actually
 * arrive with: *where do I intervene today*.
 *
 * The design follows from that question. A sprint is a run of days, and
 * discipline degrades in sequence — three misses scattered across a fortnight
 * and three in a row at the end are the same count and a completely different
 * situation (SCH-15). So the spine of the screen is one card per sprint
 * carrying that sprint's own day sequence, worst first, rather than a grid of
 * charts that aggregates the sequence away. The two distributions that are
 * genuinely org-shaped — carry-forward age (E63) and override reasons
 * (OVR-8) — sit underneath as context, not as the headline.
 *
 * Layout and palette are the Figma "Admin Standup Insights Dashboard" frame,
 * on the `--ovs-*` tokens in globals.css. Conventions carried over from the
 * previous revision:
 *  · severity is structure: a sprint in trouble gets an edge rail and rises
 *    to the top of the board, it never gets a red background
 *  · colour never carries meaning alone (NFR-A1) — every ribbon, bar and dot
 *    has the same fact written beside it or in its accessible name, which is
 *    also why UI-13's "no value is reachable only by hovering" holds without
 *    a separate table view
 *  · a zero renders as a muted dash, so only real numbers draw the eye
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, ChevronDown } from 'lucide-react'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

type CadenceState = 'ran' | 'missed' | 'ahead' | 'off'

interface CadenceDay {
  date: string
  state: CadenceState
}

interface AgeBands {
  normal: number
  noteRequired: number
  escalated: number
  chronic: number
}

/** A UI-shaped subset of `BlockerPanelRow` — no `freedMinutes`, not useful at this screen's altitude. */
interface BlockerRow {
  blockerId: string
  taskKey?: string
  description: string
  blockerType: string
  severity: string
  status: string
  owner?: string
  raisedById: string
  targetResolutionDate?: string
  overdue: boolean
  blockerLabel: string
}

interface SprintOversightRow {
  sprintId: string
  sprintName: string
  projectId: string
  projectName: string
  estimateDebtMinutes: number
  carryForward: {
    openCount: number
    oldestAgeInStandups: number
    chronicCount: number
    ageBands: AgeBands
  }
  overridesCount: number
  overrideReasonCounts: Array<{ type: string; reasonCode: string; count: number }>
  openBlockersCount: number
  openBlockers: BlockerRow[]
  chronicUnderAllocationCount: number
  discipline: {
    completedDays: number
    missedDays: number
    remainingDays: number
    totalWorkingDays: number
  }
  cadence: CadenceDay[]
  capacityBalance: {
    remainingEstimateMinutes: number
    remainingCapacityMinutes: number
    overageMinutes: number
    exceedsCapacity: boolean
  }
  consecutiveMissedDays: number
  flags: string[]
}

interface WaiverRow {
  sprintId: string
  sprintName: string
  projectId: string
  projectName: string
  waivedCheckIds: string[]
  justification: string
  expiresAt: string
  expired: boolean
}

interface OrgStandupOversight {
  sprints: SprintOversightRow[]
  waivers: WaiverRow[]
}

const ALL_PROJECTS = '__all__'

/** The org cadence chart shows a fortnight — long enough to see a slide, short enough to stay legible. */
const CADENCE_WINDOW = 14

const hours = (mins: number) => mins / 60
/** Whole hours stay whole ("16h"), anything else keeps one decimal ("2.5h"). */
const hoursLabel = (mins: number) => `${Number((mins / 60).toFixed(1))}h`
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** §13.3's bands, youngest first, so the chronic tail sits last where the eye lands. */
const AGE_BANDS: Array<{ key: keyof AgeBands; label: string; bar: string }> = [
  { key: 'normal', label: '1–2 stand-ups', bar: 'bg-[var(--ovs-blue)]' },
  { key: 'noteRequired', label: '3–4 stand-ups', bar: 'bg-[var(--ovs-blue)]' },
  { key: 'escalated', label: '5–7 stand-ups', bar: 'bg-[var(--ovs-amber)]' },
  { key: 'chronic', label: 'Chronic / 8+', bar: 'bg-[var(--ovs-red)]' }
]

const REASON_LABEL: Record<string, string> = {
  no_work_available: 'No work available',
  blocked_capacity: 'Blocked capacity',
  skills_mismatch: 'Skills mismatch',
  awaiting_dependency: 'Awaiting dependency',
  training_or_ceremony: 'Training or ceremony',
  support_rota: 'Support rota',
  part_day_unrecorded: 'Part day, unrecorded',
  onboarding: 'Onboarding',
  deliberate_buffer: 'Deliberate buffer',
  member_agreed_overtime: 'Agreed overtime',
  estimates_conservative: 'Estimates conservative',
  catching_up_debt: 'Catching up debt',
  critical_deadline: 'Critical deadline',
  task_will_split: 'Task will split',
  other: 'Other',
  unspecified: 'Unspecified'
}

const reasonLabel = (code: string) => REASON_LABEL[code] ?? code.replace(/_/g, ' ')

/** Remaining estimate minus remaining capacity, in hours. Positive is the bad direction. */
const balanceOf = (row: SprintOversightRow) =>
  hours(row.capacityBalance.remainingEstimateMinutes - row.capacityBalance.remainingCapacityMinutes)

type Severity = 'critical' | 'warning' | 'clean'

/**
 * How loudly a sprint's rail speaks. Critical is anything that has already
 * gone wrong and compounds if left — scope past capacity, chronic
 * under-allocation, a run of misses, an item aged past a decision, an
 * overdue blocker. Any other flag is a warning. Kept in step with
 * `verdictOf`'s own priority order, so a sprint's worst true thing is never
 * described in critical words while its rail reads as a mere warning.
 */
function severityOf(row: SprintOversightRow): Severity {
  if (row.flags.length === 0) return 'clean'
  if (
    row.capacityBalance.exceedsCapacity ||
    row.chronicUnderAllocationCount > 0 ||
    row.consecutiveMissedDays >= 3 ||
    row.carryForward.chronicCount > 0 ||
    row.openBlockers.some((blocker) => blocker.overdue)
  ) {
    return 'critical'
  }
  return 'warning'
}

const SEVERITY_RAIL: Record<Severity, string> = {
  critical: 'bg-[var(--ovs-red)]',
  warning: 'bg-[var(--ovs-amber)]',
  clean: 'bg-[var(--ovs-border)]'
}

const SEVERITY_TEXT: Record<Severity, string> = {
  critical: 'text-[var(--ovs-red)]',
  warning: 'text-[var(--ovs-amber)]',
  clean: 'text-[var(--ovs-muted)]'
}

/**
 * The one line under a sprint's name: the single worst true thing about it, in
 * words. Ranked the way an admin triages — a sprint that cannot fit its
 * remaining scope outranks one that has merely stopped meeting.
 */
function verdictOf(row: SprintOversightRow): string {
  const balance = balanceOf(row)
  if (row.capacityBalance.exceedsCapacity) return `${balance.toFixed(1)}h more work than capacity left`
  if (row.chronicUnderAllocationCount > 0) {
    const count = row.chronicUnderAllocationCount
    return `${count} member${count === 1 ? '' : 's'} chronically under-allocated`
  }
  if (row.consecutiveMissedDays >= 3) return `${row.consecutiveMissedDays} stand-ups missed in a row`
  if (row.carryForward.chronicCount > 0) {
    const count = row.carryForward.chronicCount
    return `${count} ${count === 1 ? 'item has' : 'items have'} aged past a decision`
  }
  if (row.openBlockersCount > 0) {
    return `${row.openBlockersCount} ${row.openBlockersCount === 1 ? 'blocker is' : 'blockers are'} still open`
  }
  if (row.discipline.missedDays > 0) {
    return `${row.discipline.missedDays} ${row.discipline.missedDays === 1 ? 'stand-up' : 'stand-ups'} missed`
  }
  return 'On cadence'
}

/**
 * Everything the screen renders, derived from one slice of the payload.
 *
 * Pure and exported so the filter contract is testable without driving a
 * portalled combobox: the point worth proving is that the headline, the board
 * and both distributions come from the *same* rows, because a filter that
 * re-rendered the board and left an org-wide sentence above it would be
 * actively misleading.
 */
export function deriveOversightView(data: OrgStandupOversight, projectId: string) {
  const sprints =
    projectId === ALL_PROJECTS ? data.sprints : data.sprints.filter((row) => row.projectId === projectId)

  const ageBands = AGE_BANDS.map((band) => ({
    ...band,
    count: sprints.reduce((total, row) => total + row.carryForward.ageBands[band.key], 0)
  }))

  const reasonCounts = new Map<string, number>()
  for (const row of sprints) {
    for (const reason of row.overrideReasonCounts) {
      reasonCounts.set(reason.reasonCode, (reasonCounts.get(reason.reasonCode) ?? 0) + reason.count)
    }
  }

  // One column per working day across every visible sprint, so the chart reads
  // as organisation cadence rather than as any one sprint's calendar.
  const byDate = new Map<string, { ran: number; missed: number; ahead: number }>()
  for (const row of sprints) {
    for (const day of row.cadence ?? []) {
      if (day.state === 'off') continue
      const bucket = byDate.get(day.date) ?? { ran: 0, missed: 0, ahead: 0 }
      bucket[day.state] += 1
      byDate.set(day.date, bucket)
    }
  }
  const orgCadence = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-CADENCE_WINDOW)
    .map(([date, counts]) => ({ date, ...counts }))

  const flagged = sprints.filter((row) => row.flags.length > 0)

  return {
    sprints,
    ageBands,
    orgCadence,
    // The rows arrive worst-first, so the first flagged one is the sprint the
    // admin should open before anything else on the page.
    worst: flagged[0] ?? null,
    reasons: Array.from(reasonCounts.entries())
      .map(([reasonCode, count]) => ({ reasonCode, label: reasonLabel(reasonCode), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    waivers:
      projectId === ALL_PROJECTS ? data.waivers : data.waivers.filter((row) => row.projectId === projectId),
    summary: {
      needingAttention: flagged.length,
      activeSprints: sprints.length,
      chronicItems: sprints.reduce((total, row) => total + row.carryForward.chronicCount, 0),
      openBlockers: sprints.reduce((total, row) => total + row.openBlockersCount, 0),
      debtMinutes: sprints.reduce((total, row) => total + row.estimateDebtMinutes, 0),
      missedDays: sprints.reduce((total, row) => total + row.discipline.missedDays, 0)
    }
  }
}

type OversightView = ReturnType<typeof deriveOversightView>

export function StandupOversightScreen() {
  const [data, setData] = useState<OrgStandupOversight | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [projectId, setProjectId] = useState(ALL_PROJECTS)

  useEffect(() => {
    let cancelled = false

    fetch('/api/organization/standup-oversight')
      .then((response) => {
        if (!response.ok) throw new Error('failed')
        return response.json()
      })
      .then((payload) => {
        if (!cancelled) setData(payload.data)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load stand-up oversight.')
      })

    return () => {
      cancelled = true
    }
  }, [])

  const projects = useMemo(() => {
    if (!data) return []
    const byId = new Map<string, string>()
    for (const row of data.sprints) byId.set(row.projectId, row.projectName)
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [data])

  // One filter above everything it scopes: the headline, the board and both
  // distributions all come out of this single derivation, so the screen can
  // never pair an org-wide sentence with a per-project board.
  const view = useMemo(() => (data ? deriveOversightView(data, projectId) : null), [data, projectId])

  const scopeLabel =
    projectId === ALL_PROJECTS
      ? 'Organization-wide'
      : (projects.find((project) => project.id === projectId)?.name ?? 'This project')

  // Splices a revoked waiver out of state rather than refetching the whole
  // org rollup for one row — the waiver panel is the only thing this action
  // can invalidate. Only on a real 2xx (or a 404, meaning it was already
  // gone) — a failed request must leave the waiver in place and tell the
  // caller, or the admin is left believing a still-active waiver is revoked.
  const revokeWaiver = async (sprintId: string) => {
    const response = await fetch(`/api/sprints/${sprintId}/planning-waiver`, { method: 'DELETE' })
    if (!response.ok && response.status !== 404) {
      throw new Error('Could not revoke the waiver. Try again.')
    }
    setData((current) =>
      current ? { ...current, waivers: current.waivers.filter((w) => w.sprintId !== sprintId) } : current
    )
  }

  return (
    // The negative margins cancel `MainLayout`'s `<main>` padding (the same
    // move My Stand-up and sprint planning make), so the design's own gutter
    // is the only one.
    <div className="standup-oversight -m-3 flex flex-col gap-6 bg-[var(--ovs-canvas)] px-4 pb-14 pt-6 text-[var(--ovs-text)] sm:-m-4 sm:px-6 lg:-m-6 lg:px-9 lg:pt-[34px]">
      {/* `MainLayout` paints a pure-black backdrop behind every page; this one
          sits over it so the design's canvas also fills the breadcrumb strip
          and below short content. */}
      <div aria-hidden className="fixed inset-0 -z-10 bg-[var(--ovs-canvas)]" />

      {error ? (
        <p role="alert" className="text-[13px] text-[var(--ovs-red)]">
          {error}
        </p>
      ) : !data || !view ? (
        <OversightSkeleton />
      ) : (
        <>
          <div className="flex flex-col gap-[18px]">
            <header className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-[5px]">
                <h1 className="text-[26px] font-bold leading-tight text-[var(--ovs-text)] sm:text-[30px]">
                  Stand-up oversight
                </h1>
                <p className="text-[13px] text-[var(--ovs-muted)]">
                  Organization health across active delivery cycles
                </p>
              </div>

              {projects.length > 0 && (
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger
                    aria-label="Project"
                    className="h-auto w-auto gap-[18px] rounded-[8px] border-[var(--ovs-border)] bg-[var(--ovs-raised)] px-[14px] py-[9px] text-[12px] font-semibold text-[var(--ovs-text)] [&>svg:last-child]:hidden"
                  >
                    <SelectValue placeholder="All projects" />
                    <ChevronDown aria-hidden className="h-3 w-3 shrink-0 text-[var(--ovs-muted)]" strokeWidth={2} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_PROJECTS}>All projects</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </header>

            {view.sprints.length > 0 && <Verdict view={view} />}
          </div>

          {view.sprints.length === 0 ? (
            <p className="rounded-[16px] bg-[var(--ovs-surface)] px-4 py-12 text-center text-[15px] text-[var(--ovs-muted)]">
              No sprint is active right now, so there is nothing to watch.
            </p>
          ) : (
            <Board sprints={view.sprints} />
          )}

          <div className="flex flex-col gap-[18px]">
            {view.sprints.length > 0 && (
              <div className="grid gap-4 lg:grid-cols-2">
                <AgeingPanel bands={view.ageBands} />
                <OverridesPanel reasons={view.reasons} scope={scopeLabel} />
              </div>
            )}

            {view.waivers.length > 0 && <WaiverPanel waivers={view.waivers} onRevoke={revokeWaiver} />}
          </div>
        </>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- verdict */

/**
 * The screen's answer, as a sentence rather than as a scoreboard. The count is
 * set large inside the sentence — grammatically part of it — and the line
 * below names the one sprint to open first, so the page is useful before
 * anything else on it has been read.
 */
function Verdict({ view }: { view: OversightView }) {
  const { summary, worst } = view
  const clean = summary.needingAttention === 0
  const heroTone = clean
    ? 'text-[var(--ovs-green)]'
    : view.sprints.some((row) => severityOf(row) === 'critical')
      ? 'text-[var(--ovs-red)]'
      : 'text-[var(--ovs-amber)]'

  return (
    <section
      aria-label="Organisation summary"
      className="flex flex-col gap-7 rounded-[16px] bg-[var(--ovs-surface)] p-5 shadow-[var(--ovs-shadow)] sm:p-6 lg:flex-row lg:items-start"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <div className="flex flex-col gap-[7px]">
          <h2 className="flex flex-wrap items-baseline gap-x-2.5 text-[18px] font-semibold text-[var(--ovs-text)]">
            <span
              data-testid="oversight-hero-figure"
              className={cn('text-[44px] font-bold leading-none tabular-nums', heroTone)}
            >
              {clean ? summary.activeSprints : summary.needingAttention}
            </span>
            <span>
              {clean
                ? `active ${summary.activeSprints === 1 ? 'sprint is' : 'sprints are'} on cadence`
                : `of ${summary.activeSprints} active ${summary.activeSprints === 1 ? 'sprint needs' : 'sprints need'} attention`}
            </span>
          </h2>

          <p className="max-w-[46ch] text-[13px] text-[var(--ovs-muted)]">
            {worst ? (
              <>
                Open{' '}
                <span className="font-semibold text-[var(--ovs-text)]">
                  {worst.sprintName} · {worst.projectName}
                </span>{' '}
                first — {verdictOf(worst).toLowerCase()}.
              </>
            ) : (
              'Nothing has missed a stand-up, gone over capacity, or aged past a decision.'
            )}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tally value={summary.chronicItems} label="Chronic items" tone="text-[var(--ovs-amber)]" />
          <Tally value={summary.openBlockers} label="Open blockers" tone="text-[var(--ovs-red)]" />
          <Tally value={summary.missedDays} label="Missed stand-ups" tone="text-[var(--ovs-red)]" />
          <Tally
            value={summary.debtMinutes}
            label="Estimate debt"
            tone="text-[var(--ovs-blue)]"
            format={hoursLabel}
          />
        </dl>
      </div>

      <OrgCadenceChart days={view.orgCadence} />
    </section>
  )
}

/** A summary tile. Zero drops to the subtle ink so only real numbers carry colour. */
function Tally({
  value,
  label,
  tone,
  format
}: {
  value: number
  label: string
  tone: string
  format?: (value: number) => string
}) {
  const zero = value === 0
  return (
    <div className="flex min-w-0 flex-col-reverse gap-[5px] rounded-[12px] bg-[var(--ovs-raised)] p-[14px]">
      <dt className="text-[11px] text-[var(--ovs-muted)]">{label}</dt>
      <dd className={cn('text-[22px] font-bold leading-none tabular-nums', zero ? 'text-[var(--ovs-subtle)]' : tone)}>
        {format ? format(value) : value}
      </dd>
    </div>
  )
}

const DAY_BAR_CLASS = {
  ran: 'bg-[var(--ovs-green)]',
  missed: 'bg-[var(--ovs-red)]',
  ahead: 'bg-[var(--ovs-blue)]'
} as const

/** Tallest bar in the chart's 96px box, leaving room for the day label beneath. */
const DAY_BAR_MAX = 76

/**
 * Organisation cadence over the last fortnight: one bar per working day,
 * height for how many sprint stand-ups fell on it, colour for how that day
 * went — any miss turns it red, otherwise ran is green and still-to-come is
 * blue. The headline percentage is completion over the days already due.
 */
function OrgCadenceChart({ days }: { days: Array<{ date: string; ran: number; missed: number; ahead: number }> }) {
  if (days.length === 0) return null

  const ran = days.reduce((total, day) => total + day.ran, 0)
  const missed = days.reduce((total, day) => total + day.missed, 0)
  const completion = ran + missed > 0 ? Math.round((ran / (ran + missed)) * 100) : null
  const completionTone =
    completion === null
      ? 'text-[var(--ovs-subtle)]'
      : completion >= 90
        ? 'text-[var(--ovs-green)]'
        : completion >= 70
          ? 'text-[var(--ovs-amber)]'
          : 'text-[var(--ovs-red)]'
  const peak = Math.max(1, ...days.map((day) => day.ran + day.missed + day.ahead))

  return (
    <figure className="m-0 flex w-full shrink-0 flex-col gap-[14px] lg:w-[390px] lg:pl-2">
      <figcaption className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-[3px]">
          <span className="text-[13px] font-semibold text-[var(--ovs-text)]">{days.length}-working-day cadence</span>
          <span className="text-[10px] text-[var(--ovs-subtle)]">
            {missed > 0 ? `Stand-up completion · ${missed} missed` : 'Organization-wide stand-up completion'}
          </span>
        </div>
        <span className={cn('text-[13px] font-semibold tabular-nums', completionTone)}>
          {completion === null ? '–' : `${completion}%`}
        </span>
      </figcaption>

      <div
        role="img"
        aria-label={`Last ${days.length} working days: ${ran} stand-ups ran, ${missed} missed`}
        className="flex h-[96px] items-end gap-[7px]"
      >
        {days.map((day, index) => {
          const total = day.ran + day.missed + day.ahead
          const state = day.missed > 0 ? 'missed' : day.ran > 0 ? 'ran' : 'ahead'
          return (
            <div
              key={day.date}
              title={`${day.date} — ${day.ran} ran, ${day.missed} missed, ${day.ahead} still to come`}
              className="flex min-w-0 max-w-[18px] flex-1 flex-col items-center gap-[5px]"
            >
              <span
                className={cn('w-full rounded-b-[2px] rounded-t-[4px]', DAY_BAR_CLASS[state])}
                style={{ height: Math.max(8, Math.round((total / peak) * DAY_BAR_MAX)) }}
              />
              <span className="text-[8px] leading-none text-[var(--ovs-subtle)]">{index + 1}</span>
            </div>
          )
        })}
      </div>
    </figure>
  )
}

/* ----------------------------------------------------------------- board */

function Board({ sprints }: { sprints: SprintOversightRow[] }) {
  return (
    <section aria-label="Active sprints" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-[20px] font-bold text-[var(--ovs-text)]">Active sprints</h2>
          <p className="text-[11px] text-[var(--ovs-subtle)]">Worst first · daily operating view</p>
        </div>
        <ul aria-label="Legend" className="flex items-center gap-3">
          {(['ran', 'missed', 'ahead'] as const).map((state) => (
            <li key={state} className="flex items-center gap-[5px]">
              <span aria-hidden className={cn('h-1.5 w-1.5 rounded-[3px]', DAY_BAR_CLASS[state])} />
              <span className="text-[9px] text-[var(--ovs-subtle)]">{LEGEND_WORD[state]}</span>
            </li>
          ))}
        </ul>
      </div>

      <ul className="flex flex-col gap-3">
        {sprints.map((row) => (
          <SprintRow key={row.sprintId} row={row} />
        ))}
      </ul>
    </section>
  )
}

const LEGEND_WORD = { ran: 'Ran', missed: 'Missed', ahead: 'Ahead' } as const

const CADENCE_CELL: Record<CadenceState, string> = {
  ran: 'w-3 bg-[var(--ovs-green)]',
  missed: 'w-3 bg-[var(--ovs-red)]',
  ahead: 'w-3 bg-[var(--ovs-blue)]',
  off: 'w-[5px] bg-[var(--ovs-border)]'
}

const CADENCE_WORD: Record<CadenceState, string> = {
  ran: 'stand-up ran',
  missed: 'missed',
  ahead: 'still to come',
  off: 'not a working day'
}

/**
 * A sprint's working days, left to right, one cell each. It is the only thing
 * on the board that keeps the *order* of what happened, which is what turns
 * "5 of 10" into a diagnosis. Non-working days are a narrow neutral sliver so
 * it stays obvious they were never counted against the sprint (G1).
 */
function CadenceRibbon({ days, label }: { days: CadenceDay[]; label: string }) {
  if (days.length === 0) {
    return <p className="text-[11px] text-[var(--ovs-subtle)]">No stand-ups scheduled yet</p>
  }

  return (
    <div className="flex h-[18px] flex-wrap gap-[3px]" role="img" aria-label={label}>
      {days.map((day) => (
        <span
          key={day.date}
          title={`${day.date} — ${CADENCE_WORD[day.state]}`}
          className={cn('h-[18px] rounded-[3px]', CADENCE_CELL[day.state])}
        />
      ))}
    </div>
  )
}

function SprintRow({ row }: { row: SprintOversightRow }) {
  const severity = severityOf(row)
  const { completedDays, missedDays, totalWorkingDays } = row.discipline

  return (
    <li className="flex overflow-hidden rounded-[12px] bg-[var(--ovs-raised)]">
      {/* Severity as structure: a rail on the edge, never a tinted row. */}
      <span aria-hidden className={cn('w-1 shrink-0 self-stretch', SEVERITY_RAIL[severity])} />

      <div className="flex min-w-0 flex-1 flex-col gap-4 p-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="min-w-0">
              <Link
                href={`/projects/${row.projectId}/standups`}
                className="group inline-flex max-w-full items-center gap-[7px] rounded-[4px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ovs-blue)]"
              >
                <span className="truncate text-[16px] font-bold text-[var(--ovs-blue)] group-hover:underline">
                  {row.sprintName}
                </span>
                <span aria-hidden className="text-[12px] text-[var(--ovs-subtle)]">
                  /
                </span>
                <span className="truncate text-[13px] font-semibold text-[var(--ovs-text)]">{row.projectName}</span>
                <ArrowUpRight aria-hidden className="h-[11px] w-[11px] shrink-0 text-[var(--ovs-blue)]" strokeWidth={2} />
              </Link>
            </h3>
            <p className={cn('text-[11px]', SEVERITY_TEXT[severity])}>{verdictOf(row)}</p>
          </div>

          <CadenceRibbon
            days={row.cadence ?? []}
            label={`${row.sprintName}: ${completedDays} of ${totalWorkingDays} stand-ups ran, ${missedDays} missed`}
          />
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:flex md:items-start md:gap-6">
          <CapacityBalance row={row} />
          <Metric label="Carried forward" value={row.carryForward.openCount} format={(n) => plural(n, 'item', 'items')} />
          <Metric label="Estimate debt" value={row.estimateDebtMinutes} format={hoursLabel} />
          <Metric label="Overrides" value={row.overridesCount} />
          <Metric
            label="Chronic under-allocation"
            value={row.chronicUnderAllocationCount}
            format={(n) => plural(n, 'person', 'people')}
            tone="text-[var(--ovs-amber)]"
          />
        </dl>

        <BlockerDisclosure blockers={row.openBlockers} />
      </div>
    </li>
  )
}

const METRIC_LABEL = 'text-[9px] font-bold uppercase tracking-[0.04em] text-[var(--ovs-subtle)]'

/**
 * CC-11 / N12: remaining estimate against remaining capacity, both written
 * out, with the fill showing how much of the capacity the estimate consumes.
 * Past 100% the bar is full and red; from 85% it warns.
 */
function CapacityBalance({ row }: { row: SprintOversightRow }) {
  const estimate = row.capacityBalance.remainingEstimateMinutes
  const capacity = row.capacityBalance.remainingCapacityMinutes
  const ratio = capacity > 0 ? estimate / capacity : estimate > 0 ? Infinity : 0
  const fill = row.capacityBalance.exceedsCapacity || ratio > 1
    ? 'bg-[var(--ovs-red)]'
    : ratio >= 0.85
      ? 'bg-[var(--ovs-amber)]'
      : 'bg-[var(--ovs-green)]'

  return (
    <div className="col-span-2 flex min-w-0 flex-col gap-[7px] md:w-[185px] md:shrink-0">
      <dt className={METRIC_LABEL}>Capacity balance</dt>
      <dd className="flex flex-col gap-[7px]">
        <span className="flex items-start justify-between gap-2 text-[12px]">
          <span className="text-[var(--ovs-text)]">Estimate {hoursLabel(estimate)}</span>
          <span className="text-[var(--ovs-muted)]">
            <span className="sr-only">of capacity </span>
            {hoursLabel(capacity)}
          </span>
        </span>
        <span aria-hidden className="h-[5px] w-full overflow-hidden rounded-[3px] bg-[var(--ovs-border)]">
          <span
            className={cn('block h-full rounded-[3px]', fill)}
            style={{ width: `${Math.min(1, ratio) * 100}%` }}
          />
        </span>
      </dd>
    </div>
  )
}

/** A board figure. Zeros collapse to a dash, so a clean row reads as quiet rather than as four more numbers. */
function Metric({
  value,
  label,
  format,
  tone = 'text-[var(--ovs-text)]'
}: {
  value: number
  label: string
  format?: (value: number) => string
  tone?: string
}) {
  const zero = value === 0
  return (
    <div className="flex min-w-0 flex-col gap-[7px] md:flex-1">
      <dt className={cn(METRIC_LABEL, 'truncate')}>{label}</dt>
      <dd className={cn('text-[15px] font-semibold tabular-nums', zero ? 'text-[var(--ovs-subtle)]' : tone)}>
        {zero ? '–' : format ? format(value) : value}
      </dd>
    </div>
  )
}

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-[var(--ovs-red)]',
  high: 'bg-[var(--ovs-red)]'
}

/**
 * The blockers strip, promoted from a count to a disclosure: an admin lands
 * here to triage, and a count alone gives them nothing to act on. Expands in
 * place rather than navigating away, so the sprint's other context stays on
 * screen while they read it.
 */
function BlockerDisclosure({ blockers }: { blockers: BlockerRow[] }) {
  const [open, setOpen] = useState(false)

  if (blockers.length === 0) {
    return (
      <div className="flex items-start justify-between rounded-[8px] bg-[var(--ovs-inset)] px-3 py-2.5">
        <p className="text-[11px] font-semibold text-[var(--ovs-text)]">Open blockers · 0</p>
        <p className="text-[10px] text-[var(--ovs-subtle)]">None open</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-[8px] bg-[var(--ovs-inset)] px-3 py-2.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-start justify-between gap-3 rounded-[4px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ovs-blue)]"
      >
        <span className="text-[11px] font-semibold text-[var(--ovs-text)]">Open blockers · {blockers.length}</span>
        <span className="text-[10px] text-[var(--ovs-subtle)]">{open ? 'Expanded' : 'Collapsed'} ⌄</span>
      </button>

      {open && (
        <ul className="grid gap-x-5 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {blockers.map((blocker) => (
            <li key={blocker.blockerId} className="flex min-w-0 items-baseline gap-[7px] text-[10px] text-[var(--ovs-muted)]">
              <span
                aria-hidden
                className={cn(
                  'h-[5px] w-[5px] shrink-0 -translate-y-px rounded-[3px]',
                  SEVERITY_DOT[blocker.severity] ?? 'bg-[var(--ovs-amber)]'
                )}
              />
              <span className="min-w-0">
                <span className="sr-only">{blocker.severity} — </span>
                <span>{blocker.description}</span>
                {blocker.taskKey && (
                  <>
                    {' · '}
                    <span className="text-[var(--ovs-subtle)]">{blocker.taskKey}</span>
                  </>
                )}
                {blocker.overdue && (
                  <>
                    {' · '}
                    <span className="text-[var(--ovs-red)]">overdue</span>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* -------------------------------------------------------------- insights */

function Panel({
  title,
  caption,
  children
}: {
  title: string
  caption: string
  children: React.ReactNode
}) {
  return (
    <section className="flex min-h-[250px] flex-col gap-[18px] rounded-[16px] bg-[var(--ovs-surface)] p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-[16px] font-bold text-[var(--ovs-text)]">{title}</h2>
        <p className="text-[10px] text-[var(--ovs-subtle)]">{caption}</p>
      </div>
      {children}
    </section>
  )
}

/** A bar's length against the longest in its panel; a zero draws nothing. */
const barWidth = (count: number, max: number) => `${max > 0 ? (count / max) * 100 : 0}%`

/**
 * §15.15's carry-forward ageing, "with the chronic band highlighted": one
 * labelled bar per band, youngest first, the chronic tail in red.
 */
function AgeingPanel({ bands }: { bands: Array<{ key: keyof AgeBands; label: string; bar: string; count: number }> }) {
  const total = bands.reduce((sum, band) => sum + band.count, 0)
  const max = Math.max(0, ...bands.map((band) => band.count))

  return (
    <Panel title="Carry-forward ageing" caption={`Open items by age band · ${total} total`}>
      {total === 0 ? (
        <Empty text="Nothing is carried over. Clean slate." />
      ) : (
        <ul className="flex flex-col gap-3">
          {bands.map((band) => (
            <li key={band.key} className="flex items-center gap-3">
              <span className="w-[82px] shrink-0 text-[10px] text-[var(--ovs-muted)]">{band.label}</span>
              <span aria-hidden className="h-[9px] min-w-0 flex-1 overflow-hidden rounded-[5px] bg-[var(--ovs-track)]">
                <span className={cn('block h-full rounded-[5px]', band.bar)} style={{ width: barWidth(band.count, max) }} />
              </span>
              <span
                className={cn(
                  'w-[18px] shrink-0 text-right text-[10px] font-semibold tabular-nums',
                  band.count === 0 ? 'text-[var(--ovs-subtle)]' : 'text-[var(--ovs-text)]'
                )}
              >
                {band.count === 0 ? '–' : band.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/**
 * OVR-8's reason ranking. The leading reason is set apart in violet; the rest
 * share one hue so bar length alone carries the ranking.
 */
function OverridesPanel({
  reasons,
  scope
}: {
  reasons: Array<{ reasonCode: string; label: string; count: number }>
  scope: string
}) {
  const max = reasons[0]?.count ?? 0

  return (
    <Panel title="Why capacity was overridden" caption={`${scope} · ranked reason codes`}>
      {reasons.length === 0 ? (
        <Empty text="No overrides have been issued." />
      ) : (
        <ul className="flex flex-col gap-[11px]">
          {reasons.map((reason, index) => (
            <li key={reason.reasonCode} className="flex flex-col gap-[5px]">
              <span className="flex items-start justify-between gap-3 text-[10px]">
                <span className="text-[var(--ovs-muted)]">{reason.label}</span>
                <span className="font-semibold tabular-nums text-[var(--ovs-text)]">{reason.count}</span>
              </span>
              <span aria-hidden className="h-[7px] w-full overflow-hidden rounded-[4px] bg-[var(--ovs-track)]">
                <span
                  className={cn(
                    'block h-full rounded-[4px]',
                    index === 0 ? 'bg-[var(--ovs-violet)]' : 'bg-[var(--ovs-blue)]'
                  )}
                  style={{ width: barWidth(reason.count, max) }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="flex min-h-[96px] items-center text-[13px] text-[var(--ovs-subtle)]">{text}</p>
}

/* --------------------------------------------------------------- waivers */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "30 Sep 2026", by hand — newer ICU data renders en-GB September as "Sept". */
const formatExpiry = (iso: string) => {
  const date = new Date(iso)
  return `${String(date.getUTCDate()).padStart(2, '0')} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

/**
 * PLN-18 — the waiver banner, at org scope. This is the one thing on the
 * screen only an Org Admin can have issued (PLN-16) and the only one they can
 * revoke, so it gets its own panel rather than a row on the board.
 */
function WaiverPanel({ waivers, onRevoke }: { waivers: WaiverRow[]; onRevoke: (sprintId: string) => Promise<void> }) {
  const active = waivers.filter((waiver) => !waiver.expired).length

  return (
    <section className="flex flex-col gap-4 rounded-[16px] bg-[var(--ovs-surface)] p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-[16px] font-bold text-[var(--ovs-text)]">Planning waivers in force</h2>
          <p className="text-[10px] text-[var(--ovs-subtle)]">
            {plural(active, 'active exception', 'active exceptions')} requiring periodic review
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--ovs-amber-tint)] px-[9px] py-[5px] text-[10px] font-semibold text-[var(--ovs-amber)]">
          {active} active
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {waivers.map((waiver) => (
          <WaiverRowItem key={waiver.sprintId} waiver={waiver} onRevoke={onRevoke} />
        ))}
      </ul>
    </section>
  )
}

/**
 * One waiver plus its revoke action. Inline confirm rather than a modal —
 * a `DELETE` with no body needs nothing more than a yes/no, and the blocker
 * disclosure is already inline too.
 */
function WaiverRowItem({
  waiver,
  onRevoke
}: {
  waiver: WaiverRow
  onRevoke: (sprintId: string) => Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  return (
    <li className="flex flex-col gap-2 rounded-[12px] bg-[var(--ovs-raised)] p-[14px]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-[18px]">
        <div className="flex min-w-0 flex-col gap-[3px] md:w-[145px] md:shrink-0">
          <p className="truncate text-[12px] font-bold text-[var(--ovs-blue)]">
            {waiver.sprintName} / {waiver.projectName}
          </p>
          <p className="text-[9px] text-[var(--ovs-subtle)]">Planning gate waived</p>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <p className={METRIC_LABEL}>Justification</p>
          <p className="text-[10px] text-[var(--ovs-muted)]">{waiver.justification}</p>
        </div>

        <div className="flex min-w-0 flex-col gap-[3px] md:w-[180px] md:shrink-0">
          <p className={METRIC_LABEL}>Waived checks</p>
          <p className="text-[10px] text-[var(--ovs-text)]">{waiver.waivedCheckIds.join(' · ')}</p>
        </div>

        <div className="flex min-w-0 flex-col gap-[3px] md:w-[95px] md:shrink-0">
          <p className={METRIC_LABEL}>Expires</p>
          <p className={cn('text-[10px]', waiver.expired ? 'text-[var(--ovs-red)]' : 'text-[var(--ovs-amber)]')}>
            {waiver.expired ? 'Expired' : formatExpiry(waiver.expiresAt)}
          </p>
        </div>

        {confirming ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={revoking}
              onClick={async () => {
                setRevoking(true)
                setRevokeError(null)
                try {
                  await onRevoke(waiver.sprintId)
                } catch {
                  setRevokeError('Could not revoke the waiver. Try again.')
                } finally {
                  setRevoking(false)
                }
              }}
              className="rounded-[8px] bg-[var(--ovs-red)] px-3 py-[7px] text-[10px] font-semibold text-white disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              type="button"
              disabled={revoking}
              onClick={() => {
                setConfirming(false)
                setRevokeError(null)
              }}
              className="rounded-[8px] border border-[var(--ovs-border)] px-3 py-[7px] text-[10px] font-semibold text-[var(--ovs-muted)] disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="shrink-0 self-start rounded-[8px] border border-[var(--ovs-red)] px-3 py-[7px] text-[10px] font-semibold text-[var(--ovs-red)] transition-colors hover:bg-[var(--ovs-red)] hover:text-white md:self-auto"
          >
            Revoke
          </button>
        )}
      </div>

      {revokeError && <p className="text-[10px] text-[var(--ovs-red)]">{revokeError}</p>}
    </li>
  )
}

function OversightSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <div className="h-9 w-64 animate-pulse rounded-[8px] bg-[var(--ovs-raised)]" />
      <div className="h-44 animate-pulse rounded-[16px] bg-[var(--ovs-surface)]" />
      <div className="h-48 animate-pulse rounded-[12px] bg-[var(--ovs-raised)]" />
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((index) => (
          <div key={index} className="h-[250px] animate-pulse rounded-[16px] bg-[var(--ovs-surface)]" />
        ))}
      </div>
    </div>
  )
}
