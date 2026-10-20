'use client'

/**
 * "Planning poker started" popup, top-right.
 *
 * Shown to the people the PM picked as voters. It arrives live over the shared
 * notification stream (via `poker-invite-bus`) and, for anyone who was offline
 * or whose stream is down, is recovered from `GET /api/poker-sessions/open-for-me`
 * on load, on tab refocus, and on a 30s poll while the stream is disconnected.
 *
 * It goes away when the user goes to that sprint's planning page themselves, when
 * the round ends, or when they dismiss it. The existing Toast is bottom-centre
 * and cannot carry a link, so this is its own component.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowRight, Spade, X } from 'lucide-react'

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

function readDismissed(): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(DISMISSED_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function writeDismissed(ids: Set<string>) {
  try {
    window.sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(ids)))
  } catch {
    // Storage can be unavailable; the popup then simply may reappear on reload.
  }
}

export function PokerInvitePopup() {
  const pathname = usePathname()
  const [invites, setInvites] = useState<OpenInvite[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  const [streamConnected, setStreamConnected] = useState(false)

  useEffect(() => {
    setDismissed(readDismissed())
    setStreamConnected(isNotificationStreamConnected())
    return subscribeNotificationStreamConnected(setStreamConnected)
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
    setDismissed((current) => {
      const next = new Set(current)
      next.add(sessionId)
      writeDismissed(next)
      return next
    })
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

  const visible = useMemo(
    () => invites.filter((invite) => !dismissed.has(invite.sessionId)),
    [invites, dismissed]
  )

  if (visible.length === 0) return null

  return (
    // Sits below the 56px (h-14) header and its buttons rather than over them.
    <div className="pointer-events-none fixed right-4 top-20 z-[9999] flex w-full max-w-[360px] flex-col gap-3 px-4 sm:px-0">
      {visible.map((invite) => (
        <InviteCard key={invite.sessionId} invite={invite} onDismiss={dismiss} />
      ))}
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
  // Slides in from the right on mount.
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div
      role="alert"
      className={`apple-glass pointer-events-auto relative overflow-hidden rounded-[var(--apple-radius-xl)] border border-[var(--apple-separator)] shadow-[0_12px_36px_rgba(0,0,0,0.16)] transition-all duration-300 ease-out dark:shadow-[0_12px_36px_rgba(0,0,0,0.5)] ${
        shown ? 'translate-x-0 opacity-100' : 'translate-x-6 opacity-0'
      }`}
    >
      {/* Accent edge, in the app's blue-to-cyan project gradient. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: 'linear-gradient(180deg,#007AFF 0%,#5AC8FA 100%)' }}
      />

      <div className="flex items-start gap-3.5 py-4 pl-5 pr-4">
        <span
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--apple-radius-md)] text-white"
          style={{
            background: 'linear-gradient(135deg,#007AFF 0%,#5AC8FA 100%)',
            boxShadow: '0 4px 12px rgba(0,122,255,0.30)'
          }}
        >
          <Spade className="h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="apple-section-label text-[var(--apple-system-blue)]">Planning poker</p>
          <p className="apple-type-callout mt-0.5 font-semibold text-[var(--apple-label)]">
            {invite.sprintName ?? 'A sprint'} is being estimated
          </p>
          <p className="apple-type-footnote mt-0.5 break-words text-[var(--apple-secondary-label)]">
            {invite.projectName ? `${invite.projectName} · ` : ''}You&apos;ve been asked to vote.
          </p>

          <Link
            href={`/sprints/${invite.sprintId}/planning`}
            className="apple-transition apple-type-footnote mt-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--apple-system-blue)] px-3.5 py-1.5 font-semibold text-white hover:opacity-90"
          >
            Go to planning
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <button
          type="button"
          onClick={() => onDismiss(invite.sessionId)}
          aria-label="Dismiss"
          className="apple-transition flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--apple-tertiary-fill)] text-[var(--apple-secondary-label)] hover:bg-[var(--apple-quaternary-fill)] hover:text-[var(--apple-label)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
