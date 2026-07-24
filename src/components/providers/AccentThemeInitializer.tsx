'use client'

import { useEffect } from 'react'
import { type AccentTheme, ACCENT_THEMES } from '@/hooks/useAccentTheme'

/* Runs once on app mount, reads the stored accent theme from localStorage
   and applies the data-theme attribute before the first paint of any page. */
export function AccentThemeInitializer() {
  useEffect(() => {
    try {
      const saved = localStorage.getItem('kanvaro-accent-theme') as AccentTheme | null
      if (saved && (ACCENT_THEMES as readonly string[]).includes(saved) && saved !== 'blue') {
        document.documentElement.setAttribute('data-theme', saved)
      }
    } catch {
      // localStorage not available (SSR guard)
    }
  }, [])

  return null
}
