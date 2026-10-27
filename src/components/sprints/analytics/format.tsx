import { formatMinutesAsHours, minutes } from '@/lib/standup/minutes'
import { cn } from '@/lib/utils'

/** What a zero or missing figure renders as: muted, so only real numbers draw the eye. */
export const DASH = '—'

/** Every hour string on the screen, through the module's one formatter (NFR-P1). */
export function hours(value: number, options: { signed?: boolean } = {}): string {
  return formatMinutesAsHours(minutes(Math.round(value)), options)
}

export function hoursOrDash(value: number): string {
  return value === 0 ? DASH : hours(value)
}

export function percentOrDash(value: number | null): string {
  return value === null ? DASH : `${Math.round(value)}%`
}

/** "1 Oct" from an ISO calendar date; the raw string if it will not parse. */
export function shortDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return isoDate
  return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** A figure in a table cell or tile: monospaced, muted when it is a dash. */
export function Figure({ value, className }: { value: string; className?: string }) {
  return (
    <span
      className={cn(
        'font-apple-mono tabular-nums',
        value === DASH ? 'text-[var(--plan-muted)]' : 'text-[var(--plan-text)]',
        className
      )}
    >
      {value}
    </span>
  )
}

/**
 * Where a stand-up-day row leads (UI-13). A completed stand-up has a summary;
 * any other day only has its run screen, which shows its own state.
 */
export function standupHref(projectId: string, sprintId: string, standupId: string, status: string): string {
  const base = `/projects/${projectId}/sprints/${sprintId}/standups/${standupId}`
  return status === 'Completed' ? `${base}/summary` : base
}
