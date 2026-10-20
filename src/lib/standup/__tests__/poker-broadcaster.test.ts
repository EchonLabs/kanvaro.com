/**
 * Session-scoped poker SSE fan-out (`src/lib/poker-broadcaster.ts`) and the
 * user-level invite events added to `notification-broadcaster.ts`.
 *
 * The messages are invalidation signals only — nothing here may carry a card
 * value (PLN-11) — and a broken connection must never throw into the route that
 * triggered the broadcast.
 */
import {
  broadcastPokerChange,
  closePokerSession,
  getPokerConnectionCount,
  registerPokerConnection,
  unregisterPokerConnection
} from '@/lib/poker-broadcaster'
import {
  broadcastUserEvent,
  hasActiveConnection,
  registerConnection,
  unregisterConnection
} from '@/lib/notification-broadcaster'

function fakeController(options: { throwsOnEnqueue?: boolean } = {}) {
  const chunks: string[] = []
  const decoder = new TextDecoder()
  return {
    chunks,
    closed: false,
    enqueue(chunk: Uint8Array) {
      if (options.throwsOnEnqueue) throw new Error('stream closed')
      chunks.push(decoder.decode(chunk))
    },
    close() {
      this.closed = true
    }
  } as any
}

function messages(controller: any) {
  return controller.chunks.map((chunk: string) => JSON.parse(chunk.replace(/^data: /, '').trim()))
}

describe('poker broadcaster', () => {
  afterEach(() => {
    closePokerSession('s1')
    closePokerSession('s2')
  })

  it('delivers a change signal only to connections on that session', () => {
    const a = fakeController()
    const b = fakeController()
    const other = fakeController()
    registerPokerConnection('s1', a)
    registerPokerConnection('s1', b)
    registerPokerConnection('s2', other)

    const sent = broadcastPokerChange('s1', { reason: 'vote', taskId: 't1', round: 2 })

    expect(sent).toBe(2)
    expect(messages(a)[0]).toMatchObject({ type: 'poker_changed', reason: 'vote', taskId: 't1', round: 2 })
    expect(messages(b)).toHaveLength(1)
    expect(other.chunks).toHaveLength(0)
  })

  it('never puts a card value on the wire', () => {
    const a = fakeController()
    registerPokerConnection('s1', a)
    broadcastPokerChange('s1', { reason: 'reveal', taskId: 't1', round: 1 })

    expect(Object.keys(messages(a)[0]).sort()).toEqual(['reason', 'round', 'taskId', 'timestamp', 'type'])
  })

  it('prunes a dead connection without throwing and still serves the live ones', () => {
    const dead = fakeController({ throwsOnEnqueue: true })
    const live = fakeController()
    registerPokerConnection('s1', dead)
    registerPokerConnection('s1', live)

    expect(() => broadcastPokerChange('s1', { reason: 'vote' })).not.toThrow()
    expect(getPokerConnectionCount('s1')).toBe(1)
    expect(live.chunks).toHaveLength(1)
  })

  it('is a no-op for a session nobody is watching', () => {
    expect(broadcastPokerChange('nobody', { reason: 'vote' })).toBe(0)
  })

  it('unregister drops the session entry once empty', () => {
    const a = fakeController()
    registerPokerConnection('s1', a)
    unregisterPokerConnection('s1', a)
    expect(getPokerConnectionCount('s1')).toBe(0)
  })

  it('closePokerSession tells watchers the round is over, then closes their streams', () => {
    const a = fakeController()
    registerPokerConnection('s1', a)

    closePokerSession('s1')

    expect(messages(a).map((message: any) => message.type)).toEqual(['session_closed'])
    expect(a.closed).toBe(true)
    expect(getPokerConnectionCount('s1')).toBe(0)
  })
})

describe('broadcastUserEvent (poker invite / close)', () => {
  it('reaches every tab of the listed users and skips users who are offline', () => {
    const tabOne = fakeController()
    const tabTwo = fakeController()
    registerConnection('voter-1', tabOne)
    registerConnection('voter-1', tabTwo)

    const delivered = broadcastUserEvent(['voter-1', 'offline-voter'], 'poker_invite', {
      sessionId: 's1',
      sprintId: 'sp1',
      sprintName: 'Sprint 7'
    })

    expect(delivered).toBe(1)
    expect(messages(tabOne)[0]).toMatchObject({
      type: 'poker_invite',
      data: { sessionId: 's1', sprintId: 'sp1', sprintName: 'Sprint 7' }
    })
    expect(messages(tabTwo)).toHaveLength(1)
    expect(hasActiveConnection('offline-voter')).toBe(false)

    unregisterConnection('voter-1', tabOne)
    unregisterConnection('voter-1', tabTwo)
  })

  it('does not throw when a connection is broken', () => {
    const dead = fakeController({ throwsOnEnqueue: true })
    registerConnection('voter-2', dead)

    expect(() => broadcastUserEvent(['voter-2'], 'poker_closed', { sessionId: 's1' })).not.toThrow()
    expect(hasActiveConnection('voter-2')).toBe(false)
  })
})
