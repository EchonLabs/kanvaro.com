import { useToast } from '@/components/ui/Toast'

type NotifyOptions = {
  title: string
  message?: string
  duration?: number
}

export function useNotify() {
  const { showToast } = useToast()

  const success = (opts: NotifyOptions) =>
    showToast({ type: 'success', ...opts })

  const error = (opts: NotifyOptions) =>
    showToast({ type: 'error', ...opts })

  const info = (opts: NotifyOptions) =>
    showToast({ type: 'info', ...opts })

  const warning = (opts: NotifyOptions) =>
    showToast({ type: 'warning', ...opts })

  return { success, error, info, warning }
}
