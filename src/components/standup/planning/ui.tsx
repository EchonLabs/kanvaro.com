'use client'

/**
 * The planning screen's building blocks, lifted from the Figma "Dark sprint
 * planning" frame. Every colour reads a `--plan-*` token so the same markup
 * renders the Figma palette in dark mode and its counterpart in light mode.
 */
import { forwardRef } from 'react'
import { GripVertical } from 'lucide-react'

import { cn } from '@/lib/utils'

export type PlanTone = 'primary' | 'secondary'

export function planButtonClass(tone: PlanTone = 'secondary', className?: string) {
  return cn(
    'inline-flex shrink-0 items-center justify-center gap-[7px] whitespace-nowrap rounded-[8px] border px-[14px] py-[9px] text-[12px] leading-none transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--plan-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--plan-surface)]',
    'disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0',
    tone === 'primary'
      ? 'border-[var(--plan-accent)] bg-[var(--plan-accent)] text-white hover:brightness-110'
      : 'border-[var(--plan-border)] bg-[var(--plan-raised)] text-[var(--plan-text)] hover:border-[var(--plan-muted)]/60',
    className
  )
}

export const PlanButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: PlanTone }
>(function PlanButton({ tone = 'secondary', className, type = 'button', ...props }, ref) {
  return <button ref={ref} type={type} className={planButtonClass(tone, className)} {...props} />
})

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
        'flex w-full scroll-mt-6 flex-col gap-4 rounded-[16px] outline-none border border-[var(--plan-border)] bg-[var(--plan-surface)] p-4 sm:p-5',
        className
      )}
      {...rest}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-[16px] font-bold text-[var(--plan-text)]">{title}</h2>
          {description && (
            <p className="text-[12px] leading-[1.4] text-[var(--plan-muted)]">{description}</p>
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
        'flex w-full flex-wrap items-center gap-3 rounded-[12px] p-[14px] sm:flex-nowrap',
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
      <div className="min-w-0 flex-1 text-[12px] text-[var(--plan-text)]">{children}</div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** A tinted status pill — the colour at 13% for the ground, as in the frame. */
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
        'inline-flex items-center justify-center rounded-full px-2 py-1 text-[10px] font-bold leading-none',
        className
      )}
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 13%, transparent)` }}
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
}

/** The bordered task card used by the scope panes and the assignment board. */
export const PlanTaskCard = forwardRef<HTMLDivElement, PlanTaskCardProps>(function PlanTaskCard(
  { taskKey, title, meta, action, dragging, className, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        'flex w-full items-center gap-3 rounded-[12px] border border-[var(--plan-border)] bg-[var(--plan-raised)] p-3 transition-shadow',
        dragging && 'opacity-50',
        className
      )}
      {...rest}
    >
      <GripVertical aria-hidden className="h-4 w-4 shrink-0 text-[var(--plan-muted)]" />
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        {taskKey && (
          <span className="text-[10px] font-bold text-[var(--plan-accent)]">{taskKey}</span>
        )}
        <span className="truncate text-[13px] font-semibold text-[var(--plan-text)]">{title}</span>
        <span className="truncate text-[11px] text-[var(--plan-muted)]">{meta}</span>
      </div>
      {action}
    </div>
  )
})

export function scrollToSection(id: string) {
  const target = document.getElementById(id)
  if (!target) return
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  target.focus({ preventScroll: true })
}
