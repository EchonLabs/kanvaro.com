import { cn } from '@/lib/utils'

export type IconChipTone = 'blue' | 'green' | 'orange' | 'red' | 'neutral'

const CHIP_TONE: Record<IconChipTone, string> = {
  blue: 'bg-[var(--apple-system-blue)]/10 text-[var(--apple-system-blue)]',
  green: 'bg-[var(--apple-system-green)]/10 text-[var(--apple-system-green)]',
  orange: 'bg-[var(--apple-system-orange)]/10 text-[var(--apple-system-orange)]',
  red: 'bg-[var(--apple-system-red)]/10 text-[var(--apple-system-red)]',
  neutral: 'bg-[var(--apple-tertiary-fill)] text-[var(--apple-secondary-label)]'
}

export interface IconChipProps {
  icon: React.ReactNode
  tone?: IconChipTone
  size?: 'sm' | 'md'
  className?: string
}

/**
 * The small tinted circle every row-level icon on this screen sits inside —
 * status, source, severity. One shape, one sizing scale, reused everywhere a
 * row needs an icon instead of each section inventing its own chip markup.
 */
export function IconChip({ icon, tone = 'neutral', size = 'sm', className }: IconChipProps) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full',
        size === 'sm' ? 'h-7 w-7 [&>svg]:h-3.5 [&>svg]:w-3.5' : 'h-8 w-8 [&>svg]:h-4 [&>svg]:w-4',
        CHIP_TONE[tone],
        className
      )}
      aria-hidden="true"
    >
      {icon}
    </span>
  )
}
