import { useToast } from '@/components/ui/Toast'

interface NotifyOptions {
  title: string
  message?: string
  duration?: number
}

export function useNotify() {
  const { showToast } = useToast()

  const success = (opts: NotifyOptions): void =>
    showToast({ type: 'success', ...opts })

  const error = (opts: NotifyOptions): void =>
    showToast({ type: 'error', ...opts })

  const info = (opts: NotifyOptions): void =>
    showToast({ type: 'info', ...opts })

  const warning = (opts: NotifyOptions): void =>
    showToast({ type: 'warning', ...opts })

  return { success, error, info, warning }
}
