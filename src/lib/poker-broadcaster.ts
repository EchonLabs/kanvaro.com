/**
 * Poker Broadcaster Module
 *
 * Session-scoped SSE fan-out for planning poker, modelled on
 * `notification-broadcaster.ts` (in-memory, per Node process).
 *
 * Messages are **invalidation signals only** — they say "something changed",
 * never what. Clients answer by re-reading the session through the same
 * endpoints they always polled, so PLN-11 (votes hidden until reveal) cannot be
 * weakened by this channel and no state logic lives here.
 */

const sessionConnections = new Map<string, Set<ReadableStreamDefaultController>>()

const encoder = new TextEncoder()

export type PokerChangeReason = 'vote' | 'reveal' | 'revote' | 'estimated'

export interface PokerStreamMessage {
  type: 'connected' | 'heartbeat' | 'poker_changed' | 'session_closed'
  reason?: PokerChangeReason
  taskId?: string
  round?: number
  timestamp: number
}

export function registerPokerConnection(
  sessionId: string,
  controller: ReadableStreamDefaultController
): void {
  if (!sessionConnections.has(sessionId)) {
    sessionConnections.set(sessionId, new Set())
  }
  sessionConnections.get(sessionId)!.add(controller)
}

export function unregisterPokerConnection(
  sessionId: string,
  controller: ReadableStreamDefaultController
): void {
  const connections = sessionConnections.get(sessionId)
  if (connections) {
    connections.delete(controller)
    if (connections.size === 0) {
      sessionConnections.delete(sessionId)
    }
  }
}

function sendToController(
  controller: ReadableStreamDefaultController,
  message: PokerStreamMessage
): boolean {
  try {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`))
    return true
  } catch {
    return false
  }
}

function fanOut(sessionId: string, message: PokerStreamMessage): number {
  const connections = sessionConnections.get(sessionId)
  if (!connections || connections.size === 0) return 0

  let sent = 0
  const dead: ReadableStreamDefaultController[] = []

  connections.forEach((controller) => {
    if (sendToController(controller, message)) sent++
    else dead.push(controller)
  })

  dead.forEach((controller) => connections.delete(controller))
  if (connections.size === 0) sessionConnections.delete(sessionId)

  return sent
}

/**
 * Tell everyone watching this session to re-read it. Best effort: a failure here
 * must never change the outcome of the write that triggered it, so callers do
 * not need their own try/catch.
 */
export function broadcastPokerChange(
  sessionId: string,
  change: { reason: PokerChangeReason; taskId?: string; round?: number }
): number {
  try {
    return fanOut(sessionId, { type: 'poker_changed', ...change, timestamp: Date.now() })
  } catch {
    return 0
  }
}

/**
 * The session is over: tell watchers, then close their streams so no
 * connection outlives the planning round.
 */
export function closePokerSession(sessionId: string): void {
  try {
    fanOut(sessionId, { type: 'session_closed', timestamp: Date.now() })

    const connections = sessionConnections.get(sessionId)
    connections?.forEach((controller) => {
      try {
        controller.close()
      } catch {
        // Already closed
      }
    })
    sessionConnections.delete(sessionId)
  } catch {
    // Best effort
  }
}

export function getPokerConnectionCount(sessionId: string): number {
  return sessionConnections.get(sessionId)?.size ?? 0
}
