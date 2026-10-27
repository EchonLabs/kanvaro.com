'use client'

import { useState } from 'react'
import { ChevronRight, X, XCircle } from 'lucide-react'

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

import { PlanBanner, planButtonClass, planPillClass } from '../planning/ui'

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
  /**
   * Carried, not rendered here: `fromBoardMemberView` passes it to
   * `ExpandableMemberCard`, which draws the photo. The board's own rows show
   * the member's name and capacity bar, never a second avatar.
   */
  avatarUrl?: string
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
          className={planPillClass('warning', 'self-start')}
        >
          {standupStrings.allocation.debtBadge({
            minutes: capacity.outstandingDebtMinutes,
            locale
          })}
        </span>
      )}

      {reduced && (
        <p className="apple-type-caption text-[var(--plan-secondary)]">
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
        <PlanBanner
          tone="danger"
          bordered
          role="alert"
          icon={<XCircle strokeWidth={2} />}
          actions={
            <button
              type="button"
              onClick={() => onReassignStranded(member.memberId)}
              className={planButtonClass('secondary', undefined, 'sm')}
            >
              {standupStrings.capacity.strandedAllocationsAction()}
            </button>
          }
        >
          {standupStrings.capacity.strandedAllocations({
            minutes: capacity.strandedMinutes,
            locale
          })}
        </PlanBanner>
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
    <div className="flex flex-col gap-3 rounded-[var(--apple-radius-lg)] border border-[var(--plan-border)] bg-[var(--plan-surface)] p-3 shadow-[var(--plan-shadow)]">
      {/* What it is: the key and where it came from, the title, and the one
          destructive action — a quiet icon until it is hovered. */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="flex flex-wrap items-center gap-x-1.5 apple-type-caption text-[var(--plan-muted)]">
            {allocation.taskKey && (
              <span className="font-semibold tabular-nums text-[var(--plan-secondary)]">
                {allocation.taskKey}
              </span>
            )}
            <span aria-hidden="true">·</span>
            <span data-testid={`source-${allocation.allocationId}`}>
              {standupStrings.allocation.source[allocation.source]()}
            </span>
            {allocation.isBlocked && (
              <span className="font-semibold text-[var(--plan-warning)]">
                · {standupStrings.allocation.blockedTag()}
              </span>
            )}
          </p>
          <p className="line-clamp-2 apple-type-subheadline font-semibold leading-snug text-[var(--plan-text)]">
            {allocation.title}
          </p>
        </div>

        <button
          type="button"
          disabled={readOnly}
          onClick={() => onRemove(allocation.allocationId)}
          aria-label={standupStrings.allocation.removeRow({
            task: allocation.taskKey ?? allocation.title
          })}
          title={standupStrings.allocation.removeTitle()}
          className="apple-transition -mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--plan-muted)] hover:bg-[var(--plan-danger-bg)] hover:text-[var(--plan-danger)] disabled:opacity-40"
        >
          <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      {/* What it costs today: planned hours, editable, against what is left. */}
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 border-t border-[var(--plan-border)] pt-3">
        <HourStepper
          taskLabel={allocation.taskKey ?? allocation.title}
          valueMinutes={allocation.plannedMinutes}
          remainingEstimateMinutes={allocation.remainingEstimateMinutes}
          disabled={readOnly}
          locale={locale}
          onChange={(next) => onChangeHours(allocation.allocationId, next)}
        />
        <p className="apple-type-caption tabular-nums text-[var(--plan-muted)]">
          <span className="font-semibold text-[var(--plan-text)]">
            {formatMinutesAsHours(allocation.remainingEstimateMinutes, { locale })}
          </span>{' '}
          {standupStrings.allocation.leftOnTask()}
        </p>
      </div>
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

      {/* A bare "8.0h" pill gave no hint what it was or that it opened
          anything; it now says what the number is and where it goes. */}
      <button
        type="button"
        onClick={() => setBreakdownOpen(true)}
        aria-label={standupStrings.allocation.breakdownTrigger({ name: member.name })}
        className="apple-transition group inline-flex items-center gap-1 self-start rounded-full apple-type-caption text-[var(--plan-muted)] hover:text-[var(--plan-text)]"
      >
        <span>
          {standupStrings.allocation.capacityToday()}{' '}
          <span className="font-semibold tabular-nums text-[var(--plan-text)]">
            {formatMinutesAsHours(capacity.effectiveMinutes, { locale })}
          </span>
        </span>
        <span className="text-[var(--plan-accent-ink)]">
          · {standupStrings.allocation.viewBreakdown()}
        </span>
        <ChevronRight
          className="h-3 w-3 text-[var(--plan-accent-ink)] apple-transition group-hover:translate-x-0.5"
          strokeWidth={2.25}
          aria-hidden="true"
        />
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
    <div className="flex flex-col gap-2 apple-type-subheadline">
      <div className="flex justify-between">
        <span className="text-[var(--plan-secondary)]">
          {standupStrings.allocation.breakdownNominal()}
        </span>
        <span className="font-apple-mono tabular-nums text-[var(--plan-text)]">
          {formatMinutesAsHours(nominalMinutes, { locale })}
        </span>
      </div>

      {adjustments.length === 0 ? (
        <p className="text-[var(--plan-secondary)]">
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
              <span className="truncate text-[var(--plan-text)]">{adjustment.label}</span>
              <span className="font-apple-mono shrink-0 tabular-nums text-[var(--plan-secondary)]">
                −{formatMinutesAsHours(adjustment.minutes, { locale })}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-between border-t border-[var(--plan-border)] pt-2 font-semibold text-[var(--plan-text)]">
        <span>{standupStrings.allocation.breakdownEffective()}</span>
        <span className="font-apple-mono tabular-nums">
          {formatMinutesAsHours(effectiveMinutes, { locale })}
        </span>
      </div>

      {/* OB-10. Without this, a full day on a day holding a two-hour review
          reads as a defect rather than as the project's setting. */}
      {!ceremoniesConsumeCapacity && (
        <p className="rounded-[var(--apple-radius-sm)] bg-[var(--plan-raised)] p-2 apple-type-caption text-[var(--plan-secondary)]">
          {standupStrings.capacity.ceremoniesNotDeducted()}
        </p>
      )}
    </div>
  )
}
