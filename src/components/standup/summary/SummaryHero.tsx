import Link from 'next/link'
import { Check, ClipboardCopy, ExternalLink, Printer } from 'lucide-react'

import { planButtonClass, planCardClass, planPillClass } from '@/components/standup/planning/ui'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import type { HeaderFacts } from './types'

const s = standupStrings.summary

/**
 * Writes the stand-up's own date out long — "11 September, Friday".
 *
 * `standupDate` is only ever an ISO calendar date (`YYYY-MM-DD`), so there is
 * no timezone to reconcile, just a local parse. A stored value that will not
 * parse returns nothing rather than "Invalid Date": the day badge and the
 * facilitator line beneath still say what this document is.
 */
export function formatStandupDate(standupDate: string): string | null {
  const parsed = new Date(`${standupDate}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return null
  const day = parsed.getDate()
  const month = parsed.toLocaleDateString(undefined, { month: 'long' })
  const weekday = parsed.toLocaleDateString(undefined, { weekday: 'long' })
  return `${day} ${month}, ${weekday}`
}

/**
 * The banner across the top: what this stand-up was, and the three things a
 * reader can do with it.
 *
 * The actions are the screen's, not the banner's — copying hits the export
 * route and printing is `window.print()` — so they arrive as callbacks and
 * this component stays free of data fetching.
 */
export function SummaryHero({
  headerFacts,
  standupHref,
  onCopy,
  copied = false,
  onPrint
}: {
  headerFacts: HeaderFacts
  standupHref: string
  onCopy: () => void
  /** True for a moment after a successful copy: the button turns green. */
  copied?: boolean
  onPrint: () => void
}) {
  const heading = formatStandupDate(headerFacts.standupDate) ?? s.title()

  return (
    <div
      className={cn(
        planCardClass,
        'flex flex-wrap items-center justify-between gap-4 p-5 sm:p-7'
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="apple-type-title1 font-bold text-[var(--plan-text)]">
            {heading}
          </h1>
          <span className={planPillClass('accent')}>
            {s.dayOf({ day: headerFacts.dayNumber, total: headerFacts.totalDays })}
          </span>
        </div>
        <p className="apple-type-subheadline flex flex-wrap items-center gap-2 text-[var(--plan-muted)]">
          <span>
            Facilitator:{' '}
            <span className="font-semibold text-[var(--plan-text)]">{headerFacts.facilitatorName}</span>
          </span>
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[var(--plan-muted)]" />
          <span>
            Duration:{' '}
            <span className="font-semibold text-[var(--plan-text)]">
              {s.duration({ minutes: headerFacts.durationMinutes })}
            </span>
          </span>
        </p>
      </div>

      {/* Hidden from print: a printed summary has nothing to click. */}
      <div className="standup-summary-no-print flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onCopy}
          data-copied={copied || undefined}
          className={planButtonClass(
            'secondary',
            copied
              ? 'border-[var(--apple-system-green)] bg-[var(--apple-system-green)] text-white hover:bg-[var(--apple-system-green)] hover:text-white'
              : undefined
          )}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
          ) : (
            <ClipboardCopy className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          )}
          {copied ? 'Copied' : s.copyAsText()}
        </button>
        <Link href={standupHref} className={planButtonClass('secondary')}>
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          View stand-up
        </Link>
        <button type="button" onClick={onPrint} className={planButtonClass('primary')}>
          <Printer className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          {s.printOrSave()}
        </button>
      </div>
    </div>
  )
}
