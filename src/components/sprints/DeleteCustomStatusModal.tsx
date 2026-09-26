'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Trash2, AlertTriangle, Loader2 } from 'lucide-react'

interface DeleteCustomStatusModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  statusName: string
  isLoading?: boolean
}

export function DeleteCustomStatusModal({
  isOpen,
  onClose,
  onConfirm,
  statusName,
  isLoading = false
}: DeleteCustomStatusModalProps) {
  const [mounted, setMounted] = useState(false)
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.classList.add('modal-open')

    const t = setTimeout(() => {
      confirmBtnRef.current?.focus()
    }, 50)

    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.classList.remove('modal-open')
    }
  }, [isOpen, isLoading, onClose])

  if (!isOpen || !mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[10060] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          onClose()
        }
      }}
    >
      <div
        className="w-full max-w-[440px] rounded-3xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-6 shadow-2xl animate-in zoom-in-95 duration-150 relative text-gray-900 dark:text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Delete Custom Status</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Delete custom status from this project</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="pt-5 pb-2 space-y-3.5">
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Are you sure you want to delete the status{' '}
            <span className="font-semibold text-gray-900 dark:text-white">
              &ldquo;{statusName}&rdquo;
            </span>
            ?
          </p>

          <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 text-xs font-normal leading-relaxed">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <span>
              Any tasks currently in this status will automatically be moved to{' '}
              <strong className="font-semibold text-amber-900 dark:text-amber-200">To Do</strong>. This action cannot be undone.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-5 border-t border-gray-100 dark:border-gray-800 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-6 py-2 rounded-full border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="px-6 py-2 rounded-full bg-red-600 hover:bg-red-700 text-sm font-semibold text-white flex items-center gap-2 shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>Delete Status</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
