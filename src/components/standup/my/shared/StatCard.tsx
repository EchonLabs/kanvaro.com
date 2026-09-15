import { IconChip, type IconChipTone } from './IconChip'
import { cn } from '@/lib/utils'

export interface StatCardProps {
  href: string
  icon: React.ReactNode
  tone: IconChipTone
  value: React.ReactNode
  label: string
  className?: string
}

/**
 * A single tile in the summary hero's stat grid — icon circle, a large
 * figure, and its label underneath. Still a real link to the section it
 * summarizes (see the page's own `StatTile` docblock for why an anchor
 * beats a scroll handler here).
 */
export function StatCard({ href, icon, tone, value, label, className }: StatCardProps) {
  return (
    <a
      href={href}
      className={cn(
        'apple-transition flex items-center gap-3 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-4 hover:bg-[var(--apple-tertiary-fill)]',
        className
      )}
    >
      <IconChip icon={icon} tone={tone} size="md" className="h-10 w-10 [&>svg]:h-5 [&>svg]:w-5" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-apple-mono text-[22px] font-bold leading-none tabular-nums text-[var(--apple-label)]">
          {value}
        </span>
        <span className="truncate text-[13px] text-[var(--apple-secondary-label)]">{label}</span>
      </span>
    </a>
  )
}
