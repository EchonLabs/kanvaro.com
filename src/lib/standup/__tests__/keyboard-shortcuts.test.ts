import { matchShortcut } from '../keyboard-shortcuts'

const evt = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods
})

describe('matchShortcut', () => {
  it.each([
    ['1', 'jump-panel-1'],
    ['7', 'jump-panel-7'],
    ['j', 'next-row'],
    ['k', 'prev-row'],
    ['d', 'mark-done'],
    ['r', 'revise-estimate'],
    ['n', 'add-note'],
    ['a', 'focus-quick-add'],
    ['/', 'focus-search'],
    ['?', 'show-help']
  ])('maps %s to %s', (key, action) => {
    expect(matchShortcut(evt(key), null)?.action).toBe(action)
  })

  it('maps g then s to go-to-schedule across two events', () => {
    const first = matchShortcut(evt('g'), null)
    expect(first).toBeNull() // 'g' alone starts a prefix, no action yet — caller tracks pendingPrefix
    const second = matchShortcut(evt('s'), 'g')
    expect(second?.action).toBe('go-to-schedule')
    expect(second?.consumesPrefix).toBe(true)
  })

  it('maps Ctrl+Enter and Cmd+Enter to attempt-complete', () => {
    expect(matchShortcut(evt('Enter', { ctrlKey: true }), null)?.action).toBe('attempt-complete')
    expect(matchShortcut(evt('Enter', { metaKey: true }), null)?.action).toBe('attempt-complete')
  })

  it('returns null for an unmapped key', () => {
    expect(matchShortcut(evt('x'), null)).toBeNull()
  })
})
