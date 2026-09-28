'use client'

import { AlertTriangle, Plus } from 'lucide-react'

import { standupStrings } from '@/lib/standup/strings'
import { freedCapacityMessage } from '@/lib/standup/blocker'
import type { Minutes } from '@/lib/standup/minutes'
import { cn } from '@/lib/utils'

import {
  Badge,
  CARD_CLASSES,
  CARD_TITLE_CLASSES,
  EMPTY_CLASSES,
  IssueCount,
  LINK_BUTTON_CLASSES,
  RowHead,
  SCROLL_CLASSES,
  SCROLL_MAX,
  TEXT_META,
  TINT_BUTTON_CLASSES,
  type Tone
} from './ui'

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

const SEVERITY_TONE: Record<BlockerRow['severity'], Tone> = {
  critical: 'red',
  high: 'red',
  medium: 'amber',
  low: 'neutral'
}

export function BlockerPanel({ blockers, onRaise, onResolve, className }: BlockerPanelProps) {
  const sorted = [...blockers].sort((a, b) => (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0))

  // Every row this panel renders is an unresolved blocker, so the row count
  // *is* the issue count. `sorted.length` rather than a filter, so the badge
  // can never disagree with the list beneath it.
  const issues = sorted.length

  return (
    <section
      id="panel-6"
      aria-labelledby="panel-6-heading"
      className={cn('scroll-mt-6 flex flex-col gap-4', CARD_CLASSES, className)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 id="panel-6-heading" className={CARD_TITLE_CLASSES}>
            {standupStrings.run.panel6()}
          </h3>
          <IssueCount count={issues} label={standupStrings.blocker.openCount({ count: issues })} />
        </div>
        <button type="button" onClick={onRaise} className={cn(TINT_BUTTON_CLASSES, 'gap-1')}>
          <Plus className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
          {standupStrings.blocker.raise()}
        </button>
      </div>

      {sorted.length === 0 && (
        <p className={EMPTY_CLASSES}>{standupStrings.blocker.empty()}</p>
      )}

      {/* The register has no natural ceiling — a bad sprint puts a dozen rows
          here — and this panel shares a row with the completion checklist, so
          an unbounded list drags the Complete button off screen. */}
      <ul
        className={cn(
          'flex flex-col divide-y divide-[var(--sur-border)]',
          sorted.length > 0 && `${SCROLL_CLASSES} ${SCROLL_MAX}`
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
                  'rounded-[var(--sur-radius-inset)] border-y-0 bg-[var(--sur-red-tint)] px-3 first:pt-3 last:pb-3 text-[var(--sur-red)]'
              )}
            >
              <RowHead
                title={
                  <span className="inline-flex items-start gap-1.5">
                    {row.overdue && (
                      <AlertTriangle
                        className="mt-[2px] h-3.5 w-3.5 shrink-0 text-[var(--sur-red)]"
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                    )}
                    <span className={cn(row.overdue && 'text-[var(--sur-red)]')}>
                      {row.description}
                    </span>
                  </span>
                }
                meta={meta}
                badge={
                  <>
                    {row.overdue && <Badge tone="red">{standupStrings.blocker.overdue()}</Badge>}
                    <Badge tone={SEVERITY_TONE[row.severity]}>
                      {standupStrings.blocker.severity({ severity: row.severity })}
                    </Badge>
                  </>
                }
              />

              {row.freedMinutes !== undefined && (
                <span className={cn(TEXT_META, 'text-[var(--sur-secondary)]')}>
                  {freedCapacityMessage(row.freedMinutes, row.blockerLabel)}
                </span>
              )}

              {row.status !== 'resolved' && row.status !== 'wont_resolve' && (
                <button
                  type="button"
                  onClick={() => onResolve(row.blockerId)}
                  className={cn(LINK_BUTTON_CLASSES, 'self-start')}
                >
                  {standupStrings.blocker.resolve()}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
