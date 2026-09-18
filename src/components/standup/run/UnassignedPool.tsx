'use client'

import { useMemo, useRef, useState } from 'react'

import type { PoolTask } from '@/lib/standup/allocation'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import {
  fromBoardMemberView,
  fromPoolTask,
  type AssignableMemberView,
  type AssignableTaskView
} from '../shared/AssignableTask'
import {
  FIELD_CLASSES,
  TaskAssignmentSplitScreen
} from '../shared/TaskAssignmentSplitScreen'

import type { BoardMemberView } from './CapacityBoard'

/**
 * Panel 5's assignment surface (§15.8.7) — ALO-13 … ALO-17.
 *
 * The file is still called `UnassignedPool` because the pool is still what
 * drives it, but since Task 8 it is the whole of Panel 5: the pool's two tabs,
 * and the shared `TaskAssignmentSplitScreen` that sprint planning also uses,
 * with the team's cards down its right-hand side. The bespoke pool list, its
 * own drag wiring and the separate capacity column are gone; what is left here
 * is the run screen's own business.
 *
 * **The tabs stayed outside the split screen.** ALO-14's Unassigned /
 * Assigned-but-not-planned distinction is not a filter over one list — the two
 * tabs are two different questions, with different empty-state copy — so this
 * chooses which `PoolTask[]` the shared component is handed rather than
 * pushing a third dropdown into its filter row.
 *
 * **Pool tasks are handed over with no assignee.** A task in the
 * assigned-but-not-planned tab does have an `assigneeIds`, but it has no
 * allocation on *this* stand-up, which is what the right-hand side is about.
 * Passing its assignee through would make `resolveMemberDrop` treat dropping
 * it onto that very person as a no-op — precisely the drop a PM makes most
 * often on that tab.
 *
 * **Every task still reaches a member's day by keyboard** (ALO-16/NFR-A2).
 * The per-row "+" button that only ever targeted one globally selected member
 * is replaced by the shared card's picker, which offers every member, and by
 * the quick-add combobox on each member card. ALO-17's fit indicator moved
 * with it: it is now shown per member, against that member's own gap, which is
 * what it always meant.
 */

export interface UnassignedPoolProps {
  unassigned: readonly PoolTask[]
  assignedNotPlanned: readonly PoolTask[]
  /** The stand-up's team. Adapted here, so the run screen keeps its own shape. */
  members: readonly BoardMemberView[]
  /** The sprint's full pool size, for the D-K pagination line. */
  totalCount: number
  /** Shown once in the split screen's header rather than on every card. */
  sprintLabel?: string
  /** The one call a drop and the picker both make. */
  onAssign: (memberId: string, taskId: string) => void
  /** Run-only card content — see `CapacityBoard.tsx`'s three exports. */
  renderMemberAlways?: (member: AssignableMemberView) => React.ReactNode
  renderMemberExpanded?: (member: AssignableMemberView) => React.ReactNode
  renderMemberTaskRow?: (
    member: AssignableMemberView,
    task: AssignableTaskView
  ) => React.ReactNode
  onShowMore?: () => void
  readOnly?: boolean
  locale?: string
  className?: string
}

type TabId = 'unassigned' | 'assigned_not_planned'

export function UnassignedPool({
  unassigned,
  assignedNotPlanned,
  members,
  totalCount,
  sprintLabel,
  onAssign,
  renderMemberAlways,
  renderMemberExpanded,
  renderMemberTaskRow,
  onShowMore,
  readOnly = false,
  locale,
  className
}: UnassignedPoolProps) {
  // Assignment happens during sprint planning now (PC-8), so the unassigned
  // tab should normally be empty on day one and the work worth looking at is
  // the assigned-but-not-yet-planned pile. Opening on an empty tab reads as a
  // broken panel.
  const [tab, setTab] = useState<TabId>(
    unassigned.length > 0 ? 'unassigned' : 'assigned_not_planned'
  )
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({
    unassigned: null,
    assigned_not_planned: null
  })

  const source = tab === 'unassigned' ? unassigned : assignedNotPlanned

  const tasks = useMemo(
    // `assigneeId: null` deliberately — see the docblock. Nothing in the pool
    // is planned into anybody's day, which is the only assignment this screen
    // is about.
    () => source.map((task) => ({ ...fromPoolTask(task), assigneeId: null })),
    [source]
  )

  const memberViews = useMemo(() => members.map(fromBoardMemberView), [members])

  const shown = unassigned.length + assignedNotPlanned.length

  const onTabKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const next: TabId = tab === 'unassigned' ? 'assigned_not_planned' : 'unassigned'
    setTab(next)
    tabRefs.current[next]?.focus()
  }

  return (
    <section className={cn('flex flex-col gap-3', className)} aria-label="Task pool">
      <div className="flex flex-wrap items-center justify-between gap-2">
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

        {/* D-K — the pool paginates rather than loading an unbounded sprint.
            Distinct from the split screen's own "showing N of M", which
            counts what the filters left of the tab currently open. */}
        <div className="flex items-center gap-2 text-[12px] text-[var(--apple-secondary-label)]">
          <span>{standupStrings.pool.showingCount({ shown, total: totalCount })}</span>
          {onShowMore && shown < totalCount && (
            <button
              type="button"
              onClick={onShowMore}
              className={cn(
                FIELD_CLASSES,
                'apple-transition h-7 hover:bg-[var(--apple-quaternary-fill)]'
              )}
            >
              {standupStrings.pool.showMore()}
            </button>
          )}
        </div>
      </div>

      <TaskAssignmentSplitScreen
        sprintLabel={sprintLabel}
        tasks={tasks}
        members={memberViews}
        busy={readOnly}
        locale={locale}
        emptyPoolMessage={
          tab === 'unassigned'
            ? standupStrings.pool.emptyUnassigned()
            : standupStrings.pool.emptyAssignedNotPlanned()
        }
        renderMemberAlways={renderMemberAlways}
        renderMemberExpanded={renderMemberExpanded}
        renderMemberTaskRow={renderMemberTaskRow}
        onAssign={async (taskId, memberId) => {
          // The pool's own droppable resolves to `null`, which here would mean
          // "unplan" — but nothing in the pool is planned, so the shared
          // component's no-op guard has already swallowed it. Guarded anyway
          // rather than trusting that from a distance.
          if (!memberId) return
          onAssign(memberId, taskId)
        }}
      />
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
