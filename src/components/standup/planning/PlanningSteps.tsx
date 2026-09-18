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
import { Check, Lock } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { cn } from '@/lib/utils'

import { type StepId, type StepState } from './gates'

export interface GateButtonProps {
  id: string
  label: string
  reason: string
  enabled: boolean
  busy?: boolean
  onClick: () => void
  onBlockedClick: (reason: string) => void
  variant?: 'default' | 'outline'
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
  variant = 'default',
  icon
}: GateButtonProps) {
  const reasonId = `${id}-reason`

  return (
    <span className="inline-flex items-center gap-1.5">
      {/* `aria-disabled` rather than `disabled`: the button must stay
          focusable and clickable so the blocked reason can be announced and
          toasted. A `disabled` button is invisible to both. */}
      <Button
        type="button"
        variant={variant}
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
        className={cn(!enabled && 'opacity-40')}
      >
        {icon}
        {label}
      </Button>

      <InfoTooltip id={reasonId} content={reason} />
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

export function PlanningStepRail({ states }: { states: Record<StepId, StepState> }) {
  return (
    <ol
      aria-label="Sprint planning steps"
      className="flex flex-wrap items-stretch gap-2"
    >
      {PLANNING_STEPS.map((step, index) => {
        const state = states[step.id]
        return (
          <li
            key={step.id}
            aria-current={state === 'current' ? 'step' : undefined}
            className={cn(
              'flex min-w-[9rem] flex-1 items-center gap-2.5 rounded-[var(--apple-radius-md)] border p-2.5',
              state === 'done' &&
                'border-[var(--apple-system-green)]/30 bg-[var(--apple-system-green)]/5',
              state === 'current' &&
                'border-[var(--apple-system-blue)]/40 bg-[var(--apple-system-blue)]/5',
              state === 'locked' && 'border-[var(--apple-separator)] opacity-60'
            )}
          >
            <span
              aria-hidden
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                state === 'done' && 'bg-[var(--apple-system-green)] text-white',
                state === 'current' && 'bg-[var(--apple-system-blue)] text-white',
                state === 'locked' &&
                  'bg-[var(--apple-fill-quaternary)] text-[var(--apple-tertiary-label)]'
              )}
            >
              {state === 'done' ? (
                <Check className="h-3.5 w-3.5" />
              ) : state === 'locked' ? (
                <Lock className="h-3 w-3" />
              ) : (
                index + 1
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-[var(--apple-label)]">
                {step.label}
              </span>
              <span className="block text-[11px] text-[var(--apple-secondary-label)]">
                {step.hint}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
