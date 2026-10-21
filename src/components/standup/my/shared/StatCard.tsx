import { IconChip, type IconChipTone } from './IconChip'
import { cn } from '@/lib/utils'

export interface StatCardProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className'> {
  href: string
  icon: React.ReactNode
  tone: IconChipTone
  value: React.ReactNode
  label: string
  className?: string
}

/**
 * A single tile in a stand-up stat grid — icon circle, a large figure, and
 * its label underneath. Still a real link to the section it summarizes (see
 * the page's own `StatTile` docblock for why an anchor beats a scroll handler
 * here).
 *
 * Extra anchor props pass through to the `<a>`, so a caller can tag or label
 * a tile without this component growing a prop per consumer. The figure
 * carries its own `stat-card-value` hook, because "the number in this tile"
 * is a fact about the component rather than about any one grid.
 */
export function StatCard({
  href,
  icon,
  tone,
  value,
  label,
  className,
  ...rest
}: StatCardProps) {
  return (
    <a
      href={href}
      className={cn(
        'apple-transition flex items-center gap-3 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-4 hover:bg-[var(--apple-tertiary-fill)]',
        className
      )}
      {...rest}
    >
      <IconChip icon={icon} tone={tone} size="md" className="h-10 w-10 [&>svg]:h-5 [&>svg]:w-5" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span
          data-testid="stat-card-value"
          className="font-apple-mono apple-type-title2 font-bold leading-none tabular-nums text-[var(--apple-label)]"
        >
          {value}
        </span>
        <span className="truncate apple-type-subheadline text-[var(--apple-secondary-label)]">{label}</span>
      </span>
    </a>
  )
}
