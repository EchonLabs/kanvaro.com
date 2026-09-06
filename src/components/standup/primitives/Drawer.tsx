'use client'

import { useCallback, useEffect, useRef, type ReactNode } from 'react'

import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

/**
 * The member detail drawer (§15.9, NFR-A3).
 *
 * A hand-rolled dialog rather than Radix's, for one reason: the drawer opens
 * *out of* a capacity board that may be virtualised and mid-scroll, and losing
 * the PM's place on close is the difference between a usable board and one that
 * has to be re-found after every glance at somebody's day. So focus return is
 * explicit here, to the element that had it before the drawer opened, rather
 * than relying on a portal's default.
 *
 * Three obligations, all tested:
 *   - it names itself, so a screen reader says whose day this is;
 *   - focus moves inside on open and **returns to the trigger** on close;
 *   - Tab cycles within the drawer, so focus never lands on the board behind it.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
}

export function Drawer({ open, onClose, title, children, className }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const returnFocusTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    // Captured before focus moves, and restored in this effect's cleanup so it
    // runs however the drawer closes — button, Escape, or the parent simply
    // deciding to unmount it.
    returnFocusTo.current = document.activeElement as HTMLElement | null

    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()

    return () => {
      returnFocusTo.current?.focus()
    }
  }, [open])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }

      if (event.key !== 'Tab') return

      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []
      )
      if (focusable.length === 0) return

      const index = focusable.indexOf(document.activeElement as HTMLElement)
      const next = event.shiftKey
        ? focusable[(index <= 0 ? focusable.length : index) - 1]
        : focusable[(index + 1) % focusable.length]

      event.preventDefault()
      next.focus()
    },
    [onClose]
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Presentational: the dialog below owns every keyboard path, and a
          clickable backdrop is a pointer-only affordance by nature. */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={onKeyDown}
        className={cn(
          'relative flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-border bg-background p-4 shadow-lg',
          className
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={standupStrings.allocation.drawerClose()}
            className="rounded-md border border-border px-2 py-1 text-sm"
          >
            ✕
          </button>
        </div>

        {children}
      </div>
    </div>
  )
}
