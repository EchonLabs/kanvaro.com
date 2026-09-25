'use client'

/**
 * The live planning checklist (spec §15.5, UI-4, UI-5, PLN-6/7).
 *
 * Two requirements shape this component and neither is cosmetic:
 *
 * **UI-4** — the checklist is live. Fixing a task updates it with no page
 * refresh, so the PM can work the list top to bottom instead of reloading.
 *
 * **UI-5** — each failing mandatory item names the *specific* offending tasks,
 * each with an inline fix control. "3 tasks have no estimate" without saying
 * which three is exactly the hunting the spec exists to eliminate, so a task
 * check renders one row per offending task.
 */
import { useState } from 'react'
import { Check, ChevronDown, AlertCircle, Loader2, AlertTriangle } from 'lucide-react'

import { cn } from '@/lib/utils'

import { PlanButton, PlanCard } from './planning/ui'

export interface ChecklistItemView {
  checkId: string
  kind: 'mandatory' | 'advisory'
  passed: boolean
  message?: string
  offendingIds?: string[]
}

export interface OffendingTask {
  id: string
  key: string
  title: string
  type?: string
  priority?: string
  originalEstimateMinutes?: number
  hasDescription: boolean
}

export interface OffendingMember {
  id: string
  name: string
}

/** Where on the planning screen a check is fixed. */
export type ChecklistFixTarget = 'goal' | 'scope' | 'assignment'

interface Props {
  items: ChecklistItemView[]
  offendingTasks: OffendingTask[]
  offendingMembers: OffendingMember[]
  acknowledged: string[]
  onAcknowledge: (checkId: string, next: boolean) => void
  /** Sets an estimate inline (PC-3). Resolves when the checklist has refreshed. */
  onEstimateTask: (taskId: string, hours: number) => Promise<void>
  /** Opens the task for the fixes an inline control cannot do (PC-4, PC-5). */
  onOpenTask: (taskId: string) => void
  /** Scrolls to the section that fixes a check. */
  onJump?: (target: ChecklistFixTarget) => void
  busy?: boolean
}

/** What a passing check guarantees. */
const CHECK_LABELS: Record<string, string> = {
  'PC-1': 'Sprint goal set',
  'PC-2': 'Sprint has tasks',
  'PC-3': 'Every task estimated',
  'PC-4': 'Every task says what done means',
  'PC-5': 'Type and priority set',
  'PC-6': 'Team assigned',
  'PC-7': 'Sprint has working days',
  'PC-8': 'Every task has an owner',
  'PC-9': 'Every task went through poker',
  'PA-1': 'Scope within capacity',
  'PA-2': 'Scope uses the team',
  'PA-3': 'Tasks fit inside a day',
  'PA-4': 'Estimates were voted on',
  'PA-5': 'Nobody over-committed',
  'PA-6': 'Everybody has work'
}

/** What a failing check is, stated as the problem. */
const ISSUE_TITLES: Record<string, string> = {
  'PC-1': 'Sprint goal missing',
  'PC-2': 'No tasks in scope',
  'PC-3': 'Missing estimate',
  'PC-4': 'Missing definition of done',
  'PC-5': 'Missing type or priority',
  'PC-6': 'No team assigned',
  'PC-7': 'No working days',
  'PC-8': 'Task without an owner',
  'PC-9': 'Not estimated in poker',
  'PA-1': 'Scope over capacity',
  'PA-2': 'Scope under capacity',
  'PA-3': 'Task larger than a day',
  'PA-4': 'Estimated without a team vote',
  'PA-5': 'Over capacity',
  'PA-6': 'Idle capacity detected'
}

const FIX_TARGETS: Record<string, ChecklistFixTarget> = {
  'PC-1': 'goal',
  'PC-2': 'scope',
  'PA-1': 'scope',
  'PA-2': 'scope',
  'PC-6': 'assignment',
  'PC-8': 'assignment',
  'PA-5': 'assignment',
  'PA-6': 'assignment'
}

export function PlanningChecklist({
  items,
  offendingTasks,
  offendingMembers,
  acknowledged,
  onAcknowledge,
  onEstimateTask,
  onOpenTask,
  onJump,
  busy
}: Props) {
  const [showPassed, setShowPassed] = useState(false)

  const blocking = items.filter((item) => item.kind === 'mandatory' && !item.passed)
  const advisory = items.filter((item) => item.kind === 'advisory' && !item.passed)
  const passed = items.filter((item) => item.passed)

  const rowProps = { offendingTasks, offendingMembers, onEstimateTask, onOpenTask, onJump }

  return (
    <PlanCard
      id="planning-checklist"
      title="Planning checklist"
      description="Blocking issues must be fixed. Advisories may be acknowledged and waived."
      aria-busy={busy}
    >
      <div className="flex w-full flex-col gap-[14px]">
        {blocking.length > 0 && (
          <ChecklistGroup label={`BLOCKING · ${blocking.length}`} tone="danger">
            {blocking.map((item) => (
              <CheckRows key={item.checkId} item={item} {...rowProps} />
            ))}
          </ChecklistGroup>
        )}

        {advisory.length > 0 && (
          <ChecklistGroup label={`ADVISORY · ${advisory.length}`} tone="warning">
            {advisory.map((item) => (
              <CheckRows
                key={item.checkId}
                item={item}
                {...rowProps}
                acknowledged={acknowledged.includes(item.checkId)}
                onAcknowledge={onAcknowledge}
              />
            ))}
          </ChecklistGroup>
        )}

        {blocking.length === 0 && advisory.length === 0 && items.length > 0 && (
          <p className="flex items-center gap-3 rounded-[12px] bg-[var(--plan-success-bg)] p-3 text-[12px] font-bold text-[var(--plan-text)]">
            <Check className="h-4 w-4 shrink-0 text-[var(--plan-success)]" />
            All {items.length} {items.length === 1 ? 'check' : 'checks'} pass
          </p>
        )}

        {passed.length > 0 && (blocking.length > 0 || advisory.length > 0) && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowPassed((current) => !current)}
              aria-expanded={showPassed}
              className="flex items-center gap-1 self-start text-[12px] text-[var(--plan-muted)] transition-colors hover:text-[var(--plan-text)]"
            >
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showPassed && 'rotate-180')} />
              {showPassed ? 'Hide passed checks' : `Show ${passed.length} passed`}
            </button>

            {showPassed && (
              <ul className="flex flex-col gap-2">
                {passed.map((item) => (
                  <li
                    key={item.checkId}
                    className="flex items-center gap-3 rounded-[12px] bg-[var(--plan-raised)] p-3"
                  >
                    <Check aria-label="Passed" className="h-4 w-4 shrink-0 text-[var(--plan-success)]" />
                    <span className="text-[12px] text-[var(--plan-text)]">
                      {CHECK_LABELS[item.checkId] ?? item.checkId}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </PlanCard>
  )
}

function ChecklistGroup({
  label,
  tone,
  children
}: {
  label: string
  tone: 'danger' | 'warning'
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3
        className={cn(
          'text-[12px] font-bold',
          tone === 'danger' ? 'text-[var(--plan-danger)]' : 'text-[var(--plan-warning)]'
        )}
      >
        {label}
      </h3>
      <ul className="flex flex-col gap-2">{children}</ul>
    </section>
  )
}

interface CheckRowsProps {
  item: ChecklistItemView
  offendingTasks: OffendingTask[]
  offendingMembers: OffendingMember[]
  acknowledged?: boolean
  onAcknowledge?: (checkId: string, next: boolean) => void
  onEstimateTask: (taskId: string, hours: number) => Promise<void>
  onOpenTask: (taskId: string) => void
  onJump?: (target: ChecklistFixTarget) => void
}

/**
 * The rows for one failing check: one per offending task when the check is
 * about tasks, otherwise a single row carrying the check's own message.
 */
function CheckRows({
  item,
  offendingTasks,
  offendingMembers,
  acknowledged,
  onAcknowledge,
  onEstimateTask,
  onOpenTask,
  onJump
}: CheckRowsProps) {
  const title = ISSUE_TITLES[item.checkId] ?? CHECK_LABELS[item.checkId] ?? item.checkId
  const tasks = offendingTasks.filter((task) => item.offendingIds?.includes(task.id))
  const members = offendingMembers.filter((member) => item.offendingIds?.includes(member.id))
  const target = FIX_TARGETS[item.checkId]
  const isAdvisory = item.kind === 'advisory'

  // PLN-7 — an advisory needs an explicit acknowledgement, never a silent pass.
  const acknowledge = isAdvisory && onAcknowledge && (
    <PlanButton
      aria-pressed={!!acknowledged}
      onClick={() => onAcknowledge(item.checkId, !acknowledged)}
      className={cn(acknowledged && 'border-[var(--plan-success)] text-[var(--plan-success)]')}
    >
      {acknowledged && <Check />}
      {acknowledged ? 'Acknowledged' : 'Acknowledge & waive'}
    </PlanButton>
  )

  if (tasks.length > 0) {
    return (
      <>
        {tasks.map((task) => (
          <IssueRow
            key={task.id}
            tone={isAdvisory ? 'warning' : 'danger'}
            title={title}
            detail={
              <>
                <button
                  type="button"
                  onClick={() => onOpenTask(task.id)}
                  className="hover:text-[var(--plan-text)] hover:underline"
                >
                  {task.key}
                </button>
                {` · ${task.title}`}
              </>
            }
            dimmed={acknowledged}
          >
            {item.checkId === 'PC-3' ? (
              <EstimateEntry task={task} onEstimateTask={onEstimateTask} />
            ) : (
              <PlanButton onClick={() => onOpenTask(task.id)}>Fix</PlanButton>
            )}
            {acknowledge}
          </IssueRow>
        ))}
      </>
    )
  }

  const memberNames = members.map((member) => member.name).join(', ')
  const detail = [memberNames, item.message].filter(Boolean).join(' · ')

  return (
    <IssueRow
      tone={isAdvisory ? 'warning' : 'danger'}
      title={title}
      detail={detail || undefined}
      dimmed={acknowledged}
    >
      {target && onJump && (
        <PlanButton onClick={() => onJump(target)}>
          {members.length > 0 && !isAdvisory ? 'Reassign tasks' : 'Fix'}
        </PlanButton>
      )}
      {acknowledge}
    </IssueRow>
  )
}

/**
 * NFR-A1 in spirit: state is carried by an icon and a label, never by colour
 * alone. A blocking check and an advisory must not look identical in greyscale.
 */
function IssueRow({
  tone,
  title,
  detail,
  dimmed,
  children
}: {
  tone: 'danger' | 'warning'
  title: string
  detail?: React.ReactNode
  dimmed?: boolean
  children?: React.ReactNode
}) {
  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-[12px] p-3 sm:flex-nowrap',
        tone === 'danger' ? 'bg-[var(--plan-danger-bg)]' : 'bg-[var(--plan-warning-bg)]'
      )}
    >
      {tone === 'danger' ? (
        <AlertCircle aria-label="Blocking" className="h-4 w-4 shrink-0 text-[var(--plan-danger)]" />
      ) : (
        <AlertTriangle aria-label="Advisory" className="h-4 w-4 shrink-0 text-[var(--plan-warning)]" />
      )}
      <div className={cn('flex min-w-0 flex-1 flex-col gap-[3px]', dimmed && 'opacity-60')}>
        <span className="text-[12px] font-bold text-[var(--plan-text)]">{title}</span>
        {detail && <span className="text-[11px] text-[var(--plan-muted)]">{detail}</span>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </li>
  )
}

/** PC-3's inline fix: an estimate is a single number, so it is entered here. */
function EstimateEntry({
  task,
  onEstimateTask
}: {
  task: OffendingTask
  onEstimateTask: (taskId: string, hours: number) => Promise<void>
}) {
  const [hours, setHours] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const value = Number(hours)
  const valid = hours !== '' && Number.isFinite(value) && value > 0

  const save = async () => {
    if (!valid) return
    setSaving(true)
    setError(null)
    try {
      await onEstimateTask(task.id, value)
      setHours('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the estimate')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="0.25"
          step="0.25"
          value={hours}
          onChange={(event) => setHours(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save()
          }}
          placeholder="Hours"
          aria-label={`Estimate for ${task.key} in hours`}
          className="w-[72px] rounded-[8px] border border-[var(--plan-border)] bg-[var(--plan-surface)] p-2 text-[11px] text-[var(--plan-text)] placeholder:text-[var(--plan-muted)] focus:border-[var(--plan-accent)] focus:outline-none"
        />
        <PlanButton onClick={save} disabled={!valid || saving}>
          {saving && <Loader2 className="animate-spin" />}
          Enter estimate
        </PlanButton>
      </div>
      {error && (
        <p className="text-[11px] text-[var(--plan-danger)]" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
