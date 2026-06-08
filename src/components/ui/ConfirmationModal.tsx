'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'

interface ConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: ReactNode
  confirmText?: string
  confirmIcon?: ReactNode
  cancelText?: string
  variant?: 'default' | 'destructive'
  isLoading?: boolean
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  confirmIcon,
  cancelText = 'Cancel',
  variant = 'default',
  isLoading = false
}: ConfirmationModalProps) {
  const isDestructive = variant === 'destructive'
  const modalId = useId()
  const titleId = `${modalId}-title`
  const descriptionId = `${modalId}-description`
  const [mounted, setMounted] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!isOpen || !mounted) return
    const t = setTimeout(() => {
      setIsVisible(true)
      confirmButtonRef.current?.focus()
    }, 10)
    return () => clearTimeout(t)
  }, [isOpen, mounted])

  useEffect(() => {
    if (!isOpen) setIsVisible(false)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !mounted) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', handleKeyDown)
    document.body.classList.add('modal-open')
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.classList.remove('modal-open')
    }
  }, [isOpen, onClose, mounted])

  if (!isOpen || !mounted) return null

  return createPortal(
    <div
      className={`
        fixed inset-0 z-[9999] flex items-center justify-center p-6
        bg-black/20 dark:bg-black/50
        backdrop-blur-[3px]
        transition-opacity duration-200
        ${isVisible ? 'opacity-100' : 'opacity-0'}
      `}
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={`
          w-full max-w-[320px] pointer-events-auto
          bg-[var(--apple-secondary-system-background)] rounded-[var(--apple-radius-xl)] overflow-hidden
          border border-[var(--apple-separator)]
          shadow-[0_20px_60px_rgba(0,0,0,0.18),0_4px_16px_rgba(0,0,0,0.10)]
          dark:shadow-[0_20px_60px_rgba(0,0,0,0.60),0_4px_16px_rgba(0,0,0,0.30)]
          transition-all duration-200 ease-out
          ${isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-[0.92] translate-y-2'}
        `}
        onClick={e => { e.stopPropagation(); e.preventDefault() }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Content */}
        <div className="px-5 pt-6 pb-5 text-center">
          {isDestructive && (
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-[var(--apple-system-red)]" aria-hidden="true" />
            </div>
          )}
          <h2
            id={titleId}
            className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--apple-label)]"
          >
            {title}
          </h2>
          <div
            id={descriptionId}
            className="mt-2 text-[13px] leading-relaxed text-[var(--apple-secondary-label)]"
          >
            {description}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-[var(--apple-separator)]" />

        {/* Buttons */}
        <div className="flex">
          <button
            onClick={e => { e.stopPropagation(); e.preventDefault(); onClose() }}
            disabled={isLoading}
            className="
              flex-1 py-3.5 text-[17px] text-[var(--apple-system-blue)]
              apple-transition hover:bg-[var(--apple-quaternary-fill)]
              disabled:opacity-40
            "
          >
            {cancelText}
          </button>

          <div className="w-px bg-[var(--apple-separator)]" />

          <button
            ref={confirmButtonRef}
            onClick={e => { e.stopPropagation(); e.preventDefault(); onConfirm() }}
            disabled={isLoading}
            className={`
              flex-1 py-3.5 text-[17px] font-semibold
              apple-transition hover:bg-[var(--apple-quaternary-fill)]
              disabled:opacity-40
              ${isDestructive ? 'text-[var(--apple-system-red)]' : 'text-[var(--apple-system-blue)]'}
            `}
          >
            {isLoading ? (
              <span className="inline-flex items-center justify-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
              </span>
            ) : (
              <span className="inline-flex items-center justify-center gap-1.5">
                {confirmIcon}
                {confirmText}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
