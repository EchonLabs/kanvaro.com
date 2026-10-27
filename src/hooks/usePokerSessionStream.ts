'use client'

import { useEffect, useRef, useState } from 'react'

interface UsePokerSessionStreamOptions {
  /** Open only while the poker modal is open on a live session. */
  enabled: boolean
  sessionId: string
  /** The session may have changed (or the stream just (re)connected): re-read it. */
  onSignal: () => void
  /** The server ended the session; the stream will not reconnect. */
  onClosed?: () => void
  reconnectInterval?: number
  maxReconnectAttempts?: number
}

const LOG = '[poker-sse]'

/**
 * Push channel for one poker session, mirroring `useNotificationSSE`.
 *
 * Events are invalidation signals, never state — the caller answers each one by
 * running its existing read of the session. `isConnected` is how the caller
 * decides whether it still needs to poll: false (no EventSource, never opened,
 * errored, or gave up reconnecting) means "keep polling as before".
 */
export function usePokerSessionStream({
  enabled,
  sessionId,
  onSignal,
  onClosed,
  reconnectInterval = 5000,
  maxReconnectAttempts = 10
}: UsePokerSessionStreamOptions) {
  const [isConnected, setIsConnected] = useState(false)

  const onSignalRef = useRef(onSignal)
  const onClosedRef = useRef(onClosed)
  onSignalRef.current = onSignal
  onClosedRef.current = onClosed

  useEffect(() => {
    if (!enabled || !sessionId) {
      setIsConnected(false)
      return
    }
    if (typeof EventSource === 'undefined') {
      console.debug(`${LOG} EventSource is not supported in this browser — using 4s polling`)
      setIsConnected(false)
      return
    }

    let source: EventSource | null = null
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
    let attempts = 0
    let finished = false

    const clearTimer = () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
        reconnectTimeout = null
      }
    }

    const close = () => {
      if (source) {
        source.close()
        source = null
      }
    }

    const connect = () => {
      if (finished) return
      close()

      console.debug(`${LOG} connecting to session ${sessionId}`)

      try {
        source = new EventSource(`/api/poker-sessions/${sessionId}/stream`, {
          withCredentials: true
        })
      } catch (error) {
        console.debug(`${LOG} could not open the stream — using 4s polling`, error)
        setIsConnected(false)
        return
      }

      source.onopen = () => {
        attempts = 0
        console.debug(`${LOG} connected — live updates on, polling slowed to a 30s safety read`)
        setIsConnected(true)
      }

      source.onmessage = (event) => {
        let message: { type?: string }
        try {
          message = JSON.parse(event.data)
        } catch {
          return
        }

        if (message.type === 'connected' || message.type === 'poker_changed') {
          // `connected` also fires on every reconnect: events missed while the
          // stream was down are not replayed, so re-reading is how we catch up.
          console.debug(`${LOG} ${message.type}`, message)
          onSignalRef.current()
        } else if (message.type === 'session_closed') {
          console.debug(`${LOG} session closed by the server — stream finished`)
          finished = true
          close()
          setIsConnected(false)
          onSignalRef.current()
          onClosedRef.current?.()
        }
      }

      source.onerror = () => {
        close()
        setIsConnected(false)
        if (finished) return

        if (attempts >= maxReconnectAttempts) {
          console.debug(`${LOG} gave up after ${attempts} reconnect attempts — staying on 4s polling`)
          return
        }
        attempts += 1
        const delay = Math.min(reconnectInterval * Math.pow(1.5, attempts - 1), 60000)
        console.debug(
          `${LOG} stream dropped — falling back to 4s polling, retrying in ${delay}ms (attempt ${attempts}/${maxReconnectAttempts})`
        )
        clearTimer()
        reconnectTimeout = setTimeout(connect, delay)
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !source && !finished) {
        attempts = 0
        clearTimer()
        connect()
      }
    }

    connect()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      console.debug(`${LOG} closing stream for session ${sessionId}`)
      finished = true
      clearTimer()
      close()
      document.removeEventListener('visibilitychange', onVisibility)
      setIsConnected(false)
    }
  }, [enabled, sessionId, reconnectInterval, maxReconnectAttempts])

  return { isConnected }
}
