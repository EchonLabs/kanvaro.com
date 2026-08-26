'use client'

/**
 * Planning poker (spec §15.6, PLN-11).
 *
 * Before the reveal this component **has never been sent a card value** — the
 * vote endpoint returns counts and voter ids only. That is deliberate: hiding
 * votes in the client would still ship them to every participant's browser,
 * where the network tab makes "hidden" meaningless.
 */
import { useCallback, useEffect, useState } from 'react'
import { Coffee, Eye, HelpCircle, Loader2, RotateCcw } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
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
}

interface RevealedVote {
  voterId: string | null
  voterName: string | null
  card: string | number
  value: number | null
  isOutlier: boolean
}

interface RevealState {
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
  pointsToHours,
  estimationUnit,
  onEstimated
}: Props) {
  const notify = useNotify()
  const [taskId, setTaskId] = useState(currentTaskId ?? queue[0]?.taskId)
  const [selected, setSelected] = useState<string | number | null>(null)
  const [progress, setProgress] = useState<{ voted: number; expected: number } | null>(null)
  const [reveal, setReveal] = useState<RevealState | null>(null)
  const [finalValue, setFinalValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [serverCurrentTask, setServerCurrentTask] = useState<string | null>(null)
  const [liveQueue, setLiveQueue] = useState<{ taskId: string; status: string }[]>([])
  const [sessionClosed, setSessionClosed] = useState(false)

  const task = queue.find((entry) => entry.taskId === taskId)
  const position = queue.findIndex((entry) => entry.taskId === taskId) + 1

  // Moving to a new task resets everything — a card left selected from the
  // previous round would be cast by accident.
  useEffect(() => {
    setSelected(null)
    setReveal(null)
    setProgress(null)
    setFinalValue('')
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
  }, [open, sessionId])

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

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Planning poker"
      description={task ? `${task.key} — ${task.title}` : 'No task selected'}
    >
      <div className="space-y-5">
        <p className="text-[12px] text-[var(--apple-tertiary-label)]">
          Task {position} of {queue.length}
        </p>

        {/* --- Voting ------------------------------------------------------ */}
        {!reveal && (
          <div className="space-y-3">
            <Label>Your card</Label>
            <div className="flex flex-wrap gap-2">
              {cards.map((card) => (
                <button
                  key={String(card)}
                  type="button"
                  disabled={busy}
                  onClick={() => vote(card)}
                  aria-pressed={selected === card}
                  className={cn(
                    'apple-transition flex h-14 w-12 items-center justify-center rounded-[var(--apple-radius-md)] border text-[15px] font-medium',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--apple-system-blue)]',
                    selected === card
                      ? 'border-[var(--apple-system-blue)] bg-[var(--apple-system-blue)] text-white'
                      : 'border-[var(--apple-separator)] bg-card text-[var(--apple-label)] hover:border-[var(--apple-system-blue)]/50'
                  )}
                >
                  {card === '?' ? (
                    <HelpCircle className="h-5 w-5" />
                  ) : card === 'coffee' ? (
                    <Coffee className="h-5 w-5" />
                  ) : (
                    card
                  )}
                </button>
              ))}
            </div>

            <p className="text-[12px] text-[var(--apple-tertiary-label)]">
              <HelpCircle className="mr-1 inline h-3 w-3" />
              means you need more information. Neither it nor coffee counts towards the estimate.
            </p>

            {progress && (
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

        {/* --- After the reveal -------------------------------------------- */}
        {reveal && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Votes</Label>
              <div className="flex flex-wrap gap-2">
                {reveal.votes.map((entry, index) => (
                  <div
                    key={`${entry.voterId ?? 'anon'}-${index}`}
                    className={cn(
                      'rounded-[var(--apple-radius-sm)] border px-2.5 py-1.5 text-[13px]',
                      entry.isOutlier
                        ? 'border-[var(--apple-system-orange)] bg-[var(--apple-system-orange)]/10'
                        : 'border-[var(--apple-separator)]'
                    )}
                  >
                    <span className="font-apple-mono">{entry.card}</span>
                    {entry.voterName && (
                      <span className="ml-2 text-[var(--apple-secondary-label)]">
                        {entry.voterName}
                      </span>
                    )}
                    {entry.isOutlier && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        outlier
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
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
      </div>
    </ResponsiveDialog>
  )
}
