'use client'

import { useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

import { CapacityMeter } from '@/components/standup/primitives/CapacityMeter'
import { Drawer } from '@/components/standup/primitives/Drawer'
import { HourStepper } from '@/components/standup/primitives/HourStepper'
import {
  QuickAddCombobox,
  type QuickAddTask
} from '@/components/standup/primitives/QuickAddCombobox'
import type { AllocationSource } from '@/models/Allocation'
import type { CapacityAdjustment, CapacityBreakdown } from '@/lib/standup/capacity'
import { formatMinutesAsHours, type Minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

/**
 * The capacity board (§15.8.7) — Panel 5's right half, and the phase's visible
 * half.
 *
 * It computes nothing. `computeCapacity()` is the module's sole capacity
 * authority and every write returns a fresh `CapacityBreakdown`; this component
 * renders what it is handed. A board that re-derived a meter would eventually
 * disagree with the server that decides whether the stand-up may complete, and
 * the PM would have no way to tell which number was real.
 *
 * Three obligations inherited from Phase 6 are discharged here, and all three
 * are the same class of bug — a number correct on the server and invisible or
 * misleading on screen:
 *
 *   **OB-9 (DN-7)** — `'ceremony'` adjustments render individually, by title.
 *   An aggregated "meetings −90m" would be a defect: the itemised breakdown
 *   exists so a PM can see *which* meeting ate the morning.
 *
 *   **OB-10 (DN-6)** — when ceremonies are not deducted, the breakdown says so.
 *   Otherwise a full eight-hour day on a day holding a two-hour review reads as
 *   a bug rather than a setting.
 *
 *   **OB-12 (RUN-7)** — non-zero `strandedMinutes` renders as an alert with the
 *   reassign action, never as a variant of the calm `unavailable` chip.
 *   `allocationStatus` decides `unavailable` from effective capacity before it
 *   looks at what is allocated, so six parked hours and an empty day are
 *   otherwise indistinguishable.
 */

/** Past this many members the list virtualises rather than mounting every card. */
const VIRTUALISE_ABOVE = 25

export interface BoardAllocationView {
  allocationId: string
  taskId: string
  taskKey?: string
  title: string
  plannedMinutes: Minutes
  remainingEstimateMinutes: Minutes
  source: AllocationSource
  isBlocked: boolean
  excludedFromCapacity: boolean
  detachedReason?: string
  pairedDeliberately: boolean
  note?: string
}

export interface BoardMemberView {
  memberId: string
  name: string
  capacity: CapacityBreakdown
  allocations: BoardAllocationView[]
}

export interface CapacityBoardProps {
  members: BoardMemberView[]
  /** Sprint tasks offered by the quick-add combobox — the keyboard path. */
  poolTasks: readonly QuickAddTask[]
  /** DN-6. False means the breakdown must carry OB-10's notice. */
  ceremoniesConsumeCapacity: boolean
  onChangeHours: (allocationId: string, minutes: Minutes) => void
  onRemove: (allocationId: string) => void
  onQuickAdd: (memberId: string, task: QuickAddTask) => void
  onReassignStranded: (memberId: string) => void
  /** RUN-26 — the stand-up moved to In_Progress and this viewer may not edit. */
  readOnly?: boolean
  locale?: string
  className?: string
}

export function CapacityBoard({
  members,
  poolTasks,
  ceremoniesConsumeCapacity,
  onChangeHours,
  onRemove,
  onQuickAdd,
  onReassignStranded,
  readOnly = false,
  locale,
  className
}: CapacityBoardProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const virtualise = members.length > VIRTUALISE_ABOVE

  const virtualizer = useVirtualizer({
    count: virtualise ? members.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 260,
    overscan: 4
  })

  const cardFor = (member: BoardMemberView) => (
    <MemberCard
      key={member.memberId}
      member={member}
      poolTasks={poolTasks}
      ceremoniesConsumeCapacity={ceremoniesConsumeCapacity}
      onChangeHours={onChangeHours}
      onRemove={onRemove}
      onQuickAdd={onQuickAdd}
      onReassignStranded={onReassignStranded}
      readOnly={readOnly}
      locale={locale}
    />
  )

  return (
    <section className={cn('flex flex-col gap-3', className)} aria-label="Capacity board">
      <header className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Capacity board</h3>
        {/* The full count, always — a member scrolled out of a virtualised
            window must never read as absent from the sprint. */}
        <span data-testid="member-count" className="text-xs text-muted-foreground">
          {standupStrings.allocation.memberCount({ count: members.length })}
        </span>
      </header>

      {virtualise ? (
        <div
          ref={scrollRef}
          data-testid="board-scroll"
          className="max-h-[70vh] overflow-y-auto"
        >
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((row) => (
              <div
                key={row.key}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${row.start}px)` }}
              >
                {cardFor(members[row.index])}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">{members.map(cardFor)}</div>
      )}
    </section>
  )
}

function MemberCard({
  member,
  poolTasks,
  ceremoniesConsumeCapacity,
  onChangeHours,
  onRemove,
  onQuickAdd,
  onReassignStranded,
  readOnly,
  locale
}: {
  member: BoardMemberView
  poolTasks: readonly QuickAddTask[]
  ceremoniesConsumeCapacity: boolean
  onChangeHours: (allocationId: string, minutes: Minutes) => void
  onRemove: (allocationId: string) => void
  onQuickAdd: (memberId: string, task: QuickAddTask) => void
  onReassignStranded: (memberId: string) => void
  readOnly: boolean
  locale?: string
}) {
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const { capacity } = member

  const carriedMinutes = member.allocations
    .filter((row) => row.source === 'carried_forward' && !row.detachedReason)
    .reduce((total, row) => total + row.plannedMinutes, 0) as Minutes

  return (
    <article
      data-testid="member-card"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium">{member.name}</h4>
          {capacity.outstandingDebtMinutes > 0 && (
            <span
              data-testid="debt-badge"
              className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400"
            >
              {standupStrings.allocation.debtBadge({
                minutes: capacity.outstandingDebtMinutes,
                locale
              })}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setBreakdownOpen(true)}
          aria-label={standupStrings.allocation.breakdownTrigger({ name: member.name })}
          className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground"
        >
          {formatMinutesAsHours(capacity.effectiveMinutes, { locale })}
        </button>
      </div>

      <CapacityMeter
        name={member.name}
        effectiveMinutes={capacity.effectiveMinutes}
        allocatedMinutes={capacity.allocatedMinutes}
        carriedMinutes={carriedMinutes}
        gapMinutes={capacity.gapMinutes}
        status={capacity.status}
        locale={locale}
      />

      {/* OB-12. Loud, and never the calm slate chip: these hours belong to
          somebody who cannot do them today, and the day is not finished until
          they belong to somebody else. */}
      {capacity.strandedMinutes > 0 && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm"
        >
          <p>
            {standupStrings.capacity.strandedAllocations({
              minutes: capacity.strandedMinutes,
              locale
            })}
          </p>
          <button
            type="button"
            onClick={() => onReassignStranded(member.memberId)}
            className="self-start rounded-md border border-border bg-background px-2 py-1 text-xs font-medium"
          >
            {standupStrings.capacity.strandedAllocationsAction()}
          </button>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {member.allocations.map((row) => (
          <li key={row.allocationId} className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                {row.taskKey ? `${row.taskKey} ` : ''}
                {row.title}
              </p>
              <span
                data-testid={`source-${row.allocationId}`}
                className="text-xs text-muted-foreground"
              >
                {standupStrings.allocation.source[row.source]()}
              </span>
            </div>

            <HourStepper
              taskLabel={row.taskKey ?? row.title}
              valueMinutes={row.plannedMinutes}
              remainingEstimateMinutes={row.remainingEstimateMinutes}
              disabled={readOnly}
              locale={locale}
              onChange={(next) => onChangeHours(row.allocationId, next)}
            />

            <button
              type="button"
              disabled={readOnly}
              onClick={() => onRemove(row.allocationId)}
              aria-label={standupStrings.allocation.removeRow({
                task: row.taskKey ?? row.title
              })}
              className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-40"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {/* The keyboard equivalent of the drop zone (NFR-A2). Present on every
          card, not behind a menu: it is the only path for some of the team. */}
      {!readOnly && (
        <QuickAddCombobox
          memberName={member.name}
          tasks={poolTasks}
          gapMinutes={capacity.gapMinutes}
          locale={locale}
          onSelect={(task) => onQuickAdd(member.memberId, task)}
        />
      )}

      <Drawer
        open={breakdownOpen}
        onClose={() => setBreakdownOpen(false)}
        title={standupStrings.allocation.drawerLabel({ name: member.name })}
      >
        <CapacityBreakdownList
          adjustments={capacity.adjustments}
          nominalMinutes={capacity.nominalMinutes}
          effectiveMinutes={capacity.effectiveMinutes}
          ceremoniesConsumeCapacity={ceremoniesConsumeCapacity}
          locale={locale}
        />
      </Drawer>
    </article>
  )
}

/**
 * The itemised breakdown (DN-7, OB-9, OB-10).
 *
 * Every adjustment gets its own row, in the order `computeCapacity` returned
 * them — that order is ALO-1's computation order, and reordering here would
 * make the arithmetic impossible to follow.
 */
function CapacityBreakdownList({
  adjustments,
  nominalMinutes,
  effectiveMinutes,
  ceremoniesConsumeCapacity,
  locale
}: {
  adjustments: readonly CapacityAdjustment[]
  nominalMinutes: Minutes
  effectiveMinutes: Minutes
  ceremoniesConsumeCapacity: boolean
  locale?: string
}) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex justify-between">
        <span className="text-muted-foreground">
          {standupStrings.allocation.breakdownNominal()}
        </span>
        <span className="tabular-nums">
          {formatMinutesAsHours(nominalMinutes, { locale })}
        </span>
      </div>

      {adjustments.length === 0 ? (
        <p className="text-muted-foreground">
          {standupStrings.allocation.breakdownNoAdjustments()}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {adjustments.map((adjustment, index) => (
            <li
              // The label is not unique — two meetings can share a title — so
              // the index is part of the key. Reordering never happens here:
              // the list is rendered once per breakdown.
              key={`${adjustment.type}-${adjustment.label}-${index}`}
              data-testid={`adjustment-${adjustment.type}`}
              className="flex justify-between gap-2"
            >
              <span className="truncate">{adjustment.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                −{formatMinutesAsHours(adjustment.minutes, { locale })}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-between border-t border-border pt-2 font-medium">
        <span>{standupStrings.allocation.breakdownEffective()}</span>
        <span className="tabular-nums">
          {formatMinutesAsHours(effectiveMinutes, { locale })}
        </span>
      </div>

      {/* OB-10. Without this, a full day on a day holding a two-hour review
          reads as a defect rather than as the project's setting. */}
      {!ceremoniesConsumeCapacity && (
        <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
          {standupStrings.capacity.ceremoniesNotDeducted()}
        </p>
      )}
    </div>
  )
}
