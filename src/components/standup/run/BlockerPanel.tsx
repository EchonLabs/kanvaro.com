'use client'

import { AlertTriangle, Plus } from 'lucide-react'

import { standupStrings } from '@/lib/standup/strings'
import { freedCapacityMessage } from '@/lib/standup/blocker'
import type { Minutes } from '@/lib/standup/minutes'
import { cn } from '@/lib/utils'

import {
  PLAN_SCROLL_MAX,
  PlanCard,
  PlanCount,
  PlanRow,
  planEmptyClass,
  planLinkClass,
  planPillClass,
  type PlanPillTone
} from '../planning/ui'

/**
 * Panel 6 — blockers (§13, RUN-14..18).
 *
 * Prop-driven, same as `CarryForwardPanel`: the parent screen owns loading
 * and mutation, this panel only renders rows and fires callbacks up.
 *
 * Two things worth calling out:
 *
 * **Overdue sorts first** (RUN-18) — a blocker past its target resolution
 * date needs to be the first thing the PM sees, not something they find by
 * scrolling.
 *
 * **The freed-capacity line is per row, not a summary** (RUN-15) — "2h freed
 * by blocker BLK-14" only means something attached to the row it freed.
 */

export interface BlockerRow {
  blockerId: string
  taskKey?: string
  description: string
  blockerType: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'in_progress' | 'resolved' | 'wont_resolve'
  owner?: string
  targetResolutionDate?: string
  overdue: boolean
  freedMinutes?: Minutes
  blockerLabel: string
}

export interface BlockerPanelProps {
  blockers: readonly BlockerRow[]
  today: string
  onRaise: () => void
  onResolve: (blockerId: string) => void
  className?: string
}

const SEVERITY_TONE: Record<BlockerRow['severity'], PlanPillTone> = {
  critical: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'neutral'
}

export function BlockerPanel({ blockers, onRaise, onResolve, className }: BlockerPanelProps) {
  const sorted = [...blockers].sort((a, b) => (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0))

  // Every row this panel renders is an unresolved blocker, so the row count
  // *is* the issue count. `sorted.length` rather than a filter, so the badge
  // can never disagree with the list beneath it.
  const issues = sorted.length

  return (
    <PlanCard
      id="panel-6"
      aria-labelledby="panel-6-heading"
      title={standupStrings.run.panel6()}
      headingLevel="h3"
      headingId="panel-6-heading"
      className={className}
      aside={
        <div className="flex items-center gap-2">
          <PlanCount count={issues} label={standupStrings.blocker.openCount({ count: issues })} />
          <button
            type="button"
            onClick={onRaise}
            className={planPillClass('accent', 'apple-transition gap-1 hover:opacity-80 disabled:opacity-40')}
          >
            <Plus className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
            {standupStrings.blocker.raise()}
          </button>
        </div>
      }
    >
      {sorted.length === 0 && (
        <p className={planEmptyClass}>{standupStrings.blocker.empty()}</p>
      )}

      {/* The register has no natural ceiling — a bad sprint puts a dozen rows
          here — and this panel shares a row with the completion checklist, so
          an unbounded list drags the Complete button off screen. */}
      <ul
        className={cn(
          'flex flex-col divide-y divide-[var(--plan-border)]',
          sorted.length > 0 && `plan-scroll ${PLAN_SCROLL_MAX}`
        )}
      >
        {sorted.map((row) => {
          const meta = [
            standupStrings.blocker.blockedTask({
              task: row.taskKey ?? standupStrings.blocker.general()
            }),
            row.owner ? standupStrings.blocker.owner({ name: row.owner }) : null,
            row.targetResolutionDate
              ? standupStrings.blocker.target({ date: row.targetResolutionDate })
              : null
          ]
            .filter(Boolean)
            .join(' · ')

          return (
            <li
              key={row.blockerId}
              data-testid="blocker-row"
              data-overdue={row.overdue || undefined}
              className={cn(
                'flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0',
                // RUN-18: overdue is the one row that must not blend in.
                row.overdue &&
                  'rounded-[var(--apple-radius-md)] border-y-0 bg-[var(--plan-danger-bg)] px-3 first:pt-3 last:pb-3 text-[var(--plan-danger)]'
              )}
            >
              <PlanRow
                title={
                  <span className="inline-flex items-start gap-1.5">
                    {row.overdue && (
                      <AlertTriangle
                        className="mt-[2px] h-3.5 w-3.5 shrink-0 text-[var(--plan-danger)]"
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                    )}
                    <span className={cn(row.overdue && 'text-[var(--plan-danger)]')}>
                      {row.description}
                    </span>
                  </span>
                }
                meta={meta}
                badge={
                  <>
                    {row.overdue && (
                      <span className={planPillClass('danger')}>{standupStrings.blocker.overdue()}</span>
                    )}
                    <span className={planPillClass(SEVERITY_TONE[row.severity])}>
                      {standupStrings.blocker.severity({ severity: row.severity })}
                    </span>
                  </>
                }
              />

              {row.freedMinutes !== undefined && (
                <span className="apple-type-caption text-[var(--plan-secondary)]">
                  {freedCapacityMessage(row.freedMinutes, row.blockerLabel)}
                </span>
              )}

              {row.status !== 'resolved' && row.status !== 'wont_resolve' && (
                <button
                  type="button"
                  onClick={() => onResolve(row.blockerId)}
                  className={cn(planLinkClass, 'self-start')}
                >
                  {standupStrings.blocker.resolve()}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </PlanCard>
  )
}
