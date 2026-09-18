'use client'

/**
 * One team member as a drop target (Task 6).
 *
 * The redesign replaces the old per-member *column* with a card: collapsed it
 * answers "can this person take more work?" in one line — avatar, name, role,
 * a capacity meter, how many tasks they already hold — and expanded it shows
 * the work itself and where the day's hours went. A PM scanning eight people
 * for somewhere to put a task should not have to scroll eight columns to do
 * it.
 *
 * The card is the drop zone, not a list inside it, so the whole surface is a
 * target — including the collapsed state, which is the state most drops land
 * on. The highlight matches `AssignmentBoard`'s `Lane` and `CapacityBoard`'s
 * member card: blue border, faint blue wash.
 *
 * Expansion is the caller's business (`expanded` + `onToggle`), modelled on
 * `CapacityBoard`'s `breakdownOpen` useState disclosure — no accordion
 * library exists in this app and none is being added.
 */
import { ChevronDown } from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar'
import { GradientProgress } from '@/components/ui/GradientProgress'
import { formatMinutesAsHours, type Minutes } from '@/lib/standup/minutes'
import { cn } from '@/lib/utils'

import { CapacityMeter } from '../primitives/CapacityMeter'

import type { AssignableMemberView, AssignableTaskView } from './AssignableTask'
import { readOnlyTaskDraggableId, TaskCard } from './TaskCard'

/** The dnd-kit droppable id for a member card. Kept next to its parser. */
export function memberDroppableId(memberId: string): string {
  return `member-${memberId}`
}

/** Inverse of `memberDroppableId`. Null when the id is not a member card. */
export function memberIdFromDroppableId(droppableId: string): string | null {
  return droppableId.startsWith('member-') ? droppableId.slice('member-'.length) : null
}

export interface ExpandableMemberCardProps {
  member: AssignableMemberView
  expanded: boolean
  onToggle: () => void
  /** Forced highlight, for callers that resolve hover themselves. */
  isOver?: boolean
  disabled?: boolean
  /** Context-specific content appended to the expanded body (Tasks 7-8). */
  renderExpandedExtra?: (member: AssignableMemberView) => React.ReactNode
  /**
   * Context-specific content shown under the meter whether the card is
   * expanded or not (Task 8). The run screen's stranded-hours alert (OB-12)
   * and estimate-debt badge live here: both are warnings, and a warning
   * hidden behind a disclosure is a warning nobody sees.
   */
  renderAlways?: (member: AssignableMemberView) => React.ReactNode
  /**
   * Replaces the default read-only row for one of the member's tasks (Task 8).
   * The run screen's rows carry an `HourStepper` and a remove button, and it
   * needs them *instead of* the read-only rows, not beside them.
   */
  renderTaskRow?: (
    member: AssignableMemberView,
    task: AssignableTaskView
  ) => React.ReactNode
  locale?: string
  className?: string
}

export function ExpandableMemberCard({
  member,
  expanded,
  onToggle,
  isOver = false,
  disabled = false,
  renderExpandedExtra,
  renderAlways,
  renderTaskRow,
  locale,
  className
}: ExpandableMemberCardProps) {
  const { setNodeRef, isOver: hovered } = useDroppable({
    id: memberDroppableId(member.id),
    data: { memberId: member.id },
    disabled
  })

  const highlighted = isOver || hovered
  const bodyId = `member-card-body-${member.id}`

  const assignedMinutes = member.assignedMinutes ?? 0
  const capacityMinutes = member.capacityMinutes ?? 0
  const percent =
    capacityMinutes > 0 ? Math.round((assignedMinutes / capacityMinutes) * 100) : 0
  const overCapacity = capacityMinutes > 0 && assignedMinutes > capacityMinutes

  return (
    <article
      ref={setNodeRef}
      data-testid="member-card"
      data-member-id={member.id}
      className={cn(
        'apple-transition flex flex-col gap-2.5 rounded-[var(--apple-radius-lg)] border bg-card p-3',
        highlighted
          ? 'border-[var(--apple-system-blue)] bg-[var(--apple-system-blue)]/5 shadow-[0_0_0_3px_rgba(0,122,255,0.15)]'
          : 'border-[var(--apple-separator)]',
        className
      )}
    >
      <div className="flex items-center gap-2.5">
        <Avatar className="h-9 w-9">
          {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt="" />}
          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-[12px] font-semibold text-white">
            {initialsOf(member.name)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <p
            data-testid="member-name"
            className="truncate text-[13.5px] font-semibold text-[var(--apple-label)]"
            title={member.name}
          >
            {member.name}
          </p>
          <p className="truncate text-[11.5px] text-[var(--apple-secondary-label)]">
            {member.role ? <span className="capitalize">{formatRole(member.role)}</span> : null}
            {member.role ? ' · ' : ''}
            {member.tasks.length === 1 ? '1 task' : `${member.tasks.length} tasks`}
            {/* Assigning here changes the sprint roster, so the card says so
                before the drop, not after it. Absent (rather than false)
                means the context has no roster concept at all. */}
            {member.onSprintTeam === false && (
              <span className="text-[var(--apple-tertiary-label)]"> · not on sprint team</span>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={bodyId}
          aria-label={
            expanded ? `Collapse ${member.name}'s details` : `Expand ${member.name}'s details`
          }
          className="apple-transition shrink-0 rounded-full border border-[var(--apple-separator)] p-1 text-[var(--apple-secondary-label)] hover:bg-[var(--apple-quaternary-fill)]"
        >
          <ChevronDown
            aria-hidden="true"
            className={cn('apple-transition h-4 w-4', expanded && 'rotate-180')}
          />
        </button>
      </div>

      {/* The richer breakdown when the run context supplied one; the plain
          assigned/capacity bar when only two numbers exist. */}
      {member.capacityBreakdown ? (
        <CapacityMeter
          name={member.name}
          effectiveMinutes={member.capacityBreakdown.effectiveMinutes}
          allocatedMinutes={member.capacityBreakdown.allocatedMinutes}
          // Absent only where the context has no carried-forward concept
          // (planning); zero is then the honest figure rather than a stand-in.
          carriedMinutes={member.carriedMinutes ?? (0 as Minutes)}
          gapMinutes={member.capacityBreakdown.gapMinutes}
          status={member.capacityBreakdown.status}
          locale={locale}
        />
      ) : capacityMinutes > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="font-apple-mono text-[11px] tabular-nums text-[var(--apple-secondary-label)]">
            {formatMinutesAsHours(assignedMinutes as Minutes, { locale })} of{' '}
            {formatMinutesAsHours(capacityMinutes as Minutes, { locale })} ·{' '}
            {overCapacity
              ? `over by ${formatMinutesAsHours((assignedMinutes - capacityMinutes) as Minutes, { locale })}`
              : `${formatMinutesAsHours((capacityMinutes - assignedMinutes) as Minutes, { locale })} free`}
          </span>
          <GradientProgress
            value={percent}
            gradient={overCapacity ? 'var(--apple-system-orange)' : 'var(--apple-chart-gradient)'}
            glow={overCapacity ? 'var(--apple-system-orange)' : 'var(--apple-chart-glow)'}
          />
        </div>
      ) : (
        <p className="text-[11.5px] text-[var(--apple-tertiary-label)]">
          No capacity figure for this member.
        </p>
      )}

      {renderAlways?.(member)}

      {/* Drop affordance, and the reason the collapsed card is worth keeping
          shallow: the target reads as a target before anything is dragged. */}
      {!expanded && member.tasks.length === 0 && (
        <p
          className={cn(
            'apple-transition rounded-[var(--apple-radius-md)] border border-dashed px-2.5 py-2 text-center text-[12px]',
            highlighted
              ? 'border-[var(--apple-system-blue)] text-[var(--apple-system-blue)]'
              : 'border-[var(--apple-separator)] text-[var(--apple-tertiary-label)]'
          )}
        >
          Drop a task here
        </p>
      )}

      <div id={bodyId} hidden={!expanded}>
        {expanded && (
          <div className="flex flex-col gap-3 border-t border-[var(--apple-separator)] pt-2.5">
            <section className="flex flex-col gap-1.5">
              <h5 className="apple-section-label text-[var(--apple-tertiary-label)]">
                Assigned work
              </h5>
              {member.tasks.length === 0 ? (
                <p className="text-[12px] text-[var(--apple-tertiary-label)]">
                  Nothing assigned yet.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {member.tasks.map((task) => (
                    <li key={task.id}>
                      {/* Read-only inside the card it already landed in: the
                          left panel is where work is picked up from. The id is
                          namespaced because the same task is usually still in
                          that panel, and dnd-kit's registry is keyed by id —
                          `disabled` does not unregister the node. */}
                      {renderTaskRow ? (
                        renderTaskRow(member, task)
                      ) : (
                        <TaskCard
                          task={task}
                          draggable={false}
                          dragId={readOnlyTaskDraggableId(member.id, task.id)}
                          compact
                          locale={locale}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-1">
              <h5 className="apple-section-label text-[var(--apple-tertiary-label)]">
                Daily workload
              </h5>
              {member.capacityBreakdown ? (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11.5px]">
                  <WorkloadRow
                    label="Nominal"
                    minutes={member.capacityBreakdown.nominalMinutes}
                    locale={locale}
                  />
                  <WorkloadRow
                    label="Effective"
                    minutes={member.capacityBreakdown.effectiveMinutes}
                    locale={locale}
                  />
                  <WorkloadRow
                    label="Allocated"
                    minutes={member.capacityBreakdown.allocatedMinutes}
                    locale={locale}
                  />
                  <WorkloadRow
                    label="Gap"
                    minutes={member.capacityBreakdown.gapMinutes}
                    locale={locale}
                    signed
                  />
                </dl>
              ) : (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11.5px]">
                  <WorkloadRow
                    label="Assigned"
                    minutes={assignedMinutes as Minutes}
                    locale={locale}
                  />
                  <WorkloadRow
                    label="Capacity"
                    minutes={capacityMinutes as Minutes}
                    locale={locale}
                  />
                </dl>
              )}
            </section>

            {/* No "skills" section: member skills have no data source anywhere
                in the app, and a placeholder would imply one is coming. */}

            {renderExpandedExtra?.(member)}
          </div>
        )}
      </div>
    </article>
  )
}

function WorkloadRow({
  label,
  minutes,
  locale,
  signed = false
}: {
  label: string
  minutes: Minutes
  locale?: string
  signed?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[var(--apple-secondary-label)]">{label}</dt>
      <dd className="font-apple-mono tabular-nums text-[var(--apple-label)]">
        {formatMinutesAsHours(minutes, { locale, signed })}
      </dd>
    </div>
  )
}

/** Matches the two-letter fallback the team reports already render. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase()
}

/** Roles arrive as enum-ish snake_case (`project_qa_lead`) in the planning context. */
function formatRole(role: string): string {
  return role.replace(/_/g, ' ')
}
