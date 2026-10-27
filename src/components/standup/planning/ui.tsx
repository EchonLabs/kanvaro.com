'use client'

/**
 * The planning screen's building blocks.
 *
 * Colours read `--plan-*`, which globals.css points at the app's Apple HIG
 * tokens; type reads the global `.apple-type-*` scale; radii read
 * `--apple-radius-*`. Nothing here sets its own font or pixel size, so the
 * planning screen stays in step with the sprint page it is reached from.
 */
import { forwardRef } from 'react'
import { createPortal } from 'react-dom'
import { DragOverlay, type DropAnimation } from '@dnd-kit/core'
import { ArrowLeftRight, GripVertical, UserRound } from 'lucide-react'

import { buttonVariants } from '@/components/ui/Button'
import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { cn } from '@/lib/utils'

import type { AssignableMember } from './types'

export type PlanTone = 'primary' | 'secondary' | 'danger'
export type PlanSize = 'default' | 'sm'

const PLAN_BUTTON_VARIANT = {
  primary: 'default',
  secondary: 'outline',
  danger: 'destructive'
} as const

/**
 * The app's own pill button — `primary` is its filled accent button,
 * `secondary` its outline one and `danger` the app's destructive red, used for
 * actions that undo or force past a failed state, where the themeable accent
 * would be wrong — so planning actions look like every other
 * action in Kanvaro instead of a square-cornered Figma variant.
 */
export function planButtonClass(
  tone: PlanTone = 'secondary',
  className?: string,
  size: PlanSize = 'default'
) {
  return cn(
    buttonVariants({ variant: PLAN_BUTTON_VARIANT[tone], size }),
    // `text-[length:…]` is the form tailwind-merge files under font-size, so it
    // replaces the variant's `text-sm`/`text-xs` with the global scale.
    size === 'sm'
      ? 'text-[length:var(--apple-font-footnote)]'
      : 'text-[length:var(--apple-font-callout)]',
    'shrink-0 gap-1.5 font-semibold leading-none [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0',
    'disabled:cursor-not-allowed',
    className
  )
}

export const PlanButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: PlanTone; size?: PlanSize }
>(function PlanButton({ tone = 'secondary', size = 'default', className, type = 'button', ...props }, ref) {
  return <button ref={ref} type={type} className={planButtonClass(tone, className, size)} {...props} />
})

/** The standard Apple card shell the rest of the app uses. */
export const planCardClass =
  'rounded-[var(--apple-radius-lg)] border border-[var(--plan-border)] bg-[var(--plan-surface)] shadow-[var(--plan-shadow)]'

export function PlanCard({
  id,
  title,
  description,
  aside,
  children,
  className,
  headingId,
  headingLevel = 'h2',
  ...rest
}: {
  id?: string
  /** A string, or a node when the heading carries an icon beside its text. */
  title: React.ReactNode
  description?: React.ReactNode
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
  /**
   * Put on the heading element, for a wrapper that labels itself with
   * `aria-labelledby`. The run panels all do.
   */
  headingId?: string
  /**
   * The heading's level. `h2` by default; the run panels sit under a page
   * `h2` and so need `h3` to keep the document outline honest.
   */
  headingLevel?: 'h2' | 'h3'
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>) {
  return (
    <section
      id={id}
      tabIndex={id ? -1 : undefined}
      className={cn(
        planCardClass,
        'flex w-full scroll-mt-6 flex-col gap-4 p-4 outline-none sm:p-5',
        className
      )}
      {...rest}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-col gap-1">
          {headingLevel === 'h3' ? (
            <h3 id={headingId} className="apple-type-headline font-semibold text-[var(--plan-text)]">
              {title}
            </h3>
          ) : (
            <h2 id={headingId} className="apple-type-headline font-semibold text-[var(--plan-text)]">
              {title}
            </h2>
          )}
          {description && (
            <p className="apple-type-subheadline text-[var(--plan-muted)]">{description}</p>
          )}
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

const PLAN_BANNER_TONE = {
  warning: { bg: 'bg-[var(--plan-warning-bg)]', ink: 'text-[var(--plan-warning)]', border: 'border-[var(--plan-warning)]' },
  info: { bg: 'bg-[var(--plan-info-bg)]', ink: 'text-[var(--plan-accent-ink)]', border: 'border-[var(--plan-accent)]' },
  danger: { bg: 'bg-[var(--plan-danger-bg)]', ink: 'text-[var(--plan-danger)]', border: 'border-[var(--plan-danger)]' }
} as const

export function PlanBanner({
  tone,
  icon,
  children,
  actions,
  bordered = false,
  role = 'status'
}: {
  tone: keyof typeof PLAN_BANNER_TONE
  icon: React.ReactNode
  children: React.ReactNode
  actions?: React.ReactNode
  /**
   * Draws the tone's border as well as its tint. For a banner that reports a
   * blocking condition rather than a passing note — the run screen's red
   * and amber system banners.
   */
  bordered?: boolean
  role?: string
}) {
  const { bg, ink, border } = PLAN_BANNER_TONE[tone]
  return (
    <div
      role={role}
      className={cn(
        'flex w-full flex-wrap items-center gap-3 rounded-[var(--apple-radius-md)] p-[14px] sm:flex-nowrap',
        bg,
        bordered && cn('border', border)
      )}
    >
      <span aria-hidden className={cn('shrink-0 [&_svg]:h-4 [&_svg]:w-4', ink)}>
        {icon}
      </span>
      <div className="apple-type-subheadline min-w-0 flex-1 text-[var(--plan-text)]">{children}</div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** A tinted status pill — the colour at 12% for the ground, as the app's badges are. */
export function PlanPill({
  color,
  children,
  className
}: {
  color: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'apple-type-caption inline-flex items-center justify-center rounded-[var(--apple-radius-pill)] px-2.5 py-1 font-semibold',
        className
      )}
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      {children}
    </span>
  )
}

export interface PlanTaskCardProps extends React.HTMLAttributes<HTMLDivElement> {
  taskKey?: string
  title: string
  meta?: string
  action?: React.ReactNode
  dragging?: boolean
  /** Draws the drag grip. Off for viewers who cannot move the card. */
  grip?: boolean
  /**
   * An optional second row — priority, estimate, required skills. The
   * stand-up run's pool tasks carry all three; the planning board's carry
   * none and stay one line. Falsy renders nothing at all, so a bare task
   * never gets an empty strip under it.
   */
  footer?: React.ReactNode
}

/**
 * The bordered task card used by the scope panes and the assignment board.
 *
 * One line tall — key, title and meta share a row — so a fixed-height pane
 * holds a useful number of them. The full title is on hover for the ones the
 * row truncates.
 */
export const PlanTaskCard = forwardRef<HTMLDivElement, PlanTaskCardProps>(function PlanTaskCard(
  { taskKey, title, meta, action, dragging, grip = true, footer, className, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        'flex w-full shrink-0 flex-col rounded-[var(--apple-radius-sm)] border border-[var(--plan-border)] bg-[var(--plan-surface)] transition-shadow',
        dragging && 'opacity-50',
        className
      )}
      {...rest}
    >
      <div className="flex min-h-9 w-full items-center gap-2 px-2.5 py-1">
        {grip && <GripVertical aria-hidden className="h-3.5 w-3.5 shrink-0 text-[var(--plan-muted)]" />}
        {taskKey && (
          <span className="apple-type-caption shrink-0 font-semibold tabular-nums text-[var(--plan-accent-ink)]">
            {taskKey}
          </span>
        )}
        <span
          className="apple-type-subheadline min-w-0 flex-1 truncate font-medium text-[var(--plan-text)]"
          title={title}
        >
          {title}
        </span>
        {meta && (
          <span className="apple-type-caption max-w-[45%] shrink-0 truncate tabular-nums text-[var(--plan-muted)]">
            {meta}
          </span>
        )}
        {action}
      </div>
      {footer && (
        <div
          data-testid="task-card-footer"
          className="flex flex-wrap items-center gap-1.5 px-2.5 pb-1.5 pt-0"
        >
          {footer}
        </div>
      )}
    </div>
  )
})

/** The compact action a task card carries, sized to keep the card one line. */
export const planTaskActionClass = 'h-7 px-2.5'

/**
 * The drag preview, portalled to `body`.
 *
 * `DragOverlay` is `position: fixed`, which an ancestor with a transform or
 * filter silently re-anchors — the preview then renders away from the pointer
 * and collision is measured against the wrong rect. Portalling takes the page
 * layout out of the question. Only ever mounted client-side: both boards
 * render after their data has loaded.
 */
export function PlanDragOverlay({
  children,
  dropAnimation
}: {
  children: React.ReactNode
  /**
   * Passed straight to `DragOverlay`. The run screen's repository supplies one
   * so the card animates into the member it landed on; the planning board
   * leaves it unset and takes dnd-kit's default.
   */
  dropAnimation?: DropAnimation | null
}) {
  return createPortal(<DragOverlay dropAnimation={dropAnimation}>{children}</DragOverlay>, document.body)
}

/** Says out loud that picking one of these people changes the sprint roster. */
export const QA_GROUP_LABEL = 'QA — will be added to the sprint team'

/**
 * The card's move button is a native select dressed as an icon button, so the
 * keyboard path gets the platform picker for free and QA can be offered under
 * a group label that says what choosing them does.
 *
 * Shared by the planning assignment board and the stand-up run's task
 * repository: drag-and-drop has no keyboard equivalent of its own, and a
 * board that can only be dragged on is a board part of the team cannot use.
 */
export function MovePicker({
  task,
  value,
  teamOptions,
  qaOptions,
  busy,
  onChange
}: {
  /** Only `_id` and `title` are read, so either surface's task view fits. */
  task: { _id: string; title: string }
  value: string | null
  teamOptions: Array<{ memberId: string; name: string }>
  qaOptions: Array<{ memberId: string; name: string }>
  busy: boolean
  onChange: (memberId: string | null) => void
}) {
  return (
    <label
      title="Move to another owner"
      className={planButtonClass(
        'secondary',
        cn(
          planTaskActionClass,
          'relative w-7 cursor-pointer px-0 focus-within:ring-2 focus-within:ring-[var(--plan-accent)]'
        ),
        'sm'
      )}
      // Stops the card's drag listener from claiming the pointer.
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <ArrowLeftRight aria-hidden />
      <select
        aria-label={`Assign ${task.title} to`}
        value={value ?? ''}
        disabled={busy}
        onChange={(event) => onChange(event.target.value || null)}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
      >
        <option value="">Unassigned</option>
        {teamOptions.map((member) => (
          <option key={member.memberId} value={member.memberId}>
            {member.name}
          </option>
        ))}
        {qaOptions.length > 0 && (
          <optgroup label={QA_GROUP_LABEL}>
            {qaOptions.map((member) => (
              <option key={member.memberId} value={member.memberId}>
                {member.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  )
}

export interface PlanAvatarMember {
  name: string
  firstName?: string
  lastName?: string
  email?: string
  avatar?: string
}

/**
 * A member's face on the planning screen — the app-wide `GravatarAvatar`, so a
 * person looks the same here as in the header and on the sprint page.
 *
 * The display name is split only when the identity fields are missing, so a
 * member whose user record has since gone still gets a readable fallback.
 * `member` omitted draws the neutral "nobody" avatar the Unassigned lane uses.
 */
export function PlanAvatar({
  member,
  size = 32
}: {
  member?: PlanAvatarMember
  size?: number
}) {
  if (!member) {
    return (
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--plan-border)] bg-[var(--plan-track)] text-[var(--plan-muted)]"
        style={{ width: size, height: size }}
      >
        <UserRound className="h-1/2 w-1/2" />
      </span>
    )
  }

  const parts = member.name.trim().split(/\s+/).filter(Boolean)
  return (
    <span aria-hidden className="shrink-0">
      <GravatarAvatar
        user={{
          firstName: member.firstName ?? parts[0] ?? '',
          lastName: member.lastName ?? (parts.length > 1 ? parts[parts.length - 1] : ''),
          email: member.email,
          avatar: member.avatar
        }}
        size={size}
        gravatarOptions={{ default: 'identicon' }}
        className="ring-1 ring-[var(--plan-border)]"
      />
    </span>
  )
}

/**
 * The nearest ancestor that actually scrolls — in the app shell, `MainLayout`'s
 * `<main className="overflow-auto">`.
 */
function scrollContainerOf(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = window.getComputedStyle(node)
    if (/(auto|scroll)/.test(overflowY) && node.scrollHeight > node.clientHeight) return node
  }
  return null
}

/**
 * Brings a panel into view by scrolling **only** its own scroll container.
 *
 * `scrollIntoView` scrolls every scrollable ancestor, and `overflow: hidden`
 * still counts — so inside the app shell it also scrolled the `h-screen
 * overflow-hidden` frame around `<main>`. The whole page slid up and the
 * fixed backdrop showed as a black bar along the bottom. Honours the target's
 * `scroll-margin-top`, as `scrollIntoView` did.
 */
export function scrollToSection(id: string) {
  const target = document.getElementById(id)
  if (!target) return

  const margin = parseFloat(window.getComputedStyle(target).scrollMarginTop) || 0
  const container = scrollContainerOf(target)

  if (container) {
    const top =
      target.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop -
      margin
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  } else {
    window.scrollTo({
      top: Math.max(0, target.getBoundingClientRect().top + window.scrollY - margin),
      behavior: 'smooth'
    })
  }

  target.focus({ preventScroll: true })
}

/**
 * The tone-named pill. `PlanPill` takes a raw colour, which left every caller
 * choosing its own hex; this is the same shape over the module's five
 * semantic tones.
 */
export type PlanPillTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral'

const PLAN_PILL_TONE: Record<PlanPillTone, string> = {
  accent: 'text-[var(--plan-accent-ink)] bg-[var(--plan-info-bg)]',
  success: 'text-[var(--plan-success)] bg-[var(--plan-success-bg)]',
  warning: 'text-[var(--plan-warning)] bg-[var(--plan-warning-bg)]',
  danger: 'text-[var(--plan-danger)] bg-[var(--plan-danger-bg)]',
  neutral: 'text-[var(--plan-muted)] bg-[var(--plan-track)]'
}

export function planPillClass(tone: PlanPillTone, className?: string) {
  return cn(
    'apple-type-caption inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-[var(--apple-radius-pill)] px-2.5 py-1 font-semibold leading-none',
    PLAN_PILL_TONE[tone],
    className
  )
}

/**
 * How many rows in a panel need somebody to do something, pinned beside the
 * heading so the count is readable without opening the panel or scrolling its
 * list. Renders nothing at zero: a grey "0" beside every heading is noise,
 * and an absent badge already says "nothing here".
 */
export function PlanCount({
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
   * pill, so it contributes nothing to the accessibility tree rather than
   * announcing the same sentence twice.
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
        'apple-type-caption inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-[var(--apple-radius-pill)] bg-[var(--plan-danger-solid)] px-1.5 py-[2px] font-semibold leading-none tabular-nums text-white',
        className
      )}
    >
      <span aria-hidden="true">{count}</span>
      {!decorative && <span className="sr-only">{label}</span>}
    </span>
  )
}

/** The list row the lower panels repeat: a semibold title, a caption meta line beneath, a badge pinned right. */
export function PlanRow({
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
        <p className="apple-type-subheadline font-semibold text-[var(--plan-text)]">{title}</p>
        {meta && <p className="apple-type-caption text-[var(--plan-muted)]">{meta}</p>}
      </div>
      {badge && <div className="flex shrink-0 flex-wrap justify-end gap-1.5">{badge}</div>}
    </div>
  )
}

/** Inset tile — a fill on the card surface, for rows and nested boxes. */
export const planInsetClass =
  'rounded-[var(--apple-radius-md)] border border-[var(--plan-border)] bg-[var(--plan-raised)]'

/** A form control: search inputs, selects, the filter row. */
export const planFieldClass =
  'plan-select apple-type-subheadline h-8 rounded-[var(--apple-radius-sm)] border border-[var(--plan-border)] bg-[var(--plan-surface)] px-2 text-[var(--plan-text)] disabled:opacity-40'

/** A text-weight action inside a row — "Fix", "Resolve", "Revise". */
export const planLinkClass =
  'apple-transition apple-type-subheadline font-semibold text-[var(--plan-accent-ink)] underline-offset-2 hover:underline disabled:opacity-40'

/** Empty state — dashed hairline box, centred body copy. */
export const planEmptyClass =
  'apple-type-subheadline rounded-[var(--apple-radius-md)] border border-dashed border-[var(--plan-border)] px-3 py-3 text-center text-[var(--plan-muted)]'

/**
 * How tall a growable list may get before it scrolls, and the shorter cap for
 * a list sharing a card with several others. One pair of values rather than
 * the six different `max-h-*` the panels each picked for themselves: two
 * side-by-side panels whose scroll boxes stop at visibly different heights
 * read as a layout bug rather than as two lists of different lengths.
 */
export const PLAN_SCROLL_MAX = 'max-h-[26rem]'
export const PLAN_SCROLL_MAX_NESTED = 'max-h-[17rem]'

/**
 * Initials for an avatar fallback, and the one implementation every surface
 * shares: first word plus LAST word, so "Ada Lovelace King" is "AK". First plus
 * last is the conventional form; do not simplify it to the first two words.
 * A single word gives its first two characters, and `'?'` is the guard for an
 * empty or whitespace-only name so an avatar is never blank.
 */
export function initialsOf(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase()
}
