'use client'

/**
 * Step 2 of planning: give every sprint task exactly one owner (PC-8).
 *
 * Scoped tasks are grouped into one column per owner plus an Unassigned
 * column, so unowned work stays visible. Two equal ways to assign, not one and
 * a fallback: dragging a card onto a column, and the card's "Move" picker. The
 * picker is not a courtesy — this screen is a hard gate on starting the
 * sprint, and a gate that can only be passed with a mouse is a gate some
 * people cannot pass.
 *
 * A QA who is not on the sprint team yet can be picked, and the picker says
 * that choosing them admits them to it.
 *
 * Confirmation toasts are deliberately not raised here: `PlanningWorkspace`'s
 * `assignTask` already notifies on success and failure, and it is the layer
 * that knows whether the server admitted anyone to the sprint team.
 */
import { useMemo, useState } from 'react'
import {
  closestCorners,
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { ArrowLeftRight } from 'lucide-react'

import { cn } from '@/lib/utils'

import {
  assigneeIdOf,
  isQaRole,
  type AssignableMember,
  type ScopeTask
} from './types'
import {
  PlanAvatar,
  PlanCard,
  PlanDragOverlay,
  PlanTaskCard,
  planButtonClass,
  planTaskActionClass
} from './ui'

const UNASSIGNED_LANE = 'unassigned'

/** Says out loud that picking one of these people changes the sprint roster. */
const QA_GROUP_LABEL = 'QA — will be added to the sprint team'

export interface AssignmentBoardProps {
  tasks: ScopeTask[]
  members: AssignableMember[]
  busy: boolean
  /**
   * Viewers without SPRINT_UPDATE (team members, QA) see who owns what but
   * get no drag, no picker - the server would refuse the change anyway.
   */
  readOnly?: boolean
  /** `null` clears the assignment. Resolves once the server has agreed. */
  onAssign: (taskId: string, assigneeId: string | null, member?: AssignableMember) => Promise<void>
}

/**
 * Resolves a drag to the lane it landed on.
 *
 * Pure and exported for the same reason `resolveDrop` is: the mapping from a
 * drop target to an assignee is the part worth testing, and it needs no DOM.
 */
export function resolveAssignmentDrop(
  overId: string,
  currentAssigneeId: string | null
): { assigneeId: string | null } | null {
  const target = overId === UNASSIGNED_LANE ? null : overId
  // Dropping a task back where it already was is not a change, and firing a
  // request for it would notify the assignee that they had been assigned work
  // they already had.
  if (target === currentAssigneeId) return null
  return { assigneeId: target }
}

export function estimateLabel(task: ScopeTask): string {
  const minutes = task.originalEstimateMinutes ?? (task.estimatedHours ? task.estimatedHours * 60 : 0)
  return minutes > 0 ? `${(minutes / 60).toFixed(1)} h` : '-'
}

interface Lane {
  id: string
  name: string
  /** The lane's owner, for its avatar; absent on the Unassigned lane. */
  member?: AssignableMember
  tasks: ScopeTask[]
}

export function AssignmentBoard({
  tasks,
  members,
  busy,
  readOnly = false,
  onAssign
}: AssignmentBoardProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const [activeTask, setActiveTask] = useState<ScopeTask | null>(null)

  // A task whose assignee is not on the board is parked as unassigned: PC-8
  // blocks on it either way, and hiding it in a lane nobody can see would
  // leave the PM with a blocking check and no row to fix it on.
  const { lanes, unassignedCount, laneOf } = useMemo(() => {
    const byAssignee = new Map<string, ScopeTask[]>()
    for (const member of members) byAssignee.set(member.memberId, [])

    const unassigned: ScopeTask[] = []
    const lookup = new Map<string, string | null>()

    for (const task of tasks) {
      const assigneeId = assigneeIdOf(task)
      if (assigneeId && byAssignee.has(assigneeId)) {
        byAssignee.get(assigneeId)!.push(task)
        lookup.set(task._id, assigneeId)
      } else {
        unassigned.push(task)
        lookup.set(task._id, null)
      }
    }

    // The sprint team always gets a column; a QA off the team only once they
    // own something, so the board doesn't fill with empty specialist lanes.
    const memberLanes: Lane[] = members
      .filter((member) => member.onSprintTeam || (byAssignee.get(member.memberId)?.length ?? 0) > 0)
      .map((member) => ({
        id: member.memberId,
        name: member.name,
        member,
        tasks: byAssignee.get(member.memberId) ?? []
      }))

    return {
      lanes: [...memberLanes, { id: UNASSIGNED_LANE, name: 'Unassigned', tasks: unassigned }],
      unassignedCount: unassigned.length,
      laneOf: lookup
    }
  }, [tasks, members])

  const teamOptions = members.filter((member) => member.onSprintTeam)
  const qaOptions = members.filter((member) => !member.onSprintTeam && isQaRole(member.role))

  /**
   * Both the drop and the picker resolve through here. The no-op guard is
   * checked against the task's real assignee, so a task parked as unassigned
   * because its owner left the board can still be reassigned to that owner.
   */
  const handleAssign = async (taskId: string, memberId: string | null) => {
    const task = tasks.find((candidate) => candidate._id === taskId)
    if (!task) return

    const action = resolveAssignmentDrop(memberId ?? UNASSIGNED_LANE, assigneeIdOf(task))
    if (!action) return

    await onAssign(
      taskId,
      action.assigneeId,
      members.find((member) => member.memberId === action.assigneeId)
    )
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTask(tasks.find((task) => task._id === event.active.id) ?? null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null)
    const overId = event.over?.id
    const taskId = event.active.id
    if (busy || readOnly || typeof overId !== 'string' || typeof taskId !== 'string') return
    handleAssign(taskId, overId === UNASSIGNED_LANE ? null : overId)
  }

  return (
    <PlanCard
      id="planning-assignment"
      title="Assignment board"
      description={
        readOnly
          ? 'Scoped tasks grouped by owner.'
          : 'Scoped tasks grouped by owner. Drag a task onto a person, or use its move button.'
      }
      aria-label="Task assignment"
      aside={
        <p
          role="status"
          className={cn(
            'apple-type-subheadline font-semibold',
            unassignedCount > 0 ? 'text-[var(--plan-warning)]' : 'text-[var(--plan-success)]'
          )}
        >
          {unassignedCount > 0
            ? `${unassignedCount} ${unassignedCount === 1 ? 'task still needs' : 'tasks still need'} an assignee`
            : 'Every task has an owner.'}
        </p>
      }
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        // dnd-kit's default auto-scroll drives the page scroller whenever the
        // drag preview nears its edge, accelerating - on a page this long it
        // ran the board off-screen before a card could reach a lane. The lanes
        // are fixed-height now, so the board fits in view; the wheel still
        // scrolls mid-drag for the rare lane below the fold.
        autoScroll={false}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid w-full gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
          {lanes.map((lane) => (
            <AssignmentLane key={lane.id} lane={lane} readOnly={readOnly}>
              {lane.tasks.map((task) => (
                <DraggableAssignmentCard
                  key={task._id}
                  task={task}
                  busy={busy}
                  readOnly={readOnly}
                  picker={
                    !readOnly && (
                      <MovePicker
                        task={task}
                        value={laneOf.get(task._id) ?? null}
                        teamOptions={teamOptions}
                        qaOptions={qaOptions}
                        busy={busy}
                        onChange={(memberId) => handleAssign(task._id, memberId)}
                      />
                    )
                  }
                />
              ))}
            </AssignmentLane>
          ))}
        </div>

        <PlanDragOverlay>
          {activeTask ? (
            <PlanTaskCard
              taskKey={activeTask.displayId}
              title={activeTask.title}
              meta={metaOf(activeTask)}
              className="cursor-grabbing shadow-[0_8px_28px_rgba(0,0,0,0.18)]"
            />
          ) : null}
        </PlanDragOverlay>
      </DndContext>
    </PlanCard>
  )
}

/** Just the estimate: the lane a card sits in already names its owner. */
function metaOf(task: ScopeTask): string {
  return estimateLabel(task)
}

function AssignmentLane({
  lane,
  readOnly,
  children
}: {
  lane: Lane
  readOnly: boolean
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: lane.id, disabled: readOnly })

  return (
    <div
      ref={setNodeRef}
      aria-label={`${lane.name} column`}
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-[var(--apple-radius-md)] bg-[var(--plan-raised)] p-3 ring-2 ring-transparent transition-shadow',
        isOver && 'ring-[var(--plan-accent)]'
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <PlanAvatar member={lane.member} size={24} />
        <p className="apple-type-subheadline min-w-0 flex-1 truncate font-semibold text-[var(--plan-text)]">
          {lane.name}
        </p>
        <span className="apple-type-caption shrink-0 tabular-nums text-[var(--plan-muted)]">
          {lane.tasks.length}
        </span>
      </div>
      {/* Fixed height, so a heavily loaded owner scrolls inside their lane
          instead of stretching the whole row of lanes down the page. */}
      <div className="plan-scroll -mr-1.5 flex h-[216px] flex-col gap-1.5 pr-1.5">
        {lane.tasks.length > 0 ? (
          children
        ) : (
          <p className="apple-type-caption flex flex-1 items-center justify-center rounded-[var(--apple-radius-sm)] border border-dashed border-[var(--plan-border)] text-center text-[var(--plan-muted)]">
            {readOnly ? 'No tasks' : 'Drop tasks here'}
          </p>
        )}
      </div>
    </div>
  )
}

function DraggableAssignmentCard({
  task,
  busy,
  readOnly,
  picker
}: {
  task: ScopeTask
  busy: boolean
  readOnly: boolean
  picker: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task._id,
    disabled: busy || readOnly
  })

  if (readOnly) {
    return (
      <PlanTaskCard taskKey={task.displayId} title={task.title} meta={metaOf(task)} grip={false} />
    )
  }

  return (
    <PlanTaskCard
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      taskKey={task.displayId}
      title={task.title}
      meta={metaOf(task)}
      dragging={isDragging}
      className="cursor-grab"
      action={picker}
    />
  )
}

/**
 * The card's move button is a native select dressed as an icon button, so
 * the keyboard path gets the platform picker for free and QA can be offered
 * under a group label that says what choosing them does.
 */
function MovePicker({
  task,
  value,
  teamOptions,
  qaOptions,
  busy,
  onChange
}: {
  task: ScopeTask
  value: string | null
  teamOptions: AssignableMember[]
  qaOptions: AssignableMember[]
  busy: boolean
  onChange: (memberId: string | null) => void
}) {
  return (
    <label
      title="Move to another owner"
      className={planButtonClass(
        'secondary',
        cn(
          planTaskActionClass,
          'relative w-7 cursor-pointer px-0 focus-within:ring-2 focus-within:ring-[var(--plan-accent)]'
        ),
        'sm'
      )}
      // Stops the card's drag listener from claiming the pointer.
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <ArrowLeftRight aria-hidden />
      <select
        aria-label={`Assign ${task.title} to`}
        value={value ?? ''}
        disabled={busy}
        onChange={(event) => onChange(event.target.value || null)}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
      >
        <option value="">Unassigned</option>
        {teamOptions.map((member) => (
          <option key={member.memberId} value={member.memberId}>
            {member.name}
          </option>
        ))}
        {qaOptions.length > 0 && (
          <optgroup label={QA_GROUP_LABEL}>
            {qaOptions.map((member) => (
              <option key={member.memberId} value={member.memberId}>
                {member.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  )
}
