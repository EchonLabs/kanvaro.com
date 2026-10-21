'use client'

/**
 * "Planning poker started" popup, top-right.
 *
 * Shown to the people the PM picked as voters. It arrives live over the shared
 * notification stream (via `poker-invite-bus`) and, for anyone who was offline
 * or whose stream is down, is recovered from `GET /api/poker-sessions/open-for-me`
 * on load, on tab refocus, and on a 30s poll while the stream is disconnected.
 *
 * One card at a time, and each round is announced once: after the user goes to
 * the planning page, dismisses it, or the round ends, it never comes back —
 * across reloads and other tabs too. The existing Toast is bottom-centre and
 * cannot carry a link, so this is its own component.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowRight, X } from 'lucide-react'

import {
  isNotificationStreamConnected,
  subscribeNotificationStreamConnected,
  subscribePokerInviteEvents
} from '@/lib/poker-invite-bus'

interface OpenInvite {
  sessionId: string
  sprintId: string
  sprintName: string | null
  projectName?: string | null
}

const FALLBACK_POLL_MS = 30000
const DISMISSED_KEY = 'kanvaro:poker-invite-dismissed'
/** Old round ids are pruned so the stored list cannot grow without bound. */
const DISMISSED_LIMIT = 50

function readDismissed(): string[] {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function rememberDismissed(sessionId: string): string[] {
  // Merged with what is already stored, so a dismissal made in another tab is
  // not overwritten by this tab's older copy.
  const ids = readDismissed().filter((id) => id !== sessionId)
  ids.push(sessionId)
  const next = ids.slice(-DISMISSED_LIMIT)
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(next))
  } catch {
    // Storage can be unavailable; the popup then only stays gone for this page load.
  }
  return next
}

export function PokerInvitePopup() {
  const pathname = usePathname()
  const [invites, setInvites] = useState<OpenInvite[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  const [streamConnected, setStreamConnected] = useState(false)

  useEffect(() => {
    setDismissed(new Set(readDismissed()))
    setStreamConnected(isNotificationStreamConnected())

    // Dismissing in one tab clears the popup in every other open tab.
    const onStorage = (event: StorageEvent) => {
      if (event.key === DISMISSED_KEY) setDismissed(new Set(readDismissed()))
    }
    window.addEventListener('storage', onStorage)
    const unsubscribe = subscribeNotificationStreamConnected(setStreamConnected)
    return () => {
      window.removeEventListener('storage', onStorage)
      unsubscribe()
    }
  }, [])

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/poker-sessions/open-for-me')
      if (!response.ok) return
      const payload = await response.json()
      const sessions: OpenInvite[] = payload?.data?.sessions ?? []
      // Authoritative: a session that is no longer open drops out here.
      setInvites(sessions)
    } catch {
      /* The next load recovers. */
    }
  }, [])

  // Initial load, and whenever the tab becomes visible again.
  useEffect(() => {
    load()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [load])

  // Fallback: without the live stream, look for new rounds on a timer.
  useEffect(() => {
    if (streamConnected) return
    const interval = setInterval(load, FALLBACK_POLL_MS)
    return () => clearInterval(interval)
  }, [streamConnected, load])

  // Live: invite adds, close removes.
  useEffect(
    () =>
      subscribePokerInviteEvents((event) => {
        const { sessionId, sprintId, sprintName } = event.data
        if (event.type === 'poker_closed') {
          setInvites((current) => current.filter((invite) => invite.sessionId !== sessionId))
          return
        }
        if (!sprintId) return
        setInvites((current) =>
          current.some((invite) => invite.sessionId === sessionId)
            ? current
            : [{ sessionId, sprintId, sprintName: sprintName ?? null }, ...current]
        )
      }),
    []
  )

  const dismiss = useCallback((sessionId: string) => {
    setDismissed(new Set(rememberDismissed(sessionId)))
  }, [])

  // Going to the planning page is the acknowledgement: dismiss for good, so the
  // popup does not come back after the user navigates away mid-round.
  useEffect(() => {
    if (!pathname) return
    for (const invite of invites) {
      if (pathname.startsWith(`/sprints/${invite.sprintId}/planning`) && !dismissed.has(invite.sessionId)) {
        dismiss(invite.sessionId)
      }
    }
  }, [pathname, invites, dismissed, dismiss])

  // One notification is enough: the newest round the user has not yet dealt with.
  const current = useMemo(
    () => invites.find((invite) => !dismissed.has(invite.sessionId)) ?? null,
    [invites, dismissed]
  )

  if (!current) return null

  return (
    // Sits below the 56px (h-14) header and its buttons rather than over them.
    <div className="pointer-events-none fixed right-4 top-20 z-[9999] w-full max-w-[340px] px-4 sm:px-0">
      <InviteCard key={current.sessionId} invite={current} onDismiss={dismiss} />
    </div>
  )
}

function InviteCard({
  invite,
  onDismiss
}: {
  invite: OpenInvite
  onDismiss: (sessionId: string) => void
}) {
  // Fades and settles in on mount.
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div
      role="alert"
      className={`apple-glass pointer-events-auto rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] px-4 py-3.5 shadow-[0_8px_28px_rgba(0,0,0,0.12)] transition-all duration-300 ease-out dark:shadow-[0_8px_28px_rgba(0,0,0,0.45)] ${
        shown ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Importance is carried by a small pulsing dot and the label, not by colour fills. */}
        <p className="apple-section-label flex items-center gap-2 text-[var(--apple-label)]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--apple-system-red)] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--apple-system-red)]" />
          </span>
          Your vote is needed
        </p>
        <button
          type="button"
          onClick={() => onDismiss(invite.sessionId)}
          aria-label="Dismiss"
          className="apple-transition -mr-1 -mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[var(--apple-tertiary-label)] hover:bg-[var(--apple-quaternary-fill)] hover:text-[var(--apple-label)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className="apple-type-callout mt-1.5 font-semibold text-[var(--apple-label)]">
        {invite.sprintName ?? 'A sprint'} is being estimated
      </p>
      <p className="apple-type-footnote mt-0.5 break-words text-[var(--apple-secondary-label)]">
        {invite.projectName ? `${invite.projectName} · ` : ''}Planning poker has started.
      </p>

      <Link
        href={`/sprints/${invite.sprintId}/planning`}
        className="apple-transition apple-type-footnote mt-3 inline-flex items-center gap-1.5 font-semibold text-[var(--apple-label)] hover:opacity-70"
      >
        Go to planning
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}
