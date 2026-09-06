/**
 * Calendar-change impact analysis (spec §7.3 — CAL-12, CAL-13, CAL-16).
 *
 * §7.3 calls calendar change propagation "the highest risk area in the module",
 * so the disposition rules live here as a pure function that can be exhaustively
 * tested, separate from the Phase 3 reconciler that will execute them.
 *
 * It powers two things:
 *   - `POST /calendar/preview-impact`, which UI-1 requires to recompute live
 *     *before* anything is saved, naming the specific dates affected.
 *   - The UI-2 confirmation dialog, which must list every affected stand-up with
 *     its current status and what will happen to it.
 *
 * CAL-16 is absolute: a completed stand-up and its allocations, variances and
 * carry-forward history are never deleted. Those show as `blocked` so UI-3 can
 * display them as refused while the rest of the change still applies.
 */
import type { IsoDate } from './calendar-dates'
import { standupStrings } from './strings'

/** Stand-up lifecycle states this analyser reasons about (spec §10.1). */
export type StandupStatusForImpact =
  | 'Scheduled'
  | 'Ready'
  | 'In_Progress'
  | 'Completed'
  | 'Reopened'
  | 'Missed'
  | 'Skipped_Holiday'
  | 'Cancelled'

/** What the reconciler will do to a date. */
export type ImpactDisposition =
  /** CAL-13: the date became working and has no stand-up yet. */
  | 'create'
  /** CAL-12: Scheduled/Ready become Skipped_Holiday; carry forward moves on. */
  | 'skip'
  /** CAL-12: a Missed stand-up becomes Skipped_Holiday and loses the missed flag. */
  | 'skip_clear_missed'
  /** CAL-12: In_Progress is left alone; the facilitator is warned. */
  | 'warn_in_progress'
  /** CAL-12 / CAL-16: Completed is untouched; a calendar anomaly note is recorded. */
  | 'blocked_completed'
  | 'no_change'

export interface ExistingStandup {
  date: IsoDate
  status: StandupStatusForImpact
  /** Prepared carry-forward items that would need to move to the next working day. */
  carryForwardCount?: number
}

export interface CalendarImpactItem {
  date: IsoDate
  disposition: ImpactDisposition
  currentStatus?: StandupStatusForImpact
  /** Plain-language explanation, shown verbatim in the confirmation dialog. */
  message: string
  /** True when the change cannot be applied to this date at all (UI-3). */
  blocked: boolean
  carryForwardCount?: number
}

export interface CalendarImpactSummary {
  items: CalendarImpactItem[]
  created: CalendarImpactItem[]
  skipped: CalendarImpactItem[]
  blocked: CalendarImpactItem[]
  warnings: CalendarImpactItem[]
  /** True when at least one date can still be changed. */
  hasApplicableChanges: boolean
}

export interface AnalyseImpactInput {
  /** Working-day state before the proposed change, keyed by date. */
  before: Map<IsoDate, boolean>
  /** Working-day state after the proposed change, keyed by date. */
  after: Map<IsoDate, boolean>
  /** Stand-ups that already exist, keyed by date. */
  existing: Map<IsoDate, ExistingStandup>
}

/**
 * Produces the CAL-12/13 disposition for every date whose working-day state
 * changes.
 *
 * Dates whose state is unchanged are omitted entirely — the dialog should list
 * consequences, not the whole calendar.
 */
export function analyseCalendarImpact(input: AnalyseImpactInput): CalendarImpactSummary {
  const { before, after, existing } = input
  const items: CalendarImpactItem[] = []

  // Array.from rather than spread: the project targets ES5, where spreading a
  // Map iterator needs downlevelIteration.
  const dates = Array.from(
    new Set(Array.from(before.keys()).concat(Array.from(after.keys())))
  ).sort()

  for (const date of dates) {
    const wasWorking = before.get(date) ?? false
    const isWorking = after.get(date) ?? false
    if (wasWorking === isWorking) continue

    const standup = existing.get(date)

    // CAL-13 — the date became a working day.
    if (!wasWorking && isWorking) {
      if (!standup || standup.status === 'Skipped_Holiday' || standup.status === 'Cancelled') {
        items.push({
          date,
          disposition: 'create',
          currentStatus: standup?.status,
          message: standupStrings.impact.willCreate({ date }),
          blocked: false
        })
      } else {
        items.push({
          date,
          disposition: 'no_change',
          currentStatus: standup.status,
          message: standupStrings.impact.alreadyHasStandup({ date, status: standup.status }),
          blocked: false
        })
      }
      continue
    }

    // CAL-12 — the date became non-working.
    if (!standup) {
      items.push({
        date,
        disposition: 'no_change',
        message: standupStrings.impact.noStandupExists({ date }),
        blocked: false
      })
      continue
    }

    items.push(dispositionForExistingStandup(date, standup))
  }

  const byDisposition = (...dispositions: ImpactDisposition[]) =>
    items.filter((item) => dispositions.includes(item.disposition))

  return {
    items,
    created: byDisposition('create'),
    skipped: byDisposition('skip', 'skip_clear_missed'),
    blocked: items.filter((item) => item.blocked),
    warnings: byDisposition('warn_in_progress'),
    hasApplicableChanges: items.some((item) => !item.blocked && item.disposition !== 'no_change')
  }
}

function dispositionForExistingStandup(
  date: IsoDate,
  standup: ExistingStandup
): CalendarImpactItem {
  switch (standup.status) {
    case 'Scheduled':
    case 'Ready': {
      const carried = standup.carryForwardCount ?? 0
      return {
        date,
        disposition: 'skip',
        currentStatus: standup.status,
        blocked: false,
        carryForwardCount: carried,
        // Two whole sentences rather than one concatenated with a fragment:
        // word order and plural rules differ between languages.
        message:
          carried > 0
            ? standupStrings.impact.willSkipWithCarryForward({ date, count: carried })
            : standupStrings.impact.willSkip({ date })
      }
    }

    case 'Missed':
      return {
        date,
        disposition: 'skip_clear_missed',
        currentStatus: standup.status,
        blocked: false,
        message: standupStrings.impact.missedBecomesHoliday({ date })
      }

    case 'In_Progress':
      return {
        date,
        disposition: 'warn_in_progress',
        currentStatus: standup.status,
        blocked: false,
        message: standupStrings.impact.inProgressUntouched({ date })
      }

    case 'Completed':
    case 'Reopened':
      // CAL-16 — completed stand-ups and their history are never touched.
      return {
        date,
        disposition: 'blocked_completed',
        currentStatus: standup.status,
        blocked: true,
        message: standupStrings.impact.completedBlocked({ date })
      }

    case 'Skipped_Holiday':
    case 'Cancelled':
      return {
        date,
        disposition: 'no_change',
        currentStatus: standup.status,
        blocked: false,
        message:
          standup.status === 'Cancelled'
            ? standupStrings.impact.alreadyCancelled({ date })
            : standupStrings.impact.alreadySkipped({ date })
      }
  }
}

/**
 * One-line summary for the impact panel (UI-1), which must name the specific
 * dates rather than only counting them.
 */
export function describeImpact(summary: CalendarImpactSummary): string {
  if (summary.items.length === 0) return standupStrings.impact.none()

  const parts: string[] = []
  if (summary.created.length > 0) {
    parts.push(`${summary.created.length} stand-up${plural(summary.created.length)} will be created`)
  }
  if (summary.skipped.length > 0) {
    parts.push(`${summary.skipped.length} will be skipped`)
  }
  if (summary.warnings.length > 0) {
    parts.push(`${summary.warnings.length} in progress will be left alone`)
  }
  if (summary.blocked.length > 0) {
    parts.push(`${summary.blocked.length} completed cannot be changed`)
  }

  return `${parts.join(', ')}.`
}

const plural = (count: number) => (count === 1 ? '' : 's')
