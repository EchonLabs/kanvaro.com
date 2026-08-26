'use client'

/**
 * Sprint Planning Workspace (spec §15.5, UI-4 to UI-7).
 *
 * The screen the planning gate lives on. Everything here exists to make the
 * gate passable rather than merely enforced: the checklist is live (UI-4), each
 * failure expands to its offending tasks with an inline fix (UI-5), Complete is
 * disabled with a tooltip naming the first blocker (UI-6), and completing shows
 * what was generated (UI-7).
 *
 * The capacity and scope strip at the top is the number the spec tells PMs to
 * note before anything else: "Note that number. It is your ceiling."
 */
import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ListPlus,
  Loader2,
  PlayCircle,
  ShieldAlert,
  Spade
} from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { Label } from '@/components/ui/label'
// Lower-case path: the rest of the app imports it this way, and TypeScript
// treats the two casings as different files on a case-insensitive filesystem.
import { Textarea } from '@/components/ui/textarea'
import { useNotify } from '@/lib/notify'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { deckCards, type DeckType } from '@/lib/standup/poker'
import { cn } from '@/lib/utils'

import {
  PlanningChecklist,
  type ChecklistItemView,
  type OffendingMember,
  type OffendingTask
} from './PlanningChecklist'
import { PokerModal } from './PokerModal'

interface ChecklistPayload {
  checklist: {
    items: ChecklistItemView[]
    blockers: ChecklistItemView[]
    canComplete: boolean
    totals: {
      taskCount: number
      estimatedTaskCount: number
      totalEstimatedMinutes: number
      totalCapacityMinutes: number
      netCapacityMinutes: number
    }
  }
  offendingTasks: OffendingTask[]
  offendingMembers: OffendingMember[]
}

interface ProjectMember {
  memberId: string
  firstName?: string
  lastName?: string
  email?: string
}

interface BacklogTask {
  _id: string
  displayId?: string
  title: string
  originalEstimateMinutes?: number
  estimatedHours?: number
}

interface Props {
  sprintId: string
  sprintName: string
  sprintStatus: string
  projectId: string
  /** PLN-18 — shown persistently while a waiver is active. */
  waiverBanner?: string | null
  onCompleted?: () => void
}

const hours = (minutes: number) => (minutes / 60).toFixed(1)

export function PlanningWorkspace({
  sprintId,
  sprintName,
  sprintStatus,
  projectId,
  waiverBanner,
  onCompleted
}: Props) {
  const notify = useNotify()
  const { hasPermission } = usePermissions()

  // Reveal and finalise are facilitator actions (SPRINT_UPDATE server side);
  // casting a vote only needs SPRINT_VIEW. A team member reaches this screen to
  // vote and must not be shown controls the API would refuse.
  const canFacilitate = hasPermission(Permission.SPRINT_UPDATE, projectId)

  const [data, setData] = useState<ChecklistPayload | null>(null)
  const [openPokerSession, setOpenPokerSession] = useState<any>(null)
  const [session, setSession] = useState<any>(null)
  const [goal, setGoal] = useState('')
  const [acknowledged, setAcknowledged] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [completed, setCompleted] = useState<{ message: string } | null>(null)
  const [poker, setPoker] = useState<any>(null)
  const [backlog, setBacklog] = useState<BacklogTask[]>([])
  const [showBacklog, setShowBacklog] = useState(false)
  // PLN-10 `participantIds`. Only the sprint team could vote before, which shut
  // out QA and specialists who estimate work they are not assigned.
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([])
  const [voterIds, setVoterIds] = useState<string[] | null>(null)
  const [choosingVoters, setChoosingVoters] = useState(false)

  // UI-4 — the checklist is live. Every mutation on this screen ends by
  // refetching it, so what the PM sees and what the server will enforce cannot
  // drift apart.
  const refresh = useCallback(async () => {
    try {
      const [checklistResponse, sessionResponse, pokerResponse] = await Promise.all([
        fetch(`/api/sprints/${sprintId}/planning-session/checklist`),
        fetch(`/api/sprints/${sprintId}/planning-session`),
        // Read-only (SPRINT_VIEW), so every participant sees an open round and
        // can join it. Without this a member arriving mid-session sees nothing:
        // the modal used to exist only in the state of whoever opened it.
        fetch(`/api/sprints/${sprintId}/poker-sessions`)
      ])

      const checklistPayload = await checklistResponse.json()
      const sessionPayload = await sessionResponse.json()

      if (pokerResponse.ok) {
        const pokerPayload = await pokerResponse.json()
        setOpenPokerSession(
          (pokerPayload.data?.sessions ?? []).find((entry: any) => entry.status === 'open') ?? null
        )
      }

      if (checklistResponse.ok) setData(checklistPayload.data)
      if (sessionResponse.ok) {
        setSession(sessionPayload.data.session)
        if (sessionPayload.data.session?.sprintGoal !== undefined) {
          setGoal(sessionPayload.data.session.sprintGoal ?? '')
        }
      }
    } catch {
      notify.error({ title: 'Could not load the planning checklist' })
    } finally {
      setLoading(false)
    }
  }, [sprintId, notify])

  // Step 2 of the spec's planning flow: pull tasks in from the backlog, watching
  // the scope bar against the capacity ceiling. Loaded separately from the
  // checklist because it changes for different reasons and is much larger.
  const loadBacklog = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/tasks?project=${encodeURIComponent(projectId)}&noSprint=true&limit=100`
      )
      const payload = await response.json()
      if (response.ok) setBacklog(payload.data ?? payload.tasks ?? [])
    } catch {
      /* The backlog panel is additive; a failure here must not blank the gate. */
    }
  }, [projectId])

  const loadMembers = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/member-capacity`)
      const payload = await response.json()
      if (response.ok) setProjectMembers(payload.data?.members ?? [])
    } catch {
      /* The picker falls back to the sprint team; a failure here must not
         block opening a round. */
    }
  }, [projectId])

  const moveTask = async (taskId: string, intoSprint: boolean) => {
    setBusy(true)
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sprint: intoSprint ? sprintId : null })
      })
      if (!response.ok) throw new Error('Could not move the task')
      await Promise.all([refresh(), loadBacklog()])
    } catch (error) {
      notify.error({
        title: intoSprint ? 'Could not add the task' : 'Could not remove the task',
        message: error instanceof Error ? error.message : undefined
      })
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [refresh])

  const openSession = async () => {
    setBusy(true)
    try {
      const response = await fetch(`/api/sprints/${sprintId}/planning-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error?.message ?? 'Could not start planning')
      setSession(payload.data.session)
      await refresh()
    } catch (error) {
      notify.error({
        title: 'Could not start planning',
        message: error instanceof Error ? error.message : undefined
      })
    } finally {
      setBusy(false)
    }
  }

  const saveGoal = async () => {
    setBusy(true)
    try {
      const response = await fetch(`/api/sprints/${sprintId}/planning-session`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sprintGoal: goal })
      })
      if (!response.ok) throw new Error('Could not save the sprint goal')
      await refresh()
    } catch (error) {
      notify.error({
        title: 'Could not save the sprint goal',
        message: error instanceof Error ? error.message : undefined
      })
    } finally {
      setBusy(false)
    }
  }

  const estimateTask = async (taskId: string, value: number) => {
    const response = await fetch(`/api/tasks/${taskId}/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value, unit: 'hours' })
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload?.error?.message ?? 'Could not save the estimate')
    await refresh()
  }

  /**
   * Opens the modal on a round somebody else started.
   *
   * The queue is rebuilt from the session document rather than the checklist,
   * because a voter may not be able to see the same task list, and the deck is
   * derived locally — `deckCards` is pure, so there is nothing to fetch.
   */
  const joinPoker = () => {
    if (!openPokerSession) return
    setPoker({
      session: openPokerSession,
      cards: deckCards(openPokerSession.deckType as DeckType),
      queue: (openPokerSession.queue ?? []).map((entry: any) => {
        const task = data?.offendingTasks.find((candidate) => candidate.id === String(entry.task))
        return {
          taskId: String(entry.task),
          key: task?.key ?? '',
          title: task?.title ?? 'Task',
          status: entry.status
        }
      })
    })
  }

  const startPoker = async () => {
    const unestimated = data?.offendingTasks.filter(
      (task) => !task.originalEstimateMinutes
    )
    if (!unestimated?.length) {
      notify.info?.({ title: 'Every task already has an estimate' })
      return
    }

    setBusy(true)
    try {
      const response = await fetch(`/api/sprints/${sprintId}/poker-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskIds: unestimated.map((task) => task.id),
          // Omitted entirely when untouched, so the server keeps its sprint-team
          // default rather than receiving an empty list.
          ...(voterIds?.length ? { participantIds: voterIds } : {})
        })
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error?.message ?? 'Could not open a poker session')

      setPoker({
        session: payload.data.session,
        cards: payload.data.cards,
        queue: payload.data.session.queue.map((entry: any) => {
          const task = unestimated.find((candidate) => candidate.id === entry.task)
          return {
            taskId: entry.task,
            key: task?.key ?? '',
            title: task?.title ?? '',
            status: entry.status
          }
        })
      })
    } catch (error) {
      notify.error({
        title: 'Could not open a poker session',
        message: error instanceof Error ? error.message : undefined
      })
    } finally {
      setBusy(false)
      setChoosingVoters(false)
    }
  }

  const complete = async () => {
    setBusy(true)
    try {
      const response = await fetch(`/api/sprints/${sprintId}/planning-session/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledgedCheckIds: acknowledged })
      })
      const payload = await response.json()

      if (!response.ok) {
        // The server re-evaluates; if it disagrees with the button state the
        // server wins, and the screen refreshes to show why.
        await refresh()
        throw new Error(payload?.error?.message ?? 'Planning could not be completed')
      }

      setCompleted({ message: payload.data.message })
      onCompleted?.()
    } catch (error) {
      notify.error({
        title: 'Could not complete planning',
        message: error instanceof Error ? error.message : undefined
      })
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <PlanningSkeleton />

  // UI-7 — the post-completion confirmation.
  if (completed) {
    return (
      <div className="space-y-4 rounded-[var(--apple-radius-lg)] border border-[var(--apple-system-green)]/30 bg-[var(--apple-system-green)]/5 p-6 text-center">
        <Check className="mx-auto h-8 w-8 text-[var(--apple-system-green)]" />
        <h3 className="text-lg font-semibold text-[var(--apple-label)]">Planning complete</h3>
        <p className="text-[13px] text-[var(--apple-secondary-label)]">{completed.message}</p>
        <p className="text-[12px] text-[var(--apple-tertiary-label)]">
          Stand-ups are generated when the scheduler runs for this sprint.
        </p>
      </div>
    )
  }

  const totals = data?.checklist.totals
  const blockers = data?.checklist.blockers ?? []
  const canComplete = !!data?.checklist.canComplete && !!session

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[var(--apple-label)]">Sprint planning</h2>
          <p className="text-[13px] text-[var(--apple-secondary-label)]">
            {sprintName} · <span className="capitalize">{sprintStatus}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {openPokerSession ? (
            <Button variant="outline" onClick={joinPoker} disabled={busy}>
              <Spade className="mr-1.5 h-4 w-4" />
              Join planning poker
            </Button>
          ) : (
            canFacilitate && (
              <Button
                variant="outline"
                onClick={() => {
                  loadMembers()
                  setChoosingVoters(true)
                }}
                disabled={busy || !session}
              >
                <Spade className="mr-1.5 h-4 w-4" />
                Planning poker
              </Button>
            )
          )}

          {/* UI-6 — disabled with a tooltip naming the first blocking item. */}
          {canFacilitate && (
            <span title={canComplete ? undefined : blockerTooltip(blockers, session)}>
              <Button onClick={complete} disabled={!canComplete || busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Complete planning
              </Button>
            </span>
          )}
        </div>
      </header>

      {/* PLN-18 — persistent while the waiver is active, naming the waived
          items and the expiry. Not dismissible: a waiver nobody can see is
          exactly what the requirement exists to prevent. */}
      {waiverBanner && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-[var(--apple-radius-lg)] border border-[var(--apple-system-orange)]/40 bg-[var(--apple-system-orange)]/[0.07] p-3.5 text-[13px]"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--apple-system-orange)]" />
          <div>
            <p className="font-medium text-[var(--apple-label)]">{waiverBanner}</p>
            <p className="mt-0.5 text-[12px] text-[var(--apple-secondary-label)]">
              A waiver never allows an unestimated task to be allocated.
            </p>
          </div>
        </div>
      )}

      {!session && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] p-4">
          <div>
            <p className="text-[13px] font-medium text-[var(--apple-label)]">
              No planning session is open
            </p>
            <p className="text-[12px] text-[var(--apple-tertiary-label)]">
              Stand-ups cannot run until this sprint has been planned.
            </p>
          </div>
          {canFacilitate && (
            <Button onClick={openSession} disabled={busy}>
              <PlayCircle className="mr-1.5 h-4 w-4" />
              Start planning
            </Button>
          )}
        </div>
      )}

      {totals && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Net capacity" value={`${hours(totals.netCapacityMinutes)}h`} />
          <Stat
            label="Estimated scope"
            value={`${hours(totals.totalEstimatedMinutes)}h`}
            tone={
              totals.totalEstimatedMinutes > totals.netCapacityMinutes ? 'warning' : 'default'
            }
          />
          <Stat
            label="Tasks estimated"
            value={`${totals.estimatedTaskCount} of ${totals.taskCount}`}
            tone={totals.estimatedTaskCount < totals.taskCount ? 'warning' : 'default'}
          />
        </div>
      )}

      {session && (
        <div className="space-y-2">
          <Label htmlFor="sprint-goal">Sprint goal</Label>
          <Textarea
            id="sprint-goal"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            onBlur={saveGoal}
            rows={2}
            maxLength={500}
            placeholder="Ship the invoicing module end to end for pilot customers."
          />
          <p className="text-[12px] text-[var(--apple-tertiary-label)]">
            One sentence describing the outcome. At least 10 characters.
          </p>
        </div>
      )}

      {session && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="apple-section-label text-[var(--apple-secondary-label)]">
              Sprint scope
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowBacklog((current) => !current)
                if (!showBacklog && backlog.length === 0) loadBacklog()
              }}
            >
              <ListPlus className="mr-1.5 h-3.5 w-3.5" />
              {showBacklog ? 'Hide backlog' : 'Add from backlog'}
            </Button>
          </div>

          {showBacklog && (
            <div className="max-h-[240px] space-y-1 overflow-y-auto rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] p-2">
              {backlog.length === 0 ? (
                <p className="px-2 py-3 text-[13px] text-[var(--apple-tertiary-label)]">
                  Nothing unassigned in the backlog for this project.
                </p>
              ) : (
                backlog.map((task) => (
                  <div
                    key={task._id}
                    className="flex items-center gap-2.5 rounded-[6px] px-2 py-1.5 hover:bg-[var(--apple-fill-quaternary)]"
                  >
                    <span className="font-apple-mono text-[12px] text-[var(--apple-system-blue)]">
                      {task.displayId}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--apple-label)]">
                      {task.title}
                    </span>
                    <span className="font-apple-mono text-[12px] tabular-nums text-[var(--apple-tertiary-label)]">
                      {task.originalEstimateMinutes
                        ? `${hours(task.originalEstimateMinutes)}h`
                        : '—'}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => moveTask(task._id, true)}
                    >
                      Add
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}
        </section>
      )}

      {data && (
        <PlanningChecklist
          items={data.checklist.items}
          offendingTasks={data.offendingTasks}
          offendingMembers={data.offendingMembers}
          acknowledged={acknowledged}
          onAcknowledge={(checkId, next) =>
            setAcknowledged((current) =>
              next ? current.concat(checkId) : current.filter((id) => id !== checkId)
            )
          }
          onEstimateTask={estimateTask}
          onOpenTask={(taskId) => window.open(`/tasks/${taskId}`, '_blank')}
          busy={busy}
        />
      )}

      {/* PLN-10 — who votes. Defaults to the sprint team, but QA and specialists
          estimate work they are never assigned, and the facilitator is often a
          PM who is not on the sprint team at all. */}
      <ResponsiveDialog
        open={choosingVoters}
        onOpenChange={setChoosingVoters}
        title="Who is estimating?"
        description="Everyone ticked can cast a vote. You can always run the round with the sprint team as it stands."
      >
        <div className="space-y-3">
          <div className="max-h-[280px] space-y-1 overflow-y-auto rounded-[10px] border border-[var(--apple-separator)] p-2">
            {projectMembers.length === 0 && (
              <p className="p-2 text-[13px] text-[var(--apple-secondary-label)]">
                Loading the project team…
              </p>
            )}
            {projectMembers.map((member) => {
              const name =
                [member.firstName, member.lastName].filter(Boolean).join(' ') ||
                member.email ||
                member.memberId
              const ticked = voterIds === null || voterIds.includes(member.memberId)

              return (
                <label
                  key={member.memberId}
                  className="flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2 py-1.5 hover:bg-[var(--apple-fill-quaternary)]"
                >
                  <Checkbox
                    checked={ticked}
                    onCheckedChange={(checked) => {
                      // `null` means "untouched, use the server default", so the
                      // first tick has to materialise the current selection.
                      const current =
                        voterIds ?? projectMembers.map((entry) => entry.memberId)
                      setVoterIds(
                        checked
                          ? Array.from(new Set([...current, member.memberId]))
                          : current.filter((id) => id !== member.memberId)
                      )
                    }}
                  />
                  <span className="text-[13px] text-[var(--apple-label)]">{name}</span>
                </label>
              )
            })}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setChoosingVoters(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={startPoker} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Start round
            </Button>
          </div>
        </div>
      </ResponsiveDialog>

      {poker && (
        <PokerModal
          open
          onOpenChange={(next) => !next && setPoker(null)}
          sessionId={poker.session._id}
          cards={poker.cards}
          queue={poker.queue}
          currentTaskId={poker.session.currentTask}
          // Reveal and finalise are SPRINT_UPDATE server side. Hardcoding this
          // to true showed a voter buttons the API would answer with 403.
          isFacilitator={canFacilitate}
          pointsToHours={poker.session.pointsToHours}
          estimationUnit={poker.session.estimationUnit}
          onEstimated={refresh}
        />
      )}
    </div>
  )
}

/** UI-6 — name the *first* blocker, not a count. */
function blockerTooltip(blockers: ChecklistItemView[], session: unknown): string {
  if (!session) return 'Start a planning session first.'
  const first = blockers[0]
  return first ? `${first.checkId}: ${first.message ?? 'This check must pass first.'}` : ''
}

function Stat({
  label,
  value,
  tone = 'default'
}: {
  label: string
  value: string
  tone?: 'default' | 'warning'
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--apple-radius-lg)] border p-3',
        tone === 'warning'
          ? 'border-[var(--apple-system-orange)]/30 bg-[var(--apple-system-orange)]/5'
          : 'border-[var(--apple-separator)]'
      )}
    >
      <p className="apple-section-label text-[var(--apple-tertiary-label)]">{label}</p>
      <p className="font-apple-mono text-lg tabular-nums text-[var(--apple-label)]">
        {value}
        {tone === 'warning' && (
          <AlertTriangle className="ml-1.5 inline h-4 w-4 text-[var(--apple-system-orange)]" />
        )}
      </p>
    </div>
  )
}

function PlanningSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="h-24 animate-pulse rounded-[var(--apple-radius-lg)] bg-[var(--apple-tertiary-fill)]"
        />
      ))}
    </div>
  )
}
