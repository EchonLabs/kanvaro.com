'use client'

import { useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useDroppable } from '@dnd-kit/core'
import { AlertTriangle } from 'lucide-react'

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
    <section
      className={cn(
        'flex flex-col gap-3 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-3.5',
        className
      )}
      aria-label="Capacity board"
    >
      <header className="flex items-baseline justify-between">
        <h3 className="apple-section-label text-[var(--apple-tertiary-label)]">
          {standupStrings.allocation.capacityBoardTitle()}
        </h3>
        {/* The full count, always — a member scrolled out of a virtualised
            window must never read as absent from the sprint. */}
        <span
          data-testid="member-count"
          className="font-apple-mono text-[11px] tabular-nums text-[var(--apple-tertiary-label)]"
        >
          {standupStrings.allocation.memberCount({ count: members.length })}
        </span>
      </header>

      {virtualise ? (
        <div
          ref={scrollRef}
          data-testid="board-scroll"
          className="max-h-[70vh] overflow-y-auto pr-0.5"
        >
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((row) => (
              <div
                key={row.key}
                className="absolute left-0 top-0 w-full pb-3"
                style={{ transform: `translateY(${row.start}px)` }}
              >
                {cardFor(members[row.index])}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-0.5">
          {members.map(cardFor)}
        </div>
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

  /**
   * ALO-16's drop zone. Disabled the same way the pool's draggable cards are
   * — a read-only viewer gets neither end of the interaction. `isOver` drives
   * the highlight below; the actual allocation happens in
   * `StandupRunScreen`'s `DndContext.onDragEnd`, which reads `memberId` back
   * off `data` and calls the identical `onAdd`/`onQuickAdd` the "+" button and
   * the combobox already call.
   */
  const { setNodeRef, isOver } = useDroppable({
    id: `member-card-${member.memberId}`,
    data: { memberId: member.memberId },
    disabled: readOnly
  })

  return (
    <article
      ref={setNodeRef}
      data-testid="member-card"
      className={cn(
        'apple-transition flex flex-col gap-3 rounded-[var(--apple-radius-lg)] border bg-background p-3.5',
        isOver
          ? 'border-[var(--apple-system-blue)] shadow-[0_0_0_3px_rgba(0,122,255,0.15)]'
          : 'border-[var(--apple-separator)]'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h4 className="truncate text-[14px] font-semibold text-[var(--apple-label)]">
            {member.name}
          </h4>
          {capacity.outstandingDebtMinutes > 0 && (
            <span
              data-testid="debt-badge"
              className="shrink-0 rounded-full bg-[var(--apple-system-orange)]/15 px-2 py-0.5 text-[11px] font-medium text-[var(--apple-system-orange)]"
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
          className="apple-transition font-apple-mono shrink-0 rounded-full border border-[var(--apple-separator)] px-2 py-0.5 text-[11px] tabular-nums text-[var(--apple-secondary-label)] hover:bg-[var(--apple-quaternary-fill)]"
        >
          {formatMinutesAsHours(capacity.effectiveMinutes, { locale })}
        </button>
      </div>

      {capacity.overrunPolicy === 'reduce' && capacity.outstandingDebtMinutes > 0 && capacity.adjustedMinutes !== capacity.effectiveMinutes ? (
        <p className="text-[11px] text-[var(--apple-secondary-label)]">
          {standupStrings.variance.capacityReduced({
            nominal: capacity.adjustedMinutes,
            effective: capacity.effectiveMinutes,
            debt: capacity.outstandingDebtMinutes,
            locale
          })}
        </p>
      ) : null}

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
          className="flex flex-col gap-2 rounded-[var(--apple-radius-md)] border border-[var(--apple-system-red)]/30 bg-[var(--apple-system-red)]/[0.06] p-2.5 text-[12.5px]"
        >
          <p className="flex items-start gap-1.5 text-[var(--apple-system-red)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            {standupStrings.capacity.strandedAllocations({
              minutes: capacity.strandedMinutes,
              locale
            })}
          </p>
          <button
            type="button"
            onClick={() => onReassignStranded(member.memberId)}
            className="apple-transition self-start rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-background px-2 py-1 text-[11px] font-semibold hover:bg-[var(--apple-quaternary-fill)]"
          >
            {standupStrings.capacity.strandedAllocationsAction()}
          </button>
        </div>
      )}

      {member.allocations.length === 0 ? (
        <p
          className={cn(
            'rounded-[var(--apple-radius-md)] border border-dashed px-2.5 py-3 text-center text-[12px] apple-transition',
            isOver
              ? 'border-[var(--apple-system-blue)] text-[var(--apple-system-blue)]'
              : 'border-[var(--apple-separator)] text-[var(--apple-tertiary-label)]'
          )}
        >
          {standupStrings.allocation.dropHint()}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {member.allocations.map((row) => (
            <li
              key={row.allocationId}
              className="flex items-start justify-between gap-2 rounded-[var(--apple-radius-sm)] px-1 py-1"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] text-[var(--apple-label)]">
                  {row.taskKey ? (
                    <span className="font-apple-mono text-[11px] text-[var(--apple-tertiary-label)]">
                      {row.taskKey}{' '}
                    </span>
                  ) : null}
                  {row.title}
                </p>
                <span
                  data-testid={`source-${row.allocationId}`}
                  className="text-[11px] text-[var(--apple-secondary-label)]"
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
                className="apple-transition shrink-0 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] px-2 py-1 text-[11px] text-[var(--apple-secondary-label)] hover:bg-[var(--apple-quaternary-fill)] hover:text-[var(--apple-system-red)] disabled:opacity-40"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

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
    <div className="flex flex-col gap-2 text-[13px]">
      <div className="flex justify-between">
        <span className="text-[var(--apple-secondary-label)]">
          {standupStrings.allocation.breakdownNominal()}
        </span>
        <span className="font-apple-mono tabular-nums text-[var(--apple-label)]">
          {formatMinutesAsHours(nominalMinutes, { locale })}
        </span>
      </div>

      {adjustments.length === 0 ? (
        <p className="text-[var(--apple-secondary-label)]">
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
              <span className="truncate text-[var(--apple-label)]">{adjustment.label}</span>
              <span className="font-apple-mono shrink-0 tabular-nums text-[var(--apple-secondary-label)]">
                −{formatMinutesAsHours(adjustment.minutes, { locale })}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-between border-t border-[var(--apple-separator)] pt-2 font-semibold text-[var(--apple-label)]">
        <span>{standupStrings.allocation.breakdownEffective()}</span>
        <span className="font-apple-mono tabular-nums">
          {formatMinutesAsHours(effectiveMinutes, { locale })}
        </span>
      </div>

      {/* OB-10. Without this, a full day on a day holding a two-hour review
          reads as a defect rather than as the project's setting. */}
      {!ceremoniesConsumeCapacity && (
        <p className="rounded-[var(--apple-radius-sm)] bg-[var(--apple-tertiary-fill)] p-2 text-[11.5px] text-[var(--apple-secondary-label)]">
          {standupStrings.capacity.ceremoniesNotDeducted()}
        </p>
      )}
    </div>
  )
}
