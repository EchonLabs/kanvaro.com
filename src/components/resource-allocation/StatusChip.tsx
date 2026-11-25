import { cn } from '@/lib/utils'
import type { WorkloadStatus } from '@/lib/resource-allocation/workload'

const STYLES: Record<WorkloadStatus | 'pending', { label: string; className: string }> = {
  full: {
    label: 'Fully Allocated',
    className: 'text-[var(--apple-system-green)] bg-[color-mix(in_srgb,var(--apple-system-green)_12%,transparent)]'
  },
  partial: {
    label: 'Partially Allocated',
    className: 'text-[var(--apple-system-orange)] bg-[color-mix(in_srgb,var(--apple-system-orange)_12%,transparent)]'
  },
  unallocated: {
    label: 'Unallocated',
    className: 'text-[var(--apple-secondary-label)] bg-[var(--apple-tertiary-fill)]'
  },
  over: {
    label: 'Overallocated',
    className: 'text-[var(--apple-system-red)] bg-[color-mix(in_srgb,var(--apple-system-red)_12%,transparent)]'
  },
  pending: {
    label: 'Allocation Pending',
    className: 'text-[var(--apple-system-red)] bg-[color-mix(in_srgb,var(--apple-system-red)_12%,transparent)]'
  }
}

/** A row's status. A pending request takes precedence: it is the thing someone needs to act on. */
export function StatusChip({ status, pending, className }: { status: WorkloadStatus; pending?: boolean; className?: string }) {
  const style = STYLES[pending ? 'pending' : status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium',
        style.className,
        className
      )}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {style.label}
    </span>
  )
}
