import Link from 'next/link'
import { ClipboardCopy, ExternalLink, Printer } from 'lucide-react'

import {
  BADGE_CLASSES,
  CARD_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
  TEXT_BODY
} from '@/components/standup/run/ui'
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
function formatStandupDate(standupDate: string): string | null {
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
  onPrint
}: {
  headerFacts: HeaderFacts
  standupHref: string
  onCopy: () => void
  onPrint: () => void
}) {
  const heading = formatStandupDate(headerFacts.standupDate) ?? s.title()

  return (
    <div
      className={cn(
        CARD_CLASSES,
        'flex flex-wrap items-center justify-between gap-4 rounded-[var(--apple-radius-xl)] p-7'
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[var(--sur-text)]">
            {heading}
          </h1>
          <span className={cn(BADGE_CLASSES, 'bg-[var(--sur-blue-tint)] text-[var(--sur-blue)] normal-case')}>
            {s.dayOf({ day: headerFacts.dayNumber, total: headerFacts.totalDays })}
          </span>
        </div>
        <p className={cn(TEXT_BODY, 'flex flex-wrap items-center gap-2 text-[var(--sur-muted)]')}>
          <span>
            Facilitator:{' '}
            <span className="font-semibold text-[var(--sur-text)]">{headerFacts.facilitatorName}</span>
          </span>
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[var(--sur-muted)]" />
          <span>
            Duration:{' '}
            <span className="font-semibold text-[var(--sur-text)]">
              {s.duration({ minutes: headerFacts.durationMinutes })}
            </span>
          </span>
        </p>
      </div>

      {/* Hidden from print: a printed summary has nothing to click. */}
      <div className="standup-summary-no-print flex flex-wrap items-center gap-2">
        <button type="button" onClick={onCopy} className={cn(SECONDARY_BUTTON_CLASSES, 'rounded-[var(--sur-radius-pill)]')}>
          <ClipboardCopy className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          {s.copyAsText()}
        </button>
        <Link href={standupHref} className={cn(SECONDARY_BUTTON_CLASSES, 'rounded-[var(--sur-radius-pill)]')}>
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          View stand-up
        </Link>
        <button type="button" onClick={onPrint} className={cn(PRIMARY_BUTTON_CLASSES, 'rounded-[var(--sur-radius-pill)]')}>
          <Printer className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          {s.printOrSave()}
        </button>
      </div>
    </div>
  )
}
