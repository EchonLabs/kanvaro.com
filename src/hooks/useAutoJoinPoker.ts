'use client'

import { useEffect, useRef } from 'react'

/** Query param the poker invite popup appends so the target page opens the round's modal. */
export const JOIN_POKER_PARAM = 'joinPoker'

/**
 * Opens the poker modal when the page was reached from the invite popup
 * (`?joinPoker=<sessionId>`).
 *
 * Fires once per session id, only after the open session has loaded and the
 * page is `ready` (the modal's queue is resolved against data the page loads).
 * The param is then stripped, so a reload does not reopen a modal the user
 * deliberately closed. The manual "Join" button is unaffected.
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
    if (!ready || !openSessionId || typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const requested = url.searchParams.get(JOIN_POKER_PARAM)
    if (!requested || requested !== openSessionId || handled.current === requested) return

    handled.current = requested
    joinRef.current()

    url.searchParams.delete(JOIN_POKER_PARAM)
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  }, [openSessionId, ready])
}
