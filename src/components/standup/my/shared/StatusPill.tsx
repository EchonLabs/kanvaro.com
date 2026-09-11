import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

export type StatusPillTone = 'blue' | 'green' | 'orange' | 'red' | 'neutral'

const TONE_CLASSES: Record<StatusPillTone, string> = {
  blue: 'bg-[var(--apple-system-blue)]/10 text-[var(--apple-system-blue)] border-[var(--apple-system-blue)]/30',
  green: 'bg-[var(--apple-system-green)]/10 text-[var(--apple-system-green)] border-[var(--apple-system-green)]/30',
  orange:
    'bg-[var(--apple-system-orange)]/10 text-[var(--apple-system-orange)] border-[var(--apple-system-orange)]/30',
  red: 'bg-[var(--apple-system-red)]/10 text-[var(--apple-system-red)] border-[var(--apple-system-red)]/30',
  neutral: 'bg-[var(--apple-tertiary-fill)] text-[var(--apple-secondary-label)] border-[var(--apple-separator)]'
}

export interface StatusPillProps {
  tone: StatusPillTone
  children: React.ReactNode
  className?: string
}

/** One place decides what "over" looks like. Colour is never the only carrier of meaning (NFR-A1) — the label text is the actual meaning; the tone reinforces it. */
export function StatusPill({ tone, children, className }: StatusPillProps) {
  return (
    <Badge
      variant="outline"
      className={cn('rounded-[var(--apple-radius-sm)] text-[13px] font-medium', TONE_CLASSES[tone], className)}
    >
      {children}
    </Badge>
  )
}
