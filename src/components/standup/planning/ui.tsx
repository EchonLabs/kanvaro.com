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
import { DragOverlay } from '@dnd-kit/core'
import { GripVertical, UserRound } from 'lucide-react'

import { buttonVariants } from '@/components/ui/Button'
import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { cn } from '@/lib/utils'

export type PlanTone = 'primary' | 'secondary'
export type PlanSize = 'default' | 'sm'

/**
 * The app's own pill button — `primary` is its filled accent button and
 * `secondary` its outline one — so planning actions look like every other
 * action in Kanvaro instead of a square-cornered Figma variant.
 */
export function planButtonClass(
  tone: PlanTone = 'secondary',
  className?: string,
  size: PlanSize = 'default'
) {
  return cn(
    buttonVariants({ variant: tone === 'primary' ? 'default' : 'outline', size }),
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
  ...rest
}: {
  id?: string
  title: string
  description?: React.ReactNode
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
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
          <h2 className="apple-type-headline font-semibold text-[var(--plan-text)]">{title}</h2>
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

export function PlanBanner({
  tone,
  icon,
  children,
  actions,
  role = 'status'
}: {
  tone: 'warning' | 'info'
  icon: React.ReactNode
  children: React.ReactNode
  actions?: React.ReactNode
  role?: string
}) {
  return (
    <div
      role={role}
      className={cn(
        'flex w-full flex-wrap items-center gap-3 rounded-[var(--apple-radius-md)] p-[14px] sm:flex-nowrap',
        tone === 'warning' ? 'bg-[var(--plan-warning-bg)]' : 'bg-[var(--plan-info-bg)]'
      )}
    >
      <span
        aria-hidden
        className={cn(
          'shrink-0 [&_svg]:h-4 [&_svg]:w-4',
          tone === 'warning' ? 'text-[var(--plan-warning)]' : 'text-[var(--plan-accent)]'
        )}
      >
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
  meta: string
  action?: React.ReactNode
  dragging?: boolean
  /** Draws the drag grip. Off for viewers who cannot move the card. */
  grip?: boolean
}

/**
 * The bordered task card used by the scope panes and the assignment board.
 *
 * One line tall — key, title and meta share a row — so a fixed-height pane
 * holds a useful number of them. The full title is on hover for the ones the
 * row truncates.
 */
export const PlanTaskCard = forwardRef<HTMLDivElement, PlanTaskCardProps>(function PlanTaskCard(
  { taskKey, title, meta, action, dragging, grip = true, className, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        'flex min-h-9 w-full shrink-0 items-center gap-2 rounded-[var(--apple-radius-sm)] border border-[var(--plan-border)] bg-[var(--plan-surface)] px-2.5 py-1 transition-shadow',
        dragging && 'opacity-50',
        className
      )}
      {...rest}
    >
      {grip && <GripVertical aria-hidden className="h-3.5 w-3.5 shrink-0 text-[var(--plan-muted)]" />}
      {taskKey && (
        <span className="apple-type-caption shrink-0 font-semibold tabular-nums text-[var(--plan-accent)]">
          {taskKey}
        </span>
      )}
      <span
        className="apple-type-subheadline min-w-0 flex-1 truncate font-medium text-[var(--plan-text)]"
        title={title}
      >
        {title}
      </span>
      <span className="apple-type-caption max-w-[45%] shrink-0 truncate tabular-nums text-[var(--plan-muted)]">
        {meta}
      </span>
      {action}
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
export function PlanDragOverlay({ children }: { children: React.ReactNode }) {
  return createPortal(<DragOverlay>{children}</DragOverlay>, document.body)
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

export function scrollToSection(id: string) {
  const target = document.getElementById(id)
  if (!target) return
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  target.focus({ preventScroll: true })
}
