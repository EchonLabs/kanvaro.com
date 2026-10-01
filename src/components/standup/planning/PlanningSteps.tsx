'use client'

/**
 * The planning rail and the gated buttons hanging off it.
 *
 * Planning is an ordered flow — scope, assign, estimate, complete — and it was
 * previously presented as a row of buttons that were simply disabled, with the
 * reason hidden in a `title` attribute. A natively disabled button receives no
 * pointer events, so that tooltip could never actually appear: the PM saw a
 * dead button and no explanation.
 *
 * {@link GateButton} is the fix, and it is the pattern `CompletionPanel` uses
 * on the stand-up run screen: the reason is always on screen, wired to the
 * button with `aria-describedby`, and clicking a blocked button raises a toast
 * rather than doing nothing.
 */
import { Check } from 'lucide-react'

import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { cn } from '@/lib/utils'

import { type StepId, type StepState } from './gates'
import { planButtonClass, planCardClass, type PlanTone } from './ui'

export interface GateButtonProps {
  id: string
  label: string
  reason: string
  enabled: boolean
  busy?: boolean
  onClick: () => void
  onBlockedClick: (reason: string) => void
  tone?: PlanTone
  icon?: React.ReactNode
}

export function GateButton({
  id,
  label,
  reason,
  enabled,
  busy,
  onClick,
  onBlockedClick,
  tone = 'secondary',
  icon
}: GateButtonProps) {
  const reasonId = `${id}-reason`

  return (
    <span className="inline-flex items-center gap-1">
      {/* `aria-disabled` rather than `disabled`: the button must stay
          focusable and clickable so the blocked reason can be announced and
          toasted. A `disabled` button is invisible to both. */}
      <button
        type="button"
        aria-disabled={!enabled || !!busy}
        aria-describedby={reasonId}
        onClick={() => {
          if (busy) return
          if (!enabled) {
            onBlockedClick(reason)
            return
          }
          onClick()
        }}
        className={planButtonClass(tone, cn(!enabled && 'opacity-40'))}
      >
        {icon}
        {label}
      </button>

      <InfoTooltip
        id={reasonId}
        content={reason}
        className="rounded-full p-0.5 text-[var(--plan-muted)] hover:text-[var(--plan-text)]"
        iconClassName="h-3.5 w-3.5"
      />
    </span>
  )
}

export interface PlanningStepDefinition {
  id: StepId
  label: string
  hint: string
}

export const PLANNING_STEPS: PlanningStepDefinition[] = [
  { id: 'scope', label: 'Scope', hint: 'Pull the work into the sprint' },
  { id: 'assign', label: 'Assign', hint: 'Give every task one owner' },
  { id: 'estimate', label: 'Estimate', hint: 'Run planning poker' },
  { id: 'complete', label: 'Complete', hint: 'Pass the checklist and plan the sprint' }
]

const STATE_LABEL: Record<StepState, string> = {
  done: 'done',
  current: 'current step',
  locked: 'not started'
}

/**
 * Planning progress as one completion bar, not a row of numbered steps.
 *
 * The numbered circles read as tabs, and tabs promise you can click to a step.
 * You can't: each step is unlocked by the one before it. A bar says what is
 * actually true here, "this much is done, this is next", and the step names
 * sit under their quarter of it so the order is still visible.
 */
export function PlanningStepRail({ states }: { states: Record<StepId, StepState> }) {
  const total = PLANNING_STEPS.length
  const doneCount = PLANNING_STEPS.filter((step) => states[step.id] === 'done').length
  const current = PLANNING_STEPS.find((step) => states[step.id] === 'current')
  const pct = Math.round((doneCount / total) * 100)
  const allDone = doneCount === total
  const fill = allDone ? 'var(--plan-success)' : 'var(--plan-accent)'

  return (
    <section
      aria-label="Sprint planning progress"
      className={cn(planCardClass, 'flex w-full flex-col gap-3 p-4 sm:px-5')}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <p className="apple-type-subheadline font-semibold text-[var(--plan-text)]">
            {allDone ? 'Ready to complete' : `Step ${doneCount + 1} of ${total} · ${current?.label}`}
          </p>
          <p className="apple-type-footnote text-[var(--plan-muted)]">
            {allDone ? 'Every step is done.' : current?.hint}
          </p>
        </div>
        <p
          className="apple-type-subheadline font-semibold tabular-nums"
          style={{ color: allDone ? 'var(--plan-success)' : 'var(--plan-text)' }}
        >
          {pct}%
        </p>
      </div>

      <div
        role="progressbar"
        aria-label="Planning steps complete"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={doneCount}
        aria-valuetext={`${doneCount} of ${total} steps done`}
        className="relative h-2 w-full overflow-hidden rounded-full bg-[var(--plan-track)]"
      >
        <div
          className="relative h-full overflow-hidden rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%`, backgroundColor: fill }}
        >
          {pct > 2 && <span aria-hidden className="progress-shimmer absolute inset-0" />}
        </div>
        {/* Quarter ticks, so the bar still reads as four steps. */}
        {PLANNING_STEPS.slice(1).map((step, index) => (
          <span
            key={step.id}
            aria-hidden
            className="absolute top-0 h-full w-[2px] -translate-x-1/2 bg-[var(--plan-surface)]"
            style={{ left: `${((index + 1) / total) * 100}%` }}
          />
        ))}
      </div>

      <ol aria-label="Sprint planning steps" className="grid grid-cols-4 gap-2">
        {PLANNING_STEPS.map((step) => {
          const state = states[step.id]
          return (
            <li
              key={step.id}
              aria-current={state === 'current' ? 'step' : undefined}
              title={step.hint}
              className={cn(
                'apple-type-footnote flex min-w-0 items-center gap-1',
                state === 'current' && 'font-semibold text-[var(--plan-text)]',
                state === 'done' && 'text-[var(--plan-text)]',
                state === 'locked' && 'text-[var(--plan-muted)]'
              )}
            >
              {state === 'done' && (
                <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-[var(--plan-success)]" />
              )}
              <span className="truncate">{step.label}</span>
              <span className="sr-only">{`, ${STATE_LABEL[state]}. ${step.hint}.`}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
