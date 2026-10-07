'use client'

/**
 * The split-screen task-assignment surface (Task 6).
 *
 * Left: the task repository — search, filters, sort, a scrollable list of
 * draggable `TaskCard`s. Right: the team as expandable cards, each one a drop
 * target. Its only consumer is `run/UnassignedPool.tsx`; sprint planning
 * renders its own `planning/AssignmentBoard.tsx`. This surface keeps its
 * pool-left / members-right layout, because a member card here carries a
 * capacity meter, debt badges and per-allocation steppers a one-line lane
 * cannot hold, but it shares planning's visual vocabulary: the same task
 * card, move picker, drag preview and accent-ring drop highlight.
 *
 * Three decisions worth stating.
 *
 * **Sprint information appears once.** Both contexts already operate inside a
 * single sprint, so it is a header line here rather than a repeated field on
 * every task card.
 *
 * **The keyboard reaches every assignment a drag can make.** Each card carries
 * the same picker `AssignmentBoard` uses, and it calls the identical
 * `onAssign` a drop does. Drag-and-drop has no keyboard equivalent of its own;
 * a board that can only be dragged on is a board part of the team cannot use.
 *
 * **Confirmation is not this component's toast.** Toasts belong at the
 * workspace level. What this owns is the visual half: dnd-kit's drop animation
 * carries the card into the member it landed on, and the caller re-rendering
 * with updated `tasks`/`members` shows it there. `onAssign` is awaited and the
 * surface is locked while it is in flight, so a second drop cannot race the
 * first.
 */
import { useMemo, useState } from 'react'
import {
  closestCorners,
  defaultDropAnimation,
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation
} from '@dnd-kit/core'
import { Inbox, Users } from 'lucide-react'

import { formatMinutesAsHours, type Minutes } from '@/lib/standup/minutes'
import { cn } from '@/lib/utils'

import {
  PlanDragOverlay,
  planEmptyClass,
  planFieldClass,
  PlanTaskCard
} from '../planning/ui'

import type { AssignableMemberView, AssignableTaskView } from './AssignableTask'
import { ExpandableMemberCard, memberIdFromDroppableId } from './ExpandableMemberCard'
import {
  TaskCard,
  taskIdFromDraggableId,
  type AssignOption
} from './TaskCard'

/** The pool's own droppable — dropping here clears an assignment. */
export const POOL_DROPPABLE_ID = 'assignment-pool'

const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const

/** Most urgent first — the same order `allocation.ts`'s `sortPool` uses. */
const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
}

export type AssignableSort = 'priority' | 'estimate_asc' | 'estimate_desc'

export interface AssignableFilter {
  search?: string
  priorities?: string[]
  skills?: string[]
  types?: string[]
}

/**
 * The pool filter, over `AssignableTaskView`.
 *
 * `allocation.ts`'s `filterPool` was not widened in place: it also filters on
 * `epicId`, which no canonical view carries. `type` is here because ALO-15
 * names it and the run screen would otherwise have lost a filter it shipped
 * with; like `skills` it is optional, and a context whose tasks have none
 * never offers the control. Conjunctive, like `filterPool`.
 */
export function filterAssignableTasks(
  tasks: readonly AssignableTaskView[],
  filter: AssignableFilter
): AssignableTaskView[] {
  const search = filter.search?.trim().toLowerCase()

  return tasks.filter((task) => {
    if (filter.priorities?.length) {
      if (!task.priority || !filter.priorities.includes(task.priority)) return false
    }
    if (filter.types?.length) {
      if (!task.type || !filter.types.includes(task.type)) return false
    }
    if (filter.skills?.length) {
      if (!task.skills?.some((skill) => filter.skills!.includes(skill))) return false
    }
    if (search) {
      const haystack = `${task.displayId ?? ''} ${task.title}`.toLowerCase()
      if (!haystack.includes(search)) return false
    }
    return true
  })
}

/** `sortPool`'s sorts, minus `backlog_rank` (no `position` on the canonical view). */
export function sortAssignableTasks(
  tasks: readonly AssignableTaskView[],
  sort: AssignableSort
): AssignableTaskView[] {
  const sorted = [...tasks]
  const estimate = (task: AssignableTaskView) => task.estimateMinutes ?? Number.MAX_SAFE_INTEGER

  switch (sort) {
    case 'priority':
      return sorted.sort(
        (a, b) =>
          (PRIORITY_ORDER[a.priority ?? ''] ?? Number.MAX_SAFE_INTEGER) -
          (PRIORITY_ORDER[b.priority ?? ''] ?? Number.MAX_SAFE_INTEGER)
      )
    case 'estimate_asc':
      return sorted.sort((a, b) => estimate(a) - estimate(b))
    case 'estimate_desc':
      return sorted.sort((a, b) => estimate(b) - estimate(a))
  }
}

/**
 * Resolves a drop to the member it landed on.
 *
 * Pure and exported for the same reason `resolveAssignmentDrop` is: the
 * mapping from a drop target to an assignee is the part worth testing, and
 * dnd-kit's pointer mechanics are not something jsdom can honestly simulate.
 *
 * Null result means "no change" — dropping a task back where it already was
 * must not fire a request, or its assignee is told again that they have been
 * given work they already hold.
 */
export function resolveMemberDrop(
  activeId: string,
  overId: string | null,
  currentAssigneeId: string | null | undefined
): { taskId: string; memberId: string | null } | null {
  const taskId = taskIdFromDraggableId(activeId)
  if (!taskId || !overId) return null

  const memberId =
    overId === POOL_DROPPABLE_ID ? null : memberIdFromDroppableId(overId)
  // An id that is neither the pool nor a member card is not a drop target we
  // own — dropping there is a cancel, not an unassign.
  if (memberId === null && overId !== POOL_DROPPABLE_ID) return null
  if (memberId === (currentAssigneeId ?? null)) return null

  return { taskId, memberId }
}

export interface TaskAssignmentSplitScreenProps {
  /** Shown once, in the left panel's header — never repeated per task card. */
  sprintLabel?: string
  tasks: AssignableTaskView[]
  members: AssignableMemberView[]
  busy?: boolean
  /** `null` clears the assignment. Resolves once the server has agreed. */
  onAssign: (taskId: string, memberId: string | null) => Promise<void>
  /**
   * Overrides the per-card picker's options, which default to every member
   * shown on the right. Planning narrows and groups them: only the sprint team
   * plus QA who would be admitted by the assignment; grouped options are
   * flattened into `MovePicker`'s single QA optgroup (it supports only one
   * group label, so each `group`'s own label is not shown). Drop targets are unaffected — every member card still takes one.
   */
  assignOptions?: AssignOption[]
  renderMemberExpanded?: (member: AssignableMemberView) => React.ReactNode
  /**
   * Context-specific content that stays visible on the collapsed card. The
   * run screen puts OB-12's stranded-hours alert and the estimate-debt badge
   * here — an alert only readable after expanding a card is an alert nobody
   * reads.
   */
  renderMemberAlways?: (member: AssignableMemberView) => React.ReactNode
  /**
   * Replaces the read-only row the expanded card renders per assigned task.
   * The run screen swaps in its `HourStepper` + remove controls rather than
   * listing the same work twice.
   */
  renderMemberTaskRow?: (
    member: AssignableMemberView,
    task: AssignableTaskView
  ) => React.ReactNode
  emptyPoolMessage?: string
  locale?: string
  className?: string
  /**
   * The two panels' headings and chrome. Planning keeps the defaults; the run
   * screen swaps in its blueprint's "Unassigned Backlog" / "Active
   * Assignments & Capacity" titles and card padding.
   */
  repositoryTitle?: string
  teamTitle?: string
  headingClassName?: string
  panelClassName?: string
  /**
   * Which optional filters the repository offers, beside search and sort.
   * Each still only renders when the tasks carry that field. Planning keeps
   * all three; the run screen's backlog asks for type only.
   */
  filters?: readonly RepositoryFilter[]
}

export type RepositoryFilter = 'priority' | 'type' | 'skill'

const ALL_FILTERS: readonly RepositoryFilter[] = ['priority', 'type', 'skill']

const DEFAULT_HEADING_CLASSES = 'apple-section-label text-[var(--plan-muted)]'

export function TaskAssignmentSplitScreen({
  sprintLabel,
  tasks,
  members,
  busy = false,
  onAssign,
  assignOptions: assignOptionsProp,
  renderMemberExpanded,
  renderMemberAlways,
  renderMemberTaskRow,
  emptyPoolMessage,
  locale,
  className,
  repositoryTitle = 'Task repository',
  teamTitle = 'Team assignment',
  headingClassName = DEFAULT_HEADING_CLASSES,
  panelClassName = 'p-3.5',
  filters = ALL_FILTERS
}: TaskAssignmentSplitScreenProps) {
  const sensors = useSensors(
    // Same activation distance as every other board in the module: without
    // it, a card's pointerdown beats the click on its own picker.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const [search, setSearch] = useState('')
  const [priority, setPriority] = useState('')
  const [skill, setSkill] = useState('')
  const [type, setType] = useState('')
  const [sort, setSort] = useState<AssignableSort>('priority')
  const [activeTask, setActiveTask] = useState<AssignableTaskView | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [assigning, setAssigning] = useState(false)

  const locked = busy || assigning
  const filtersActive = Boolean(search.trim() || priority || skill || type)

  const skillOptions = useMemo(() => {
    if (!filters.includes('skill')) return []
    const all = new Set<string>()
    for (const task of tasks) for (const value of task.skills ?? []) all.add(value)
    return Array.from(all).sort()
  }, [tasks, filters])

  const typeOptions = useMemo(() => {
    if (!filters.includes('type')) return []
    const all = new Set<string>()
    for (const task of tasks) if (task.type) all.add(task.type)
    return Array.from(all).sort()
  }, [tasks, filters])

  // Same rule as type and skill: planning-context tasks (ScopeTask via
  // fromScopeTask) carry no priority, so a hardcoded list would filter every
  // task away. Keep PRIORITIES' severity order rather than sorting.
  const priorityOptions = useMemo(
    () =>
      filters.includes('priority')
        ? PRIORITIES.filter((value) => tasks.some((task) => task.priority === value))
        : [],
    [tasks, filters]
  )

  const visible = useMemo(() => {
    const filtered = filterAssignableTasks(tasks, {
      ...(search.trim() ? { search } : {}),
      ...(priority ? { priorities: [priority] } : {}),
      ...(skill ? { skills: [skill] } : {}),
      ...(type ? { types: [type] } : {})
    })
    return sortAssignableTasks(filtered, sort)
  }, [tasks, search, priority, skill, type, sort])

  const derivedAssignOptions = useMemo(
    () => members.map((member) => ({ id: member.id, name: member.name })),
    [members]
  )
  const assignOptions = assignOptionsProp ?? derivedAssignOptions

  const runAssign = async (taskId: string, memberId: string | null) => {
    setAssigning(true)
    try {
      await onAssign(taskId, memberId)
    } finally {
      setAssigning(false)
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null)
    const activeId = event.active.id
    const overId = event.over?.id
    if (typeof activeId !== 'string') return

    const taskId = taskIdFromDraggableId(activeId)
    const task = tasks.find((candidate) => candidate.id === taskId)

    const action = resolveMemberDrop(
      activeId,
      typeof overId === 'string' ? overId : null,
      task?.assigneeId ?? null
    )
    if (!action) return

    void runAssign(action.taskId, action.memberId)
  }

  return (
    <div
      className={cn(
        'grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]',
        className
      )}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        // Off, as on the planning board: dnd-kit's edge auto-scroll drives the
        // page scroller whenever the preview nears its edge, accelerating,
        // and both columns here are fixed-height scroll boxes, so the drop
        // target is always on screen anyway.
        autoScroll={false}
        onDragStart={(event: DragStartEvent) => {
          const taskId = taskIdFromDraggableId(String(event.active.id))
          setActiveTask(tasks.find((task) => task.id === taskId) ?? null)
        }}
        onDragCancel={() => setActiveTask(null)}
        onDragEnd={handleDragEnd}
      >
        <TaskRepository
          sprintLabel={sprintLabel}
          tasks={visible}
          totalCount={tasks.length}
          search={search}
          priority={priority}
          priorityOptions={priorityOptions}
          skill={skill}
          skillOptions={skillOptions}
          type={type}
          typeOptions={typeOptions}
          sort={sort}
          filtersActive={filtersActive}
          locked={locked}
          assignOptions={assignOptions}
          emptyPoolMessage={emptyPoolMessage}
          locale={locale}
          title={repositoryTitle}
          headingClassName={headingClassName}
          panelClassName={panelClassName}
          onSearch={setSearch}
          onPriority={setPriority}
          onSkill={setSkill}
          onType={setType}
          onSort={setSort}
          onClearFilters={() => {
            setSearch('')
            setPriority('')
            setSkill('')
            setType('')
          }}
          onAssign={(taskId, memberId) => void runAssign(taskId, memberId)}
        />

        <section
          aria-label="Team assignment"
          className={cn(
            'flex flex-col gap-3 rounded-[var(--apple-radius-lg)] border border-[var(--plan-border)] bg-[var(--plan-surface)]',
            panelClassName
          )}
        >
          <div className="flex items-baseline justify-between gap-2">
            <h3 className={headingClassName}>{teamTitle}</h3>
            <span className="apple-type-caption tabular-nums text-[var(--plan-muted)]">
              {members.length}
            </span>
          </div>

          {members.length === 0 ? (
            <div className={cn(planEmptyClass, 'flex flex-col items-center gap-1.5 p-5')}>
              <Users className="h-5 w-5 text-[var(--plan-muted)]" strokeWidth={1.5} />
              <p>No team members to assign to yet.</p>
            </div>
          ) : (
            <ul role="list" className="plan-scroll flex max-h-[34rem] flex-col gap-2.5 overflow-y-auto pr-0.5">
              {members.map((member) => (
                <li key={member.id}>
                  <ExpandableMemberCard
                    member={member}
                    expanded={Boolean(expanded[member.id])}
                    onToggle={() =>
                      setExpanded((current) => ({
                        ...current,
                        [member.id]: !current[member.id]
                      }))
                    }
                    disabled={locked}
                    renderExpandedExtra={renderMemberExpanded}
                    renderAlways={renderMemberAlways}
                    renderTaskRow={renderMemberTaskRow}
                    locale={locale}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* The panels scroll, and a scrolling box clips an inline transform,
            so the dragged card would vanish at the panel edge without a
            portal. `dropAnimation` is what carries the card into the member
            card it landed on — the "animate into the member" half of the
            brief, with no custom transform maths. */}
        <PlanDragOverlay dropAnimation={DROP_ANIMATION}>
          {activeTask ? (
            <PlanTaskCard
              taskKey={activeTask.displayId}
              title={activeTask.title}
              meta={
                activeTask.estimateMinutes !== undefined
                  ? formatMinutesAsHours(activeTask.estimateMinutes as Minutes, { locale })
                  : ''
              }
              className="cursor-grabbing shadow-[0_8px_28px_rgba(0,0,0,0.18)]"
            />
          ) : null}
        </PlanDragOverlay>
      </DndContext>
    </div>
  )
}

const DROP_ANIMATION: DropAnimation = {
  ...defaultDropAnimation,
  duration: 220
}

function TaskRepository({
  sprintLabel,
  tasks,
  totalCount,
  search,
  priority,
  priorityOptions,
  skill,
  skillOptions,
  type,
  typeOptions,
  sort,
  filtersActive,
  locked,
  assignOptions,
  emptyPoolMessage,
  locale,
  title,
  headingClassName,
  panelClassName,
  onSearch,
  onPriority,
  onSkill,
  onType,
  onSort,
  onClearFilters,
  onAssign
}: {
  sprintLabel?: string
  tasks: AssignableTaskView[]
  totalCount: number
  search: string
  priority: string
  priorityOptions: readonly string[]
  skill: string
  skillOptions: string[]
  type: string
  typeOptions: string[]
  sort: AssignableSort
  filtersActive: boolean
  locked: boolean
  assignOptions: AssignOption[]
  emptyPoolMessage?: string
  locale?: string
  title: string
  headingClassName: string
  panelClassName: string
  onSearch: (value: string) => void
  onPriority: (value: string) => void
  onSkill: (value: string) => void
  onType: (value: string) => void
  onSort: (value: AssignableSort) => void
  onClearFilters: () => void
  onAssign: (taskId: string, memberId: string | null) => void
}) {
  // Dropping back on the repository is how an assignment is cleared.
  const { setNodeRef, isOver } = useDroppable({ id: POOL_DROPPABLE_ID, disabled: locked })

  return (
    <section
      ref={setNodeRef}
      aria-label="Task repository"
      className={cn(
        'apple-transition flex flex-col gap-3 rounded-[var(--apple-radius-lg)] border border-[var(--plan-border)] bg-[var(--plan-surface)] ring-2 ring-transparent',
        panelClassName,
        isOver && 'ring-[var(--plan-accent)]'
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className={headingClassName}>{title}</h3>
        {sprintLabel && (
          <span className="apple-type-caption truncate text-[var(--plan-muted)]">
            {sprintLabel}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <label className="min-w-[8rem] flex-1">
          <span className="sr-only">Search tasks</span>
          <input
            type="search"
            aria-label="Search tasks"
            placeholder="Search by key or title…"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            className={cn(planFieldClass, 'w-full')}
          />
        </label>

        {/* Gated like the type and skill filters below: planning-context tasks
            have no priority, so an ungated select would silently filter the
            whole repository away. */}
        {priorityOptions.length > 0 && (
          <select
            aria-label="Priority"
            value={priority}
            onChange={(event) => onPriority(event.target.value)}
            className={planFieldClass}
          >
            <option value="">Priority</option>
            {priorityOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        )}

        {/* ALO-15's type filter. Same rule as the skill filter below: only the
            run screen's tasks carry a type, so planning never sees it. */}
        {typeOptions.length > 0 && (
          <select
            aria-label="Type"
            value={type}
            onChange={(event) => onType(event.target.value)}
            className={planFieldClass}
          >
            <option value="">Type</option>
            {typeOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        )}

        {/* Only offered where the context actually has skills to filter on —
            the planning screen's tasks carry none, and an empty dropdown is a
            dead control. */}
        {skillOptions.length > 0 && (
          <select
            aria-label="Skill"
            value={skill}
            onChange={(event) => onSkill(event.target.value)}
            className={planFieldClass}
          >
            <option value="">Skill</option>
            {skillOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        )}

        <select
          aria-label="Sort"
          value={sort}
          onChange={(event) => onSort(event.target.value as AssignableSort)}
          className={planFieldClass}
        >
          <option value="priority">Priority</option>
          <option value="estimate_asc">Smallest first</option>
          <option value="estimate_desc">Largest first</option>
        </select>
      </div>

      {tasks.length === 0 ? (
        <EmptyRepository
          filtersActive={filtersActive}
          emptyPoolMessage={emptyPoolMessage}
          onClearFilters={onClearFilters}
        />
      ) : (
        <ul role="list" className="plan-scroll flex max-h-[34rem] flex-col gap-2 overflow-y-auto pr-0.5">
          {tasks.map((task) => (
            <li key={task.id}>
              <TaskCard
                task={task}
                disabled={locked}
                assignOptions={assignOptions}
                onAssignVia={(memberId) => onAssign(task.id, memberId)}
                locale={locale}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="apple-type-caption text-[var(--plan-muted)]">
        Showing {tasks.length} of {totalCount}
      </p>
    </section>
  )
}

/**
 * An empty repository and a filtered-empty one say opposite things: one is
 * good news, the other is a dead end with an action attached.
 */
function EmptyRepository({
  filtersActive,
  emptyPoolMessage,
  onClearFilters
}: {
  filtersActive: boolean
  emptyPoolMessage?: string
  onClearFilters: () => void
}) {
  if (filtersActive) {
    return (
      <div className={cn(planEmptyClass, 'flex flex-col items-start gap-2 text-left')}>
        <p>No task matches these filters.</p>
        <button
          type="button"
          onClick={onClearFilters}
          className="apple-transition apple-type-subheadline rounded-[var(--apple-radius-sm)] border border-[var(--plan-border)] px-2 py-1 text-[var(--plan-text)] hover:bg-[var(--plan-track)]"
        >
          Clear filters
        </button>
      </div>
    )
  }

  return (
    <div className={cn(planEmptyClass, 'flex flex-col items-center gap-1.5 p-5')}>
      <Inbox className="h-5 w-5 text-[var(--plan-muted)]" strokeWidth={1.5} />
      <p>{emptyPoolMessage ?? 'Every task has an owner.'}</p>
    </div>
  )
}
