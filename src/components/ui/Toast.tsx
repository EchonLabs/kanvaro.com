'use client'

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { X, CheckCircle2, XCircle, Info, AlertTriangle } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'critical'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

interface ToastContextType {
  toasts: Toast[]
  showToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

export const TOAST_DURATION = 5000

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9)
    const newToast: Toast = { ...toast, id, duration: toast.duration ?? TOAST_DURATION }
    setToasts((prev) => [...prev, newToast])
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, newToast.duration)
    }
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  )
}

function ToastContainer({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: string) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 w-full max-w-sm px-4 pointer-events-none overflow-hidden">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  )
}

const TYPE_CONFIG: Record<ToastType, {
  icon: React.ElementType
  color: string
  style: string
  shadow: string
  titleClass: string
}> = {
  success: {
    icon: CheckCircle2,
    color: 'var(--apple-system-green)',
    style: 'bg-green-500/[0.12] dark:bg-green-500/[0.18] border-green-500/[0.55] dark:border-green-400/[0.55]',
    shadow: 'shadow-[0_4px_16px_rgba(0,0,0,0.10)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.40)]',
    titleClass: 'text-[var(--apple-label)]',
  },
  error: {
    icon: XCircle,
    color: 'var(--apple-system-red)',
    style: 'bg-red-500/[0.12] dark:bg-red-500/[0.18] border-red-500/[0.55] dark:border-red-400/[0.55]',
    shadow: 'shadow-[0_4px_16px_rgba(0,0,0,0.10)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.40)]',
    titleClass: 'text-[var(--apple-label)]',
  },
  warning: {
    icon: AlertTriangle,
    color: 'var(--apple-system-orange)',
    style: 'bg-orange-500/[0.12] dark:bg-orange-500/[0.18] border-orange-500/[0.55] dark:border-orange-400/[0.55]',
    shadow: 'shadow-[0_4px_16px_rgba(0,0,0,0.10)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.40)]',
    titleClass: 'text-[var(--apple-label)]',
  },
  info: {
    icon: Info,
    color: 'var(--apple-system-blue)',
    style: 'bg-blue-500/[0.12] dark:bg-blue-500/[0.18] border-blue-500/[0.55] dark:border-blue-400/[0.55]',
    shadow: 'shadow-[0_4px_16px_rgba(0,0,0,0.10)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.40)]',
    titleClass: 'text-[var(--apple-label)]',
  },
  critical: {
    icon: XCircle,
    color: 'var(--apple-system-red)',
    style: 'bg-red-500/[0.18] dark:bg-red-500/[0.26] border-red-500/[0.70] dark:border-red-400/[0.70]',
    shadow: 'shadow-[0_4px_16px_rgba(255,59,48,0.20)] dark:shadow-[0_4px_16px_rgba(255,69,58,0.35)]',
    titleClass: 'text-[var(--apple-system-red)]',
  },
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setIsVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  const handleRemove = () => {
    setIsVisible(false)
    setTimeout(() => onRemove(toast.id), 250)
  }

  const { icon: Icon, color, style, shadow, titleClass } = TYPE_CONFIG[toast.type]

  return (
    <div
      className={`
        backdrop-blur-[8px] ${style} ${shadow} border
        rounded-full
        pointer-events-auto
        transition-all duration-250 ease-out
        ${isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-3 scale-[0.96]'}
      `}
      role="alert"
    >
      <div className="flex items-center gap-2.5 pl-3.5 pr-3 py-2">
        <Icon className="flex-shrink-0 w-5 h-5" style={{ color }} />
        <div className="flex-1 min-w-0">
          <p className={`text-[13.5px] font-semibold leading-snug tracking-[-0.01em] ${titleClass}`}>
            {toast.title}
          </p>
          {toast.message && (
            <p className="text-[12px] leading-snug text-[var(--apple-secondary-label)] break-words">
              {toast.message}
            </p>
          )}
        </div>
        <button
          onClick={handleRemove}
          className="flex-shrink-0 w-[20px] h-[20px] flex items-center justify-center rounded-full bg-black/[0.07] dark:bg-white/[0.10] hover:bg-black/[0.12] dark:hover:bg-white/[0.16] apple-transition text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]"
          aria-label="Dismiss"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
