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
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import Link from 'next/link'
import {
  ArrowLeft,
  BarChart3,
  Check,
  Info,
  Loader2,
  Spade,
  AlertTriangle,
  Users
} from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { useAuthContext } from '@/contexts/AuthContext'
import { useNotify } from '@/lib/notify'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { deckCards, type DeckType } from '@/lib/standup/poker'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import {
  PlanningChecklist,
  type ChecklistFixTarget,
  type ChecklistItemView,
  type OffendingMember,
  type OffendingTask
} from './PlanningChecklist'
import { PokerModal } from './PokerModal'
import { PokerResultsModal, type PokerResultsQueueEntry } from './PokerResultsModal'
import { AssignmentBoard, estimateLabel } from './planning/AssignmentBoard'
import { completeGate, pokerGate, stepStates, type GateInput } from './planning/gates'
import { GateButton, PlanningStepRail } from './planning/PlanningSteps'
import {
  assigneeNamesOf,
  isQaRole,
  unpokeredTasks,
  type AssignableMember,
  type ScopeTask
} from './planning/types'
import {
  PlanBanner,
  PlanButton,
  PlanCard,
  PlanPill,
  PlanTaskCard,
  scrollToSection
} from './planning/ui'

interface MemberLoad {
  id: string
  name: string
  assignedMinutes: number
  capacityMinutes: number
}

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
  /** Every sprint member's pre-assigned load, not just PA-5/PA-6's offenders. */
  members: MemberLoad[]
}

interface ProjectMember {
  memberId: string
  firstName?: string
  lastName?: string
  email?: string
  /** Project role, so the assignment picker can group QA separately. */
  role?: string | null
  dailyCapacityMinutes?: number
}

/**
 * Both panes and the assignment board speak the same shape now: the assign
 * step needs each scope task's owner, and the poker queue needs it too so a
 * round can name who the estimate is for.
 */
type BacklogTask = ScopeTask

interface Props {
  sprintId: string
  sprintName: string
  sprintStatus: string
  projectId: string
  /** Shown after the sprint name in the page header. */
  sprintDescription?: string | null
  /** PLN-18 — shown persistently while a waiver is active. */
  waiverBanner?: string | null
  onCompleted?: () => void
}

const hours = (minutes: number) => (minutes / 60).toFixed(1)
/** Whole hours read as "58 h", fractional ones keep a decimal: "7.5 h". */
const hoursValue = (minutes: number) => hours(minutes).replace(/\.0$/, '')

/**
 * Task lists, defensively.
 *
 * `/api/tasks` answers under `data` on one path and `tasks` on another, and an
 * error shape has neither. A non-array here used to reach straight into
 * `.map`, which takes the whole planning screen down — and this screen is the
 * gate on starting a sprint, so it failing closed and blank is the worst
 * available outcome.
 */
function asTaskList(payload: any): ScopeTask[] {
  const candidate = payload?.data ?? payload?.tasks
  return Array.isArray(candidate) ? candidate : []
}

export function PlanningWorkspace({
  sprintId,
  sprintName,
  sprintStatus,
  projectId,
  sprintDescription,
  waiverBanner,
  onCompleted
}: Props) {
  const notify = useNotify()
  const { hasPermission } = usePermissions()
  const { user } = useAuthContext()

  // Reveal and finalise are facilitator actions (SPRINT_UPDATE server side);
  // casting a vote only needs SPRINT_VIEW. A team member reaches this screen to
  // vote and must not be shown controls the API would refuse.
  const canFacilitate = hasPermission(Permission.SPRINT_UPDATE, projectId)

  // Matches KanbanBoard's sensor config: without an activation distance, the
  // draggable row's pointerdown listener can register a drag before a click
  // on its "Add"/"Remove" button is resolved.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const [data, setData] = useState<ChecklistPayload | null>(null)
  const [openPokerSession, setOpenPokerSession] = useState<any>(null)
  // The most recently finished round, kept around only so "View poker
  // results" has something to open — refresh()'s own poker-sessions fetch
  // otherwise only ever surfaces the `status === 'open'` session, discarding
  // a just-completed one the instant the round ends.
  const [lastCompletedPokerSession, setLastCompletedPokerSession] = useState<any>(null)
  // PC-9's client mirror: which tasks a poker round has actually estimated.
  // Derived from the session queues exactly as the server derives it, so the
  // Estimate step and the checklist can never disagree about what is left.
  const [pokerCoveredIds, setPokerCoveredIds] = useState<Set<string>>(new Set())
  const [viewingPokerResults, setViewingPokerResults] = useState(false)
  const [session, setSession] = useState<any>(null)
  const [goal, setGoal] = useState('')
  const [acknowledged, setAcknowledged] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [completed, setCompleted] = useState<{ message: string } | null>(null)
  const [poker, setPoker] = useState<any>(null)
  const [backlog, setBacklog] = useState<BacklogTask[]>([])
  const [scope, setScope] = useState<BacklogTask[]>([])
  // PLN-10 `participantIds`. Only the sprint team could vote before, which shut
  // out QA and specialists who estimate work they are not assigned.
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([])
  const [voterIds, setVoterIds] = useState<string[] | null>(null)
  const [choosingVoters, setChoosingVoters] = useState(false)
  // E20 — reopening an already-planned sprint is legal, but it must be a
  // deliberate choice. Without this, "no open session" looks identical
  // whether planning has never run or has already completed once, and the
  // plain "Start planning" button lets a PM loop plan -> complete -> plan
  // indefinitely without ever starting the sprint.
  const [history, setHistory] = useState<any[]>([])
  const [confirmingReopen, setConfirmingReopen] = useState(false)
  // Mirrors KanbanBoard's activeTask/DragOverlay pattern: TaskPane's list is
  // overflow-y-auto (for max-h scrolling), which per CSS forces overflow-x to
  // auto too — an inline transform + z-index cannot escape that clip, so the
  // dragged row visually vanishes at the pane edge without this. DragOverlay
  // portals its content outside the clipped tree.
  const [activeTask, setActiveTask] = useState<BacklogTask | null>(null)

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
        const sessions = pokerPayload.data?.sessions ?? []
        setOpenPokerSession(sessions.find((entry: any) => entry.status === 'open') ?? null)
        // Sessions come back sorted by `createdAt` descending, so the first
        // completed one is the most recent round.
        setLastCompletedPokerSession(
          sessions.find((entry: any) => entry.status === 'completed') ?? null
        )

        const covered = new Set<string>()
        for (const entry of sessions) {
          for (const item of entry.queue ?? []) {
            if (item?.status === 'estimated' && item.task) covered.add(String(item.task))
          }
        }
        setPokerCoveredIds(covered)
      }

      if (checklistResponse.ok) setData(checklistPayload.data)
      if (sessionResponse.ok) {
        setSession(sessionPayload.data.session)
        setHistory(sessionPayload.data.history ?? [])
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
      if (response.ok) setBacklog(asTaskList(payload))
    } catch {
      /* The backlog panel is additive; a failure here must not blank the gate. */
    }
  }, [projectId])

  // The sprint scope pane: what a PM has already committed. Without this a
  // PM could add tasks but never see or remove what's already in the sprint
  // without leaving the page.
  const loadScope = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/tasks?sprint=${encodeURIComponent(sprintId)}&limit=500`
      )
      const payload = await response.json()
      if (response.ok) setScope(asTaskList(payload))
    } catch {
      /* Same reasoning as loadBacklog: additive, must not blank the gate. */
    }
  }, [sprintId])

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
      await Promise.all([refresh(), loadBacklog(), loadScope()])
    } catch (error) {
      notify.error({
        title: intoSprint ? 'Could not add the task' : 'Could not remove the task',
        message: error instanceof Error ? error.message : undefined
      })
    } finally {
      setBusy(false)
    }
  }

  /**
   * PC-8 — one owner per task, decided here rather than at task creation.
   *
   * Goes through the planning endpoint rather than a generic task update so
   * the sprint roster rule is enforced, and so a QA can be pulled onto the
   * sprint team in the same request: capacity and the workload board are read
   * from `Sprint.teamMembers`, and an assignee missing from it would have
   * their minutes vanish from every number on this screen.
   */
  const assignTask = async (
    taskId: string,
    assigneeId: string | null,
    member?: AssignableMember
  ) => {
    setBusy(true)
    try {
      const response = await fetch(
        `/api/sprints/${sprintId}/planning-session/assignments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assignments: [{ taskId, assigneeId }],
            ...(member && !member.onSprintTeam ? { addToSprintTeam: true } : {})
          })
        }
      )
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? 'Could not assign the task')
      }

      const task = payload.data?.tasks?.[0]
      const label = task?.key ? `${task.key}` : 'Task'
      notify.success({
        title: assigneeId
          ? `Assigned ${label} to ${member?.name ?? 'the assignee'}`
          : `Unassigned ${label}`,
        message: payload.data?.addedToSprintTeam?.length
          ? 'They were added to the sprint team.'
          : undefined
      })

      await Promise.all([refresh(), loadScope()])
    } catch (error) {
      notify.error({
        title: 'Could not assign the task',
        message: error instanceof Error ? error.message : undefined
      })
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [refresh])

  // Scope and members load unconditionally, not only once a session is open:
  // a voter arriving to join a round has no session in view but still needs
  // the scope map to see task titles and assignees, and the assignment board
  // needs the roster before the first drag.
  useEffect(() => {
    loadScope()
    loadMembers()
  }, [loadScope, loadMembers])

  useEffect(() => {
    if (session) loadBacklog()
  }, [session, loadBacklog])

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

  const scopeById = useMemo(
    () => new Map(scope.map((task) => [task._id, task])),
    [scope]
  )

  /**
   * Who a sprint task may be assigned to.
   *
   * The sprint team first, carrying the live load figures the checklist
   * already computes, then project QA who are not on the team yet — assigning
   * to one of those is what pulls them onto it.
   */
  const assignableMembers = useMemo<AssignableMember[]>(() => {
    const sprintTeam = (data?.members ?? []).map((member) => ({
      memberId: member.id,
      name: member.name,
      onSprintTeam: true,
      role: projectMembers.find((candidate) => candidate.memberId === member.id)?.role ?? null,
      assignedMinutes: member.assignedMinutes,
      capacityMinutes: member.capacityMinutes
    }))

    const onTeam = new Set(sprintTeam.map((member) => member.memberId))
    const qa = projectMembers
      .filter((member) => !onTeam.has(member.memberId) && isQaRole(member.role))
      .map((member) => ({
        memberId: member.memberId,
        name:
          [member.firstName, member.lastName].filter(Boolean).join(' ') ||
          member.email ||
          member.memberId,
        onSprintTeam: false,
        role: member.role ?? null
      }))

    return [...sprintTeam, ...qa]
  }, [data?.members, projectMembers])

  const unpokered = useMemo(
    () => unpokeredTasks(scope, pokerCoveredIds),
    [scope, pokerCoveredIds]
  )

  const gateInput = useMemo<GateInput>(
    () => ({
      hasSession: !!session,
      scopeCount: scope.length,
      items: data?.checklist.items ?? [],
      blockers: data?.checklist.blockers ?? [],
      unpokeredCount: unpokered.length
    }),
    [session, scope.length, data?.checklist.items, data?.checklist.blockers, unpokered.length]
  )

  /**
   * Opens the modal on a round somebody else started.
   *
   * The queue is rebuilt from the session document against the sprint scope,
   * and the deck is derived locally — `deckCards` is pure, so there is nothing
   * to fetch. It used to resolve titles from the checklist's offending tasks,
   * which only ever contains tasks that failed a check: anything already
   * passing showed up in the round as the literal word "Task".
   */
  const joinPoker = () => {
    if (!openPokerSession) return
    setPoker({
      session: openPokerSession,
      cards: deckCards(openPokerSession.deckType as DeckType),
      queue: buildPokerQueue(openPokerSession.queue ?? [], scopeById)
    })
  }

  const startPoker = async () => {
    // Everything in scope that a round has not already estimated — not just
    // the tasks with no estimate at all. A task estimated by hand still has
    // to go through poker to clear PC-9, and `offendingTasks` would never
    // have listed it.
    if (!unpokered.length) {
      notify.info?.({ title: standupStrings.planning.pokerNothingToEstimate() })
      return
    }

    setBusy(true)
    try {
      // A deliberate opt-out is only meaningful if the facilitator was a
      // selectable candidate in the picker to begin with — otherwise their
      // absence from `voterIds` is just them never having been on the sprint
      // team, which must still fall back to the lockout-safe default.
      const facilitatorIsCandidate = projectMembers.some((member) => member.memberId === user?.id)
      const excludeFacilitator =
        facilitatorIsCandidate && voterIds !== null && !voterIds.includes(user!.id)

      const response = await fetch(`/api/sprints/${sprintId}/poker-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskIds: unpokered.map((task) => task._id),
          // Omitted entirely when untouched, so the server keeps its sprint-team
          // default rather than receiving an empty list.
          ...(voterIds?.length ? { participantIds: voterIds } : {}),
          ...(excludeFacilitator ? { excludeFacilitator: true } : {})
        })
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error?.message ?? 'Could not open a poker session')

      setPoker({
        session: payload.data.session,
        cards: payload.data.cards,
        queue: buildPokerQueue(payload.data.session.queue ?? [], scopeById)
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

  const handleDragStart = (event: DragStartEvent) => {
    const activeId = event.active.id
    if (typeof activeId !== 'string') return
    const task = backlog.find((candidate) => candidate._id === activeId) ??
      scope.find((candidate) => candidate._id === activeId)
    setActiveTask(task ?? null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null)

    const overId = event.over?.id
    const activeId = event.active.id
    if (!overId || typeof activeId !== 'string' || typeof overId !== 'string') return

    const action = resolveDrop(overId, activeId, backlog, scope)
    if (action === 'add') moveTask(activeId, true)
    if (action === 'remove') moveTask(activeId, false)
  }

  const header = (actions?: React.ReactNode) => (
    <PlanningHeader
      sprintId={sprintId}
      sprintName={sprintName}
      sprintStatus={sprintStatus}
      sprintDescription={sprintDescription}
      actions={actions}
    />
  )

  if (loading) {
    return (
      <div className="flex w-full flex-col gap-5">
        {header()}
        <PlanningSkeleton />
      </div>
    )
  }

  // UI-7 — the post-completion confirmation.
  if (completed) {
    return (
      <div className="flex w-full flex-col gap-5">
        {header()}
        <div
          role="status"
          className="flex flex-col items-center gap-3 rounded-[16px] border border-[var(--plan-border)] bg-[var(--plan-surface)] p-8 text-center"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--plan-success-bg)]">
            <Check className="h-5 w-5 text-[var(--plan-success)]" />
          </span>
          <h2 className="text-[16px] font-bold text-[var(--plan-text)]">Planning complete</h2>
          <p className="text-[13px] text-[var(--plan-text)]">{completed.message}</p>
          <p className="text-[12px] text-[var(--plan-muted)]">
            Stand-ups are generated when the scheduler runs for this sprint.
          </p>
        </div>
      </div>
    )
  }

  const totals = data?.checklist.totals
  const poke = pokerGate(gateInput)
  const finish = completeGate(gateInput)
  const steps = stepStates(gateInput)
  const warnBlocked = (reason: string) => notify.warning({ title: reason })
  const jumpTo = (target: ChecklistFixTarget) => scrollToSection(`planning-${target}`)

  const headerActions = (
    <>
      {openPokerSession && (
        <PlanButton onClick={joinPoker} disabled={busy}>
          <Users />
          Join planning poker
        </PlanButton>
      )}

      {/* Server-side gating (SPRINT_UPDATE, same as `finalize`) is what
          actually restricts who set these estimates — this button only
          decides who sees a shortcut to look back at them. */}
      {canFacilitate && lastCompletedPokerSession && (
        <PlanButton onClick={() => setViewingPokerResults(true)} disabled={busy}>
          <BarChart3 />
          View poker results
        </PlanButton>
      )}

      {/* UI-6 — the first blocking check, stated on screen rather than in a
          `title` a disabled button can never surface. */}
      {canFacilitate && (
        <GateButton
          id="complete-planning"
          label="Complete planning"
          reason={finish.reason}
          enabled={finish.enabled}
          busy={busy}
          onClick={complete}
          onBlockedClick={warnBlocked}
          icon={busy ? <Loader2 className="animate-spin" /> : <Check />}
        />
      )}

      {!openPokerSession && canFacilitate && (
        <GateButton
          id="planning-poker"
          label="Planning poker"
          tone="primary"
          icon={<Spade />}
          reason={poke.reason}
          enabled={poke.enabled}
          busy={busy}
          onClick={() => setChoosingVoters(true)}
          onBlockedClick={warnBlocked}
        />
      )}
    </>
  )

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex w-full flex-col gap-[18px]">
        {header(headerActions)}
        {/* Planning is an ordered flow, so it is shown as one: which step the
            PM is on, and what the next one is waiting for. */}
        <PlanningStepRail states={steps} />
      </div>

      {/* PLN-18 — persistent while the waiver is active, naming the waived
          items and the expiry. Not dismissible: a waiver nobody can see is
          exactly what the requirement exists to prevent. */}
      {waiverBanner && (
        <PlanBanner
          tone="warning"
          icon={<AlertTriangle />}
          actions={
            data && (
              <PlanButton onClick={() => scrollToSection('planning-checklist')}>
                Review waivers
              </PlanButton>
            )
          }
        >
          {waiverBanner} A waiver never allows an unestimated task to be allocated.
        </PlanBanner>
      )}

      {!session && (
        <PlanBanner
          tone="info"
          icon={<Info />}
          actions={
            canFacilitate &&
            (history.length > 0 ? (
              <PlanButton onClick={() => setConfirmingReopen(true)} disabled={busy}>
                Reopen planning
              </PlanButton>
            ) : (
              <PlanButton tone="primary" onClick={openSession} disabled={busy}>
                Start planning
              </PlanButton>
            ))
          }
        >
          {history.length > 0
            ? `This sprint has already been planned ${history.length > 1 ? `${history.length} times` : 'once'}. Reopening starts a new round and re-evaluates every check.`
            : 'No planning session is active. Start a session to scope, assign and estimate work — stand-ups cannot run until this sprint has been planned.'}
        </PlanBanner>
      )}

      {/* E20 — reopening is legal but must be deliberate, not a side effect of
          the button always reading "Start planning" after a completion. */}
      <ResponsiveDialog
        open={confirmingReopen}
        onOpenChange={setConfirmingReopen}
        title="Reopen planning for this sprint?"
        description={`This sprint was already planned${
          history.length > 0 && history[0]?.completedAt
            ? ` on ${new Date(history[0].completedAt).toLocaleDateString()}`
            : ''
        }. Reopening starts a new planning session, re-runs every check, and can change the sprint's schedule and locked estimates once you complete it again. ${standupStrings.planning.reopenUnstartsSprint()}`}
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmingReopen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              setConfirmingReopen(false)
              await openSession()
            }}
            disabled={busy}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reopen planning
          </Button>
        </div>
      </ResponsiveDialog>

      {totals && <PlanningOverview totals={totals} memberCount={data?.members?.length ?? 0} />}

      {/* The number a PM actually needs before committing scope: not "is the
          team, in aggregate, under the ceiling" but "is any specific person
          about to be buried while someone else has nothing." This shows
          everyone, live, as tasks move between the panes below. */}
      {data && (data.members ?? []).length > 0 && <TeamWorkload members={data.members} />}

      {session && (
        <PlanCard
          id="planning-goal"
          title="Sprint goal"
          description="Give the team one clear outcome to optimize for."
        >
          <textarea
            id="sprint-goal"
            aria-label="Sprint goal"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            onBlur={saveGoal}
            maxLength={GOAL_MAX}
            placeholder="Ship the invoicing module end to end for pilot customers."
            className="min-h-[88px] w-full resize-y rounded-[12px] border border-[var(--plan-border)] bg-[var(--plan-raised)] p-[14px] text-[13px] leading-[1.45] text-[var(--plan-text)] placeholder:text-[var(--plan-muted)] focus:border-[var(--plan-accent)] focus:outline-none"
          />
          <p
            className={cn(
              'text-[10px]',
              goal.trim().length < GOAL_MIN ? 'text-[var(--plan-warning)]' : 'text-[var(--plan-muted)]'
            )}
          >
            {goal.length} / {GOAL_MAX} characters
            {goal.trim().length < GOAL_MIN && ` · at least ${GOAL_MIN} needed`}
          </p>
        </PlanCard>
      )}

      {session && (
        <PlanCard
          id="planning-scope"
          title="Sprint scope"
          description="Drag tasks between lists, or use Add and Remove for keyboard-friendly planning."
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="grid w-full gap-[14px] md:grid-cols-2">
              <TaskPane
                id="backlog-pool"
                title={`Backlog · ${backlog.length}`}
                hint="↕ Drag to sprint"
                emptyMessage="Nothing unassigned in the backlog for this project."
                tasks={backlog}
                actionLabel="Add"
                onAction={(taskId) => moveTask(taskId, true)}
                busy={busy}
              />
              <TaskPane
                id="sprint-scope"
                title={`In this sprint · ${scope.length}`}
                hint="↕ Drag to backlog"
                emptyMessage="Nothing is in scope yet. Add tasks from the backlog, or drag one in."
                tasks={scope}
                actionLabel="Remove"
                onAction={(taskId) => moveTask(taskId, false)}
                busy={busy}
              />
            </div>

            {/* Portals outside the panes' scroll containers, so the dragged
                card stays visible the whole way across to the other pane. */}
            <DragOverlay>
              {activeTask ? (
                <PlanTaskCard
                  taskKey={activeTask.displayId}
                  title={activeTask.title}
                  meta={taskMeta(activeTask)}
                  className="cursor-grabbing shadow-[0_8px_24px_rgba(0,0,0,0.25)]"
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        </PlanCard>
      )}

      {/* Step 2. Below the scope panes because it operates on what they put
          in scope, and above the checklist because PC-8 is what it clears. */}
      {session && scope.length > 0 && assignableMembers.length > 0 && (
        <AssignmentBoard
          tasks={scope}
          members={assignableMembers}
          busy={busy}
          onAssign={assignTask}
        />
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
          onJump={jumpTo}
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
        description="Select the teammates joining this round. You can always run it with the sprint team as it stands."
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
                  className="flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2 py-1.5 hover:bg-[var(--apple-quaternary-fill)]"
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
          // A viewer who isn't on the participant list (including a
          // facilitator who deliberately opted out — PLN-11) gets a
          // read-only version of the round instead of the card grid.
          isParticipant={(poker.session.participants ?? []).some(
            (id: any) => String(id) === user?.id
          )}
          pointsToHours={poker.session.pointsToHours}
          estimationUnit={poker.session.estimationUnit}
          onEstimated={refresh}
        />
      )}

      {lastCompletedPokerSession && (
        <PokerResultsModal
          open={viewingPokerResults}
          onOpenChange={setViewingPokerResults}
          sessionId={lastCompletedPokerSession._id}
          estimationUnit={lastCompletedPokerSession.estimationUnit}
          queue={(lastCompletedPokerSession.queue ?? []).map((entry: any): PokerResultsQueueEntry => {
            const taskId = String(entry.task)
            const task = scopeById.get(taskId)
            return {
              taskId,
              key: task?.displayId,
              title: task?.title ?? 'Task',
              status: entry.status,
              finalValue: entry.finalValue,
              consensusReached: entry.consensusReached,
              voteSpread: entry.voteSpread
            }
          })}
        />
      )}
    </div>
  )
}

/**
 * Builds the queue the poker modal walks, resolving each entry against the
 * sprint scope.
 *
 * The assignee travels with the queue rather than being fetched inside the
 * modal: the workspace already has it, and `PokerModal` polls on a timer, so
 * every fetch added there is another request per round per viewer.
 */
export function buildPokerQueue(
  sessionQueue: Array<{ task: unknown; status: string }>,
  scopeById: Map<string, ScopeTask>
): Array<{ taskId: string; key: string; title: string; status: string; assigneeName?: string }> {
  return sessionQueue.map((entry) => {
    const taskId = String(entry.task)
    const task = scopeById.get(taskId)
    const assigneeName = assigneeNamesOf(task).join(', ')
    return {
      taskId,
      key: task?.displayId ?? '',
      title: task?.title ?? 'Task',
      status: entry.status,
      ...(assigneeName ? { assigneeName } : {})
    }
  })
}

/**
 * Pure drag-resolution: given what was dropped where, decide whether that's
 * an add, a remove, or nothing — no DOM, no network, so it's testable
 * without simulating a real pointer drag (dnd-kit's own drag mechanics are
 * out of scope for jsdom; this function is the part worth unit testing).
 */
export function resolveDrop(
  overId: string,
  activeTaskId: string,
  backlog: BacklogTask[],
  scope: BacklogTask[]
): 'add' | 'remove' | null {
  const inBacklog = backlog.some((task) => task._id === activeTaskId)
  const inScope = scope.some((task) => task._id === activeTaskId)

  if (overId === 'sprint-scope' && inBacklog) return 'add'
  if (overId === 'backlog-pool' && inScope) return 'remove'
  return null
}

const GOAL_MIN = 10
const GOAL_MAX = 500

function taskMeta(task: BacklogTask): string {
  return `${estimateLabel(task)} · ${assigneeNamesOf(task)[0] ?? 'Unassigned'}`
}

const STATUS_COLORS: Record<string, { fg: string; bg: string }> = {
  draft: { fg: 'var(--plan-muted)', bg: 'var(--plan-raised)' },
  planning: { fg: 'var(--plan-success)', bg: 'var(--plan-success-bg)' },
  planned: { fg: 'var(--plan-accent)', bg: 'var(--plan-info-bg)' },
  active: { fg: 'var(--plan-success)', bg: 'var(--plan-success-bg)' },
  completed: { fg: 'var(--plan-muted)', bg: 'var(--plan-raised)' },
  cancelled: { fg: 'var(--plan-danger)', bg: 'var(--plan-danger-bg)' }
}

function PlanningHeader({
  sprintId,
  sprintName,
  sprintStatus,
  sprintDescription,
  actions
}: {
  sprintId: string
  sprintName: string
  sprintStatus: string
  sprintDescription?: string | null
  actions?: React.ReactNode
}) {
  const status = STATUS_COLORS[sprintStatus?.toLowerCase()] ?? STATUS_COLORS.draft
  const description = sprintDescription?.trim()

  return (
    <header className="flex w-full flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        <Link
          href={`/sprints/${sprintId}`}
          className="flex w-fit items-center gap-1.5 text-[12px] text-[var(--plan-muted)] transition-colors hover:text-[var(--plan-text)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {sprintName}
        </Link>
        <h1 className="text-[30px] leading-tight text-[var(--plan-text)]">Sprint planning</h1>
        <div className="flex min-w-0 flex-col items-start gap-2">
          <p className="max-w-[60ch] truncate text-[14px] text-[var(--plan-text)]">
            {sprintName}
            {description && ` · ${description}`}
          </p>
          {sprintStatus && (
            <span
              className="rounded-full px-2 py-1 text-[10px] font-bold uppercase leading-none"
              style={{ color: status.fg, backgroundColor: status.bg }}
            >
              {sprintStatus}
            </span>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

function StatTile({
  label,
  value,
  detail,
  valueColor
}: {
  label: string
  value: React.ReactNode
  detail: React.ReactNode
  valueColor?: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-[7px] rounded-[16px] border border-[var(--plan-border)] bg-[var(--plan-surface)] p-[18px]">
      <p className="text-[11px] text-[var(--plan-muted)]">{label}</p>
      <p className="text-[24px] leading-tight tabular-nums" style={{ color: valueColor ?? 'var(--plan-text)' }}>
        {value}
      </p>
      <p className="text-[11px] text-[var(--plan-muted)]">{detail}</p>
    </div>
  )
}

/**
 * Team capacity, scoped effort and what is still unestimated — the ceiling
 * the spec tells the PM to note before anything else.
 */
function PlanningOverview({
  totals,
  memberCount
}: {
  totals: ChecklistPayload['checklist']['totals']
  memberCount: number
}) {
  const overCapacity = totals.totalEstimatedMinutes > totals.netCapacityMinutes
  // The true, uncapped ratio: an over-capacity sprint must read 150%, never a
  // reassuring clamped 100%.
  const percent =
    totals.netCapacityMinutes > 0
      ? Math.round((totals.totalEstimatedMinutes / totals.netCapacityMinutes) * 100)
      : 0
  const unestimated = Math.max(0, totals.taskCount - totals.estimatedTaskCount)

  return (
    <div className="grid w-full gap-[14px] sm:grid-cols-3">
      <StatTile
        label="Team capacity"
        value={`${hoursValue(totals.netCapacityMinutes)} h`}
        detail={`Across ${memberCount} ${memberCount === 1 ? 'member' : 'members'}`}
      />
      <StatTile
        label="Scoped effort"
        value={`${hoursValue(totals.totalEstimatedMinutes)} h`}
        valueColor={overCapacity ? 'var(--plan-warning)' : undefined}
        detail={
          <>
            {totals.taskCount} {totals.taskCount === 1 ? 'task' : 'tasks'} in sprint ·{' '}
            <span className={cn(overCapacity && 'font-bold text-[var(--plan-warning)]')}>
              {percent}%
            </span>{' '}
            of capacity
          </>
        }
      />
      <StatTile
        label="Unestimated"
        value={`${unestimated} ${unestimated === 1 ? 'task' : 'tasks'}`}
        valueColor={unestimated > 0 ? 'var(--plan-danger)' : undefined}
        detail={unestimated > 0 ? 'Blocking completion' : 'Every task has an estimate'}
      />
    </div>
  )
}

/** A member's load state, in the order the board sorts by (worst first). */
type LoadState = 'over' | 'full' | 'room' | 'idle'

function loadStateOf(assignedMinutes: number, capacityMinutes: number): LoadState {
  if (assignedMinutes === 0) return 'idle'
  if (capacityMinutes <= 0) return assignedMinutes > 0 ? 'over' : 'idle'
  const ratio = assignedMinutes / capacityMinutes
  if (ratio > 1) return 'over'
  if (ratio >= 0.7) return 'full'
  return 'room'
}

const LOAD_ORDER: Record<LoadState, number> = { over: 0, full: 1, room: 2, idle: 3 }

/** NFR-A1 — every state carries a text label, never colour alone. */
const LOAD_CONFIG: Record<LoadState, { label: string; color: string }> = {
  over: { label: 'Over', color: 'var(--plan-danger)' },
  full: { label: 'Full', color: 'var(--plan-warning)' },
  room: { label: 'Room', color: 'var(--plan-success)' },
  idle: { label: 'Idle', color: 'var(--plan-idle)' }
}

const AVATAR_COLORS = ['#7A5AF8', '#3478F6', '#2F9D68', '#D88A15', '#D9467A', '#1B9AAA']

function avatarColor(seed: string): string {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)
  return letters.toUpperCase()
}

/**
 * The workload board: every sprint member's pre-assigned load against their
 * own sprint capacity, sorted worst-first. Reads straight from the same
 * checklist payload `refresh()` already re-fetches after every add/remove, so
 * moving a task visibly moves its owner's bar with no extra plumbing.
 */
function TeamWorkload({ members }: { members: MemberLoad[] }) {
  const sorted = [...members].sort((a, b) => {
    const stateA = loadStateOf(a.assignedMinutes, a.capacityMinutes)
    const stateB = loadStateOf(b.assignedMinutes, b.capacityMinutes)
    if (LOAD_ORDER[stateA] !== LOAD_ORDER[stateB]) return LOAD_ORDER[stateA] - LOAD_ORDER[stateB]
    return b.assignedMinutes - a.assignedMinutes
  })

  return (
    <PlanCard
      id="planning-workload"
      title="Team workload"
      description="Sorted by highest utilization so risks are visible first."
      aria-label="Team workload"
    >
      <ul className="flex w-full flex-col gap-2">
        {sorted.map((member) => {
          const state = loadStateOf(member.assignedMinutes, member.capacityMinutes)
          const config = LOAD_CONFIG[state]
          const pct =
            member.capacityMinutes > 0
              ? Math.min(100, (member.assignedMinutes / member.capacityMinutes) * 100)
              : member.assignedMinutes > 0
                ? 100
                : 0

          return (
            <li
              key={member.id}
              className="flex items-center gap-3 rounded-[12px] bg-[var(--plan-raised)] p-3 sm:gap-[14px]"
            >
              <span
                aria-hidden
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: avatarColor(member.id || member.name) }}
              >
                {initialsOf(member.name)}
              </span>
              <span
                className="w-24 shrink-0 truncate text-[12px] text-[var(--plan-text)] sm:w-[180px]"
                title={member.name}
              >
                {member.name}
              </span>
              <span
                role="progressbar"
                aria-label={`${member.name} utilization`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(pct)}
                className="h-[6px] min-w-0 flex-1 overflow-hidden rounded-[3px] bg-[var(--plan-border)]"
              >
                <span
                  className="block h-full rounded-[3px] transition-[width] duration-300"
                  style={{
                    width: state === 'idle' ? '8px' : `${pct}%`,
                    backgroundColor: config.color
                  }}
                />
              </span>
              <span className="w-[76px] shrink-0 text-[11px] tabular-nums text-[var(--plan-muted)]">
                {hours(member.assignedMinutes)} / {hours(member.capacityMinutes)} h
              </span>
              <PlanPill color={config.color} className="w-[52px] shrink-0">
                {config.label}
              </PlanPill>
            </li>
          )
        })}
      </ul>
    </PlanCard>
  )
}

function TaskPane({
  id,
  title,
  hint,
  emptyMessage,
  tasks,
  actionLabel,
  onAction,
  busy
}: {
  id: string
  title: string
  hint: string
  emptyMessage: string
  tasks: BacklogTask[]
  actionLabel: string
  onAction: (taskId: string) => void
  busy: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-w-0 flex-col gap-[10px] rounded-[12px] bg-[var(--plan-raised)] p-[14px] ring-1 ring-transparent transition-shadow',
        isOver && 'ring-[var(--plan-accent)]'
      )}
    >
      <div className="flex flex-col">
        <p className="text-[13px] font-bold text-[var(--plan-text)]">{title}</p>
        <p className="text-[10px] text-[var(--plan-muted)]">{hint}</p>
      </div>
      <div className="-mx-1 flex max-h-[360px] flex-col gap-[10px] overflow-y-auto px-1 py-0.5">
        {tasks.length === 0 ? (
          <p className="rounded-[12px] border border-dashed border-[var(--plan-border)] p-4 text-center text-[12px] text-[var(--plan-muted)]">
            {emptyMessage}
          </p>
        ) : (
          tasks.map((task) => (
            <DraggableTaskRow
              key={task._id}
              task={task}
              actionLabel={actionLabel}
              onAction={onAction}
              busy={busy}
            />
          ))
        )}
      </div>
    </div>
  )
}

function DraggableTaskRow({
  task,
  actionLabel,
  onAction,
  busy
}: {
  task: BacklogTask
  actionLabel: string
  onAction: (taskId: string) => void
  busy: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task._id })

  return (
    <PlanTaskCard
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      taskKey={task.displayId}
      title={task.title}
      meta={taskMeta(task)}
      dragging={isDragging}
      className="cursor-grab"
      action={
        // NFR-A2 — every drag interaction needs a keyboard/click equivalent.
        // This button is that equivalent, not a leftover.
        <PlanButton
          disabled={busy}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onAction(task._id)
          }}
        >
          {actionLabel}
        </PlanButton>
      }
    />
  )
}

function PlanningSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy>
      <div className="h-[92px] animate-pulse rounded-[16px] bg-[var(--plan-surface)]" />
      <div className="grid gap-[14px] sm:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-[98px] animate-pulse rounded-[16px] bg-[var(--plan-surface)]" />
        ))}
      </div>
      {[0, 1].map((index) => (
        <div key={index} className="h-[200px] animate-pulse rounded-[16px] bg-[var(--plan-surface)]" />
      ))}
    </div>
  )
}
