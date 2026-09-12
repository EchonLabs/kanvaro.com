import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

export type SectionCardTone = 'blue' | 'green' | 'orange' | 'red' | 'neutral'

const ICON_CHIP_TONE: Record<SectionCardTone, string> = {
  blue: 'bg-[var(--apple-system-blue)]/10 text-[var(--apple-system-blue)]',
  green: 'bg-[var(--apple-system-green)]/10 text-[var(--apple-system-green)]',
  orange: 'bg-[var(--apple-system-orange)]/10 text-[var(--apple-system-orange)]',
  red: 'bg-[var(--apple-system-red)]/10 text-[var(--apple-system-red)]',
  neutral: 'bg-[var(--apple-tertiary-fill)] text-[var(--apple-secondary-label)]'
}

const ACCENT_BORDER: Record<SectionCardTone, string> = {
  blue: 'border-l-[var(--apple-system-blue)]',
  green: 'border-l-[var(--apple-system-green)]',
  orange: 'border-l-[var(--apple-system-orange)]',
  red: 'border-l-[var(--apple-system-red)]',
  neutral: 'border-l-[var(--apple-separator)]'
}

export interface SectionCardProps {
  title: string
  summary?: React.ReactNode
  /** A lucide icon element (outlined, not filled) that gives this section a shape to recognize at a glance, distinct from every other section on the screen. */
  icon?: React.ReactNode
  /** Tints the icon's chip. Purely identifying when `neutral`; every other tone still only appears where it already carries real meaning elsewhere on the screen. */
  tone?: SectionCardTone
  /** Opt-in colored left edge matching `tone` — off by default so existing screens keep their current look; the summary page turns it on for scannability across many stacked cards. */
  accent?: boolean
  id?: string
  className?: string
  children: React.ReactNode
}

/**
 * Rule R1 (design §3): every section header carries a live number, not a
 * noun. Structural, not just a convention — a section physically cannot be
 * added to this screen without passing something into `summary`.
 */
export function SectionCard({
  title,
  summary,
  icon,
  tone = 'neutral',
  accent = false,
  id,
  className,
  children
}: SectionCardProps) {
  return (
    <Card id={id} className={cn(accent && 'border-l-4', accent && ACCENT_BORDER[tone], className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {icon ? (
            <span
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full [&>svg]:h-4 [&>svg]:w-4',
                ICON_CHIP_TONE[tone]
              )}
              aria-hidden="true"
            >
              {icon}
            </span>
          ) : null}
          <CardTitle className="truncate">{title}</CardTitle>
        </div>
        {summary ? (
          <span className="shrink-0 text-[13px] text-[var(--apple-secondary-label)]">{summary}</span>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  )
}
