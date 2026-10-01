'use client'

/**
 * Planning poker (spec §15.6, PLN-11).
 *
 * Before the reveal this component **has never been sent a card value** — the
 * vote endpoint returns counts and voter ids only. That is deliberate: hiding
 * votes in the client would still ship them to every participant's browser,
 * where the network tab makes "hidden" meaningless. The roster panel names who
 * has cast and who the room is waiting on, which is the most the pre-reveal
 * data allows and the most the design asks for.
 *
 * Two screens live here, keyed off `reveal`: the voting table, and the
 * revealed spread with the facilitator's final-estimate controls.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Eye, FileText, Loader2, RotateCcw } from 'lucide-react'

import { PlanAvatar, PlanButton } from '@/components/standup/planning/ui'
import { PokerCard } from '@/components/standup/poker/PokerCard'
import { PokerCardCarousel } from '@/components/standup/poker/PokerCardCarousel'
import {
  PokerBadge,
  PokerDialogShell,
  PokerStat,
  PokerTaskNav,
  pokerPanelClass
} from '@/components/standup/poker/ui'
import { useNotify } from '@/lib/notify'
import {
  describeAgreement,
  resolveVisibleTask,
  type Agreement,
  type DeckType
} from '@/lib/standup/poker'
import { cn } from '@/lib/utils'

/** How often an open modal re-reads the session. */
const POLL_INTERVAL_MS = 4000

const DECK_LABELS: Record<DeckType, string> = {
  fibonacci: 'Fibonacci',
  modified_fibonacci: 'Modified Fibonacci',
  tshirt: 'T-shirt',
  hours: 'Hours',
  powers_of_two: 'Powers of two'
}

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

/**
 * A participant's identity, as the session endpoint reports it.
 *
 * Deliberately not resolved on the client: the participant list always
 * includes the facilitator, who is frequently a PM outside the project's
 * `teamMembers`, so matching ids against the roster the planning screen has
 * loaded left real voters showing as a placeholder name.
 */
export interface PokerRosterMember {
  memberId: string
  name: string
  firstName?: string
  lastName?: string
  email?: string
  avatar?: string
}

interface RevealedVote {
  voterId: string | null
  voterName: string | null
  firstName?: string
  lastName?: string
  email?: string
  avatar?: string
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
  /** Names the deck in the heading badge. */
  deckType?: DeckType
  /**
   * Seeds the roster before the first poll returns. The poll's own
   * `participantProfiles` replaces it as soon as one lands.
   */
  roster?: PokerRosterMember[]
  /** Marks the viewer's own row as "You". */
  currentUserId?: string
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
  deckType,
  roster,
  currentUserId,
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
  const [votedVoterIds, setVotedVoterIds] = useState<string[]>([])
  const [serverRoster, setServerRoster] = useState<PokerRosterMember[] | null>(null)
  // Titles and descriptions as the server reports them, keyed by task. The
  // `queue` prop is a snapshot taken when the round opened and can be missing
  // a task entirely; this is authoritative.
  const [taskDetails, setTaskDetails] = useState<
    Record<string, { title?: string | null; displayId?: string | null; description?: string | null }>
  >({})
  const [descriptionOpen, setDescriptionOpen] = useState(false)
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

  /**
   * A task's identity, preferring the server's copy over the opener's
   * snapshot. Without this a task the planning screen had not loaded into
   * scope shows as "— Task" for the whole round.
   */
  const detailsOf = (id: string | undefined, entry?: QueueEntry) => {
    const server = id ? taskDetails[id] : undefined
    const key = server?.displayId ?? entry?.key ?? ''
    const title = server?.title ?? (entry?.title && entry.title !== 'Task' ? entry.title : null)
    return {
      key,
      title: title ?? 'Untitled task',
      description: server?.description?.trim() || null,
      label: [key, title].filter(Boolean).join(' — ') || 'Untitled task'
    }
  }

  const displayDetails = detailsOf(displayTaskId, displayTask)

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
    setVotedVoterIds([])
    setFinalValue('')
  }, [taskId])

  // "The median is preselected as the final estimate" has to hold however the
  // reveal arrived. `doReveal()` seeds it from its own POST response, but that
  // response only reaches whoever called it — a facilitator who let
  // `autoRevealOnAllVoted` fire, or who reopened the modal on an
  // already-revealed task, learns about the reveal from the poll instead and
  // would otherwise be left with nothing picked and Set estimate disabled.
  useEffect(() => {
    if (!reveal) return
    const suggested = reveal.suggestedValue ?? reveal.median
    if (suggested != null) setFinalValue((current) => (current === '' ? String(suggested) : current))
  }, [reveal])

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

        const details: Record<
          string,
          { title?: string | null; displayId?: string | null; description?: string | null }
        > = {}
        for (const entry of session.queue ?? []) {
          details[String(entry.task)] = {
            title: entry.title,
            displayId: entry.displayId,
            description: entry.description
          }
        }
        setTaskDetails((current) => {
          const changed = Object.keys(details).some(
            (id) =>
              current[id]?.title !== details[id].title ||
              current[id]?.description !== details[id].description
          )
          return changed ? details : current
        })
        setServerCurrentTask(session.currentTask ?? null)
        setSessionClosed(session.status !== 'open')

        if (Array.isArray(session.participantProfiles)) {
          // Replaced only when it actually differs, so a four-second poll does
          // not re-render the roster on every tick.
          setServerRoster((current) =>
            current &&
            current.length === session.participantProfiles.length &&
            current.every(
              (member, index) => member.memberId === session.participantProfiles[index].memberId
            )
              ? current
              : session.participantProfiles
          )
        }

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
          const { voted, expected, round, votedVoterIds: castBy } = session.progress
          setProgress((current) =>
            current && current.voted === voted && current.expected === expected
              ? current
              : { voted, expected }
          )
          if (Array.isArray(castBy)) {
            setVotedVoterIds((current) =>
              current.length === castBy.length && castBy.every((id: string) => current.includes(id))
                ? current
                : castBy
            )
          }

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
      setVotedVoterIds([])
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

  /** Points become hours; hours are already hours. */
  const toHours = useCallback(
    (value: number) => (estimationUnit === 'story_points' ? value * pointsToHours : value),
    [estimationUnit, pointsToHours]
  )

  // The quick-pick row only offers numeric deck values — '?' and 'coffee'
  // aren't estimates, so they'd have nothing sensible to fill into the input.
  const numericCards = useMemo(
    () => cards.filter((card): card is number => typeof card === 'number'),
    [cards]
  )

  /**
   * The roster rows, in the design's order: the viewer first, then everyone
   * who has cast, then whoever the room is still waiting on.
   */
  const rosterRows = useMemo(() => {
    const cast = new Set(votedVoterIds)
    return (serverRoster ?? roster ?? [])
      .map((member) => ({
        ...member,
        isSelf: member.memberId === currentUserId,
        hasVoted: cast.has(member.memberId)
      }))
      .sort((a, b) => {
        if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1
        if (a.hasVoted !== b.hasVoted) return a.hasVoted ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  }, [serverRoster, roster, votedVoterIds, currentUserId])

  const waitingOn = rosterRows.filter((member) => !member.hasVoted)
  const votedCount = progress?.voted ?? votedVoterIds.length
  const expectedCount = progress?.expected ?? rosterRows.length
  const votedPercent = expectedCount > 0 ? Math.min(100, (votedCount / expectedCount) * 100) : 0

  const revealedValue = Number(finalValue)
  const hasRevealedValue = Number.isFinite(revealedValue) && revealedValue > 0
  const outlierNames = (reveal?.votes ?? [])
    .filter((entry) => entry.isOutlier)
    .map((entry) => entry.voterName ?? 'Someone')

  /**
   * What the votes actually say — measured in cards apart, not in arithmetic.
   *
   * `numericCount` is the count of votes that carried a number; `votes.length`
   * would include the `?` and `coffee` abstentions and so could call a round
   * with one real estimate a consensus.
   */
  const agreement: Agreement | null = reveal
    ? describeAgreement(deckType ?? 'fibonacci', {
        min: reveal.min,
        max: reveal.max,
        numericCount: reveal.votes.filter((entry) => entry.value !== null).length
      })
    : null

  const header = reveal
    ? {
        badge: <PokerBadge tone="accent">Revealed</PokerBadge>,
        description: 'Votes are revealed. Review the spread and set the final estimate.'
      }
    : {
        badge: <PokerBadge tone="accent">Live</PokerBadge>,
        description: 'Choose the effort this task needs. Votes stay private until reveal.'
      }

  return (
    <PokerDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Let's Poker-Through it!"
      badge={header.badge}
      description={header.description}
      dismissible={false}
      footer={
        reveal ? (
          <>
            <div className="flex min-w-0 flex-wrap items-center gap-2.5">
              {agreement && <PokerBadge tone={agreement.tone}>{agreement.label}</PokerBadge>}
              <span className="apple-type-footnote text-[var(--plan-muted)]">
                {isFacilitator
                  ? 'The median is preselected as the final estimate.'
                  : 'Waiting for the facilitator to set the estimate.'}
              </span>
            </div>
            {isFacilitator && (
              <div className="flex shrink-0 items-center gap-2.5">
                <PlanButton onClick={revote} disabled={busy}>
                  <RotateCcw />
                  Revote
                </PlanButton>
                <PlanButton tone="primary" onClick={setEstimate} disabled={busy || !hasRevealedValue}>
                  {busy ? <Loader2 className="animate-spin" /> : <Check />}
                  {hasRevealedValue ? `Set estimate · ${finalValue}` : 'Set estimate'}
                </PlanButton>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-center justify-between gap-4">
                <span className="apple-type-footnote font-semibold text-[var(--plan-text)]">
                  Voting progress
                </span>
                <span className="apple-type-footnote tabular-nums text-[var(--plan-muted)]">
                  {votedCount} of {expectedCount} voted
                </span>
              </div>
              <span
                role="progressbar"
                aria-label="Voting progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(votedPercent)}
                className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--plan-track)]"
              >
                <span
                  className="block h-full rounded-full bg-[var(--plan-accent)] transition-[width] duration-300"
                  style={{ width: `${votedPercent}%` }}
                />
              </span>
              <span className="apple-type-caption text-[var(--plan-muted)]">
                {waitingOn.length === 0
                  ? 'Everyone has voted.'
                  : waitingOn.length === 1
                    ? `Waiting for ${waitingOn[0].name} to choose a card`
                    : `Waiting for ${waitingOn.length} people to choose a card`}
              </span>
            </div>
            {isFacilitator && (
              <div className="flex shrink-0 flex-col items-end gap-1">
                <PlanButton onClick={doReveal} disabled={busy || votedCount === 0}>
                  <Eye />
                  Reveal cards
                </PlanButton>
                <span className="apple-type-caption text-[var(--plan-muted)]">Facilitator action</span>
              </div>
            )}
          </>
        )
      }
    >
      <PokerTaskNav
        position={displayPosition}
        total={queue.length}
        label={displayDetails.label}
        previewing={isPreviewingOtherTask}
        onPrevious={() => goToPreview('prev')}
        onNext={() => goToPreview('next')}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
        {displayTask?.assigneeName && !isPreviewingOtherTask && (
          <p className="apple-type-footnote mb-4 text-[var(--plan-muted)]">
            Assigned to {displayTask.assigneeName}
          </p>
        )}

        {isPreviewingOtherTask ? (
          // Back/Next is a read-only preview — it never changes which task is
          // authoritatively "current," so voting stays off while browsing.
          <div
            className={cn(
              pokerPanelClass,
              'flex flex-col items-center gap-2 px-4 py-10 text-center'
            )}
          >
            <p className="apple-type-body font-semibold text-[var(--plan-text)]">
              {displayTask ? `${displayTask.key} — ${displayTask.title}` : 'Task not found'}
            </p>
            <p className="apple-type-footnote text-[var(--plan-muted)]">
              Status: {displayTask?.status ?? 'unknown'}
            </p>
            <p className="apple-type-footnote text-[var(--plan-muted)]">
              This is a preview — voting happens on the current task.
            </p>
          </div>
        ) : reveal ? (
          <RevealScreen
            reveal={reveal}
            isFacilitator={isFacilitator}
            numericCards={numericCards}
            finalValue={finalValue}
            onPickFinal={setFinalValue}
            estimationUnit={estimationUnit}
            toHours={toHours}
            agreement={agreement}
            outlierNames={outlierNames}
            description={displayDetails.description}
            descriptionOpen={descriptionOpen}
            onToggleDescription={() => setDescriptionOpen((current) => !current)}
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.9fr)_minmax(260px,1fr)]">
            <section className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  {/* A watcher has no card of their own, so they are not
                      offered one — the heading has to say so too, not just
                      the missing arc below it. */}
                  <h3 className="apple-type-headline font-semibold text-[var(--plan-text)]">
                    {isParticipant ? 'Your card' : 'This round'}
                  </h3>
                  <p className="apple-type-footnote text-[var(--plan-muted)]">
                    {isParticipant
                      ? 'Drag the arc or click a card to change your vote'
                      : 'Votes stay hidden until the facilitator reveals them'}
                  </p>
                </div>
                {deckType && <PokerBadge dot={false}>{DECK_LABELS[deckType]}</PokerBadge>}
              </div>

              {isParticipant ? (
                <>
                  <PokerCardCarousel
                    cards={cards}
                    selected={selected}
                    disabled={busy}
                    onPick={setCandidate}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          'flex h-[42px] w-[42px] items-center justify-center rounded-[var(--apple-radius-sm)] border font-bold tabular-nums',
                          effectiveCandidate != null
                            ? 'border-[var(--plan-accent)] bg-[var(--plan-info-bg)] text-[var(--plan-accent)]'
                            : 'border-[var(--plan-border)] bg-[var(--plan-raised)] text-[var(--plan-muted)]'
                        )}
                      >
                        {effectiveCandidate != null ? String(effectiveCandidate) : '—'}
                      </span>
                      <div className="flex flex-col gap-0.5">
                        <span className="apple-type-footnote text-[var(--plan-muted)]">
                          Your estimate
                        </span>
                        <span className="apple-type-subheadline font-medium text-[var(--plan-text)]">
                          {typeof effectiveCandidate === 'number'
                            ? `≈ ${toHours(effectiveCandidate).toFixed(1).replace(/\.0$/, '')} hours`
                            : 'Not chosen yet'}
                        </span>
                      </div>
                    </div>
                    <PlanButton
                      tone="primary"
                      onClick={() => vote(effectiveCandidate!)}
                      disabled={busy || effectiveCandidate == null || effectiveCandidate === selected}
                    >
                      {busy ? <Loader2 className="animate-spin" /> : <Check />}
                      {selected != null ? 'Update vote' : 'Confirm'}
                    </PlanButton>
                  </div>
                </>
              ) : (
                // Anyone not on the participant list — including a facilitator
                // who opted out of voting — gets a read-only view: no card grid,
                // no way to cast a vote the server would refuse anyway.
                <div className={cn(pokerPanelClass, 'px-4 py-8 text-center')}>
                  <p className="apple-type-subheadline text-[var(--plan-muted)]">
                    {isFacilitator
                      ? "You're facilitating this round without voting yourself."
                      : 'You are not part of this vote. Watching the round.'}
                  </p>
                </div>
              )}

              <TaskDescription
                description={displayDetails.description}
                open={descriptionOpen}
                onToggle={() => setDescriptionOpen((current) => !current)}
              />
            </section>

            <RosterPanel
              rows={rosterRows}
              anonymousCount={rosterRows.length === 0 ? expectedCount : 0}
              votedCount={votedCount}
              selfHasSelection={selected != null}
            />
          </div>
        )}
      </div>
    </PokerDialogShell>
  )
}

/**
 * Who is at the table and where each of them has got to.
 *
 * Only ever renders cast/not-cast, never a card: the pre-reveal endpoints have
 * never sent this component a value, which is the whole point of PLN-11.
 */
function RosterPanel({
  rows,
  anonymousCount,
  votedCount,
  selfHasSelection
}: {
  rows: Array<PokerRosterMember & { isSelf: boolean; hasVoted: boolean }>
  /** Participants the server declined to name, because the round is anonymous. */
  anonymousCount: number
  votedCount: number
  selfHasSelection: boolean
}) {
  const total = rows.length || anonymousCount

  return (
    <aside className={cn(pokerPanelClass, 'flex min-w-0 flex-col gap-3.5 p-4')}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="apple-type-subheadline font-semibold text-[var(--plan-text)]">At the table</h3>
        <span className="apple-type-footnote tabular-nums text-[var(--plan-muted)]">
          {total} {total === 1 ? 'voter' : 'voters'}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="apple-type-footnote text-[var(--plan-muted)]">
          {anonymousCount > 0
            ? `${votedCount} of ${anonymousCount} have voted. This round is anonymous, so voters are not named.`
            : 'The voter list is still loading.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((member) => {
            const status = member.hasVoted
              ? 'Voted'
              : member.isSelf && selfHasSelection
                ? 'Vote selected'
                : 'Choosing…'
            return (
              <li key={member.memberId} className="flex items-center gap-2.5 py-1.5">
                <PlanAvatar member={member} size={30} />
                <span
                  className={cn(
                    'apple-type-footnote min-w-0 flex-1 truncate text-[var(--plan-text)]',
                    member.isSelf && 'font-semibold'
                  )}
                >
                  {member.isSelf ? 'You' : member.name}
                </span>
                <span
                  className={cn(
                    'apple-type-caption shrink-0',
                    member.hasVoted
                      ? 'text-[var(--plan-success)]'
                      : member.isSelf && selfHasSelection
                        ? 'text-[var(--plan-success)]'
                        : 'text-[var(--plan-warning)]'
                  )}
                >
                  {status}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <p className="apple-type-caption rounded-[var(--apple-radius-sm)] bg-[var(--plan-surface)] p-3 leading-[1.45] text-[var(--plan-muted)]">
        Votes are hidden to prevent anchoring. The facilitator can reveal once everyone is ready.
      </p>
    </aside>
  )
}

const agreementBackground = (agreement: Agreement | null) => {
  switch (agreement?.tone) {
    case 'success':
      return 'bg-[var(--plan-success-bg)]'
    case 'danger':
      return 'bg-[var(--plan-danger-bg)]'
    case 'warning':
      return 'bg-[var(--plan-warning-bg)]'
    default:
      return 'bg-[var(--plan-track)]'
  }
}

const agreementInk = (agreement: Agreement | null) => {
  switch (agreement?.tone) {
    case 'success':
      return 'text-[var(--plan-success)]'
    case 'danger':
      return 'text-[var(--plan-danger)]'
    case 'warning':
      return 'text-[var(--plan-warning)]'
    default:
      return 'text-[var(--plan-muted)]'
  }
}

/**
 * The task's own description, collapsed by default.
 *
 * Collapsed because the round is about sizing one task and the arc is the
 * thing to look at; expanded because "what does this actually involve" is the
 * question that causes the spread in the first place, and leaving the modal
 * to find out loses your place in the queue.
 */
function TaskDescription({
  description,
  open,
  onToggle
}: {
  description: string | null
  open: boolean
  onToggle: () => void
}) {
  return (
    <section className={cn(pokerPanelClass, 'overflow-hidden')}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        disabled={!description}
        className="apple-transition flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-[var(--plan-surface)] disabled:cursor-default disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--plan-accent)]"
      >
        <FileText className="h-[15px] w-[15px] shrink-0 text-[var(--plan-muted)]" />
        <span className="apple-type-footnote flex-1 font-semibold text-[var(--plan-text)]">
          Task description
        </span>
        {description ? (
          <ChevronDown
            className={cn(
              'apple-transition h-[15px] w-[15px] shrink-0 text-[var(--plan-muted)]',
              open && 'rotate-180'
            )}
          />
        ) : (
          <span className="apple-type-caption text-[var(--plan-muted)]">None</span>
        )}
      </button>

      {open && description && (
        <div className="border-t border-[var(--plan-border)] bg-[var(--plan-surface)] px-3.5 py-3">
          {/* Descriptions are authored in the rich-text editor, so they arrive
              as HTML. Rendered as text: this modal is a voting surface, and
              injecting task-authored markup into it buys nothing. */}
          <p className="apple-type-footnote max-h-[180px] overflow-y-auto whitespace-pre-wrap leading-[1.5] text-[var(--plan-muted)]">
            {toPlainText(description)}
          </p>
        </div>
      )}
    </section>
  )
}

/**
 * Rich-text descriptions arrive as HTML. Block-level tags become line breaks
 * so a bulleted description does not collapse into one run-on paragraph.
 */
function toPlainText(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** The revealed spread, and the facilitator's controls for closing it out. */
function RevealScreen({
  reveal,
  isFacilitator,
  numericCards,
  finalValue,
  onPickFinal,
  estimationUnit,
  toHours,
  agreement,
  outlierNames,
  description,
  descriptionOpen,
  onToggleDescription
}: {
  reveal: RevealState
  isFacilitator: boolean
  numericCards: number[]
  finalValue: string
  onPickFinal: (value: string) => void
  estimationUnit: 'story_points' | 'hours'
  toHours: (value: number) => number
  agreement: Agreement | null
  outlierNames: string[]
  description: string | null
  descriptionOpen: boolean
  onToggleDescription: () => void
}) {
  const selectedValue = Number(finalValue)
  const hasSelectedValue = Number.isFinite(selectedValue) && selectedValue > 0
  const unit = estimationUnit === 'story_points' ? 'story points' : 'hours'

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
      <section className="flex min-w-0 flex-col gap-3.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="apple-type-headline font-semibold text-[var(--plan-text)]">
              The table has spoken
            </h3>
            <p className="apple-type-footnote text-[var(--plan-muted)]">
              {reveal.votes.length} {reveal.votes.length === 1 ? 'vote' : 'votes'}
              {outlierNames.length > 0 &&
                ` · ${outlierNames.length} ${
                  outlierNames.length === 1 ? 'estimate sits' : 'estimates sit'
                } outside the central range`}
              {reveal.abstainCount > 0 && ` · ${reveal.abstainCount} did not vote a number`}
            </p>
          </div>
          {agreement && <PokerBadge tone={agreement.tone}>{agreement.label}</PokerBadge>}
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {reveal.votes.map((entry, index) => (
            <div
              key={`${entry.voterId ?? 'anon'}-${index}`}
              data-testid="poker-vote-tile"
              className={cn(
                'flex flex-col items-center gap-2.5 rounded-[var(--apple-radius-lg)] border p-3',
                entry.isOutlier
                  ? 'border-[var(--plan-danger)] bg-[var(--plan-danger-bg)]'
                  : 'border-[var(--plan-border)] bg-[var(--plan-raised)]'
              )}
            >
              <PokerCard
                card={entry.card}
                width={68}
                tone={entry.isOutlier ? 'outlier' : 'selected'}
              />
              <div className="flex w-full min-w-0 items-center justify-center gap-2">
                <PlanAvatar
                  member={{
                    name: entry.voterName ?? 'Anonymous',
                    firstName: entry.firstName,
                    lastName: entry.lastName,
                    email: entry.email,
                    avatar: entry.avatar
                  }}
                  size={30}
                />
                <div className="flex min-w-0 flex-col">
                  <span className="apple-type-footnote truncate font-semibold text-[var(--plan-text)]">
                    {entry.voterName ?? 'Anonymous'}
                  </span>
                  <span
                    className={cn(
                      'apple-type-caption uppercase tracking-[0.06em]',
                      entry.isOutlier ? 'text-[var(--plan-danger)]' : 'text-[var(--plan-muted)]'
                    )}
                  >
                    {entry.isOutlier ? 'Outlier' : entry.value === null ? 'Abstained' : 'In range'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <TaskDescription
          description={description}
          open={descriptionOpen}
          onToggle={onToggleDescription}
        />
      </section>

      <aside className={cn(pokerPanelClass, 'flex min-w-0 flex-col gap-4 p-4')}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="apple-type-subheadline font-semibold text-[var(--plan-text)]">
            Estimate summary
          </h3>
          {isFacilitator && <PokerBadge tone="accent">Facilitator</PokerBadge>}
        </div>

        <div className="flex gap-2">
          <PokerStat testId="poker-stat-min" label="Min" value={reveal.min ?? '—'} />
          <PokerStat testId="poker-stat-median" label="Median" value={reveal.median ?? '—'} emphasis />
          <PokerStat testId="poker-stat-max" label="Max" value={reveal.max ?? '—'} />
        </div>

        <div
          className={cn(
            'flex flex-col gap-1 rounded-[var(--apple-radius-sm)] p-3',
            agreementBackground(agreement)
          )}
        >
          <span
            className={cn('apple-type-footnote font-semibold', agreementInk(agreement))}
          >
            {/* Stated in cards, not in points: "8-point spread" reads as a
                chasm when 13 and 21 are neighbours on the deck. */}
            {agreement?.key === 'consensus'
              ? 'Everyone agreed'
              : agreement?.key === 'none'
                ? 'No numeric votes'
                : agreement?.key === 'single'
                  ? 'Only one estimate'
                  : agreement?.steps != null
                    ? `${agreement.steps} ${agreement.steps === 1 ? 'card' : 'cards'} apart`
                    : `${reveal.spread ?? 0}-point spread`}
          </span>
          <span className="apple-type-caption leading-[1.45] text-[var(--plan-muted)]">
            {agreement?.key === 'consensus'
              ? 'No discussion needed — lock it in.'
              : agreement?.key === 'near'
                ? 'Neighbouring cards — close enough to lock without a debate.'
                : agreement?.key === 'single'
                  ? 'Only one person sized this, so there is nothing to compare it against.'
                  : agreement?.key === 'none'
                    ? 'Nobody put a number on this task.'
                    : outlierNames.length > 0
                      ? `${outlierNames.join(' and ')} sized this differently. Align assumptions before locking.`
                      : 'Align assumptions before locking the estimate.'}
          </span>
        </div>

        {isFacilitator && (
          <div className="flex flex-col gap-2">
            <span className="apple-type-footnote font-semibold text-[var(--plan-text)]">
              Final estimate
            </span>
            {numericCards.length > 0 && (
              <div
                className="grid grid-cols-4 gap-2"
                role="group"
                aria-label="Quick-pick estimate"
              >
                {numericCards.map((card) => {
                  const isActive = finalValue === String(card)
                  return (
                    <button
                      key={card}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => onPickFinal(String(card))}
                      className={cn(
                        'apple-transition apple-type-callout flex h-[38px] items-center justify-center rounded-[var(--apple-radius-sm)] border font-bold tabular-nums',
                        isActive
                          ? 'border-[var(--plan-accent)] bg-[var(--plan-info-bg)] text-[var(--plan-accent)]'
                          : 'border-[var(--plan-border)] bg-[var(--plan-surface)] text-[var(--plan-muted)] hover:text-[var(--plan-text)]'
                      )}
                    >
                      {card}
                    </button>
                  )
                })}
              </div>
            )}
            {/* The design's conversion row, with its left half made editable:
                the deck covers the usual answers, but E16 lets a facilitator
                set a value the room never voted, and that has to stay
                reachable without a second control fighting the chips for
                space. */}
            <div className="flex items-center justify-between gap-3 py-1">
              <span className="flex min-w-0 items-center gap-2">
                <input
                  id="poker-final"
                  aria-label="Final estimate"
                  type="number"
                  min="0.25"
                  step="0.25"
                  value={finalValue}
                  onChange={(event) => onPickFinal(event.target.value)}
                  placeholder="—"
                  className="apple-type-callout h-[34px] w-[72px] rounded-[var(--apple-radius-sm)] border border-[var(--plan-border)] bg-[var(--plan-surface)] px-2 text-center font-bold tabular-nums text-[var(--plan-text)] placeholder:font-normal placeholder:text-[var(--plan-muted)] focus:border-[var(--plan-accent)] focus:outline-none"
                />
                <span className="apple-type-footnote truncate text-[var(--plan-muted)]">{unit}</span>
              </span>
              {hasSelectedValue && (
                <span className="apple-type-subheadline shrink-0 font-semibold tabular-nums text-[var(--plan-text)]">
                  ≈ {toHours(selectedValue).toFixed(1).replace(/\.0$/, '')} hours
                </span>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
