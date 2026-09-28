'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, CircleDashed, XCircle } from 'lucide-react'

import type { CompletionCheckResult } from '@/lib/standup/completion-checks'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import {
  CARD_CLASSES,
  CARD_TITLE_CLASSES,
  IssueCount,
  SCROLL_CLASSES,
  SCROLL_MAX_NESTED,
  TEXT_BODY,
  TEXT_META
} from './ui'

/**
 * Panel 7 — the completion checks (§15.8.9). Sits in the run screen's closing
 * row beside Panel 6, per the "Daily Standup Page Redesign" blueprint: the
 * checklist and the Complete button come last on the page because they come
 * last in the meeting.
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
  pass: 'text-[var(--sur-green)]',
  fail: 'text-[var(--sur-red)]',
  warn: 'text-[var(--sur-amber)]',
  not_evaluated: 'text-[var(--sur-disabled)]'
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
      className="apple-transition flex items-start gap-2"
    >
      <span
        key={`${check.checkId}-${check.status}`}
        className={cn('mt-[2px] shrink-0 check-pop', ICON_TONE[check.status])}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
      </span>

      {/* The blueprint's row: the message, then its actions inline after it
          ("Liam J. is overallocated by 2h  Fix"). A long message wraps and
          the actions follow it rather than squeezing it. */}
      <p className={cn(TEXT_BODY, 'min-w-0 flex-1 leading-snug text-[var(--sur-secondary)]')}>
        <span className="mr-2">
          {check.status === 'not_evaluated'
            ? standupStrings.run.checkNotEvaluated({ phase: check.ownedBy ?? '' })
            : check.message}
        </span>

        {/* RUN-19's jump link. Only where there is something to jump to. */}
        {needsAttention && check.entities.length > 0 && (
          <a
            href={`#${anchorFor(check.checkId)}`}
            className="mr-2 font-semibold text-[var(--sur-blue)] underline underline-offset-2"
          >
            {standupStrings.run.jumpToFailure()}
          </a>
        )}

        {/* Task 22 — AC-10's whole point: a PM must be able to knowingly
            accept this exception instead of only being blocked by it. */}
        {needsAttention && check.status === 'fail' && check.overridable && onOverride && (
          <button
            type="button"
            onClick={() => onOverride(check)}
            className="font-semibold text-[var(--sur-amber)] underline underline-offset-2"
          >
            {standupStrings.run.override()}
          </button>
        )}
      </p>
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
  const failedCount = checks.filter((check) => check.status === 'fail').length

  return (
    <section
      id="panel-7"
      aria-labelledby="panel-7-heading"
      className={cn('scroll-mt-20 flex flex-col gap-4', CARD_CLASSES, className)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 id="panel-7-heading" className={CARD_TITLE_CLASSES}>
            {standupStrings.run.completionTitle()}
          </h3>
          {/* Only the failing checks count as issues. A `warn` is advisory —
              it never blocks completion — so folding warnings in here would
              put a red number beside a checklist the PM can sign off as is. */}
          <IssueCount
            count={failedCount}
            label={standupStrings.run.failingCheckCount({ count: failedCount })}
          />
        </div>
        {checks.length > 0 && (
          <span className={cn(TEXT_META, 'tabular-nums text-[var(--sur-muted)]')}>
            {passedCount}/{checks.length}
          </span>
        )}
      </div>

      {checksUnavailable ? (
        <p
          role="alert"
          className="rounded-[var(--sur-radius-inset)] border border-[var(--sur-amber)] bg-[var(--sur-amber-tint)] px-4 py-3 text-[13px] text-[var(--sur-text)]"
        >
          {standupStrings.run.checksUnavailable()}
        </p>
      ) : needsAttention.length === 0 && settled.length === 0 ? null : (
        <div className="flex flex-col gap-2">
          {needsAttention.length > 0 ? (
            /* Eleven checks can all need attention at once on a bad day, and
               this panel closes the page — the Complete button below it must
               stay reachable without scrolling past the reasons it is off. */
            <ul className={cn('flex flex-col gap-2', SCROLL_CLASSES, SCROLL_MAX_NESTED)}>
              {needsAttention.map((check) => (
                <CheckRow key={check.checkId} check={check} onOverride={onOverride} />
              ))}
            </ul>
          ) : (
            <p className={cn(TEXT_BODY, 'flex items-center gap-2 text-[var(--sur-secondary)]')}>
              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--sur-green)]" strokeWidth={2.25} aria-hidden="true" />
              {standupStrings.run.everythingChecksOut()}
            </p>
          )}

          {settled.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowAll((current) => !current)}
                aria-expanded={showAll}
                className={cn(
                  TEXT_META,
                  'apple-transition flex items-center gap-1 self-start font-semibold text-[var(--sur-muted)] hover:text-[var(--sur-text)]'
                )}
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
                <ul className={cn('flex flex-col gap-2', SCROLL_CLASSES, SCROLL_MAX_NESTED)}>
                  {settled.map((check) => (
                    <CheckRow key={check.checkId} check={check} onOverride={onOverride} />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {/* The blueprint's sign-off button: full width, and when it cannot be
            pressed it goes flat grey rather than a faded blue, so it reads as
            "not yet" instead of "almost". */}
        <button
          type="button"
          onClick={onComplete}
          disabled={disabled || blocking.length > 0}
          aria-describedby="complete-reason"
          className="apple-transition w-full rounded-[var(--sur-radius-control)] bg-[var(--sur-blue-solid)] p-3 text-[15px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[var(--sur-neutral-tint)] disabled:text-[var(--sur-disabled)] disabled:hover:opacity-100"
        >
          {standupStrings.run.complete()}
        </button>

        {/* Always rendered, so the button's accessible description is stable
            whether or not anything blocks — a description that appears and
            disappears is announced as a new element each time. */}
        <span id="complete-reason" className={cn(TEXT_META, 'text-[var(--sur-muted)]')}>
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
