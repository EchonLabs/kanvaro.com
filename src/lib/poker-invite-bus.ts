/**
 * Tiny in-tab pub/sub for planning-poker invite events.
 *
 * The notification SSE connection is opened once per tab (MainLayout). Rather
 * than open a second EventSource for poker, that hook forwards `poker_invite` /
 * `poker_closed` messages here, and the popup and the planning screen subscribe.
 */

export interface PokerInviteEvent {
  type: 'poker_invite' | 'poker_closed'
  data: {
    sessionId: string
    sprintId?: string
    sprintName?: string | null
    facilitatorId?: string
  }
}

type Listener = (event: PokerInviteEvent) => void

const listeners = new Set<Listener>()

export function publishPokerInviteEvent(event: PokerInviteEvent): void {
  listeners.forEach((listener) => {
    try {
      listener(event)
    } catch {
      // One bad subscriber must not stop the others.
    }
  })
}

export function subscribePokerInviteEvents(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Whether the shared notification stream is up. Invites only arrive live while
// it is, so subscribers poll `open-for-me` as the fallback whenever it is not.
let streamConnected = false
const connectionListeners = new Set<(connected: boolean) => void>()

export function publishNotificationStreamConnected(connected: boolean): void {
  if (streamConnected === connected) return
  streamConnected = connected
  console.debug(
    connected
      ? '[poker-sse] notification stream connected — poker invites arrive live'
      : '[poker-sse] notification stream down — checking open-for-me every 30s for poker invites'
  )
  connectionListeners.forEach((listener) => listener(connected))
}

export function isNotificationStreamConnected(): boolean {
  return streamConnected
}

export function subscribeNotificationStreamConnected(
  listener: (connected: boolean) => void
): () => void {
  connectionListeners.add(listener)
  return () => {
    connectionListeners.delete(listener)
  }
}
