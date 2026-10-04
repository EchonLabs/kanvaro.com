import type { LucideIcon } from 'lucide-react'

import { PLAN_SCROLL_MAX, PlanCard, planEmptyClass } from '@/components/standup/planning/ui'
import { cn } from '@/lib/utils'

/**
 * The one card every section of the summary sits in: icon, title, an optional
 * badge pinned right, and the body.
 *
 * It also owns the empty state, because every §15.13 section renders whether
 * or not anything happened — an omitted heading reads as "this was never
 * built" rather than "nothing happened today" (the same reasoning the
 * `yesterday` string namespace sets out). Passing `isEmpty` and `emptyText`
 * rather than each caller writing its own `length === 0 ? ... : ...` keeps
 * that promise in one place.
 *
 * `scroll` is the other thing every section shares: these lists are as long
 * as the sprint made them, and a stand-up with forty commitments otherwise
 * pushes every section below it off the screen — the stat grid's jump links
 * land somewhere the reader then has to scroll back from. Capping the body
 * and giving it the planning screen's visible track (`plan-scroll`) keeps the
 * section headings a reachable table of contents. Opt-in, because the short
 * fixed-height sections have nothing to cap, and it wraps only `children` so
 * the heading and badge stay pinned above the box rather than scrolling away
 * with the rows.
 */
export function SummarySection({
  id,
  title,
  icon: Icon,
  badge,
  isEmpty,
  emptyText,
  scroll = false,
  scrollMax = PLAN_SCROLL_MAX,
  children,
  className
}: {
  id?: string
  title: string
  icon?: LucideIcon
  badge?: React.ReactNode
  isEmpty?: boolean
  emptyText?: string
  /** Cap the body's height and let it scroll instead of growing the page. */
  scroll?: boolean
  /** The cap, when this section's rows are taller or shorter than the norm. */
  scrollMax?: string
  children?: React.ReactNode
  className?: string
}) {
  return (
    <PlanCard
      id={id}
      data-testid="summary-section"
      /**
       * `scroll-mt` so a jump from the stat grid does not park the heading
       * underneath the app's sticky header.
       */
      className={cn('scroll-mt-24', className)}
      aria-labelledby={id ? `${id}-title` : undefined}
      headingId={id ? `${id}-title` : undefined}
      title={
        <span className="flex items-center gap-2">
          {Icon && (
            <Icon
              className="h-[18px] w-[18px] shrink-0 text-[var(--plan-accent-ink)]"
              strokeWidth={2}
              aria-hidden="true"
            />
          )}
          {title}
        </span>
      }
      aside={badge}
    >
      {isEmpty ? (
        <p className={planEmptyClass}>{emptyText}</p>
      ) : scroll ? (
        /* `pr-1.5` so the track sits beside the rows rather than on top of a
           row's right-hand badge, and `-mr-1.5` spends the card's own padding
           on it so the content width is unchanged. */
        <div className={cn('plan-scroll', scrollMax, '-mr-1.5 pr-1.5')}>{children}</div>
      ) : (
        children
      )}
    </PlanCard>
  )
}
