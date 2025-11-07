'use client'

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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card
        className={cn(
          "w-full max-w-md flex flex-col max-h-[90vh]",
          isDestructive && 'border-destructive/60 bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-100'
        )}
      >
        <CardHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {isDestructive && (
                <AlertTriangle className="h-5 w-5 text-destructive" />
              )}
              <CardTitle className={cn(isDestructive && 'text-destructive')}>
                {title}
              </CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription className={cn(isDestructive && 'text-destructive/80 dark:text-red-200')}>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex-shrink-0 pt-4">
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onClose} disabled={isLoading}>
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
    </div>
  )
}
