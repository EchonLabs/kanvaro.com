/**
 * @jest-environment jsdom
 */
/**
 * `?joinPoker=<id>` opens the round once when it is still open, and is always
 * stripped once the page has loaded — including when the round has ended.
 */
import { renderHook } from '@testing-library/react'

import { useAutoJoinPoker } from '../useAutoJoinPoker'

const at = (search: string) => window.history.replaceState(null, '', `/sprints/sp1/planning${search}`)

describe('useAutoJoinPoker', () => {
  afterEach(() => at(''))

  it('joins the open round once and strips the param', () => {
    at('?joinPoker=s1&tab=scope')
    const join = jest.fn()

    const { rerender } = renderHook(({ ready }) => useAutoJoinPoker('s1', ready, join), {
      initialProps: { ready: true }
    })
    rerender({ ready: false })
    rerender({ ready: true })

    expect(join).toHaveBeenCalledTimes(1)
    expect(window.location.search).toBe('?tab=scope')
  })

  it('strips the param without joining when the round has ended', () => {
    at('?joinPoker=s1')
    const join = jest.fn()

    renderHook(() => useAutoJoinPoker(null, true, join))

    expect(join).not.toHaveBeenCalled()
    expect(window.location.search).toBe('')
  })

  it('strips the param without joining when a different round is open', () => {
    at('?joinPoker=old')
    const join = jest.fn()

    renderHook(() => useAutoJoinPoker('s2', true, join))

    expect(join).not.toHaveBeenCalled()
    expect(window.location.search).toBe('')
  })

  it('keeps the param until the page is ready', () => {
    at('?joinPoker=s1')
    const join = jest.fn()

    const { rerender } = renderHook(
      ({ id, ready }: { id: string | null; ready: boolean }) => useAutoJoinPoker(id, ready, join),
      { initialProps: { id: null as string | null, ready: false } }
    )
    expect(window.location.search).toBe('?joinPoker=s1')

    rerender({ id: 's1', ready: true })
    expect(join).toHaveBeenCalledTimes(1)
    expect(window.location.search).toBe('')
  })
})
