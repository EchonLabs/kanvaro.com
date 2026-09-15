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
 * situation (SCH-15). So the spine of the screen is one strip per sprint
 * carrying that sprint's own day sequence, worst first, rather than a grid of
 * charts that aggregates the sequence away. The two distributions that are
 * genuinely org-shaped — carry-forward age (E63) and override reasons
 * (OVR-8) — sit underneath as context, not as the headline, drawn as labelled
 * horizontal bars rather than the board's chrome-free marks: an aggregate
 * ranking benefits from an axis to anchor it, where a per-sprint sequence
 * would only be cluttered by one.
 *
 * Mark conventions, all on the validated `--viz-*` palette in globals.css:
 *  · board marks stay chrome-free — a rounded cell or a beam on a hairline
 *    track, no axis furniture, nothing that needs a legend to decode
 *  · severity is structure: a sprint in trouble gets an edge rail and rises
 *    to the top of the board, it never gets a red background
 *  · colour never carries meaning alone (NFR-A1) — every ribbon, beam and bar
 *    has the same fact written beside it in words, which is also why UI-13's
 *    "no value is reachable only by hovering" holds without a separate table
 *    view
 *  · a zero renders as a muted dash, so only real numbers draw the eye
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Clock, RefreshCw, ShieldAlert } from 'lucide-react'
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis
} from 'recharts'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { IconChip } from '@/components/standup/my/shared/IconChip'
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

/** The org cadence rail shows a fortnight — long enough to see a slide, short enough to stay legible. */
const CADENCE_WINDOW = 14

const hours = (mins: number) => mins / 60
const hoursLabel = (mins: number) => `${(mins / 60).toFixed(1)}h`

/** §13.3's bands, oldest last. The ramp is ordinal — older is always the stronger step. */
const AGE_BANDS: Array<{ key: keyof AgeBands; label: string; swatch: string; color: string }> = [
  { key: 'normal', label: '1–2 stand-ups', swatch: 'bg-[var(--viz-age-1)]', color: 'var(--viz-age-1)' },
  { key: 'noteRequired', label: '3–4, note required', swatch: 'bg-[var(--viz-age-2)]', color: 'var(--viz-age-2)' },
  { key: 'escalated', label: '5–7, escalated', swatch: 'bg-[var(--viz-age-3)]', color: 'var(--viz-age-3)' },
  { key: 'chronic', label: '8 or more, chronic', swatch: 'bg-[var(--viz-age-4)]', color: 'var(--viz-age-4)' }
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

const MONO_STACK = "'Nunito Sans', ui-monospace, monospace"

/** Remaining estimate minus remaining capacity, in hours. Positive is the bad direction. */
const balanceOf = (row: SprintOversightRow) =>
  hours(row.capacityBalance.remainingEstimateMinutes - row.capacityBalance.remainingCapacityMinutes)

/**
 * The one line under a sprint's name: the single worst true thing about it, in
 * words. Ranked the way an admin triages — a sprint that cannot fit its
 * remaining scope outranks one that has merely stopped meeting.
 */
function verdictOf(row: SprintOversightRow): string {
  const balance = balanceOf(row)
  if (row.capacityBalance.exceedsCapacity) return `${balance.toFixed(1)}h more work than capacity left`
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

  // One column per working day across every visible sprint, so the rail reads
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
    // One shared scale across every beam on the board — without it a 1h
    // overage and a 40h overage draw the same bar on different rows.
    capacityScale: Math.max(1, ...sprints.map((row) => Math.abs(balanceOf(row)))),
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

  if (error) {
    return (
      <p role="alert" className="p-6 text-[13px] text-[var(--apple-system-red)]">
        {error}
      </p>
    )
  }

  if (!data || !view) return <OversightSkeleton />

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--apple-label)]">
          Stand-up oversight
        </h1>

        {projects.length > 0 && (
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger
              aria-label="Project"
              className="w-56 rounded-[var(--apple-radius-pill)] border-[var(--apple-separator)] text-[13px]"
            >
              <SelectValue placeholder="All projects" />
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

      {view.sprints.length === 0 ? (
        <p className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card px-4 py-12 text-center text-[15px] text-[var(--apple-secondary-label)]">
          No sprint is active right now, so there is nothing to watch.
        </p>
      ) : (
        <>
          <Verdict view={view} />
          <Board sprints={view.sprints} scale={view.capacityScale} />

          <div className="grid gap-4 lg:grid-cols-2">
            <AgeingPanel bands={view.ageBands} />
            <OverridesPanel reasons={view.reasons} />
          </div>
        </>
      )}

      {view.waivers.length > 0 && <WaiverPanel waivers={view.waivers} />}
    </div>
  )
}

/* ------------------------------------------------------------------ chart plumbing */

/**
 * Recharts' own `ResponsiveContainer` measures its host element and renders
 * nothing until it does — which is correct in a browser but means a 0×0
 * result in jsdom, where layout never runs (see jest.setup.ts). Tracking
 * width ourselves with a non-zero fallback keeps every chart's category
 * labels and bars real DOM/SVG nodes in tests, and still re-measures on
 * resize in a real browser.
 */
function useMeasuredWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(fallback)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width
      if (measured && measured > 0) setWidth(measured)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { ref, width }
}

/**
 * One tooltip style for every chart on the screen, built from the same card
 * tokens as everything else here rather than recharts' default box — a hover
 * card is a convenience on top of the words already on the page, not a
 * second design system.
 */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((entry: any) => entry.value !== undefined && entry.value !== null)
  if (rows.length === 0) return null

  return (
    <div className="rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-card px-3 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.14)]">
      {label && <p className="text-[12px] font-medium text-[var(--apple-label)]">{label}</p>}
      <dl className="mt-0.5 flex flex-col gap-0.5">
        {rows.map((entry: any) => (
          <div key={entry.dataKey} className="flex items-center gap-1.5 text-[12px]">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: entry.color }} />
            <dt className="text-[var(--apple-secondary-label)]">{entry.name}</dt>
            <dd className="font-apple-mono tabular-nums text-[var(--apple-label)]">{entry.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/* ------------------------------------------------------------------ marks */

/**
 * Whole class strings rather than an inline `style`, so Tailwind's scanner can
 * see them — and so a non-working day reads as a narrow pause in the rhythm
 * rather than as an event of its own.
 */
const CADENCE_CLASS: Record<CadenceState, string> = {
  ran: 'flex-1 bg-[var(--viz-good)]',
  missed: 'flex-1 bg-[var(--viz-critical)]',
  ahead: 'flex-1 bg-[var(--apple-tertiary-fill)]',
  off: 'flex-[0.35] bg-[var(--apple-quaternary-fill)]'
}

const CADENCE_WORD: Record<CadenceState, string> = {
  ran: 'stand-up ran',
  missed: 'missed',
  ahead: 'still to come',
  off: 'not a working day'
}

/**
 * A sprint's working days, left to right, one cell each. The signature mark on
 * this screen: it is the only thing here that keeps the *order* of what
 * happened, which is what turns "5 of 10" into a diagnosis. Non-working days
 * are drawn as an empty outline so it stays obvious they were never counted
 * against the sprint (G1).
 */
function CadenceRibbon({ days, label }: { days: CadenceDay[]; label: string }) {
  if (days.length === 0) {
    return (
      <p className="flex h-5 items-center text-[12px] text-[var(--apple-tertiary-label)]">
        No stand-ups scheduled yet
      </p>
    )
  }

  return (
    <div className="flex h-5 w-full items-stretch gap-[2px]" role="img" aria-label={label}>
      {days.map((day) => (
        <span
          key={day.date}
          title={`${day.date} — ${CADENCE_WORD[day.state]}`}
          className={cn('min-w-[4px] max-w-[14px] rounded-[2px]', CADENCE_CLASS[day.state])}
        />
      ))}
    </div>
  )
}

/**
 * CC-11 / N12 as a beam either side of a centre line: left is headroom, right
 * is scope the sprint cannot absorb. Every beam on the board shares one scale,
 * so row-to-row length is comparable.
 */
function BalanceBeam({ balance, scale }: { balance: number; scale: number }) {
  const over = balance > 0
  const extent = Math.min(1, Math.abs(balance) / scale) * 50

  return (
    <div className="relative h-2 w-full rounded-full bg-[var(--apple-quaternary-fill)]">
      <span
        aria-hidden
        className="absolute inset-y-[-3px] left-1/2 w-px -translate-x-1/2 bg-[var(--apple-separator)]"
      />
      {Math.abs(balance) > 0.05 && (
        <span
          aria-hidden
          className={cn(
            'absolute inset-y-0',
            over ? 'left-1/2 rounded-r-full bg-[var(--viz-critical)]' : 'right-1/2 rounded-l-full bg-[var(--viz-accent)]'
          )}
          style={{ width: `${extent}%` }}
        />
      )}
    </div>
  )
}

/* --------------------------------------------------------------- sections */

/**
 * The screen's answer, as a sentence rather than as a scoreboard. The count is
 * set large inside the sentence — grammatically part of it, not a tile with a
 * caption underneath — and the line below names the one sprint to open first,
 * so the page is useful before anything else on it has been read.
 */
function Verdict({ view }: { view: OversightView }) {
  const { summary, worst } = view
  const clean = summary.needingAttention === 0

  return (
    <section
      aria-label="Organisation summary"
      className="grid gap-x-10 gap-y-6 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:shadow-none sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto]"
    >
      <div className="min-w-0">
        <h2 className="flex flex-wrap items-baseline gap-x-2.5 text-[19px] font-medium leading-tight text-[var(--apple-label)]">
          <span
            data-testid="oversight-hero-figure"
            className={cn(
              'font-apple-mono text-[40px] font-semibold leading-none tabular-nums',
              clean ? 'text-[var(--viz-good)]' : 'text-[var(--viz-critical)]'
            )}
          >
            {clean ? summary.activeSprints : summary.needingAttention}
          </span>
          <span className="max-w-[26rem]">
            {clean
              ? `active ${summary.activeSprints === 1 ? 'sprint is' : 'sprints are'} on cadence`
              : `of ${summary.activeSprints} active ${summary.activeSprints === 1 ? 'sprint needs' : 'sprints need'} you today`}
          </span>
        </h2>

        <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-[var(--apple-secondary-label)]">
          {worst
            ? `Start with ${worst.sprintName} in ${worst.projectName}: ${verdictOf(worst).toLowerCase()}.`
            : 'Nothing has missed a stand-up, gone over capacity, or aged past a decision.'}
        </p>

        <dl className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2.5">
          <Tally value={summary.chronicItems} label="chronic items" />
          <Tally value={summary.openBlockers} label="open blockers" />
          <Tally value={summary.missedDays} label="missed stand-ups" />
          <Tally value={summary.debtMinutes} label="estimate debt" format={hoursLabel} />
        </dl>
      </div>

      <div className="lg:border-l lg:border-[var(--apple-separator)] lg:pl-8">
        <OrgCadenceRail days={view.orgCadence} />
      </div>
    </section>
  )
}

/**
 * A figure and its noun on one line. Zero drops to grey so only real numbers
 * carry ink — red is spent on the board's rails and verdicts, not here, or
 * four alarming red numbers would sit in a row saying nothing about which one
 * to act on.
 */
function Tally({
  value,
  label,
  format
}: {
  value: number
  label: string
  format?: (value: number) => string
}) {
  const zero = value === 0
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="sr-only">{label}</dt>
      <dd
        className={cn(
          'font-apple-mono text-[15px] font-semibold tabular-nums',
          zero ? 'text-[var(--apple-quaternary-label)]' : 'text-[var(--apple-label)]'
        )}
      >
        {format ? format(value) : value}
      </dd>
      <span
        aria-hidden
        className={cn(
          'text-[13px]',
          zero ? 'text-[var(--apple-tertiary-label)]' : 'text-[var(--apple-secondary-label)]'
        )}
      >
        {label}
      </span>
    </div>
  )
}

/**
 * Organisation cadence over the last fortnight: one column per working day,
 * stand-ups that were missed stacked over the ones that ran. Not a
 * fully-chromed line chart — the question it answers is "are we sliding?",
 * which is a shape — but a real (Recharts) bar chart now, so the day scale
 * reads as an axis and a hover gives the exact split without losing the
 * always-visible totals below.
 */
function OrgCadenceRail({
  days
}: {
  days: Array<{ date: string; ran: number; missed: number; ahead: number }>
}) {
  const { ref, width } = useMeasuredWidth(300)

  if (days.length === 0) return null

  const missedTotal = days.reduce((total, day) => total + day.missed, 0)

  // A day nobody has reached yet gets a neutral stub of its own rather than an
  // empty column, so the fortnight still reads as a fortnight — full height
  // for that column would read as attendance nobody earned.
  const chartData = days.map((day) => ({
    ...day,
    label: day.date.slice(5).replace('-', '/'),
    pending: day.ran + day.missed === 0 ? 1 : 0
  }))

  return (
    <figure className="m-0 w-full lg:w-[300px]">
      <div ref={ref} className="w-full">
        <BarChart
          width={width}
          height={112}
          data={chartData}
          margin={{ top: 4, right: 2, left: 2, bottom: 0 }}
          barCategoryGap={2}
        >
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }}
            axisLine={{ stroke: 'var(--apple-separator)' }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis hide domain={[0, 'dataMax']} />
          <RechartsTooltip
            content={<ChartTooltip />}
            cursor={{ fill: 'var(--apple-quaternary-fill)' }}
            labelFormatter={(value, entries) => entries?.[0]?.payload?.date ?? value}
          />
          <Bar
            dataKey="ran"
            name="Ran"
            stackId="cadence"
            fill="var(--viz-good)"
            stroke="var(--viz-surface)"
            strokeWidth={2}
            maxBarSize={16}
          />
          <Bar
            dataKey="missed"
            name="Missed"
            stackId="cadence"
            fill="var(--viz-critical)"
            stroke="var(--viz-surface)"
            strokeWidth={2}
            radius={[2, 2, 0, 0]}
            maxBarSize={16}
          />
          <Bar
            dataKey="pending"
            name="Not yet run"
            stackId="cadence"
            fill="var(--apple-tertiary-fill)"
            radius={[2, 2, 0, 0]}
            maxBarSize={16}
            isAnimationActive={false}
          />
        </BarChart>
      </div>

      <div className="mt-2 flex items-center gap-4 text-[11px] text-[var(--apple-tertiary-label)]">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-[2px] bg-[var(--viz-good)]" />
          Ran
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-[2px] bg-[var(--viz-critical)]" />
          Missed
        </span>
      </div>
      <figcaption className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-[var(--apple-separator)] pt-1.5 text-[12px] text-[var(--apple-tertiary-label)]">
        <span>Organisation cadence, last {days.length} working days</span>
        <span className={missedTotal > 0 ? 'text-[var(--viz-critical)]' : undefined}>
          {missedTotal > 0 ? `${missedTotal} missed` : 'none missed'}
        </span>
      </figcaption>
    </figure>
  )
}

/**
 * The board. Rows on one surface rather than a card each — cards would give
 * eleven sprints eleven equal-weight frames, and the whole point is that they
 * are not equal. Every row shares one grid, so the figures line up as columns
 * down the page while each row still carries its own sequence. A header row
 * names those columns once instead of leaving them to be inferred per row.
 */
function Board({ sprints, scale }: { sprints: SprintOversightRow[]; scale: number }) {
  return (
    <section
      aria-label="Active sprints"
      className="overflow-hidden rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card"
    >
      <div className="hidden gap-x-6 border-b border-[var(--apple-separator)] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--apple-tertiary-label)] lg:grid lg:grid-cols-[minmax(0,17rem)_minmax(0,15rem)_minmax(0,1fr)_auto_auto] lg:items-center">
        <span>Sprint</span>
        <span>Cadence</span>
        <span>Capacity balance</span>
        <span>Backlog</span>
        <span aria-hidden />
      </div>
      <ul className="divide-y divide-[var(--apple-separator)]">
        {sprints.map((row) => (
          <SprintStrip key={row.sprintId} row={row} scale={scale} />
        ))}
      </ul>
    </section>
  )
}

function SprintStrip({ row, scale }: { row: SprintOversightRow; scale: number }) {
  const needsAttention = row.flags.length > 0
  const balance = balanceOf(row)
  const { completedDays, missedDays, totalWorkingDays } = row.discipline

  return (
    <li className="group relative transition-colors hover:bg-[var(--apple-quaternary-fill)]">
      {/* Severity as structure: a rail on the edge, never a tinted row. */}
      <span
        aria-hidden
        className={cn('absolute inset-y-0 left-0 w-[3px]', needsAttention && 'bg-[var(--viz-critical)]')}
      />

      <div className="grid gap-x-6 gap-y-4 py-4 pl-5 pr-4 lg:grid-cols-[minmax(0,17rem)_minmax(0,15rem)_minmax(0,1fr)_auto_auto] lg:items-center">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold text-[var(--apple-label)]">
            <Link
              href={`/projects/${row.projectId}/standups`}
              className="rounded-[var(--apple-radius-sm)] after:absolute after:inset-0 after:content-[''] group-hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--apple-system-blue)]"
            >
              {row.sprintName}
            </Link>
          </h3>
          <p className="truncate text-[13px] text-[var(--apple-tertiary-label)]">{row.projectName}</p>
          <p
            className={cn(
              'mt-1 text-[13px]',
              needsAttention ? 'text-[var(--viz-critical)]' : 'text-[var(--apple-secondary-label)]'
            )}
          >
            {verdictOf(row)}
          </p>
        </div>

        <div className="min-w-0">
          <div className="flex h-5 items-center">
            <CadenceRibbon
              days={row.cadence ?? []}
              label={`${row.sprintName}: ${completedDays} of ${totalWorkingDays} stand-ups ran, ${missedDays} missed`}
            />
          </div>
          <p className="mt-1.5 text-[12px] text-[var(--apple-tertiary-label)]">
              <span className="font-apple-mono tabular-nums text-[var(--apple-secondary-label)]">
                {completedDays}/{totalWorkingDays}
              </span>{' '}
              stand-ups ran
              {missedDays > 0 && (
                <>
                  {', '}
                  <span className="font-apple-mono tabular-nums text-[var(--viz-critical)]">
                    {missedDays}
                  </span>{' '}
                  missed
                </>
              )}
          </p>
        </div>

        <div className="min-w-0">
          <div className="flex h-5 items-center">
            <BalanceBeam balance={balance} scale={scale} />
          </div>
          <p className="mt-1.5 text-[12px] text-[var(--apple-tertiary-label)]">
              {Math.abs(balance) < 0.05
                ? 'Scope matches remaining capacity'
                : balance > 0
                  ? `${balance.toFixed(1)}h over remaining capacity`
                : `${Math.abs(balance).toFixed(1)}h of headroom left`}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-5 gap-y-1.5">
          <Figure value={row.carryForward.openCount} label="carried" />
          <Figure value={row.openBlockersCount} label="blockers" />
          <Figure value={row.estimateDebtMinutes} label="debt" format={hoursLabel} />
          <Figure value={row.overridesCount} label="overrides" />
        </dl>

        <ArrowUpRight
          aria-hidden
          className="h-4 w-4 self-center justify-self-end text-[var(--apple-tertiary-label)] transition-colors group-hover:text-[var(--apple-system-blue)]"
          strokeWidth={2}
        />
      </div>
    </li>
  )
}

/** A board figure. Zeros collapse to a dash, so a clean row reads as quiet rather than as four more numbers. */
function Figure({
  value,
  label,
  format
}: {
  value: number
  label: string
  format?: (value: number) => string
}) {
  const zero = value === 0
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <dt className="sr-only">{label}</dt>
      <dd
        className={cn(
          'font-apple-mono text-[14px] font-semibold tabular-nums',
          zero ? 'text-[var(--apple-quaternary-label)]' : 'text-[var(--apple-label)]'
        )}
      >
        {zero ? '–' : format ? format(value) : value}
      </dd>
      <span aria-hidden className="truncate text-[12px] text-[var(--apple-tertiary-label)]">
        {label}
      </span>
    </div>
  )
}

function Panel({
  title,
  caption,
  icon,
  children
}: {
  title: string
  caption: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-5">
      <div className="flex items-center gap-2.5">
        <IconChip icon={icon} tone="neutral" size="sm" />
        <h2 className="text-[15px] font-semibold text-[var(--apple-label)]">{title}</h2>
      </div>
      <p className="mb-4 mt-1.5 max-w-[52ch] text-[13px] leading-relaxed text-[var(--apple-tertiary-label)]">
        {caption}
      </p>
      {children}
    </section>
  )
}

/**
 * §15.15's carry-forward ageing, "with the chronic band highlighted". Drawn as
 * a labelled horizontal bar per band, worst (chronic) first — this is the one
 * place on the screen where an aggregate ranking benefits from an axis, since
 * the question is which bands the backlog has actually reached, not a single
 * sprint's sequence.
 */
function AgeingPanel({
  bands
}: {
  bands: Array<{ key: keyof AgeBands; label: string; swatch: string; color: string; count: number }>
}) {
  const total = bands.reduce((sum, band) => sum + band.count, 0)
  const chronic = bands.find((band) => band.key === 'chronic')?.count ?? 0
  const chartData = [...bands].reverse()
  const { ref, width } = useMeasuredWidth(340)

  return (
    <Panel
      title="Carry-forward ageing"
      icon={<Clock strokeWidth={1.75} />}
      caption={
        chronic > 0
          ? `${chronic} ${chronic === 1 ? 'item needs' : 'items need'} a documented decision at eight stand-ups or older: continue, descope or split.`
          : 'Open items by how many stand-ups they have survived. Nothing has reached the chronic band.'
      }
    >
      {total === 0 ? (
        <Empty text="Nothing is carried over. Clean slate." />
      ) : (
        <div ref={ref} className="w-full" role="img" aria-label={`${total} open carry-forward items by age`}>
          <BarChart
            width={width}
            height={chartData.length * 34 + 8}
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 28, left: 0, bottom: 0 }}
            barCategoryGap={10}
          >
            <XAxis type="number" hide domain={[0, 'dataMax']} />
            <YAxis
              type="category"
              dataKey="label"
              width={132}
              tick={{ fontSize: 12, fill: 'var(--apple-secondary-label)' }}
              axisLine={false}
              tickLine={false}
            />
            <RechartsTooltip content={<ChartTooltip />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
            <Bar dataKey="count" name="Items" radius={[0, 4, 4, 0]} barSize={14} isAnimationActive={false}>
              {chartData.map((band) => (
                <Cell key={band.key} fill={band.count === 0 ? 'var(--apple-tertiary-fill)' : band.color} />
              ))}
              <LabelList
                dataKey="count"
                position="right"
                formatter={(value: number) => (value === 0 ? '–' : String(value))}
                style={{ fill: 'var(--apple-label)', fontSize: 12, fontWeight: 600, fontFamily: MONO_STACK }}
              />
            </Bar>
          </BarChart>
        </div>
      )}
    </Panel>
  )
}

/**
 * OVR-8's reason ranking. A nominal list, so every bar wears one hue —
 * colouring each by its own value would spend the identity channel
 * re-encoding what bar length already says. Counts sit at the end of each bar
 * as a direct label, so nothing here needs a hover to be read.
 */
function OverridesPanel({ reasons }: { reasons: Array<{ reasonCode: string; label: string; count: number }> }) {
  const { ref, width } = useMeasuredWidth(340)

  return (
    <Panel
      title="Why capacity was overridden"
      icon={<RefreshCw strokeWidth={1.75} />}
      caption="Every override issued on an active sprint, ranked by reason. A pattern here is a resourcing signal, not a rounding error."
    >
      {reasons.length === 0 ? (
        <Empty text="No overrides have been issued." />
      ) : (
        <div ref={ref} className="w-full">
          <BarChart
            width={width}
            height={reasons.length * 34 + 8}
            data={reasons}
            layout="vertical"
            margin={{ top: 0, right: 28, left: 0, bottom: 0 }}
            barCategoryGap={10}
          >
            <XAxis type="number" hide domain={[0, 'dataMax']} />
            <YAxis
              type="category"
              dataKey="label"
              width={140}
              tick={{ fontSize: 12, fill: 'var(--apple-secondary-label)' }}
              axisLine={false}
              tickLine={false}
            />
            <RechartsTooltip content={<ChartTooltip />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
            <Bar
              dataKey="count"
              name="Overrides"
              fill="var(--viz-accent)"
              radius={[0, 4, 4, 0]}
              barSize={14}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="count"
                position="right"
                style={{ fill: 'var(--apple-label)', fontSize: 12, fontWeight: 600, fontFamily: MONO_STACK }}
              />
            </Bar>
          </BarChart>
        </div>
      )}
    </Panel>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="flex min-h-[96px] items-center text-[13px] text-[var(--apple-tertiary-label)]">{text}</p>
}

/**
 * PLN-18 — the waiver banner, at org scope. This is the one thing on the
 * screen only an Org Admin can have issued (PLN-16) and the only one they can
 * revoke, so it gets its own panel rather than a row on the board.
 */
function WaiverPanel({ waivers }: { waivers: WaiverRow[] }) {
  return (
    <section className="rounded-[var(--apple-radius-lg)] border border-[var(--viz-critical)]/30 bg-card p-5">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[var(--apple-label)]">
        <ShieldAlert className="h-4 w-4 shrink-0 text-[var(--viz-critical)]" strokeWidth={1.75} />
        Planning waivers in force
      </h2>
      <p className="mb-4 mt-1 max-w-[62ch] text-[13px] leading-relaxed text-[var(--apple-tertiary-label)]">
        A waiver lets stand-ups run on a sprint that failed its planning gate. Only an org admin can issue or
        revoke one.
      </p>
      <ul className="flex flex-col divide-y divide-[var(--apple-separator)]">
        {waivers.map((waiver) => (
          <li
            key={waiver.sprintId}
            className="flex flex-col items-start justify-between gap-x-6 gap-y-2 py-3 first:pt-0 last:pb-0 sm:flex-row"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium text-[var(--apple-label)]">
                {waiver.sprintName}
                <span className="font-normal text-[var(--apple-tertiary-label)]"> in {waiver.projectName}</span>
              </p>
              <p className="mt-0.5 max-w-[62ch] text-[13px] leading-relaxed text-[var(--apple-secondary-label)]">
                {waiver.justification}
              </p>
            </div>
            <div className="flex shrink-0 items-baseline gap-3 text-[12px]">
              <span className="font-apple-mono tabular-nums text-[var(--apple-tertiary-label)]">
                {waiver.waivedCheckIds.join(', ')}
              </span>
              <span
                className={
                  waiver.expired ? 'text-[var(--viz-critical)]' : 'text-[var(--apple-secondary-label)]'
                }
              >
                {waiver.expired ? 'Expired' : `Until ${waiver.expiresAt.slice(0, 10)}`}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function OversightSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6" aria-busy>
      <div className="h-8 w-56 animate-pulse rounded bg-[var(--apple-tertiary-fill)]" />
      <div className="h-28 animate-pulse rounded-[var(--apple-radius-lg)] bg-[var(--apple-tertiary-fill)]" />
      <div className="h-72 animate-pulse rounded-[var(--apple-radius-lg)] bg-[var(--apple-tertiary-fill)]" />
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((index) => (
          <div
            key={index}
            className="h-48 animate-pulse rounded-[var(--apple-radius-lg)] bg-[var(--apple-tertiary-fill)]"
          />
        ))}
      </div>
    </div>
  )
}
