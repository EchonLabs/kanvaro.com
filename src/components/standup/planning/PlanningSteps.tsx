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
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { cn } from '@/lib/utils'

import { type StepId, type StepState } from './gates'
import { planButtonClass, type PlanTone } from './ui'

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

export function PlanningStepRail({ states }: { states: Record<StepId, StepState> }) {
  return (
    <ol
      aria-label="Sprint planning steps"
      className="flex w-full flex-wrap items-start justify-between gap-4 rounded-[16px] border border-[var(--plan-border)] bg-[var(--plan-surface)] p-4"
    >
      {PLANNING_STEPS.map((step, index) => {
        const state = states[step.id]
        const reached = state !== 'locked'
        const isLast = index === PLANNING_STEPS.length - 1

        return (
          <li
            key={step.id}
            aria-current={state === 'current' ? 'step' : undefined}
            title={step.hint}
            className="flex min-w-[4.5rem] flex-col items-center gap-[9px]"
          >
            <span
              aria-hidden
              className={cn(
                'flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-bold',
                reached
                  ? 'bg-[var(--plan-accent)] text-white'
                  : 'bg-[var(--plan-raised)] text-[var(--plan-muted)]'
              )}
            >
              {index + 1}
            </span>
            <span
              className={cn(
                'text-[12px]',
                state === 'current' && 'font-bold text-[var(--plan-text)]',
                state === 'done' && 'text-[var(--plan-text)]',
                state === 'locked' && 'text-[var(--plan-muted)]'
              )}
            >
              {step.label}
              <span className="sr-only">
                {`, ${STATE_LABEL[state]}. ${step.hint}.`}
              </span>
            </span>
            {!isLast && (
              <span
                aria-hidden
                className={cn(
                  'h-px w-[clamp(3rem,12vw,150px)]',
                  state === 'done' ? 'bg-[var(--plan-accent)]' : 'bg-[var(--plan-border)]'
                )}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
