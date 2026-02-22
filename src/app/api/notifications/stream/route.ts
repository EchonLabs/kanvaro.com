import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser } from '@/lib/auth-utils'
import { 
  registerConnection, 
  unregisterConnection, 
  sendHeartbeat 
} from '@/lib/notification-broadcaster'
import connectDB from '@/lib/db-config'


export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const userId = authResult.user.id
    
    await connectDB()

    // Create a readable stream for SSE
    const stream = new ReadableStream({
      start(controller) {
        // Register this connection using the broadcaster
        registerConnection(userId, controller)

        // Send initial connection established message
        const encoder = new TextEncoder()
        const initialMessage = `data: ${JSON.stringify({ type: 'connected', userId, timestamp: Date.now() })}\n\n`
        controller.enqueue(encoder.encode(initialMessage))

        // Send a heartbeat every 30 seconds to keep connection alive
        const heartbeatInterval = setInterval(() => {
          try {
            sendHeartbeat(userId)
          } catch (error) {
            // Connection might be closed
            clearInterval(heartbeatInterval)
          }
        }, 30000)

        // Cleanup when connection is closed
        request.signal.addEventListener('abort', () => {
          clearInterval(heartbeatInterval)
          unregisterConnection(userId, controller)
          try {
            controller.close()
          } catch (error) {
            // Already closed
          }
        })
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no' // Disable nginx buffering
      }
    })
  } catch (error) {
    console.error('SSE connection failed:', error)
    return NextResponse.json(
      { error: 'Failed to establish SSE connection' },
      { status: 500 }
    )
  }
}
