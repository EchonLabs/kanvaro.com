'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info, Loader2, Save, X } from 'lucide-react'
import { useNotify } from '@/lib/notify'

interface AddCustomStatusModalProps {
  isOpen: boolean
  onClose: () => void
  projectId?: string
  sprintName?: string
  onStatusCreated?: (newStatus: { key: string; title: string; color?: string; order: number }) => void
}

export function AddCustomStatusModal({
  isOpen,
  onClose,
  projectId,
  onStatusCreated
}: AddCustomStatusModalProps) {
  const [mounted, setMounted] = useState(false)
  const [statusName, setStatusName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const notify = useNotify()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen) {
      setStatusName('')
      setError(null)

      let active = true
      let attempts = 0
      const maxAttempts = 15

      const focusField = () => {
        if (!active) return
        if (inputRef.current) {
          inputRef.current.focus({ preventScroll: true })
          const len = inputRef.current.value.length
          try {
            inputRef.current.setSelectionRange(len, len)
          } catch {}
          if (document.activeElement === inputRef.current) {
            return
          }
        }
        if (attempts < maxAttempts) {
          attempts++
          setTimeout(focusField, 40)
        }
      }

      requestAnimationFrame(focusField)
      const t1 = setTimeout(focusField, 30)

      return () => {
        active = false
        clearTimeout(t1)
      }
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isSubmitting, onClose])

  if (!mounted || !isOpen) return null

  const handleSubmit = async () => {
    const trimmed = statusName.trim()
    if (!trimmed) {
      setError('Status name is required')
      return
    }

    if (!projectId) {
      setError('Project reference is missing for this sprint')
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)

      const res = await fetch(`/api/projects/${projectId}/statuses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed })
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create custom status')
      }

      notify.success({
        title: 'Status Created',
        message: `Status "${trimmed}" has been added to this project.`
      })

      onStatusCreated?.(data.data)
      setStatusName('')
      onClose()
    } catch (err: any) {
      const msg = err.message || 'Failed to add status'
      setError(msg)
      notify.error({
        title: 'Failed to Add Status',
        message: msg
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[10060] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
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
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Other Status</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Create a custom status for other</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="pt-5 pb-2">
          <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
            Set Name for Status <span className="text-gray-400 font-normal">*</span>
          </label>
          <input
            ref={(node) => {
              inputRef.current = node
              if (node && isOpen) {
                node.focus({ preventScroll: true })
              }
            }}
            autoFocus
            type="text"
            value={statusName}
            onChange={(e) => {
              setStatusName(e.target.value)
              if (error) setError(null)
            }}
            placeholder="Status Name"
            disabled={isSubmitting}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSubmit()
              }
            }}
            className="w-full px-4 py-3 rounded-2xl border border-blue-100 dark:border-gray-700 bg-white dark:bg-gray-800/80 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />

          {error && (
            <p className="text-xs text-red-500 mt-2 font-medium">{error}</p>
          )}

          <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 text-xs mt-3 font-normal">
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>This status will be available for tasks in this sprint.</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-5 border-t border-gray-100 dark:border-gray-800 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-6 py-2 rounded-full border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !statusName.trim()}
            className="px-6 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white flex items-center gap-2 shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Status</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
