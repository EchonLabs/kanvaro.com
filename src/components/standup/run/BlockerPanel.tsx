'use client'

import { AlertTriangle } from 'lucide-react'

import { standupStrings } from '@/lib/standup/strings'
import { freedCapacityMessage } from '@/lib/standup/blocker'
import type { Minutes } from '@/lib/standup/minutes'
import { cn } from '@/lib/utils'

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
    <section
      id="panel-6"
      aria-labelledby="panel-6-heading"
      className="scroll-mt-6 flex flex-col gap-3 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-4"
    >
      <div className="flex items-center justify-between">
        <h3 id="panel-6-heading" className="apple-section-label text-[var(--apple-tertiary-label)]">
          {standupStrings.run.panel6()}
        </h3>
        <button
          type="button"
          onClick={onRaise}
          className="apple-transition rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] px-2.5 py-1 text-[12px] font-medium hover:bg-[var(--apple-quaternary-fill)]"
        >
          {standupStrings.blocker.raise()}
        </button>
      </div>

      {sorted.length === 0 && (
        <p className="rounded-[var(--apple-radius-md)] border border-dashed border-[var(--apple-separator)] px-3 py-3 text-center text-[13px] text-[var(--apple-tertiary-label)]">
          {standupStrings.blocker.empty()}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {sorted.map((row) => (
          <li
            key={row.blockerId}
            data-testid="blocker-row"
            className={cn(
              'flex flex-col gap-1.5 rounded-[var(--apple-radius-md)] border p-3 text-[13px]',
              row.overdue
                ? 'border-[var(--apple-system-red)]/40 bg-[var(--apple-system-red)]/[0.05]'
                : 'border-[var(--apple-separator)] bg-background'
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              {row.overdue && (
                <AlertTriangle
                  className="h-3.5 w-3.5 shrink-0 text-[var(--apple-system-red)]"
                  strokeWidth={2}
                />
              )}
              <span className={cn('font-medium', row.overdue ? 'text-[var(--apple-system-red)]' : 'text-[var(--apple-label)]')}>
                {row.taskKey ?? standupStrings.blocker.general()}
              </span>
              <span className={cn('min-w-0 flex-1', row.overdue ? 'text-[var(--apple-system-red)]' : 'text-[var(--apple-label)]')}>
                {row.description}
              </span>
              <span className="shrink-0 rounded-full bg-[var(--apple-tertiary-fill)] px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-[var(--apple-secondary-label)]">
                {row.severity}
              </span>
            </div>

            {row.freedMinutes !== undefined && (
              <span className="text-[11.5px] text-[var(--apple-secondary-label)]">
                {freedCapacityMessage(row.freedMinutes, row.blockerLabel)}
              </span>
            )}

            {row.status !== 'resolved' && row.status !== 'wont_resolve' && (
              <button
                type="button"
                onClick={() => onResolve(row.blockerId)}
                className="apple-transition self-start rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] px-2.5 py-1 text-[12px] font-medium hover:bg-[var(--apple-quaternary-fill)]"
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
