import {
  schedulerIsEnabled,
  startScheduler,
  stopScheduler,
  TICK_INTERVAL_MS
} from '@/lib/standup/jobs/scheduler'

/**
 * The real `connectDB` opens a socket and does not cooperate with fake timers,
 * so every test that starts the scheduler injects a stub. A test that forgets
 * hangs rather than fails, which is why this is a named helper.
 */
const noopConnect = () => jest.fn().mockResolvedValue(undefined)

describe('scheduler', () => {
  const original = process.env.KANVARO_INTERNAL_SCHEDULER

  afterEach(() => {
    stopScheduler()
    jest.useRealTimers()
    if (original === undefined) delete process.env.KANVARO_INTERNAL_SCHEDULER
    else process.env.KANVARO_INTERNAL_SCHEDULER = original
  })

  it('is enabled when the variable is unset — an upgrade needs no env change', () => {
    delete process.env.KANVARO_INTERNAL_SCHEDULER

    expect(schedulerIsEnabled()).toBe(true)
  })

  it('is disabled only by an explicit "false"', () => {
    process.env.KANVARO_INTERNAL_SCHEDULER = 'false'
    expect(schedulerIsEnabled()).toBe(false)

    process.env.KANVARO_INTERNAL_SCHEDULER = 'true'
    expect(schedulerIsEnabled()).toBe(true)
  })

  it('runs every job on each tick', async () => {
    jest.useFakeTimers()
    const run = jest.fn().mockResolvedValue(null)
    const recordTick = jest.fn().mockResolvedValue(undefined)

    startScheduler({ run, connect: noopConnect(), recordTick })
    await jest.advanceTimersByTimeAsync(TICK_INTERVAL_MS)

    expect(run).toHaveBeenCalledWith('promote-to-ready')
    expect(run).toHaveBeenCalledWith('mark-missed')
  })

  it('starts only one ticker however many times it is called', async () => {
    jest.useFakeTimers()
    const run = jest.fn().mockResolvedValue(null)
    const recordTick = jest.fn().mockResolvedValue(undefined)
    const connect = noopConnect()

    startScheduler({ run, connect, recordTick })
    startScheduler({ run, connect, recordTick })
    await jest.advanceTimersByTimeAsync(TICK_INTERVAL_MS)

    expect(run).toHaveBeenCalledTimes(7)
  })

  it('keeps ticking after a job throws', async () => {
    jest.useFakeTimers()
    const run = jest
      .fn()
      .mockRejectedValueOnce(new Error('first job exploded'))
      .mockResolvedValue(null)

    startScheduler({ run, connect: noopConnect(), recordTick: jest.fn().mockResolvedValue(undefined) })
    await jest.advanceTimersByTimeAsync(TICK_INTERVAL_MS * 2)

    expect(run.mock.calls.length).toBeGreaterThan(7)
  })

  /**
   * The regression guard for the false-alarm bug: with no jobs registered every
   * run returns null, and the tick must still record that it happened or
   * SCHEDULER_STALE fires on a healthy scheduler.
   */
  it('records the tick even when every job is a no-op', async () => {
    jest.useFakeTimers()
    const run = jest.fn().mockResolvedValue(null)
    const recordTick = jest.fn().mockResolvedValue(undefined)
    const connect = noopConnect()

    startScheduler({ run, connect, recordTick })
    await jest.advanceTimersByTimeAsync(TICK_INTERVAL_MS)

    expect(recordTick).toHaveBeenCalledTimes(1)
    expect(recordTick).toHaveBeenCalledWith(
      expect.objectContaining({ jobsRun: 0, errorCount: 0 })
    )
  })

  /**
   * The ticker is not a request, so nothing else calls connectDB() for it. Before
   * this, every write from a tick sat in mongoose's command buffer forever —
   * silently, with no error logged — which would have broken every real job in
   * Phase 5 while the scheduler looked healthy.
   */
  it('connects to the database before running any job', async () => {
    jest.useFakeTimers()
    const order: string[] = []
    const connect = jest.fn(async () => {
      order.push('connect')
    })
    const run = jest.fn(async () => {
      order.push('run')
      return null
    })

    startScheduler({ run, connect, recordTick: jest.fn().mockResolvedValue(undefined) })
    await jest.advanceTimersByTimeAsync(TICK_INTERVAL_MS)

    expect(connect).toHaveBeenCalled()
    expect(order[0]).toBe('connect')
  })

  it('skips the tick entirely when the database is unavailable', async () => {
    jest.useFakeTimers()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    const run = jest.fn().mockResolvedValue(null)
    const recordTick = jest.fn().mockResolvedValue(undefined)
    const connect = jest.fn().mockRejectedValue(new Error('no database configured'))

    startScheduler({ run, connect, recordTick })
    await jest.advanceTimersByTimeAsync(TICK_INTERVAL_MS)

    expect(run).not.toHaveBeenCalled()
    // No heartbeat, so SCHEDULER_STALE fires — the correct signal for a
    // scheduler that genuinely cannot do its work.
    expect(recordTick).not.toHaveBeenCalled()
  })

  it('does not start an overlapping tick while one is still running', async () => {
    jest.useFakeTimers()
    let release: (() => void) | undefined
    const connect = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        })
    )
    const run = jest.fn().mockResolvedValue(null)

    startScheduler({ run, connect, recordTick: jest.fn().mockResolvedValue(undefined) })
    await jest.advanceTimersByTimeAsync(TICK_INTERVAL_MS * 3)

    // Three intervals elapsed but the first tick never finished connecting.
    expect(connect).toHaveBeenCalledTimes(1)
    release?.()
  })

  it('counts jobs that actually ran, and failures, on the tick record', async () => {
    jest.useFakeTimers()
    const run = jest
      .fn()
      .mockResolvedValueOnce({ job: 'promote-to-ready' })
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(null)
    const recordTick = jest.fn().mockResolvedValue(undefined)
    const connect = noopConnect()

    startScheduler({ run, connect, recordTick })
    await jest.advanceTimersByTimeAsync(TICK_INTERVAL_MS)

    expect(recordTick).toHaveBeenCalledWith(
      expect.objectContaining({ jobsRun: 1, errorCount: 1 })
    )
  })
})
