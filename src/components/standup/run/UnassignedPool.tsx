'use client'

import { useMemo, useRef, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Inbox } from 'lucide-react'

import {
  filterPool,
  fitsIndicator,
  sortPool,
  type PoolSort,
  type PoolTask
} from '@/lib/standup/allocation'
import { formatMinutesAsHours, type Minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

/**
 * The unassigned pool (§15.8.7) — Panel 5's left half.
 *
 * The partitioning and the sorts are pure and live in `allocation.ts`; this
 * component is the surface. Two things it must get right that the pure layer
 * cannot:
 *
 * **Every task reaches a member's day by keyboard, not only by drag.** ALO-16's
 * drag (via `@dnd-kit/core`'s `useDraggable`, wired up in `StandupRunScreen`'s
 * `DndContext`) is one path; the per-row "+" button is the other, and it
 * issues the identical `onAdd` call — HTML drag-and-drop has no keyboard
 * equivalent of its own, so a pool that could only be dragged from would be
 * unusable for part of the team, and the tablet breakpoint (768–1023px, spec
 * line 1807) falls back to it entirely.
 *
 * **An empty tab and a filtered-empty tab say different things.** "Every sprint
 * task has an owner" is good news; "no task matches these filters" is a dead
 * end with an action attached. Collapsing them into one "nothing here" leaves
 * the PM hunting for work that is sitting behind a filter chip.
 */

export interface PoolMemberSelection {
  memberId: string
  name: string
  /** ALO-17's denominator: what is left of this member's day. */
  gapMinutes: Minutes
}

export interface UnassignedPoolProps {
  unassigned: readonly PoolTask[]
  assignedNotPlanned: readonly PoolTask[]
  /** Null means no member is selected, so no "fits" can be shown. */
  selectedMember: PoolMemberSelection | null
  /** The sprint's full pool size, for the D-K pagination line. */
  totalCount: number
  onAdd: (memberId: string, task: PoolTask) => void
  onShowMore?: () => void
  readOnly?: boolean
  locale?: string
  className?: string
}

type TabId = 'unassigned' | 'assigned_not_planned'

const TYPES = ['bug', 'feature', 'improvement', 'task', 'subtask']
const PRIORITIES = ['critical', 'high', 'medium', 'low']

const FIELD_CLASSES =
  'h-8 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-background px-2 text-[12.5px] text-[var(--apple-label)]'

export function UnassignedPool({
  unassigned,
  assignedNotPlanned,
  selectedMember,
  totalCount,
  onAdd,
  onShowMore,
  readOnly = false,
  locale,
  className
}: UnassignedPoolProps) {
  const [tab, setTab] = useState<TabId>('unassigned')
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [priority, setPriority] = useState('')
  const [sort, setSort] = useState<PoolSort>('priority')
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({
    unassigned: null,
    assigned_not_planned: null
  })

  const source = tab === 'unassigned' ? unassigned : assignedNotPlanned
  const filtersActive = Boolean(search.trim() || type || priority)

  const visible = useMemo(() => {
    const filtered = filterPool(source, {
      ...(search.trim() ? { search } : {}),
      ...(type ? { types: [type] } : {}),
      ...(priority ? { priorities: [priority] } : {})
    })
    return sortPool(filtered, sort)
  }, [source, search, type, priority, sort])

  const shown = unassigned.length + assignedNotPlanned.length

  const clearFilters = () => {
    setSearch('')
    setType('')
    setPriority('')
  }

  const onTabKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const next: TabId = tab === 'unassigned' ? 'assigned_not_planned' : 'unassigned'
    setTab(next)
    tabRefs.current[next]?.focus()
  }

  return (
    <section
      className={cn(
        'flex flex-col gap-3 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-3.5',
        className
      )}
      aria-label="Task pool"
    >
      <h3 className="apple-section-label text-[var(--apple-tertiary-label)]">
        {standupStrings.pool.title()}
      </h3>

      <div role="tablist" aria-label="Task pool tabs" className="flex gap-1.5">
        <PoolTab
          id="unassigned"
          selected={tab === 'unassigned'}
          label={standupStrings.pool.tabUnassigned({ count: unassigned.length })}
          onSelect={setTab}
          onKeyDown={onTabKeyDown}
          register={(node) => {
            tabRefs.current.unassigned = node
          }}
        />
        <PoolTab
          id="assigned_not_planned"
          selected={tab === 'assigned_not_planned'}
          label={standupStrings.pool.tabAssignedNotPlanned({
            count: assignedNotPlanned.length
          })}
          onSelect={setTab}
          onKeyDown={onTabKeyDown}
          register={(node) => {
            tabRefs.current.assigned_not_planned = node
          }}
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <label className="min-w-[8rem] flex-1">
          <span className="sr-only">{standupStrings.pool.searchLabel()}</span>
          <input
            type="search"
            aria-label={standupStrings.pool.searchLabel()}
            placeholder={standupStrings.pool.searchPlaceholder()}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={cn(FIELD_CLASSES, 'w-full')}
          />
        </label>

        <select
          aria-label={standupStrings.pool.filterType()}
          value={type}
          onChange={(event) => setType(event.target.value)}
          className={FIELD_CLASSES}
        >
          <option value="">{standupStrings.pool.filterType()}</option>
          {TYPES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        <select
          aria-label={standupStrings.pool.filterPriority()}
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
          className={FIELD_CLASSES}
        >
          <option value="">{standupStrings.pool.filterPriority()}</option>
          {PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        <select
          aria-label={standupStrings.pool.sortLabel()}
          value={sort}
          onChange={(event) => setSort(event.target.value as PoolSort)}
          className={FIELD_CLASSES}
        >
          <option value="priority">{standupStrings.pool.sortPriority()}</option>
          <option value="estimate_asc">{standupStrings.pool.sortEstimateAsc()}</option>
          <option value="estimate_desc">{standupStrings.pool.sortEstimateDesc()}</option>
          <option value="backlog_rank">{standupStrings.pool.sortBacklogRank()}</option>
        </select>
      </div>

      <p className="text-[12px] text-[var(--apple-secondary-label)]">
        {selectedMember
          ? standupStrings.pool.fitsAgainst({ name: selectedMember.name })
          : standupStrings.pool.selectMemberFirst()}
      </p>

      {visible.length === 0 ? (
        <EmptyState filtersActive={filtersActive} tab={tab} onClearFilters={clearFilters} />
      ) : (
        <ul role="list" className="flex max-h-[26rem] flex-col gap-2 overflow-y-auto pr-0.5">
          {visible.map((task) => (
            <PoolCard
              key={task.taskId}
              task={task}
              selectedMember={selectedMember}
              readOnly={readOnly}
              locale={locale}
              onAdd={onAdd}
            />
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between text-[12px] text-[var(--apple-secondary-label)]">
        <span>{standupStrings.pool.showingCount({ shown, total: totalCount })}</span>
        {onShowMore && shown < totalCount && (
          <button
            type="button"
            onClick={onShowMore}
            className="apple-transition rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] px-2 py-1 hover:bg-[var(--apple-quaternary-fill)]"
          >
            {standupStrings.pool.showMore()}
          </button>
        )}
      </div>
    </section>
  )
}

function PoolTab({
  id,
  selected,
  label,
  onSelect,
  onKeyDown,
  register
}: {
  id: TabId
  selected: boolean
  label: string
  onSelect: (id: TabId) => void
  onKeyDown: (event: React.KeyboardEvent) => void
  register: (node: HTMLButtonElement | null) => void
}) {
  return (
    <button
      ref={register}
      type="button"
      role="tab"
      aria-selected={selected}
      // Roving tabindex: one stop for the tablist, arrows move within it.
      tabIndex={selected ? 0 : -1}
      onClick={() => onSelect(id)}
      onKeyDown={onKeyDown}
      className={cn(
        'apple-transition rounded-[var(--apple-radius-sm)] px-2.5 py-1 text-[12.5px] font-medium',
        selected
          ? 'bg-[var(--apple-system-blue)]/10 text-[var(--apple-system-blue)]'
          : 'text-[var(--apple-secondary-label)] hover:bg-[var(--apple-quaternary-fill)]'
      )}
    >
      {label}
    </button>
  )
}

/**
 * A draggable pool card (ALO-16). `useDraggable`'s `id` carries the task so
 * `StandupRunScreen`'s `DndContext.onDragEnd` can read it straight off
 * `active.data.current.task` without a lookup table. Drag only starts after
 * `PointerSensor`'s `distance: 8` activation constraint is crossed (set where
 * the sensor is configured), so a plain click still reaches the "+" button
 * below rather than being swallowed by drag initiation.
 */
function PoolCard({
  task,
  selectedMember,
  readOnly,
  locale,
  onAdd
}: {
  task: PoolTask
  selectedMember: PoolMemberSelection | null
  readOnly: boolean
  locale?: string
  onAdd: (memberId: string, task: PoolTask) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `pool-task-${task.taskId}`,
    data: { task },
    disabled: readOnly
  })

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: transform ? CSS.Translate.toString(transform) : undefined,
        touchAction: 'none'
      }}
      data-testid="pool-task"
      id={`pool-row-${task.key ?? task.taskId}`}
      className={cn(
        'apple-transition group flex items-start gap-2 rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-background p-2.5 text-[13px] hover:border-[var(--apple-system-blue)]/40 hover:shadow-[0_1px_4px_rgba(0,0,0,0.06)]',
        isDragging && 'z-50 opacity-50 shadow-[0_8px_24px_rgba(0,0,0,0.18)]'
      )}
      {...listeners}
      {...attributes}
    >
      {!readOnly && (
        <GripVertical
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--apple-tertiary-label)] opacity-0 group-hover:opacity-100"
          aria-hidden="true"
        />
      )}

      <div
        className="min-w-0 flex-1"
        data-testid={`pool-task-${task.key ?? task.taskId}`}
      >
        {/* Key and title are separate elements so each is independently
            queryable — a single text node containing both matches neither. */}
        <p className="truncate text-[var(--apple-label)]">
          {task.key && (
            <span className="font-apple-mono text-[11px] text-[var(--apple-tertiary-label)]">
              {task.key}{' '}
            </span>
          )}
          <span>{task.title}</span>
        </p>
        <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-[var(--apple-secondary-label)]">
          <span className="font-apple-mono tabular-nums">
            {formatMinutesAsHours(task.remainingEstimateMinutes, { locale })}
          </span>
          <span className="capitalize">{task.priority}</span>
          <span className="capitalize">{task.type}</span>
          {selectedMember && (
            <span>{fitLabel(task.remainingEstimateMinutes, selectedMember.gapMinutes, locale)}</span>
          )}
        </p>
      </div>

      {/* ALO-16's keyboard path. The same call a drop makes — the two must
          never diverge, or the board behaves differently depending on how the
          PM got here. */}
      {selectedMember && !readOnly && (
        <button
          type="button"
          onClick={() => onAdd(selectedMember.memberId, task)}
          onPointerDown={(event) => event.stopPropagation()}
          aria-label={standupStrings.pool.addToMember({
            task: task.key ?? task.title,
            name: selectedMember.name
          })}
          className="apple-transition shrink-0 rounded-full border border-[var(--apple-separator)] px-2 py-1 text-[11px] font-semibold text-[var(--apple-system-blue)] hover:bg-[var(--apple-system-blue)]/10"
        >
          +
        </button>
      )}
    </li>
  )
}

/** The ghost card `StandupRunScreen` renders inside `DragOverlay` while a pool card is being dragged. */
export function PoolCardPreview({ task, locale }: { task: PoolTask; locale?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-[var(--apple-radius-md)] border border-[var(--apple-system-blue)]/40 bg-card px-2.5 py-2 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.22)]">
      <GripVertical className="h-3.5 w-3.5 shrink-0 text-[var(--apple-system-blue)]" aria-hidden="true" />
      <div className="min-w-0">
        <p className="truncate text-[var(--apple-label)]">
          {task.key && (
            <span className="font-apple-mono text-[11px] text-[var(--apple-tertiary-label)]">
              {task.key}{' '}
            </span>
          )}
          <span>{task.title}</span>
        </p>
        <span className="font-apple-mono text-[11px] tabular-nums text-[var(--apple-secondary-label)]">
          {formatMinutesAsHours(task.remainingEstimateMinutes, { locale })}
        </span>
      </div>
    </div>
  )
}

function EmptyState({
  filtersActive,
  tab,
  onClearFilters
}: {
  filtersActive: boolean
  tab: TabId
  onClearFilters: () => void
}) {
  if (filtersActive) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-[var(--apple-radius-md)] border border-dashed border-[var(--apple-separator)] p-3 text-[13px] text-[var(--apple-secondary-label)]">
        <p>{standupStrings.pool.emptyFiltered()}</p>
        <button
          type="button"
          onClick={onClearFilters}
          className="apple-transition rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] px-2 py-1 text-[12px] hover:bg-[var(--apple-quaternary-fill)]"
        >
          {standupStrings.pool.clearFilters()}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-1.5 rounded-[var(--apple-radius-md)] border border-dashed border-[var(--apple-separator)] p-5 text-center text-[13px] text-[var(--apple-secondary-label)]">
      <Inbox className="h-5 w-5 text-[var(--apple-tertiary-label)]" strokeWidth={1.5} />
      <p>
        {tab === 'unassigned'
          ? standupStrings.pool.emptyUnassigned()
          : standupStrings.pool.emptyAssignedNotPlanned()}
      </p>
    </div>
  )
}

/** ALO-17, as a word rather than a colour. */
function fitLabel(remaining: Minutes, gapMinutes: Minutes, locale?: string): string {
  switch (fitsIndicator(remaining, gapMinutes)) {
    case 'exact':
      return standupStrings.allocation.fitsExact()
    case 'fits':
      return standupStrings.allocation.fitsUnder({
        minutes: (gapMinutes - remaining) as Minutes,
        locale
      })
    case 'overflows':
      return standupStrings.allocation.fitsOver({
        minutes: Math.max(0, remaining - gapMinutes) as Minutes,
        locale
      })
  }
}
