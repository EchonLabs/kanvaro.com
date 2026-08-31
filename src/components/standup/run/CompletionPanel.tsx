'use client'

import type { CompletionCheckResult } from '@/lib/standup/completion-checks'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

/**
 * Panel 7 — the completion checks (§15.8.9).
 *
 * Renders **all eleven**, including the five no phase has built yet. Those
 * report the phase that owns them rather than being hidden, for the same reason
 * the evaluator returns them: a list that silently drops the checks nobody
 * wrote looks like a clean bill of health, and a PM reading "all checks passed"
 * would have no way to know it never asked about carry-forward notes.
 *
 * No override control is rendered. `overridable` is data on the result and
 * Phase 10 owns the override path; showing a button that does nothing would be
 * worse than showing none.
 */

export interface CompletionPanelProps {
  checks: readonly CompletionCheckResult[]
  blocking: readonly CompletionCheckResult[]
  onComplete: () => void
  disabled?: boolean
}

const TONE: Record<string, string> = {
  pass: 'text-emerald-600 dark:text-emerald-400',
  fail: 'text-destructive',
  warn: 'text-amber-600 dark:text-amber-400',
  not_evaluated: 'text-muted-foreground'
}

const MARK: Record<string, string> = {
  pass: '✓',
  fail: '!',
  warn: '!',
  not_evaluated: '–'
}

export function CompletionPanel({
  checks,
  blocking,
  onComplete,
  disabled = false
}: CompletionPanelProps) {
  const firstBlocker = blocking[0]

  return (
    <section id="panel-7" aria-labelledby="panel-7-heading" className="flex flex-col gap-3">
      <h3 id="panel-7-heading" className="text-sm font-semibold">
        {standupStrings.run.completionTitle()}
      </h3>

      <ul className="flex flex-col gap-1">
        {checks.map((check) => (
          <li
            key={check.checkId}
            data-testid="check-row"
            className="flex items-baseline gap-2 text-sm"
          >
            <span className={cn('w-4 shrink-0 text-center', TONE[check.status])}>
              {MARK[check.status]}
            </span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {check.checkId}
            </span>
            <span className="flex-1">
              {check.status === 'not_evaluated'
                ? standupStrings.run.checkNotEvaluated({ phase: check.ownedBy ?? '' })
                : check.message}
            </span>

            {/* RUN-19's jump link. Only where there is something to jump to. */}
            {check.status === 'fail' && check.entities.length > 0 && (
              <a
                href={`#panel-${panelFor(check.checkId)}`}
                className="shrink-0 text-xs underline"
              >
                {standupStrings.run.jumpToFailure()}
              </a>
            )}
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onComplete}
          disabled={disabled || blocking.length > 0}
          aria-describedby="complete-reason"
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
        >
          {standupStrings.run.complete()}
        </button>

        {/* Always rendered, so the button's accessible description is stable
            whether or not anything blocks — a description that appears and
            disappears is announced as a new element each time. */}
        <span id="complete-reason" className="text-xs text-muted-foreground">
          {firstBlocker
            ? standupStrings.run.completeBlockedBy({ message: firstBlocker.message })
            : standupStrings.run.completeReady()}
        </span>
      </div>
    </section>
  )
}

/**
 * Which panel a failing check's offending rows live in, for the jump link.
 *
 * Only the checks Phase 7 evaluates appear here; the rest never reach `fail`
 * while they are `not_evaluated`.
 */
function panelFor(checkId: string): number {
  switch (checkId) {
    case 'CC-7':
      return 1
    default:
      return 5
  }
}
