'use client'

import { useState, useEffect, useCallback } from 'react'

export const ACCENT_THEMES = ['blue', 'orange', 'purple', 'red'] as const
export type AccentTheme = typeof ACCENT_THEMES[number]

const STORAGE_KEY = 'kanvaro-accent-theme'

function applyTheme(theme: AccentTheme) {
  if (theme === 'blue') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', theme)
  }
}

export function useAccentTheme() {
  const [theme, setTheme] = useState<AccentTheme>('blue')

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as AccentTheme | null
    if (saved && (ACCENT_THEMES as readonly string[]).includes(saved)) {
      setTheme(saved)
      applyTheme(saved)
    }
  }, [])

  const updateTheme = useCallback((next: AccentTheme) => {
    setTheme(next)
    applyTheme(next)
    localStorage.setItem(STORAGE_KEY, next)
  }, [])

  return { theme, updateTheme }
}
