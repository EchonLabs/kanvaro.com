'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmText?: string
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
  cancelText = 'Cancel',
  variant = 'default',
  isLoading = false
}: ConfirmationModalProps) {
  const isDestructive = variant === 'destructive'
  const initialButtonRef = useRef<HTMLButtonElement>(null)
  const modalId = useId()
  const titleId = `${modalId}-title`
  const descriptionId = `${modalId}-description`
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isOpen || !mounted) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    initialButtonRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose, mounted])

  useEffect(() => {
    if (!isOpen || !mounted) return

    document.body.classList.add('modal-open')
    return () => {
      document.body.classList.remove('modal-open')
    }
  }, [isOpen, mounted])

  if (!isOpen || !mounted) return null

  return createPortal(
    <div
      className="modal-overlay fixed inset-0 w-screen h-screen bg-white/60 dark:bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
      role="presentation"
      onClick={onClose}
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={cn(
          "w-full max-w-md flex flex-col max-h-[90vh] bg-card text-card-foreground shadow-2xl transition-all duration-200 ease-out",
          isDestructive && 'border-destructive/60 bg-red-50 text-red-900 dark:bg-red-900 dark:text-red-100'
        )}
        onClick={event => event.stopPropagation()}
      >
        <CardHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {isDestructive && (
                <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
              )}
              <CardTitle id={titleId} className={cn(isDestructive && 'text-destructive')}>
                {title}
              </CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close confirmation dialog">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription id={descriptionId} className={cn(isDestructive && 'text-destructive/80 dark:text-red-200')}>
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-shrink-0 pt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:space-x-2">
            <Button
              ref={initialButtonRef}
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
            >
              {cancelText}
            </Button>
            <Button
              variant={isDestructive ? 'destructive' : 'default'}
              onClick={onConfirm}
              disabled={isLoading}
            >
              {isLoading ? 'Processing...' : confirmText}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>,
    document.body
  )
}
