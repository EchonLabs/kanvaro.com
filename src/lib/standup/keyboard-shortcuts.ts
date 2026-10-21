/**
 * §15.17's key table, as a pure matcher. No DOM, no React — `useStandupShortcuts`
 * is the only caller and owns the `keydown` listener and the `g`-prefix state.
 */

export type StandupShortcutAction =
  | 'jump-panel-1'
  | 'jump-panel-2'
  | 'jump-panel-3'
  | 'jump-panel-4'
  | 'jump-panel-5'
  | 'jump-panel-6'
  | 'jump-panel-7'
  | 'next-row'
  | 'prev-row'
  | 'mark-done'
  | 'revise-estimate'
  | 'add-note'
  | 'focus-quick-add'
  | 'focus-search'
  | 'go-to-schedule'
  | 'attempt-complete'
  | 'show-help'

export interface ShortcutEvent {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

const PANEL_KEYS: Record<string, StandupShortcutAction> = {
  '1': 'jump-panel-1',
  '2': 'jump-panel-2',
  '3': 'jump-panel-3',
  '4': 'jump-panel-4',
  '5': 'jump-panel-5',
  '6': 'jump-panel-6',
  '7': 'jump-panel-7'
}

const SIMPLE_KEYS: Record<string, StandupShortcutAction> = {
  j: 'next-row',
  k: 'prev-row',
  d: 'mark-done',
  r: 'revise-estimate',
  n: 'add-note',
  a: 'focus-quick-add',
  '/': 'focus-search',
  '?': 'show-help'
}

/**
 * `pendingPrefix` is `'g'` when the previous `matchShortcut` call returned
 * `null` for a bare `g` — the caller (`useStandupShortcuts`) is responsible
 * for holding that state across two key events and clearing it after a
 * `consumesPrefix: true` result or a timeout.
 */
export function matchShortcut(
  event: ShortcutEvent,
  pendingPrefix: 'g' | null
): { action: StandupShortcutAction; consumesPrefix: boolean } | null {
  if (pendingPrefix === 'g') {
    return event.key === 's' ? { action: 'go-to-schedule', consumesPrefix: true } : null
  }

  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    return { action: 'attempt-complete', consumesPrefix: false }
  }

  if (event.ctrlKey || event.metaKey) return null

  if (event.key === 'g') return null // starts a prefix; caller tracks it, nothing fires yet

  const panel = PANEL_KEYS[event.key]
  if (panel) return { action: panel, consumesPrefix: false }

  const simple = SIMPLE_KEYS[event.key]
  if (simple) return { action: simple, consumesPrefix: false }

  return null
}
