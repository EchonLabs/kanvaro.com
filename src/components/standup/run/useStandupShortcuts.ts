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

      // Any key pressed after `g` settles the chord one way or the other. A
      // non-matching key used to leave the prefix armed until its 1-second
      // timeout, during which the hook was deaf to every other shortcut —
      // clearing it here makes the very next keystroke live again.
      if (pendingPrefix === 'g') {
        pendingPrefix = null
        if (prefixTimeout) {
          clearTimeout(prefixTimeout)
          prefixTimeout = null
        }
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
