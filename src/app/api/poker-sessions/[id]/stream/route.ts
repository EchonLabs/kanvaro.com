/**
 * Live change signals for one poker session.
 *
 *   GET /api/poker-sessions/:id/stream   (text/event-stream)
 *
 * Replaces the 4s poll in the poker modal. The stream carries no state, only
 * "re-read the session" signals (see `poker-broadcaster.ts`), so it is gated by
 * the same `SPRINT_VIEW` check as the polled `GET /api/poker-sessions/:id`.
 * Polling remains the client's fallback when this stream is unavailable.
 */
import { NextResponse } from 'next/server'

import { Permission } from '@/lib/permissions/permission-definitions'
import { registerPokerConnection, unregisterPokerConnection } from '@/lib/poker-broadcaster'
import { withPokerPermission } from '@/lib/standup/route-helpers'

export const dynamic = 'force-dynamic'

export const GET = withPokerPermission(
  { permission: Permission.SPRINT_VIEW },
  async (request, { pokerSession }) => {
    const sessionId = pokerSession._id.toString()

    // Nothing left to watch on a finished session; the client's sync() sees the
    // closed status and shuts the modal.
    if (pokerSession.status !== 'open') {
      return NextResponse.json(
        { error: { code: 'VALIDATION_FAILED', message: 'This poker session has been closed.' } },
        { status: 409 }
      )
    }

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      start(controller) {
        registerPokerConnection(sessionId, controller)

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`)
        )

        const heartbeatInterval = setInterval(() => {
          // Only this connection's controller: a session-wide ping from every
          // connection would send each client N heartbeats per interval.
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`)
            )
          } catch {
            clearInterval(heartbeatInterval)
            unregisterPokerConnection(sessionId, controller)
          }
        }, 30000)

        request.signal.addEventListener('abort', () => {
          clearInterval(heartbeatInterval)
          unregisterPokerConnection(sessionId, controller)
          try {
            controller.close()
          } catch {
            // Already closed
          }
        })
      }
    })

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      }
    })
  }
)
