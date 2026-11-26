import { classify } from '@/lib/resource-allocation/workload'
import { cn } from '@/lib/utils'

const FILL: Record<ReturnType<typeof classify>, string> = {
  over: 'bg-[var(--apple-system-red)]',
  full: 'bg-[var(--apple-system-green)]',
  partial: 'bg-[var(--apple-system-blue)]',
  unallocated: 'bg-[var(--apple-tertiary-fill)]'
}

/** A member's total allocation as a percentage and a bar, for compact places like member cards. */
export function AllocationBar({ total, threshold, compact }: { total: number; threshold: number; compact?: boolean }) {
  const status = classify(total, threshold)
  return (
    <div className={cn('flex items-center gap-2', compact ? 'min-w-[96px]' : 'min-w-[140px]')}>
      <span
        role="img"
        aria-label={`Allocation ${total}%`}
        data-status={status}
        className="block h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--apple-tertiary-fill)]"
      >
        <span className={cn('block h-full rounded-full', FILL[status])} style={{ width: `${Math.min(100, total)}%` }} />
      </span>
      <span
        className={cn(
          'text-[12px] font-semibold tabular-nums',
          status === 'over' ? 'text-[var(--apple-system-red)]' : 'text-[var(--apple-label)]'
        )}
      >
        {total}%
      </span>
    </div>
  )
}
