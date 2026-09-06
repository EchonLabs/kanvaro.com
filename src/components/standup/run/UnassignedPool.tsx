'use client'

import { useMemo, useRef, useState } from 'react'

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
 * **Every task reaches a member's day by keyboard.** ALO-16's drag is one path;
 * the per-row add button is the other, and it issues the identical call. HTML
 * drag-and-drop has no keyboard equivalent of its own, so a pool that could
 * only be dragged from would be unusable for part of the team — and that is
 * discovered at the accessibility audit, three phases too late to be cheap.
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
    <section className={cn('flex flex-col gap-3', className)} aria-label="Task pool">
      <h3 className="text-sm font-semibold">{standupStrings.pool.title()}</h3>

      <div role="tablist" aria-label="Task pool tabs" className="flex gap-1">
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

      <div className="flex flex-wrap gap-2">
        <label className="flex-1">
          <span className="sr-only">{standupStrings.pool.searchLabel()}</span>
          <input
            type="search"
            aria-label={standupStrings.pool.searchLabel()}
            placeholder={standupStrings.pool.searchPlaceholder()}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
          />
        </label>

        <select
          aria-label={standupStrings.pool.filterType()}
          value={type}
          onChange={(event) => setType(event.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
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
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
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
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="priority">{standupStrings.pool.sortPriority()}</option>
          <option value="estimate_asc">{standupStrings.pool.sortEstimateAsc()}</option>
          <option value="estimate_desc">{standupStrings.pool.sortEstimateDesc()}</option>
          <option value="backlog_rank">{standupStrings.pool.sortBacklogRank()}</option>
        </select>
      </div>

      <p className="text-xs text-muted-foreground">
        {selectedMember
          ? standupStrings.pool.fitsAgainst({ name: selectedMember.name })
          : standupStrings.pool.selectMemberFirst()}
      </p>

      {visible.length === 0 ? (
        <EmptyState
          filtersActive={filtersActive}
          tab={tab}
          onClearFilters={clearFilters}
        />
      ) : (
        <ul role="list" className="flex flex-col gap-2">
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

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{standupStrings.pool.showingCount({ shown, total: totalCount })}</span>
        {onShowMore && shown < totalCount && (
          <button
            type="button"
            onClick={onShowMore}
            className="rounded-md border border-border px-2 py-1"
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
        'rounded-md border px-2 py-1 text-xs',
        selected ? 'border-primary bg-primary/10 font-medium' : 'border-border'
      )}
    >
      {label}
    </button>
  )
}

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
  return (
    <li
      data-testid="pool-task"
      id={`pool-row-${task.key ?? task.taskId}`}
      className="flex items-start justify-between gap-2 rounded-md border border-border p-2 text-sm"
    >
      <div className="min-w-0 flex-1" data-testid={`pool-task-${task.key ?? task.taskId}`}>
        {/* Key and title are separate elements so each is independently
            queryable — a single text node containing both matches neither. */}
        <p className="truncate">
          {task.key && <span className="text-muted-foreground">{task.key}</span>}{' '}
          <span>{task.title}</span>
        </p>
        <p className="flex gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {formatMinutesAsHours(task.remainingEstimateMinutes, { locale })}
          </span>
          <span>{task.priority}</span>
          <span>{task.type}</span>
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
          aria-label={standupStrings.pool.addToMember({
            task: task.key ?? task.title,
            name: selectedMember.name
          })}
          className="shrink-0 rounded-md border border-border px-2 py-1 text-xs"
        >
          +
        </button>
      )}
    </li>
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
      <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
        <p>{standupStrings.pool.emptyFiltered()}</p>
        <button
          type="button"
          onClick={onClearFilters}
          className="rounded-md border border-border px-2 py-1 text-xs"
        >
          {standupStrings.pool.clearFilters()}
        </button>
      </div>
    )
  }

  return (
    <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
      {tab === 'unassigned'
        ? standupStrings.pool.emptyUnassigned()
        : standupStrings.pool.emptyAssignedNotPlanned()}
    </p>
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
