'use client'

import { standupStrings } from '@/lib/standup/strings'
import { freedCapacityMessage } from '@/lib/standup/blocker'
import type { Minutes } from '@/lib/standup/minutes'

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
}

export function BlockerPanel({ blockers, onRaise, onResolve }: BlockerPanelProps) {
  const sorted = [...blockers].sort((a, b) => (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0))

  return (
    <section id="panel-6" aria-labelledby="panel-6-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 id="panel-6-heading" className="text-sm font-semibold">
          {standupStrings.run.panel6()}
        </h3>
        <button
          type="button"
          onClick={onRaise}
          className="rounded-md border border-border px-2 py-1 text-xs"
        >
          {standupStrings.blocker.raise()}
        </button>
      </div>

      {sorted.length === 0 && (
        <p className="text-sm text-muted-foreground">{standupStrings.blocker.empty()}</p>
      )}

      <ul className="flex flex-col gap-2">
        {sorted.map((row) => (
          <li
            key={row.blockerId}
            data-testid="blocker-row"
            className={
              row.overdue
                ? 'flex flex-col gap-1 rounded-md border border-destructive/50 p-2 text-sm text-destructive'
                : 'flex flex-col gap-1 rounded-md border border-border p-2 text-sm'
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{row.taskKey ?? standupStrings.blocker.general()}</span>
              <span>{row.description}</span>
              <span className="text-xs uppercase text-muted-foreground">{row.severity}</span>
            </div>

            {row.freedMinutes !== undefined && (
              <span className="text-xs text-muted-foreground">
                {freedCapacityMessage(row.freedMinutes, row.blockerLabel)}
              </span>
            )}

            {row.status !== 'resolved' && row.status !== 'wont_resolve' && (
              <button
                type="button"
                onClick={() => onResolve(row.blockerId)}
                className="self-start rounded-md border border-border px-2 py-1 text-xs"
              >
                {standupStrings.blocker.resolve()}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
