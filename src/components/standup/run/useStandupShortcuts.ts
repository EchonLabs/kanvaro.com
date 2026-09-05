'use client'

import { useEffect, useRef } from 'react'

import { matchShortcut, type StandupShortcutAction } from '@/lib/standup/keyboard-shortcuts'

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function useStandupShortcuts(
  handlers: Partial<Record<StandupShortcutAction, () => void>>
): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    let pendingPrefix: 'g' | null = null
    let prefixTimeout: ReturnType<typeof setTimeout> | null = null

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && TYPING_TAGS.has(target.tagName)) return

      const result = matchShortcut(event, pendingPrefix)

      if (event.key === 'g' && pendingPrefix === null) {
        pendingPrefix = 'g'
        prefixTimeout = setTimeout(() => {
          pendingPrefix = null
        }, 1000)
        return
      }

      if (result?.consumesPrefix) {
        pendingPrefix = null
        if (prefixTimeout) clearTimeout(prefixTimeout)
      }

      if (result) {
        event.preventDefault()
        handlersRef.current[result.action]?.()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (prefixTimeout) clearTimeout(prefixTimeout)
    }
  }, [])
}
