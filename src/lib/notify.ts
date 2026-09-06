import { useCallback, useMemo } from 'react'

import { useToast } from '@/components/ui/Toast'

interface NotifyOptions {
  title: string
  message?: string
  duration?: number
}

/**
 * Toast helpers with a **stable identity**.
 *
 * The memoisation is load-bearing, not tidiness. Callers put `notify` in
 * `useCallback`/`useEffect` dependency arrays; an object rebuilt on every render
 * makes those effects re-run on every render, and an effect that shows a toast
 * then re-renders itself into an infinite loop. `showToast` is already stable,
 * so depending on it alone is enough to make this constant for the lifetime of
 * the provider.
 */
export function useNotify() {
  const { showToast } = useToast()

  const success = useCallback(
    (opts: NotifyOptions): void => showToast({ type: 'success', ...opts }),
    [showToast]
  )
  const error = useCallback(
    (opts: NotifyOptions): void => showToast({ type: 'error', ...opts }),
    [showToast]
  )
  const info = useCallback(
    (opts: NotifyOptions): void => showToast({ type: 'info', ...opts }),
    [showToast]
  )
  const warning = useCallback(
    (opts: NotifyOptions): void => showToast({ type: 'warning', ...opts }),
    [showToast]
  )

  return useMemo(
    () => ({ success, error, info, warning }),
    [success, error, info, warning]
  )
}
