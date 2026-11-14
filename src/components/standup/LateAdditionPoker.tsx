'use client'

/**
 * Planning poker for tasks added after the sprint left planning (E14).
 *
 * Lives on the sprint page, not the planning screen: planning is over, and
 * its checklist has nothing to say about a running sprint. The sprint-level
 * button appears only while the sprint is active and still has tasks nobody
 * has estimated; a round that is already open shows "Join" to everyone
 * instead, so voters can reach it from the invite popup.
 *
 * The rules live on the server (`late-addition.ts`): a reason is required,
 * only unestimated tasks are accepted, and each result is frozen on finalize.
 * This component only offers the entry point and states the rules up front.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Users } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { useAuthContext } from '@/contexts/AuthContext'
import { useNotify } from '@/lib/notify'
import { MIN_LATE_ADDITION_REASON_LENGTH, isUnestimated } from '@/lib/standup/late-addition'
import { deckCards, type DeckType } from '@/lib/standup/poker'
import { standupStrings } from '@/lib/standup/strings'

import { PokerModal } from './PokerModal'
import { buildPokerQueue } from './PlanningWorkspace'
import type { ScopeTask } from './planning/types'

interface ProjectMember {
  memberId: string
  firstName?: string
  lastName?: string
  email?: string
}

interface Props {
  sprintId: string
  sprintName?: string
  sprintStatus: string
  projectId: string
  /** The sprint team's user ids: the default voters, as the server would pick. */
  teamMemberIds: string[]
  /** `SPRINT_UPDATE` — may open a round. Voters only ever see "Join". */
  canFacilitate: boolean
  /** Called after a round closes or an estimate lands, so the page can refetch. */
  onChanged?: () => void
}

const strings = standupStrings.lateAddition

export function LateAdditionPoker({
  sprintId,
  sprintStatus,
  projectId,
  teamMemberIds,
  canFacilitate,
  onChanged
}: Props) {
  const notify = useNotify()
  const { user } = useAuthContext()

  const [tasks, setTasks] = useState<ScopeTask[]>([])
  const [openSession, setOpenSession] = useState<any>(null)
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [poker, setPoker] = useState<any>(null)

  const [choosing, setChoosing] = useState(false)
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
  const [voterIds, setVoterIds] = useState<string[] | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const active = sprintStatus === 'active'

  const load = useCallback(async () => {
    try {
      const [taskResponse, sessionResponse] = await Promise.all([
        fetch(`/api/tasks?sprint=${encodeURIComponent(sprintId)}&limit=500`),
        fetch(`/api/sprints/${sprintId}/poker-sessions`)
      ])
      if (taskResponse.ok) {
        const payload = await taskResponse.json()
        const list = payload?.data ?? payload?.tasks
        setTasks(Array.isArray(list) ? list : [])
      }
      if (sessionResponse.ok) {
        const payload = await sessionResponse.json()
        const sessions: any[] = payload?.data?.sessions ?? []
        setOpenSession(sessions.find((entry) => entry.status === 'open') ?? null)
      }
    } catch {
      /* Additive: a failed read just leaves the button off. */
    }
  }, [sprintId])

  useEffect(() => {
    if (active) load()
  }, [active, load])

  // Voter candidates are only needed by whoever opens a round.
  useEffect(() => {
    if (!active || !canFacilitate || !projectId) return
    let cancelled = false
    fetch(`/api/projects/${projectId}/member-capacity`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!cancelled && payload) setMembers(payload.data?.members ?? [])
      })
      .catch(() => {
        /* The picker falls back to the sprint team. */
      })
    return () => {
      cancelled = true
    }
  }, [active, canFacilitate, projectId])

  const eligible = useMemo(() => tasks.filter((task) => isUnestimated(task)), [tasks])
  const scopeById = useMemo(() => new Map(tasks.map((task) => [task._id, task])), [tasks])

  // Same defaults the planning screen uses: the sprint team, plus the
  // facilitator when they are a project member (and so can be unticked).
  const facilitatorIsCandidate = members.some((member) => member.memberId === user?.id)
  const defaultVoterIds = useMemo(
    () =>
      Array.from(
        new Set([...teamMemberIds, ...(facilitatorIsCandidate && user?.id ? [user.id] : [])])
      ),
    [teamMemberIds, facilitatorIsCandidate, user?.id]
  )
  const effectiveVoterIds = voterIds ?? defaultVoterIds

  if (!active) return null

  const reasonLength = reason.trim().length
  const reasonOk = reasonLength >= MIN_LATE_ADDITION_REASON_LENGTH
  const canStart = !busy && reasonOk && selectedTaskIds.length > 0

  const openDialog = () => {
    setSelectedTaskIds(eligible.map((task) => task._id))
    setVoterIds(null)
    setReason('')
    setChoosing(true)
  }

  const start = async () => {
    if (selectedTaskIds.length === 0) {
      notify.info?.({ title: strings.nothingSelected() })
      return
    }
    setBusy(true)
    try {
      const excludeFacilitator =
        facilitatorIsCandidate && !!user?.id && !effectiveVoterIds.includes(user.id)

      const response = await fetch(`/api/sprints/${sprintId}/poker-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskIds: selectedTaskIds,
          reason: reason.trim(),
          ...(effectiveVoterIds.length ? { participantIds: effectiveVoterIds } : {}),
          ...(excludeFacilitator ? { excludeFacilitator: true } : {})
        })
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error?.message ?? strings.openFailed())

      setChoosing(false)
      setPoker({
        session: payload.data.session,
        cards: payload.data.cards,
        queue: buildPokerQueue(payload.data.session.queue ?? [], scopeById)
      })
    } catch (error) {
      notify.error({
        title: strings.openFailed(),
        message: error instanceof Error ? error.message : undefined
      })
    } finally {
      setBusy(false)
    }
  }

  const join = () => {
    if (!openSession) return
    setPoker({
      session: openSession,
      cards: deckCards(openSession.deckType as DeckType),
      queue: buildPokerQueue(openSession.queue ?? [], scopeById)
    })
  }

  const buttonClass =
    'inline-flex items-center justify-center gap-1.5 rounded-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/60 text-gray-700 dark:text-gray-200 text-[13px] font-medium px-4 h-9 shadow-sm transition-all cursor-pointer'

  return (
    <>
      {openSession ? (
        <button type="button" onClick={join} className={buttonClass}>
          <Users className="h-4 w-4" />
          <span>{strings.join()}</span>
        </button>
      ) : canFacilitate && eligible.length > 0 ? (
        <button type="button" onClick={openDialog} className={buttonClass}>
          <Users className="h-4 w-4" />
          <span>{strings.button()}</span>
        </button>
      ) : null}

      <ResponsiveDialog
        open={choosing}
        onOpenChange={setChoosing}
        title={strings.dialogTitle()}
        description={strings.dialogDescription()}
      >
        <div className="space-y-4">
          <section className="space-y-1.5">
            <p className="apple-type-footnote font-semibold text-[var(--apple-secondary-label)]">
              {strings.tasksHeading({ count: selectedTaskIds.length })}
            </p>
            <div className="max-h-[200px] space-y-1 overflow-y-auto rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] p-2">
              {eligible.map((task) => (
                <label
                  key={task._id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-[var(--apple-radius-sm)] px-2 py-1.5 hover:bg-[var(--apple-quaternary-fill)]"
                >
                  <Checkbox
                    checked={selectedTaskIds.includes(task._id)}
                    onCheckedChange={(checked) =>
                      setSelectedTaskIds((current) =>
                        checked
                          ? Array.from(new Set([...current, task._id]))
                          : current.filter((id) => id !== task._id)
                      )
                    }
                  />
                  {task.displayId && (
                    <span className="apple-type-caption shrink-0 text-[var(--apple-tertiary-label)]">
                      {task.displayId}
                    </span>
                  )}
                  <span className="apple-type-subheadline flex-1 text-[var(--apple-label)]">
                    {task.title}
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-1.5">
            <label
              htmlFor="late-addition-reason"
              className="apple-type-footnote font-semibold text-[var(--apple-secondary-label)]"
            >
              {strings.reasonLabel()}
            </label>
            <textarea
              id="late-addition-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              className="apple-type-body min-h-[72px] w-full resize-y rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-transparent p-3 text-[var(--apple-label)] focus:outline-none"
            />
            <p
              className={`apple-type-caption tabular-nums ${
                reasonOk ? 'text-[var(--apple-secondary-label)]' : 'text-[var(--apple-system-orange)]'
              }`}
            >
              {strings.reasonHint({ min: MIN_LATE_ADDITION_REASON_LENGTH })} {reasonLength}/
              {MIN_LATE_ADDITION_REASON_LENGTH}+
            </p>
          </section>

          {members.length > 0 && (
            <section className="space-y-1.5">
              <p className="apple-type-footnote font-semibold text-[var(--apple-secondary-label)]">
                {strings.votersHeading()}
              </p>
              <div className="max-h-[160px] space-y-1 overflow-y-auto rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] p-2">
                {members.map((member) => {
                  const name =
                    [member.firstName, member.lastName].filter(Boolean).join(' ') ||
                    member.email ||
                    member.memberId
                  return (
                    <label
                      key={member.memberId}
                      className="flex cursor-pointer items-center gap-2.5 rounded-[var(--apple-radius-sm)] px-2 py-1.5 hover:bg-[var(--apple-quaternary-fill)]"
                    >
                      <Checkbox
                        checked={effectiveVoterIds.includes(member.memberId)}
                        onCheckedChange={(checked) =>
                          setVoterIds(
                            checked
                              ? Array.from(new Set([...effectiveVoterIds, member.memberId]))
                              : effectiveVoterIds.filter((id) => id !== member.memberId)
                          )
                        }
                      />
                      <span className="apple-type-subheadline flex-1 text-[var(--apple-label)]">
                        {name}
                      </span>
                    </label>
                  )
                })}
              </div>
            </section>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setChoosing(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={start} disabled={!canStart}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {strings.start()}
            </Button>
          </div>
        </div>
      </ResponsiveDialog>

      {poker && (
        <PokerModal
          open
          // Closing never ends the round — it is saved server side. Re-read so
          // the button flips between Start and Join to match.
          onOpenChange={(next) => {
            if (next) return
            setPoker(null)
            load()
            onChanged?.()
          }}
          sessionId={poker.session._id}
          cards={poker.cards}
          queue={poker.queue}
          currentTaskId={poker.session.currentTask}
          // Reveal and finalize are SPRINT_UPDATE server side, and only the
          // person who opened the round may use them.
          isFacilitator={canFacilitate && String(poker.session.facilitator) === user?.id}
          isParticipant={(poker.session.participants ?? []).some(
            (id: any) => String(id) === user?.id
          )}
          pointsToHours={poker.session.pointsToHours}
          estimationUnit={poker.session.estimationUnit}
          deckType={poker.session.deckType}
          currentUserId={user?.id}
          onEstimated={() => {
            load()
            onChanged?.()
          }}
        />
      )}
    </>
  )
}
