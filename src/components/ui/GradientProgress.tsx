'use client'

/**
 * A thin, animated progress bar with a gradient fill, glow, and trailing
 * percentage label. Originally local to `RecentProjects.tsx` (Dashboard
 * project-progress rows); lifted here so `PlanningWorkspace.tsx`'s capacity
 * gauge can reuse the exact same visual without a copy-paste fork.
 */
export function GradientProgress({
  value,
  gradient,
  glow
}: {
  value: number
  gradient: string
  glow: string
}) {
  const pct = Math.min(Math.max(value, 0), 100)
  return (
    <div className="flex items-center gap-2.5 w-full">
      <div className="relative flex-1 h-[7px] rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
        {pct > 0 && (
          <div
            className="progress-bar-animated absolute inset-y-0 left-0 rounded-full overflow-hidden"
            style={{
              width: `${pct}%`,
              background: gradient,
              boxShadow: `0 0 10px ${glow}, 0 1px 4px ${glow}`
            }}
          >
            <span aria-hidden className="progress-shimmer absolute inset-0" />
          </div>
        )}
      </div>
      <span className="text-xs font-apple-mono font-semibold text-[var(--apple-secondary-label)] w-10 text-right flex-shrink-0 tabular-nums">
        {pct}%
      </span>
    </div>
  )
}
