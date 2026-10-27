'use client'

/**
 * Chrome shared by the three poker screens (before reveal, after reveal,
 * results).
 *
 * All three are the same object in the design: a wide dialog with a titled
 * header carrying a status badge, edge-to-edge hairlines between bands, and a
 * footer bar that states where the round is and what the facilitator can do
 * about it. Only the middle band differs, so only the middle band is written
 * three times.
 *
 * Colours read `--plan-*`, as the planning screen behind the dialog does, so
 * the popup does not arrive looking like a different product.
 */
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

import { Dialog, DialogClose, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/Dialog'
import { cn } from '@/lib/utils'

export type PokerTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral'

const TONE_INK: Record<PokerTone, string> = {
  accent: 'var(--plan-accent)',
  success: 'var(--plan-success)',
  warning: 'var(--plan-warning)',
  danger: 'var(--plan-danger)',
  neutral: 'var(--plan-muted)'
}

/**
 * The design's status pill. The leading dot is not decoration — NFR-A1 wants
 * every state to carry a text label rather than lean on colour, and the dot
 * is what lets the label stay short enough to sit in a table cell.
 */
export function PokerBadge({
  tone = 'neutral',
  dot = true,
  children,
  className
}: {
  tone?: PokerTone
  dot?: boolean
  children: React.ReactNode
  className?: string
}) {
  const ink = TONE_INK[tone]
  return (
    <span
      className={cn(
        'apple-type-caption inline-flex h-6 shrink-0 items-center gap-1.5 rounded-[var(--apple-radius-pill)] px-2.5 font-semibold',
        className
      )}
      style={{ color: ink, backgroundColor: `color-mix(in srgb, ${ink} 14%, transparent)` }}
    >
      {dot && (
        <span
          aria-hidden
          className="h-[5px] w-[5px] shrink-0 rounded-full"
          style={{ backgroundColor: ink }}
        />
      )}
      {children}
    </span>
  )
}

/** A bordered inset panel — the participant roster, the estimate summary. */
export const pokerPanelClass =
  'rounded-[var(--apple-radius-lg)] border border-[var(--plan-border)] bg-[var(--plan-raised)]'

/** One of the MIN / MEDIAN / MAX tiles. */
export function PokerStat({
  label,
  value,
  emphasis,
  testId
}: {
  label: string
  value: React.ReactNode
  emphasis?: boolean
  testId?: string
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[var(--apple-radius-sm)] border p-3',
        emphasis
          ? 'border-[var(--plan-accent)] bg-[var(--plan-info-bg)]'
          : 'border-[var(--plan-border)] bg-[var(--plan-surface)]'
      )}
    >
      <span
        className={cn(
          'apple-type-caption font-semibold uppercase tracking-[0.06em]',
          emphasis ? 'text-[var(--plan-accent)]' : 'text-[var(--plan-muted)]'
        )}
      >
        {label}
      </span>
      <span className="apple-type-title3 font-bold tabular-nums text-[var(--plan-text)]">
        {value}
      </span>
    </div>
  )
}

/**
 * The dialog shell.
 *
 * `hideClose` on `DialogContent` is what lets the close button live inside the
 * header row rather than floating over it — the header is 92px tall, so the
 * default top-right control would sit well above its centre line.
 */
export function PokerDialogShell({
  open,
  onOpenChange,
  title,
  badge,
  description,
  dismissible = true,
  children,
  footer
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  badge?: React.ReactNode
  description?: React.ReactNode
  dismissible?: boolean
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="max-w-[min(1040px,95vw)] gap-0 p-0 sm:max-w-[min(1040px,95vw)] lg:max-w-[min(1040px,95vw)] h-[min(820px,92vh)]"
        onInteractOutside={dismissible ? undefined : (event) => event.preventDefault()}
        onEscapeKeyDown={dismissible ? undefined : (event) => event.preventDefault()}
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--plan-border)] px-5 py-4 sm:px-7 sm:py-5">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <DialogTitle className="apple-type-title3 font-bold text-[var(--plan-text)]">
                {title}
              </DialogTitle>
              {badge}
            </div>
            {description && (
              <DialogDescription className="apple-type-footnote text-[var(--plan-muted)]">
                {description}
              </DialogDescription>
            )}
          </div>
          <DialogClose
            className="apple-transition flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--apple-radius-sm)] border border-[var(--plan-border)] bg-[var(--plan-raised)] text-[var(--plan-muted)] hover:text-[var(--plan-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--plan-accent)]"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </header>

        {children}

        {footer && (
          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-t border-[var(--plan-border)] bg-[var(--plan-raised)] px-5 py-4 sm:px-7">
            {footer}
          </footer>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * The Previous / "TASK 3 OF 8" / Next strip.
 *
 * The task name sits in the strip rather than the header because the header's
 * title names the activity ("Let's Poker-Through it!") and stays put, while
 * this line changes under it every time the queue advances.
 */
export function PokerTaskNav({
  position,
  total,
  label,
  previewing,
  onPrevious,
  onNext
}: {
  position: number
  total: number
  label: string
  previewing?: boolean
  onPrevious: () => void
  onNext: () => void
}) {
  const arrow =
    'apple-transition flex items-center gap-1.5 rounded-[var(--apple-radius-pill)] px-2.5 py-1.5 apple-type-footnote text-[var(--plan-muted)] hover:text-[var(--plan-text)] disabled:pointer-events-none disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--plan-accent)]'

  return (
    <nav className="flex h-[66px] shrink-0 items-center justify-between gap-4 border-b border-[var(--plan-border)] px-5 sm:px-7">
      <button type="button" aria-label="Previous task" className={arrow} onClick={onPrevious} disabled={position <= 1}>
        <ChevronLeft className="h-[15px] w-[15px] shrink-0" strokeWidth={1.75} />
        <span className="hidden sm:inline">Previous</span>
      </button>

      <div className="flex min-w-0 flex-col items-center gap-0.5 text-center">
        <span className="apple-type-caption font-semibold uppercase tracking-[0.06em] text-[var(--plan-muted)]">
          Task {position} of {total}
          {previewing && ' (preview)'}
        </span>
        <span className="apple-type-subheadline min-w-0 max-w-[46ch] truncate font-semibold text-[var(--plan-text)]">
          {label}
        </span>
      </div>

      <button type="button" aria-label="Next task" className={arrow} onClick={onNext} disabled={position >= total}>
        <span className="hidden sm:inline">Next</span>
        <ChevronRight className="h-[15px] w-[15px] shrink-0" strokeWidth={1.75} />
      </button>
    </nav>
  )
}
