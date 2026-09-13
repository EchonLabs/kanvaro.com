'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, CircleDashed, XCircle } from 'lucide-react'

import type { CompletionCheckResult } from '@/lib/standup/completion-checks'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

/**
 * Panel 7 — the completion checks (§15.8.9), redesigned to live in the run
 * screen's sticky right rail rather than the bottom of a long scroll.
 *
 * Evaluates all eleven checks, but only ever *shows* the ones a PM has
 * something to do about (`fail`/`warn`) by default — the passed and
 * not-yet-evaluated ones collapse behind a single summary line. Spelling out
 * "8 of 11 passed" beats a list of eight identical green rows a PM has to
 * scan past to find the two that matter; the full list is one click away,
 * not hidden.
 *
 * Task 22 — an Override action is rendered on every failing, `overridable`
 * check, alongside RUN-19's jump link. This panel does not decide *how* to
 * override a check (the entities-to-`OverrideModal`-props mapping is
 * `StandupRunScreen`'s job, since it needs `board` data this panel does not
 * have); it only reports which check the PM clicked.
 *
 * Each row's icon is keyed on `${checkId}-${status}`, so a check flipping from
 * `fail` to `pass` as the PM fixes something remounts that one icon and its
 * `check-pop` animation plays — a quiet, deliberate signal rather than a
 * silent glyph swap.
 */

export interface CompletionPanelProps {
  checks: readonly CompletionCheckResult[]
  blocking: readonly CompletionCheckResult[]
  onComplete: () => void
  /** Task 22. Omitted entirely, the check row renders no Override action. */
  onOverride?: (check: CompletionCheckResult) => void
  disabled?: boolean
  /** True only when the server-side checklist itself failed to load. */
  checksUnavailable?: boolean
  className?: string
}

const ICON_TONE: Record<CompletionCheckResult['status'], string> = {
  pass: 'text-[var(--apple-system-green)]',
  fail: 'text-[var(--apple-system-red)]',
  warn: 'text-[var(--apple-system-orange)]',
  not_evaluated: 'text-[var(--apple-tertiary-label)]'
}

const ICON_FOR: Record<CompletionCheckResult['status'], typeof CheckCircle2> = {
  pass: CheckCircle2,
  fail: XCircle,
  warn: AlertTriangle,
  not_evaluated: CircleDashed
}

/**
 * Which anchor a failing check's offending rows live in, for the jump link.
 * These ids must match the `id` each panel section actually renders in
 * `StandupRunScreen.tsx` — CC-8 is the one exception, owned by
 * `SprintCloseReadinessPanel` (`id="panel-5-5"`), which only mounts on the
 * sprint's final day.
 */
const CHECK_ANCHOR: Record<string, string> = {
  'CC-1': 'panel-5',
  'CC-2': 'panel-5',
  'CC-3': 'panel-3',
  'CC-4': 'panel-4',
  'CC-5': 'panel-5',
  'CC-6': 'panel-5',
  'CC-7': 'panel-1',
  'CC-8': 'panel-5-5',
  'CC-9': 'panel-6',
  'CC-10': 'panel-5',
  'CC-11': 'panel-5'
}

function anchorFor(checkId: string): string {
  return CHECK_ANCHOR[checkId] ?? 'panel-5'
}

function CheckRow({
  check,
  onOverride
}: {
  check: CompletionCheckResult
  onOverride?: (check: CompletionCheckResult) => void
}) {
  const Icon = ICON_FOR[check.status]
  const needsAttention = check.status === 'fail' || check.status === 'warn'

  return (
    <li
      data-testid="check-row"
      className="apple-transition flex items-start gap-2.5 rounded-[var(--apple-radius-sm)] px-1.5 py-2"
    >
      <span
        key={`${check.checkId}-${check.status}`}
        className={cn('mt-0.5 shrink-0 check-pop', ICON_TONE[check.status])}
      >
        <Icon className="h-[17px] w-[17px]" strokeWidth={2} aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] leading-snug text-[var(--apple-label)]">
          {check.status === 'not_evaluated'
            ? standupStrings.run.checkNotEvaluated({ phase: check.ownedBy ?? '' })
            : check.message}
        </p>

        {needsAttention && (
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {/* RUN-19's jump link. Only where there is something to jump to. */}
            {check.entities.length > 0 && (
              <a
                href={`#${anchorFor(check.checkId)}`}
                className="text-[11px] font-medium text-[var(--apple-system-blue)] hover:underline"
              >
                {standupStrings.run.jumpToFailure()}
              </a>
            )}

            {/* Task 22 — AC-10's whole point: a PM must be able to knowingly
                accept this exception instead of only being blocked by it. */}
            {check.status === 'fail' && check.overridable && onOverride && (
              <button
                type="button"
                onClick={() => onOverride(check)}
                className="text-[11px] font-medium text-[var(--apple-system-orange)] hover:underline"
              >
                {standupStrings.run.override()}
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

export function CompletionPanel({
  checks,
  blocking,
  onComplete,
  onOverride,
  disabled = false,
  checksUnavailable = false,
  className
}: CompletionPanelProps) {
  const [showAll, setShowAll] = useState(false)
  const firstBlocker = blocking[0]

  const needsAttention = checks.filter(
    (check) => check.status === 'fail' || check.status === 'warn'
  )
  const settled = checks.filter((check) => check.status === 'pass' || check.status === 'not_evaluated')
  const passedCount = checks.filter((check) => check.status === 'pass').length

  return (
    <section
      id="panel-7"
      aria-labelledby="panel-7-heading"
      className={cn(
        'scroll-mt-20 flex flex-col gap-3 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <h3
          id="panel-7-heading"
          className="apple-section-label text-[var(--apple-tertiary-label)]"
        >
          {standupStrings.run.completionTitle()}
        </h3>
        {checks.length > 0 && (
          <span className="font-apple-mono text-[11px] tabular-nums text-[var(--apple-tertiary-label)]">
            {passedCount}/{checks.length}
          </span>
        )}
      </div>

      {checksUnavailable ? (
        <p
          role="alert"
          className="rounded-[var(--apple-radius-md)] border border-[var(--apple-system-orange)]/30 bg-[var(--apple-system-orange)]/[0.06] px-3 py-2.5 text-[13px] text-[var(--apple-label)]"
        >
          {standupStrings.run.checksUnavailable()}
        </p>
      ) : needsAttention.length === 0 && settled.length === 0 ? null : (
        <div className="flex flex-col gap-1">
          {needsAttention.length > 0 ? (
            <ul className="flex flex-col gap-0.5">
              {needsAttention.map((check) => (
                <CheckRow key={check.checkId} check={check} onOverride={onOverride} />
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-1.5 px-1.5 py-1 text-[12.5px] text-[var(--apple-system-green)]">
              <CheckCircle2 className="h-[15px] w-[15px]" strokeWidth={2} aria-hidden="true" />
              {standupStrings.run.everythingChecksOut()}
            </p>
          )}

          {settled.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowAll((current) => !current)}
                aria-expanded={showAll}
                className="apple-transition flex items-center gap-1 self-start px-1.5 py-1 text-[11.5px] font-medium text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]"
              >
                <ChevronDown
                  className={cn('h-3 w-3 apple-transition', showAll && 'rotate-180')}
                  strokeWidth={2}
                />
                {showAll
                  ? standupStrings.run.hidePassedChecks()
                  : standupStrings.run.showPassedChecks({ count: settled.length })}
              </button>

              {showAll && (
                <ul className="flex flex-col gap-0.5">
                  {settled.map((check) => (
                    <CheckRow key={check.checkId} check={check} onOverride={onOverride} />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5 border-t border-[var(--apple-separator)] pt-3">
        <button
          type="button"
          onClick={onComplete}
          disabled={disabled || blocking.length > 0}
          aria-describedby="complete-reason"
          className="apple-transition w-full rounded-[var(--apple-radius-md)] bg-[var(--apple-system-blue)] px-3.5 h-9 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-40"
        >
          {standupStrings.run.complete()}
        </button>

        {/* Always rendered, so the button's accessible description is stable
            whether or not anything blocks — a description that appears and
            disappears is announced as a new element each time. */}
        <span id="complete-reason" className="text-[11px] text-[var(--apple-secondary-label)]">
          {checksUnavailable
            ? standupStrings.run.checksUnavailable()
            : firstBlocker
              ? standupStrings.run.completeBlockedBy({ message: firstBlocker.message })
              : standupStrings.run.completeReady()}
        </span>
      </div>
    </section>
  )
}
