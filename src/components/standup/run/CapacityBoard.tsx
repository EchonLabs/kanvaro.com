'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'

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
 * The *layout* is no longer this file's business. Task 8 moved the per-member
 * card onto `shared/ExpandableMemberCard`, rendered by the same
 * `TaskAssignmentSplitScreen` sprint planning uses, so what is left here is
 * the run-specific content that card cannot know about, supplied to it through
 * its three render props:
 *
 *   `renderAlways`      → `MemberRunAlerts`      — debt, reduced capacity, OB-12
 *   `renderTaskRow`     → `MemberAllocationRow`  — source, hours, remove
 *   `renderExpandedExtra` → `MemberRunDetails`   — quick add + the breakdown drawer
 *
 * It still computes nothing. `computeCapacity()` is the module's sole capacity
 * authority and every write returns a fresh `CapacityBreakdown`; these
 * components render what they are handed. A board that re-derived a meter
 * would eventually disagree with the server that decides whether the stand-up
 * may complete, and the PM would have no way to tell which number was real.
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
 *   otherwise indistinguishable. It goes through `renderAlways`, not
 *   `renderExpandedExtra`: an alert behind a disclosure triangle is an alert
 *   nobody reads.
 */

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

/**
 * Everything about a member's day that must be legible without expanding
 * their card: the estimate-debt badge, AC-16's capacity-reduced sentence, and
 * OB-12's stranded-hours alert.
 */
export function MemberRunAlerts({
  member,
  onReassignStranded,
  locale
}: {
  member: BoardMemberView
  onReassignStranded: (memberId: string) => void
  locale?: string
}) {
  const { capacity } = member

  const hasDebt = capacity.outstandingDebtMinutes > 0
  const reduced =
    capacity.overrunPolicy === 'reduce' &&
    hasDebt &&
    capacity.adjustedMinutes !== capacity.effectiveMinutes

  if (!hasDebt && capacity.strandedMinutes === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {hasDebt && (
        <span
          data-testid="debt-badge"
          className="self-start rounded-full bg-[var(--apple-system-orange)]/15 px-2 py-0.5 text-[11px] font-medium text-[var(--apple-system-orange)]"
        >
          {standupStrings.allocation.debtBadge({
            minutes: capacity.outstandingDebtMinutes,
            locale
          })}
        </span>
      )}

      {reduced && (
        <p className="text-[11px] text-[var(--apple-secondary-label)]">
          {standupStrings.variance.capacityReduced({
            nominal: capacity.adjustedMinutes,
            effective: capacity.effectiveMinutes,
            debt: capacity.outstandingDebtMinutes,
            locale
          })}
        </p>
      )}

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
    </div>
  )
}

/**
 * One allocated row inside an expanded member card, with the two controls the
 * shared read-only row has no notion of: ALO-5's hours and the remove action.
 *
 * It *replaces* the shared card's read-only row rather than being appended
 * below it — the same task listed twice, once editable and once not, is worse
 * than either alone.
 */
export function MemberAllocationRow({
  allocation,
  onChangeHours,
  onRemove,
  readOnly = false,
  locale
}: {
  allocation: BoardAllocationView
  onChangeHours: (allocationId: string, minutes: Minutes) => void
  onRemove: (allocationId: string) => void
  readOnly?: boolean
  locale?: string
}) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-background px-2 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] text-[var(--apple-label)]">
          {allocation.taskKey ? (
            <span className="font-apple-mono text-[11px] text-[var(--apple-tertiary-label)]">
              {allocation.taskKey}{' '}
            </span>
          ) : null}
          {allocation.title}
        </p>
        <span
          data-testid={`source-${allocation.allocationId}`}
          className="text-[11px] text-[var(--apple-secondary-label)]"
        >
          {standupStrings.allocation.source[allocation.source]()}
        </span>
      </div>

      <HourStepper
        taskLabel={allocation.taskKey ?? allocation.title}
        valueMinutes={allocation.plannedMinutes}
        remainingEstimateMinutes={allocation.remainingEstimateMinutes}
        disabled={readOnly}
        locale={locale}
        onChange={(next) => onChangeHours(allocation.allocationId, next)}
      />

      <button
        type="button"
        disabled={readOnly}
        onClick={() => onRemove(allocation.allocationId)}
        aria-label={standupStrings.allocation.removeRow({
          task: allocation.taskKey ?? allocation.title
        })}
        className="apple-transition shrink-0 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] px-2 py-1 text-[11px] text-[var(--apple-secondary-label)] hover:bg-[var(--apple-quaternary-fill)] hover:text-[var(--apple-system-red)] disabled:opacity-40"
      >
        ✕
      </button>
    </div>
  )
}

/**
 * The run-only tail of an expanded member card: the keyboard path to
 * allocation (NFR-A2) and the itemised capacity breakdown behind a drawer.
 *
 * The quick-add combobox is present on every card, not behind a menu: it is
 * the only path for some of the team, and it is also where ALO-17's fit
 * indicator now lives — measured against *this* member's gap rather than
 * against a single globally "selected" member, which is what the pool used to
 * do.
 */
export function MemberRunDetails({
  member,
  poolTasks,
  ceremoniesConsumeCapacity,
  onQuickAdd,
  readOnly = false,
  locale
}: {
  member: BoardMemberView
  poolTasks: readonly QuickAddTask[]
  ceremoniesConsumeCapacity: boolean
  onQuickAdd: (memberId: string, task: QuickAddTask) => void
  readOnly?: boolean
  locale?: string
}) {
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const { capacity } = member

  return (
    <div className="flex flex-col gap-2.5">
      {!readOnly && (
        <QuickAddCombobox
          memberName={member.name}
          tasks={poolTasks}
          gapMinutes={capacity.gapMinutes}
          locale={locale}
          onSelect={(task) => onQuickAdd(member.memberId, task)}
        />
      )}

      <button
        type="button"
        onClick={() => setBreakdownOpen(true)}
        aria-label={standupStrings.allocation.breakdownTrigger({ name: member.name })}
        className={cn(
          'apple-transition font-apple-mono self-start rounded-full border border-[var(--apple-separator)] px-2 py-0.5 text-[11px] tabular-nums text-[var(--apple-secondary-label)] hover:bg-[var(--apple-quaternary-fill)]'
        )}
      >
        {formatMinutesAsHours(capacity.effectiveMinutes, { locale })}
      </button>

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
    </div>
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
