'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

interface ResponsiveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  className?: string
  /** When false, dialog can only be closed via explicit close controls (close icon/buttons). */
  dismissible?: boolean
}

export function ResponsiveDialog({ 
  open, 
  onOpenChange, 
  title, 
  description,
  children, 
  footer,
  className,
  dismissible = true
}: ResponsiveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className={cn(
          'max-w-lg sm:max-w-2xl lg:max-w-4xl',
          className
        )}
        onInteractOutside={dismissible ? undefined : (e) => e.preventDefault()}
        onEscapeKeyDown={dismissible ? undefined : (e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogBody>
          {children}
        </DialogBody>
        {footer && (
          <DialogFooter>
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
