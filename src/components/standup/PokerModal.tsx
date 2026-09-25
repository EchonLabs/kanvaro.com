'use client'

/**
 * Planning poker (spec §15.6, PLN-11).
 *
 * Before the reveal this component **has never been sent a card value** — the
 * vote endpoint returns counts and voter ids only. That is deliberate: hiding
 * votes in the client would still ship them to every participant's browser,
 * where the network tab makes "hidden" meaningless.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Eye, Loader2, RotateCcw } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { PokerCardCarousel } from '@/components/standup/poker/PokerCardCarousel'
import { useNotify } from '@/lib/notify'
import { resolveVisibleTask } from '@/lib/standup/poker'
import { cn } from '@/lib/utils'

/** How often an open modal re-reads the session. */
const POLL_INTERVAL_MS = 4000

interface QueueEntry {
  taskId: string
  key: string
  title: string
  status: string
  /**
   * Who the task is assigned to, resolved by the workspace and passed down.
   *
   * The round needs it because the same task is a different size for
   * different people: an intern asking for more than a senior would is a
   * legitimate estimate, not an outlier, and the room can only see that if it
   * knows whose work is being sized.
   */
  assigneeName?: string
}

interface RevealedVote {
  voterId: string | null
  voterName: string | null
  card: string | number
  value: number | null
  isOutlier: boolean
}

interface RevealState {
  round?: number
  spread: number | null
  min: number | null
  max: number | null
  median: number | null
  unanimous: boolean
  suggestedValue: number | null
  abstainCount: number
  votes: RevealedVote[]
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionId: string
  cards: Array<string | number>
  queue: QueueEntry[]
  currentTaskId?: string
  isFacilitator: boolean
  /**
   * Whether the current user is on this round's participant list. Someone who
   * isn't — including a facilitator who deliberately left themselves off it
   * (PLN-11) — gets a read-only view: no card grid, no ability to vote.
   */
  isParticipant: boolean
  pointsToHours: number
  estimationUnit: 'story_points' | 'hours'
  /** Refetches the planning screen once an estimate lands. */
  onEstimated: () => void
}

export function PokerModal({
  open,
  onOpenChange,
  sessionId,
  cards,
  queue,
  currentTaskId,
  isFacilitator,
  isParticipant,
  pointsToHours,
  estimationUnit,
  onEstimated
}: Props) {
  const notify = useNotify()
  const [taskId, setTaskId] = useState(currentTaskId ?? queue[0]?.taskId)
  const [selected, setSelected] = useState<string | number | null>(null)
  // The card the fan is currently browsed to but hasn't been confirmed yet.
  // `null` means "nothing picked since the last confirm/task change" — see
  // `effectiveCandidate` below, which falls back to `selected` in that case.
  const [candidate, setCandidate] = useState<string | number | null>(null)
  // Back/Next paging is a local, read-only preview of another queued task —
  // it never touches which task is authoritatively "current" server side.
  // `null` means "show the live task."
  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ voted: number; expected: number } | null>(null)
  const [reveal, setReveal] = useState<RevealState | null>(null)
  const [finalValue, setFinalValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [serverCurrentTask, setServerCurrentTask] = useState<string | null>(null)
  const [liveQueue, setLiveQueue] = useState<{ taskId: string; status: string }[]>([])
  const [sessionClosed, setSessionClosed] = useState(false)
  // A facilitator who never votes has no vote() response to trigger auto-reveal
  // from — the poll below does it instead. This guards against calling reveal
  // twice for the same round once every poller notices it is ready.
  const autoRevealedForRef = useRef<string | null>(null)

  const task = queue.find((entry) => entry.taskId === taskId)
  const position = queue.findIndex((entry) => entry.taskId === taskId) + 1
  // Falls back to the already-cast vote when nothing new has been browsed to
  // yet, so reopening on an already-voted task shows the existing pick.
  const effectiveCandidate = candidate ?? selected

  // What the "Task X of Y" header and Back/Next arrows show. This is
  // deliberately separate from `task`/`taskId` above: those stay tied to the
  // live task and keep driving voting, polling, and the reveal panel exactly
  // as before. Paging with Back/Next only ever changes `previewTaskId`.
  const isPreviewingOtherTask = previewTaskId !== null && previewTaskId !== taskId
  const displayTaskId = previewTaskId ?? taskId
  const displayTask = queue.find((entry) => entry.taskId === displayTaskId)
  const displayPosition = queue.findIndex((entry) => entry.taskId === displayTaskId) + 1

  const goToPreview = (direction: 'prev' | 'next') => {
    const baseIndex = queue.findIndex((entry) => entry.taskId === displayTaskId)
    const nextIndex = direction === 'prev' ? baseIndex - 1 : baseIndex + 1
    if (nextIndex < 0 || nextIndex >= queue.length) return
    const nextId = queue[nextIndex].taskId
    setPreviewTaskId(nextId === taskId ? null : nextId)
  }

  // Moving to a new task resets everything — a card left selected from the
  // previous round would be cast by accident.
  useEffect(() => {
    setSelected(null)
    setCandidate(null)
    setReveal(null)
    setProgress(null)
    setFinalValue('')
  }, [taskId])

  // A Back/Next preview is only ever meaningful relative to the live task at
  // the moment it was opened — if the facilitator advances the round (or
  // `resolveVisibleTask`'s fallback moves `taskId` for any other reason)
  // while someone is mid-preview, drop the preview rather than try to keep it
  // pointed at a queue position that may no longer make sense.
  useEffect(() => {
    setPreviewTaskId(null)
  }, [taskId])

  // The facilitator advances the queue, but only their own finalize response
  // carries `nextTaskId`. Everyone else learns about the move by re-reading the
  // session — without this a voter sits on a task that has already been
  // estimated and every card they click is refused. Polling rather than a live
  // channel is deliberate: plan v3 descopes presence (RUN-24) and keeps polling.
  useEffect(() => {
    if (!open) return

    let cancelled = false

    const sync = async () => {
      try {
        const response = await fetch(`/api/poker-sessions/${sessionId}`)
        if (!response.ok) return

        const payload = await response.json()
        const session = payload?.data?.session
        if (cancelled || !session) return

        setLiveQueue(
          (session.queue ?? []).map((entry: any) => ({
            taskId: String(entry.task),
            status: entry.status
          }))
        )
        setServerCurrentTask(session.currentTask ?? null)
        setSessionClosed(session.status !== 'open')

        // A non-facilitator's local `reveal` state never gets set by the
        // reveal POST (that response only reaches the facilitator's own
        // request) — poll the read-only reveal-state endpoint for whichever
        // task is actually on screen (the local `taskId`, resolved through
        // `resolveVisibleTask`'s own fallback logic) so every voter sees the
        // same spread. Fetching for a separately-computed id (the old
        // `session.currentTask ?? currentTaskId`) could disagree with what
        // `resolveVisibleTask`'s fallback branch put on screen when
        // `currentTask` is null or not in the client's queue (Important 3).
        if (taskId) {
          const revealResponse = await fetch(
            `/api/poker-sessions/${sessionId}/tasks/${taskId}/reveal-state`
          )
          if (revealResponse.ok) {
            const revealPayload = await revealResponse.json()
            // Replace, never merely set-if-null: a re-vote (`finalize({
            // revote: true })`) puts the same task back into `voting` without
            // changing `taskId`, so `revealed: false` (or a new `round`) must
            // clear/replace a stale spread — otherwise a non-facilitator voter
            // is stuck looking at round 1's reveal forever, with the card grid
            // (rendered under `!reveal`) never coming back (Critical 2).
            if (revealPayload?.data?.revealed) {
              setReveal((current) =>
                current && current.round === revealPayload.data.round ? current : revealPayload.data
              )
            } else {
              setReveal((current) => (current === null ? current : null))
            }
          }
        }

        // A facilitator who opted out of voting (PLN-11) never calls vote()
        // themselves, so they need the poll to learn how many have voted —
        // without it their "Reveal" control never appears at all.
        if (session.progress) {
          const { voted, expected, round } = session.progress
          setProgress((current) =>
            current && current.voted === voted && current.expected === expected
              ? current
              : { voted, expected }
          )

          const revealKey = `${taskId}:${round}`
          if (
            voted >= expected &&
            expected > 0 &&
            isFacilitator &&
            session.autoRevealOnAllVoted &&
            autoRevealedForRef.current !== revealKey
          ) {
            autoRevealedForRef.current = revealKey
            await doReveal()
          }
        }
      } catch {
        /* A dropped poll is not worth a toast; the next one recovers. */
      }
    }

    sync()
    const interval = setInterval(sync, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
    // `taskId` is included (Important 3) so the reveal-state fetch always
    // targets the task actually on screen, including after
    // `resolveVisibleTask`'s fallback branch changes it out from under a
    // stale `currentTaskId` prop.
  }, [open, sessionId, taskId])

  // One rule decides what is on screen, for the facilitator and voters alike.
  useEffect(() => {
    const next = resolveVisibleTask({
      serverCurrentTask: serverCurrentTask ?? currentTaskId ?? null,
      queue: liveQueue.length ? liveQueue : queue,
      showing: taskId
    })

    if (next && next !== taskId) setTaskId(next)
    if (!next && sessionClosed) onOpenChange(false)
  }, [serverCurrentTask, liveQueue, queue, currentTaskId, taskId, sessionClosed, onOpenChange])

  const post = useCallback(
    async (path: string, body?: unknown) => {
      const response = await fetch(
        `/api/poker-sessions/${sessionId}/tasks/${taskId}/${path}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body ?? {})
        }
      )
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error?.message ?? 'Something went wrong')
      return payload.data
    },
    [sessionId, taskId]
  )

  const vote = async (card: string | number) => {
    setSelected(card)
    setBusy(true)
    try {
      const data = await post('vote', { card })
      setCandidate(null)
      setProgress({ voted: data.voted, expected: data.expected })
      if (data.readyToReveal && data.autoReveal && isFacilitator) await doReveal()
    } catch (error) {
      setSelected(null)
      notify.error({
        title: 'Could not cast your vote',
        message: error instanceof Error ? error.message : undefined
      })
    } finally {
      setBusy(false)
    }
  }

  const doReveal = async () => {
    setBusy(true)
    try {
      const data = await post('reveal')
      setReveal(data)
      if (data.suggestedValue != null) setFinalValue(String(data.suggestedValue))
    } catch (error) {
      notify.error({
        title: 'Could not reveal the votes',
        message: error instanceof Error ? error.message : undefined
      })
    } finally {
      setBusy(false)
    }
  }

  const revote = async () => {
    setBusy(true)
    try {
      await post('finalize', { revote: true })
      setReveal(null)
      setSelected(null)
      setProgress(null)
    } finally {
      setBusy(false)
    }
  }

  const setEstimate = async () => {
    const value = Number(finalValue)
    if (!Number.isFinite(value) || value <= 0) return

    setBusy(true)
    try {
      const data = await post('finalize', { finalValue: value })
      notify.success({ title: `${task?.key ?? 'Task'} estimated` })
      onEstimated()

      if (data.nextTaskId) setTaskId(data.nextTaskId)
      else onOpenChange(false)
    } catch (error) {
      notify.error({
        title: 'Could not set the estimate',
        message: error instanceof Error ? error.message : undefined
      })
    } finally {
      setBusy(false)
    }
  }

  const derivedHours =
    estimationUnit === 'story_points' ? Number(finalValue) * pointsToHours : Number(finalValue)

  // The quick-pick row only offers numeric deck values — '?' and 'coffee'
  // aren't estimates, so they'd have nothing sensible to fill into the input.
  const numericCards = cards.filter((card): card is number => typeof card === 'number')

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Let's Poker-Through it!"
      description={task ? `${task.key} — ${task.title}` : 'No task selected'}
      className="sm:max-w-2xl lg:max-w-5xl"
      headerClassName="text-center"
      dismissible={false}
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            aria-label="Previous task"
            onClick={() => goToPreview('prev')}
            disabled={displayPosition <= 1}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          </Button>
          <p className="text-[12px] text-[var(--apple-tertiary-label)]">
            Task {displayPosition} of {queue.length}
            {isPreviewingOtherTask && ' (preview)'}
          </p>
          <Button
            variant="outline"
            size="sm"
            aria-label="Next task"
            onClick={() => goToPreview('next')}
            disabled={displayPosition >= queue.length}
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </div>

        {displayTask?.assigneeName ? (
          <p className="text-[13px] text-[var(--apple-secondary-label)]">
            Assigned to {displayTask.assigneeName}
          </p>
        ) : null}

        {isPreviewingOtherTask ? (
          // Back/Next is a read-only preview — it never changes which task is
          // authoritatively "current," so voting stays off while browsing.
          <div className="rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] px-3 py-4 text-center">
            <p className="text-[13px] text-[var(--apple-secondary-label)]">
              {displayTask ? `${displayTask.key} — ${displayTask.title}` : 'Task not found'}
            </p>
            <p className="mt-1 text-[12px] text-[var(--apple-tertiary-label)]">
              Status: {displayTask?.status ?? 'unknown'}
            </p>
            <p className="mt-3 text-[12px] text-[var(--apple-tertiary-label)]">
              This is a preview — voting happens on the current task.
            </p>
          </div>
        ) : (
          <>
            {/* --- Voting -------------------------------------------------- */}
            {!reveal && (
              <div className="space-y-3">
                {isParticipant ? (
                  <>
                    <Label>Your card</Label>
                    <PokerCardCarousel
                      cards={cards}
                      selected={selected}
                      disabled={busy}
                      onPick={setCandidate}
                    />
                    <div className="flex justify-center">
                      <Button
                        onClick={() => vote(effectiveCandidate!)}
                        disabled={busy || effectiveCandidate == null || effectiveCandidate === selected}
                      >
                        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {selected != null ? 'Update vote' : 'Confirm'}
                      </Button>
                    </div>
                  </>
                ) : (
                  // Anyone not on the participant list — including a facilitator
                  // who opted out of voting — gets a read-only view: no card grid,
                  // no way to cast a vote the server would refuse anyway.
                  <p className="text-[13px] text-[var(--apple-tertiary-label)]">
                    {isFacilitator
                      ? "You're facilitating this round without voting yourself."
                      : 'You are not part of this vote. Watching the round.'}
                  </p>
                )}

                {progress && (isParticipant || isFacilitator) && (
                  <div className="flex items-center justify-between rounded-[var(--apple-radius-sm)] bg-[var(--apple-tertiary-fill)] px-3 py-2">
                    <span className="text-[13px] text-[var(--apple-label)]">
                      Voted {progress.voted} of {progress.expected}
                    </span>
                    {isFacilitator && (
                      <Button size="sm" onClick={doReveal} disabled={busy || progress.voted === 0}>
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                        Reveal
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* --- After the reveal ---------------------------------------- */}
            {reveal && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Votes</Label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {reveal.votes.map((entry, index) => (
                      <div
                        key={`${entry.voterId ?? 'anon'}-${index}`}
                        className={cn(
                          'rounded-[var(--apple-radius-md)] border px-3 py-2.5 text-center',
                          entry.isOutlier
                            ? 'border-[var(--apple-system-orange)] bg-[var(--apple-system-orange)]/10'
                            : 'border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)]'
                        )}
                      >
                        <p className="font-apple-mono text-[19px] font-semibold text-[var(--apple-label)]">
                          {entry.card}
                        </p>
                        <p className="mt-0.5 truncate text-[12px] text-[var(--apple-secondary-label)]">
                          {entry.voterName ?? 'Anonymous'}
                        </p>
                        {entry.isOutlier && (
                          <Badge variant="outline" className="mt-1 text-[10px]">
                            outlier
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ['min', 'Min', reveal.min],
                      ['median', 'Median', reveal.median],
                      ['max', 'Max', reveal.max]
                    ] as const
                  ).map(([key, label, value]) => (
                    <div
                      key={key}
                      data-testid={`poker-stat-${key}`}
                      className="rounded-[var(--apple-radius-sm)] bg-[var(--apple-tertiary-fill)] py-2 text-center"
                    >
                      <p className="font-apple-mono text-[17px] font-semibold tabular-nums text-[var(--apple-label)]">
                        {value ?? '—'}
                      </p>
                      <p className="text-[11px] uppercase tracking-[0.06em] text-[var(--apple-tertiary-label)]">
                        {label}
                      </p>
                    </div>
                  ))}
                </div>

                <p className="text-[13px] text-[var(--apple-secondary-label)]">
                  {reveal.unanimous
                    ? 'Everyone agreed.'
                    : `Spread ${reveal.min} to ${reveal.max}. Discuss the outliers.`}
                  {reveal.abstainCount > 0 && ` ${reveal.abstainCount} did not vote a number.`}
                </p>

                {isFacilitator ? (
                  <div className="space-y-3 border-t border-[var(--apple-separator)] pt-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="poker-final">Final estimate</Label>
                      {numericCards.length > 0 && (
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick-pick estimate">
                          {numericCards.map((card) => {
                            const isActive = finalValue === String(card)
                            return (
                              <button
                                key={card}
                                type="button"
                                aria-pressed={isActive}
                                onClick={() => setFinalValue(String(card))}
                                className={cn(
                                  'apple-transition font-apple-mono rounded-full border px-3 py-1 text-[13px] tabular-nums',
                                  isActive
                                    ? 'border-[var(--apple-system-blue)] bg-[var(--apple-system-blue)]/10 text-[var(--apple-system-blue)]'
                                    : 'border-[var(--apple-separator)] text-[var(--apple-label)] hover:bg-[var(--apple-quaternary-fill)]'
                                )}
                              >
                                {card}
                              </button>
                            )
                          })}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Input
                          id="poker-final"
                          type="number"
                          min="0.25"
                          step="0.25"
                          value={finalValue}
                          onChange={(event) => setFinalValue(event.target.value)}
                          className="w-[110px]"
                        />
                        {/* Shown so the team sees the real hours, per §15.6. */}
                        {Number.isFinite(derivedHours) && derivedHours > 0 && (
                          <span className="font-apple-mono text-[13px] text-[var(--apple-secondary-label)]">
                            = {derivedHours.toFixed(1)}h
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={revote} disabled={busy}>
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        Revote
                      </Button>
                      <Button onClick={setEstimate} disabled={busy || !finalValue}>
                        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Set estimate
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px] text-[var(--apple-tertiary-label)]">
                    Waiting for the facilitator to set the estimate.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </ResponsiveDialog>
  )
}
