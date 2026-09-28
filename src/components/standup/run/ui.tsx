import { AlertTriangle, Info, XCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * The run screen's visual vocabulary, from the "Daily Standup Page Redesign"
 * blueprint: one card shell, one uppercase badge, one banner, one list row.
 *
 * Every colour, radius and size here reads a token — `--sur-*` for the run
 * screen's own palette (defined only inside the `.standup-run` scope
 * `StandupRunScreen` sets) and `--apple-*` underneath it. Nothing in this file
 * spells out a hex, a pixel radius or an off-scale font size: the blueprint's
 * literal 6/8/12px radii and its 11.5/12.5px type steps were a second design
 * system living alongside the app's, and are gone.
 */

/**
 * The type scale, snapped onto the app's Apple HIG steps (11 / 13 / 15 / 17).
 * Used by role rather than by size, so a step can move in one place:
 *
 *   - `TEXT_SECTION`  17px - a section heading above a group of cards
 *   - `TEXT_HEADING`  15px - a card's own heading
 *   - `TEXT_BODY`     13px - row titles, controls, buttons, banner copy
 *   - `TEXT_META`     11px - captions, counts, badges, a row's second line
 */
export const TEXT_SECTION = 'text-[17px]'
export const TEXT_HEADING = 'text-[15px]'
export const TEXT_BODY = 'text-[13px]'
export const TEXT_META = 'text-[11px]'

export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'neutral'

const BADGE_TONE: Record<Tone, string> = {
  green: 'bg-[var(--sur-green-tint)] text-[var(--sur-green)]',
  amber: 'bg-[var(--sur-amber-tint)] text-[var(--sur-amber)]',
  red: 'bg-[var(--sur-red-tint)] text-[var(--sur-red)]',
  blue: 'bg-[var(--sur-blue-tint)] text-[var(--sur-blue)]',
  neutral: 'bg-[var(--sur-neutral-tint)] text-[var(--sur-muted)]'
}

/** Pill, 11px, tinted - the same shape the app's own `Badge` uses. */
export const BADGE_CLASSES =
  'inline-flex shrink-0 items-center rounded-[var(--sur-radius-pill)] px-2.5 py-[3px] text-[11px] font-semibold uppercase leading-none whitespace-nowrap'

export function badgeClass(tone: Tone): string {
  return cn(BADGE_CLASSES, BADGE_TONE[tone])
}

export function Badge({
  tone,
  children,
  className,
  ...rest
}: {
  tone: Tone
  children: React.ReactNode
  className?: string
} & Omit<React.HTMLAttributes<HTMLSpanElement>, 'className' | 'children'>) {
  return (
    <span className={cn(badgeClass(tone), className)} {...rest}>
      {children}
    </span>
  )
}

/** The card: app surface, hairline Apple separator, the app's large radius. */
export const CARD_CLASSES =
  'rounded-[var(--sur-radius-card)] border border-[var(--sur-border)] bg-[var(--sur-surface)] p-5'

/** A card's own heading (15px) — section headings above cards use 17px. */
export const CARD_TITLE_CLASSES = `${TEXT_HEADING} font-semibold text-[var(--sur-text)]`
export const SECTION_TITLE_CLASSES = `${TEXT_SECTION} font-semibold text-[var(--sur-text)]`
export const SECTION_SUBTITLE_CLASSES = `${TEXT_BODY} text-[var(--sur-muted)]`
/** Inset tile — the backlog cards' fill-on-surface. */
export const INSET_CLASSES =
  'rounded-[var(--sur-radius-inset)] border border-[var(--sur-border)] bg-[var(--sur-inset)]'

export const SECONDARY_BUTTON_CLASSES =
  'apple-transition inline-flex h-[34px] items-center gap-1.5 rounded-[var(--sur-radius-control)] border border-[var(--sur-border)] px-3.5 text-[13px] font-semibold text-[var(--sur-secondary)] hover:bg-[var(--sur-inset)] disabled:opacity-40'

/**
 * Filled and carrying white text, so it takes the vivid `-solid` blue rather
 * than the stepped ink one: the ink step is chosen for legibility *as* text
 * and reads muddy as a large fill.
 */
export const PRIMARY_BUTTON_CLASSES =
  'apple-transition inline-flex h-[34px] items-center gap-1.5 rounded-[var(--sur-radius-control)] bg-[var(--sur-blue-solid)] px-4 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-40'

/** The small tinted action — "+ Raise Blocker". */
export const TINT_BUTTON_CLASSES =
  'apple-transition inline-flex items-center rounded-[var(--sur-radius-pill)] bg-[var(--sur-blue-tint)] px-2.5 py-1 text-[11px] font-semibold text-[var(--sur-blue)] hover:opacity-80 disabled:opacity-40'

/** Text-weight action inside a row — "Fix", "Resolve", "Revise". */
export const LINK_BUTTON_CLASSES =
  'apple-transition text-[13px] font-semibold text-[var(--sur-blue)] underline-offset-2 hover:underline disabled:opacity-40'

export const RUN_FIELD_CLASSES =
  'h-8 rounded-[var(--sur-radius-control)] border border-[var(--sur-border)] bg-[var(--sur-surface)] px-2 text-[13px] text-[var(--sur-text)] disabled:opacity-40'

/**
 * A region that grows with its data and is allowed to scroll rather than push
 * the rest of the page down. Pair with a `max-h-*`: this only supplies the
 * overflow behaviour and the visible track (`.sur-scroll` in `globals.css`),
 * never the height, because how tall is a per-panel decision.
 */
export const SCROLL_CLASSES = 'sur-scroll'

/**
 * The height a growable list is allowed to reach before it scrolls, and the
 * shorter one for a list that shares a card with several others (Yesterday's
 * four buckets, Completion's two).
 *
 * One pair of values rather than the six different `max-h-*` these panels each
 * picked for themselves. Panels 2 and 3 now sit side by side, so their caps are
 * read against each other: two columns whose scroll boxes stop at visibly
 * different heights read as a layout bug rather than as two lists of different
 * lengths. Roughly 20 and 13 rows at the run screen's row height — enough that
 * a normal sprint day never scrolls, and a bad one does.
 */
export const SCROLL_MAX = 'max-h-[26rem]'
export const SCROLL_MAX_NESTED = 'max-h-[17rem]'

/** Empty state — dashed hairline box, centred body copy. */
export const EMPTY_CLASSES =
  'rounded-[var(--sur-radius-inset)] border border-dashed border-[var(--sur-border)] px-3 py-3 text-center text-[13px] text-[var(--sur-muted)]'

/**
 * How many rows in this panel need somebody to do something, pinned beside the
 * panel's heading in red, so the count is readable without opening the panel
 * or scrolling its list — which is the whole point once the list is a scroll
 * box. Renders nothing at zero: a grey "0" beside every heading is noise, and
 * an absent badge already says "nothing here".
 */
export function IssueCount({
  count,
  label,
  decorative = false,
  className
}: {
  count: number
  /** What the number counts, for screen readers — "3 overdue blockers". */
  label: string
  /**
   * Set when the caller already renders `label` as visible text beside the
   * pill, so the pill contributes nothing to the accessibility tree rather
   * than announcing the same sentence a second time.
   */
  decorative?: boolean
  className?: string
}) {
  if (count <= 0) return null
  return (
    <span
      data-testid="issue-count"
      title={label}
      aria-hidden={decorative || undefined}
      className={cn(
        'inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-[var(--sur-radius-pill)] bg-[var(--sur-red-solid)] px-1.5 py-[2px] text-[11px] font-semibold leading-none tabular-nums text-white',
        className
      )}
    >
      <span aria-hidden="true">{count}</span>
      {!decorative && <span className="sr-only">{label}</span>}
    </span>
  )
}

const BANNER_TONE = {
  amber: {
    box: 'border-[var(--sur-amber)] bg-[var(--sur-amber-tint)]',
    icon: 'text-[var(--sur-amber)]',
    Icon: AlertTriangle
  },
  red: {
    box: 'border-[var(--sur-red)] bg-[var(--sur-red-tint)]',
    icon: 'text-[var(--sur-red)]',
    Icon: XCircle
  },
  blue: {
    box: 'border-[var(--sur-blue)] bg-[var(--sur-blue-tint)]',
    icon: 'text-[var(--sur-blue)]',
    Icon: Info
  }
} as const

/**
 * The blueprint's system banner: tinted, full width, icon + bold lead + text,
 * optional action on the right.
 */
export function Banner({
  tone,
  lead,
  children,
  action,
  role = 'status',
  ...rest
}: {
  tone: keyof typeof BANNER_TONE
  lead?: string
  children: React.ReactNode
  action?: React.ReactNode
  role?: 'status' | 'alert'
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'role'>) {
  const { box, icon, Icon } = BANNER_TONE[tone]
  return (
    <div
      role={role}
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 rounded-[var(--sur-radius-inset)] border px-4 py-3',
        box
      )}
      {...rest}
    >
      <p className="flex min-w-0 items-start gap-2 text-[13px] text-[var(--sur-text)]">
        <Icon className={cn('mt-[1px] h-4 w-4 shrink-0', icon)} strokeWidth={2} aria-hidden="true" />
        <span>
          {lead && <span className="font-semibold">{lead} </span>}
          {children}
        </span>
      </p>
      {action}
    </div>
  )
}

/**
 * The list row the blueprint repeats in every lower panel: a semibold title,
 * an 11px meta line beneath it, and a badge pinned right.
 */
export function RowHead({
  title,
  meta,
  badge,
  className
}: {
  title: React.ReactNode
  meta?: React.ReactNode
  badge?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className={cn(TEXT_BODY, 'font-semibold text-[var(--sur-text)]')}>{title}</p>
        {meta && <p className={cn(TEXT_META, 'text-[var(--sur-muted)]')}>{meta}</p>}
      </div>
      {badge && <div className="flex shrink-0 flex-wrap justify-end gap-1.5">{badge}</div>}
    </div>
  )
}

export function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}
