'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, CircleDashed, ShieldCheck, XCircle } from 'lucide-react'

import type { CompletionCheckResult } from '@/lib/standup/completion-checks'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import {
  PLAN_SCROLL_MAX_NESTED,
  PlanCard,
  PlanCount,
  planButtonClass,
  planPillClass,
  scrollToSection
} from '../planning/ui'

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
  pass: 'text-[var(--plan-success)]',
  fail: 'text-[var(--plan-danger)]',
  warn: 'text-[var(--plan-warning)]',
  not_evaluated: 'text-[var(--plan-disabled)]'
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

export function anchorFor(checkId: string): string {
  return CHECK_ANCHOR[checkId] ?? 'panel-5'
}

function CheckRow({
  check,
  onOverride,
  overridden = false
}: {
  check: CompletionCheckResult
  onOverride?: (check: CompletionCheckResult) => void
  /** A failing hard check an issued override has lifted. */
  overridden?: boolean
}) {
  const Icon = overridden ? ShieldCheck : ICON_FOR[check.status]
  const needsAttention = !overridden && (check.status === 'fail' || check.status === 'warn')

  return (
    <li
      data-testid="check-row"
      className="apple-transition flex items-start gap-2"
    >
      <span
        key={`${check.checkId}-${check.status}`}
        className={cn(
          'mt-[2px] shrink-0 check-pop',
          overridden ? 'text-[var(--plan-warning)]' : ICON_TONE[check.status]
        )}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
      </span>

      {/* The message on its own line, then the actions under it: "Fix" as
          a real button, because it is the usual answer, and "Override" as the
          quieter exception beside it. Inline after the sentence, the two read
          as equal choices — and Override, in amber, read as the louder one. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="apple-type-subheadline leading-snug text-[var(--plan-secondary)]">
          {check.status === 'not_evaluated'
            ? standupStrings.run.checkNotEvaluated({ phase: check.ownedBy ?? '' })
            : check.message}
          {overridden && (
            <span className={planPillClass('warning', 'ml-2 align-middle')}>
              {standupStrings.run.overridden()}
            </span>
          )}
        </p>

        {needsAttention && (check.entities.length > 0 || (check.status === 'fail' && check.overridable && onOverride)) && (
          <div className="flex flex-wrap items-center gap-2">
            {/* RUN-19's jump link. Only where there is something to jump to.
                Scrolled and focused explicitly: the bare hash did nothing
                inside the app's own scroll container. */}
            {check.entities.length > 0 && (
              <a
                href={`#${anchorFor(check.checkId)}`}
                onClick={(event) => {
                  event.preventDefault()
                  scrollToSection(anchorFor(check.checkId))
                }}
                className={planButtonClass('secondary', 'h-7 px-3', 'sm')}
              >
                {standupStrings.run.jumpToFailure()}
              </a>
            )}

            {/* Task 22 — AC-10's whole point: a PM must be able to knowingly
                accept this exception instead of only being blocked by it. */}
            {check.status === 'fail' && check.overridable && onOverride && (
              <>
                {check.entities.length > 0 && (
                  <span className="apple-type-caption text-[var(--plan-muted)]">
                    {standupStrings.run.overrideHint()}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onOverride(check)}
                  className="apple-type-footnote font-semibold text-[var(--plan-secondary)] underline underline-offset-2 hover:text-[var(--plan-text)]"
                >
                  {standupStrings.run.override()}
                </button>
              </>
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

  /**
   * A hard failure that is no longer in `blocking` has been overridden. It
   * used to keep rendering as a red failure with its Override button, so the
   * PM saw the same problem "still failing" after dealing with it — with only
   * the re-enabled Complete button hinting otherwise.
   */
  const isOverridden = (check: CompletionCheckResult) =>
    check.status === 'fail' &&
    check.hard &&
    !blocking.some((candidate) => candidate.checkId === check.checkId)
  const overridden = checks.filter(isOverridden)
  const needsAttention = checks.filter(
    (check) => (check.status === 'fail' || check.status === 'warn') && !isOverridden(check)
  )
  const settled = checks.filter((check) => check.status === 'pass' || check.status === 'not_evaluated')
  const passedCount = checks.filter((check) => check.status === 'pass').length
  const failedCount = needsAttention.filter((check) => check.status === 'fail').length

  return (
    <PlanCard
      id="panel-7"
      aria-labelledby="panel-7-heading"
      title={standupStrings.run.completionTitle()}
      headingLevel="h3"
      headingId="panel-7-heading"
      className={cn('scroll-mt-20', className)}
      aside={
        <div className="flex items-center gap-2">
          {/* Only the failing checks count as issues. A `warn` is advisory —
              it never blocks completion — so folding warnings in here would
              put a red number beside a checklist the PM can sign off as is. */}
          <PlanCount
            count={failedCount}
            label={standupStrings.run.failingCheckCount({ count: failedCount })}
          />
          {checks.length > 0 && (
            <span className="apple-type-caption tabular-nums text-[var(--plan-muted)]">
              {passedCount}/{checks.length}
            </span>
          )}
        </div>
      }
    >

      {checksUnavailable ? (
        <p
          role="alert"
          className="rounded-[var(--apple-radius-md)] border border-[var(--plan-warning)] bg-[var(--plan-warning-bg)] px-4 py-3 apple-type-subheadline text-[var(--plan-text)]"
        >
          {standupStrings.run.checksUnavailable()}
        </p>
      ) : needsAttention.length === 0 && settled.length === 0 ? null : (
        <div className="flex flex-col gap-2">
          {overridden.length > 0 && (
            <ul className="flex flex-col gap-2">
              {overridden.map((check) => (
                <CheckRow key={check.checkId} check={check} overridden />
              ))}
            </ul>
          )}

          {needsAttention.length > 0 ? (
            /* Eleven checks can all need attention at once on a bad day, and
               this panel closes the page — the Complete button below it must
               stay reachable without scrolling past the reasons it is off. */
            <ul className={cn('flex flex-col gap-2', 'plan-scroll', PLAN_SCROLL_MAX_NESTED)}>
              {needsAttention.map((check) => (
                <CheckRow key={check.checkId} check={check} onOverride={onOverride} />
              ))}
            </ul>
          ) : (
            <p className="apple-type-subheadline flex items-center gap-2 text-[var(--plan-secondary)]">
              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--plan-success)]" strokeWidth={2.25} aria-hidden="true" />
              {standupStrings.run.everythingChecksOut()}
            </p>
          )}

          {settled.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowAll((current) => !current)}
                aria-expanded={showAll}
                className="apple-type-caption apple-transition flex items-center gap-1 self-start font-semibold text-[var(--plan-muted)] hover:text-[var(--plan-text)]"
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
                <ul className={cn('flex flex-col gap-2', 'plan-scroll', PLAN_SCROLL_MAX_NESTED)}>
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
          className={planButtonClass('primary', 'w-full')}
        >
          {standupStrings.run.complete()}
        </button>

        {/* Always rendered, so the button's accessible description is stable
            whether or not anything blocks — a description that appears and
            disappears is announced as a new element each time. */}
        <span id="complete-reason" className="apple-type-caption text-[var(--plan-muted)]">
          {checksUnavailable
            ? standupStrings.run.checksUnavailable()
            : firstBlocker
              ? standupStrings.run.completeBlockedBy({ message: firstBlocker.message })
              : standupStrings.run.completeReady()}
        </span>
      </div>
    </PlanCard>
  )
}
