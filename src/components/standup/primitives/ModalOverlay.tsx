'use client'

import { useCallback, useEffect, useRef, type ReactNode } from 'react'

/**
 * A centered backdrop dialog, the sibling of `Drawer.tsx` for content that
 * should sit mid-screen rather than docked to an edge (revise-estimate,
 * override, debt-ledger, raise-blocker, resolve-blocker — all short,
 * focused, single-decision dialogs).
 * Same focus-trap/Escape/return-focus contract as `Drawer.tsx`, deliberately
 * duplicated rather than parameterising `Drawer` itself: the two have
 * different enough layouts (docked panel vs. centered card) that sharing one
 * component would need a position prop threading through every consumer.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface ModalOverlayProps {
  open: boolean
  onClose: () => void
  labelledBy: string
  children: ReactNode
}

export function ModalOverlay({ open, onClose, labelledBy, children }: ModalOverlayProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const returnFocusTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
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

      const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        data-testid="modal-overlay-backdrop"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onKeyDown={onKeyDown}
        className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_16px_48px_rgba(0,0,0,0.25)]"
      >
        {children}
      </div>
    </div>
  )
}
