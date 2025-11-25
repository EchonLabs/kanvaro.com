'use client'

import { ToastProvider } from '@/components/ui/Toast'

export function ToastProviderWrapper({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}

