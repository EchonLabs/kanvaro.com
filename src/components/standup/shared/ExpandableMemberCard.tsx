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
 * on. The highlight matches `AssignmentBoard`'s `Lane`: an accent ring drawn
 * outside the box, so nothing reflows as a card passes over.
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
import { initialsOf } from '../planning/ui'

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

  const highlighted = hovered
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
        'apple-transition flex flex-col gap-2.5 rounded-[var(--apple-radius-lg)] border border-[var(--plan-border)] bg-[var(--plan-surface)] p-3 ring-2 ring-transparent',
        highlighted && 'ring-[var(--plan-accent)]',
        className
      )}
    >
      <div className="flex items-center gap-2.5">
        <Avatar className="h-9 w-9">
          {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt="" />}
          {/* Tokenised, not `from-blue-500 to-purple-500`: raw Tailwind palette
              steps here were the one place this card stepped outside the app's
              Apple tokens, so it read as a different blue to everything around
              it — including the run screen, which restyles this card. */}
          <AvatarFallback className="bg-[var(--plan-track)] apple-type-caption font-semibold text-[var(--plan-muted)]">
            {initialsOf(member.name)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <p
            data-testid="member-name"
            className="apple-type-subheadline truncate font-semibold text-[var(--plan-text)]"
            title={member.name}
          >
            {member.name}
          </p>
          <p className="apple-type-caption truncate text-[var(--plan-secondary)]">
            {member.role ? <span className="capitalize">{formatRole(member.role)}</span> : null}
            {member.role ? ' · ' : ''}
            {member.tasks.length === 1 ? '1 task' : `${member.tasks.length} tasks`}
            {/* Assigning here changes the sprint roster, so the card says so
                before the drop, not after it. Absent (rather than false)
                means the context has no roster concept at all. */}
            {member.onSprintTeam === false && (
              <span className="text-[var(--plan-muted)]"> · not on sprint team</span>
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
          className="apple-transition shrink-0 rounded-full border border-[var(--plan-border)] p-1 text-[var(--plan-muted)] hover:bg-[var(--plan-track)]"
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
          <span className="apple-type-caption font-apple-mono tabular-nums text-[var(--plan-secondary)]">
            {formatMinutesAsHours(assignedMinutes as Minutes, { locale })} of{' '}
            {formatMinutesAsHours(capacityMinutes as Minutes, { locale })} ·{' '}
            {overCapacity
              ? `over by ${formatMinutesAsHours((assignedMinutes - capacityMinutes) as Minutes, { locale })}`
              : `${formatMinutesAsHours((capacityMinutes - assignedMinutes) as Minutes, { locale })} free`}
          </span>
          <GradientProgress
            value={percent}
            gradient={overCapacity ? 'var(--plan-warning)' : 'var(--apple-chart-gradient)'}
            glow={overCapacity ? 'var(--plan-warning)' : 'var(--apple-chart-glow)'}
          />
        </div>
      ) : (
        <p className="apple-type-caption text-[var(--plan-muted)]">
          No capacity figure for this member.
        </p>
      )}

      {renderAlways?.(member)}

      {/* Drop affordance, and the reason the collapsed card is worth keeping
          shallow: the target reads as a target before anything is dragged. */}
      {!expanded && member.tasks.length === 0 && (
        <p
          className={cn(
            'apple-transition apple-type-caption rounded-[var(--apple-radius-md)] border border-dashed border-[var(--plan-border)] px-2.5 py-2 text-center',
            highlighted
              ? 'border-[var(--plan-accent)] text-[var(--plan-accent-ink)]'
              : 'text-[var(--plan-muted)]'
          )}
        >
          Drop a task here
        </p>
      )}

      <div id={bodyId} hidden={!expanded}>
        {expanded && (
          <div className="flex flex-col gap-3 border-t border-[var(--plan-border)] pt-2.5">
            <section className="flex flex-col gap-1.5">
              <h5 className="apple-section-label text-[var(--plan-muted)]">
                Assigned work
              </h5>
              {member.tasks.length === 0 ? (
                <p className="apple-type-caption text-[var(--plan-muted)]">
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
                          locale={locale}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-1">
              <h5 className="apple-section-label text-[var(--plan-muted)]">
                Daily workload
              </h5>
              {member.capacityBreakdown ? (
                <dl className="apple-type-caption grid grid-cols-2 gap-x-3 gap-y-0.5">
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
                <dl className="apple-type-caption grid grid-cols-2 gap-x-3 gap-y-0.5">
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
      <dt className="text-[var(--plan-secondary)]">{label}</dt>
      <dd className="font-apple-mono tabular-nums text-[var(--plan-text)]">
        {formatMinutesAsHours(minutes, { locale, signed })}
      </dd>
    </div>
  )
}

/** Roles arrive as enum-ish snake_case (`project_qa_lead`) in the planning context. */
function formatRole(role: string): string {
  return role.replace(/_/g, ' ')
}
