'use client'

import { useEffect, useRef } from 'react'

/** Query param the poker invite popup appends so the target page opens the round's modal. */
export const JOIN_POKER_PARAM = 'joinPoker'

/**
 * Opens the poker modal when the page was reached from the invite popup
 * (`?joinPoker=<sessionId>`).
 *
 * `ready` must mean the page has finished loading its open session (the
 * modal's queue is resolved against data the page loads), so that a null
 * `openSessionId` really means "no open round". Once ready:
 *
 * - the requested round is still open → join it, once per session id;
 * - it has ended, or a different round is open → do nothing.
 *
 * Either way the param is stripped, so a reload does not reopen a modal the
 * user deliberately closed and a stale invite link does not linger in the
 * address bar. The manual "Join" button is unaffected.
 */
export function useAutoJoinPoker(
  openSessionId: string | null | undefined,
  ready: boolean,
  join: () => void
) {
  const handled = useRef<string | null>(null)
  const joinRef = useRef(join)
  joinRef.current = join

  useEffect(() => {
    if (!ready || typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const requested = url.searchParams.get(JOIN_POKER_PARAM)
    if (!requested) return

    if (requested === openSessionId && handled.current !== requested) {
      handled.current = requested
      joinRef.current()
    }

    url.searchParams.delete(JOIN_POKER_PARAM)
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  }, [openSessionId, ready])
}
