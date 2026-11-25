import { cn } from '@/lib/utils'

export type ResourceAllocationTab = 'overview' | 'history'

interface Props {
  active: ResourceAllocationTab
  showHistory: boolean
  historyCount?: number
  onChange(tab: ResourceAllocationTab): void
}

/** Overview | History. History is only offered to roles that may read reasons. */
export function ResourceAllocationTabs({ active, showHistory, historyCount, onChange }: Props) {
  const tabs: { id: ResourceAllocationTab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Allocation Overview' },
    ...(showHistory ? [{ id: 'history' as const, label: 'Allocation History', count: historyCount }] : [])
  ]

  return (
    <div role="tablist" aria-label="Resource allocation views" className="flex gap-6 border-b border-[var(--apple-separator)]">
      {tabs.map((tab) => {
        const selected = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 pb-2.5 pt-1 text-[14px] font-medium apple-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--apple-system-blue)] rounded-t-sm',
              selected
                ? 'border-[var(--apple-system-blue)] text-[var(--apple-system-blue)]'
                : 'border-transparent text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]'
            )}
          >
            {tab.label}
            {typeof tab.count === 'number' && (
              <span className="rounded-full bg-[var(--apple-tertiary-fill)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--apple-secondary-label)]">
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
