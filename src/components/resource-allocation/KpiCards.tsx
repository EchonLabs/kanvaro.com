import { CheckCircle2, Clock, PieChart, Users } from 'lucide-react'

import type { Kpis } from './api'

const CARDS = [
  { key: 'totalResources', label: 'Total Resources', icon: Users, tint: 'var(--apple-system-blue)', suffix: '' },
  { key: 'fullyAllocated', label: 'Fully Allocated', icon: CheckCircle2, tint: 'var(--apple-system-green)', suffix: '' },
  { key: 'partiallyAllocated', label: 'Partially Allocated', icon: PieChart, tint: 'var(--apple-system-orange)', suffix: '' },
  { key: 'availableCapacity', label: 'Available Capacity', icon: Clock, tint: 'var(--apple-system-purple)', suffix: '%' }
] as const

export function KpiCards({ kpis }: { kpis: Kpis }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {CARDS.map(({ key, label, icon: Icon, tint, suffix }) => (
        <div
          key={key}
          className="flex items-center gap-3 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-4"
        >
          <span
            aria-hidden
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--apple-radius-sm)]"
            style={{ color: tint, background: `color-mix(in srgb, ${tint} 12%, transparent)` }}
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="text-[12px] text-[var(--apple-secondary-label)]">{label}</p>
            <p className="text-[22px] font-semibold leading-tight tabular-nums text-[var(--apple-label)]">
              {kpis[key]}
              {suffix}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
