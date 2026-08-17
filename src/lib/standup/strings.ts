/**
 * User-facing string catalogue for the stand-up module (spec NFR-19).
 *
 * NFR-19 requires every user-facing string to be externalised for translation,
 * **including the generated variance explanations**. Kanvaro has no i18n runtime
 * today, and adding one is an application-wide decision rather than this
 * module's to make — so this file does the part that is genuinely expensive to
 * retrofit: it gets the strings out of the components and gives every
 * interpolation a named parameter.
 *
 * Why that ordering matters. Swapping a lookup function for `next-intl` or
 * `react-i18next` later is mechanical. Unpicking sentences that were assembled
 * inline with template literals and string concatenation is not — especially the
 * variance explanations, where word order changes between languages and a
 * concatenated sentence simply cannot be translated.
 *
 * Rules for adding to this file:
 *   - One entry per complete sentence. Never concatenate two entries to build
 *     one sentence; languages do not agree on word order.
 *   - Interpolate through named parameters, never positional.
 *   - Keep pluralisation inside the entry, so a language with different plural
 *     rules can override the whole form.
 */
import { formatMinutesAsHours, type Minutes } from './minutes'

/** Formatting context a string may need. Supplied by the caller's locale. */
export interface StringContext {
  locale?: string
}

const plural = (count: number, singular: string, pluralForm: string) =>
  count === 1 ? singular : pluralForm

export const standupStrings = {
  calendar: {
    title: () => 'Working Calendar',
    subtitle: () => 'Decides which dates get a stand-up. Everything else depends on this.',

    inheritedNotice: () =>
      'This project inherits the organisation working week. Saving creates a project-specific calendar you can then adjust.',

    atLeastOneWorkingDay: () => 'At least one working day must be selected',

    timezoneHint: () => 'Decides which calendar date a stand-up belongs to.',

    noHolidaySets: () =>
      'No holiday calendars exist yet. An organisation admin can create one and import a gazette.',

    noOverrides: () =>
      'No overrides. Add one to close a working day, or to work a day the holiday calendar marks as a holiday.',

    recurringWarning: () =>
      'Only use this for fixed dates. Lunar holidays such as Poya days move every year and must come from a holiday calendar instead.',

    /**
     * Coverage gap warning. Holiday sets are perpetual and topped up each year,
     * so running past the loaded range must announce itself.
     */
    coverageExhausted: ({ coveredTo }: { coveredTo: string }) =>
      `Holiday data only runs to ${coveredTo}. Dates after that are treated as working days. Import the next gazette to cover them.`,

    // --- N10, the consolidated calendar-change notification (CAL-15) --------
    // CAL-15 requires one notification summarising everything that changed, so
    // the count fragments below are assembled into a single sentence rather
    // than sent as separate messages.

    changeNotificationTitle: () => 'Your stand-up schedule changed',

    changeNotification: ({ change, summary }: { change: string; summary: string }) =>
      `${change} ${summary}`,

    countCreated: ({ count }: { count: number }) =>
      `${count} ${plural(count, 'stand-up', 'stand-ups')} will be created.`,

    countSkipped: ({ count }: { count: number }) =>
      `${count} ${plural(count, 'stand-up', 'stand-ups')} will be skipped.`,

    countWarned: ({ count }: { count: number }) =>
      `${count} in-progress ${plural(count, 'stand-up needs', 'stand-ups need')} your attention.`,

    countBlocked: ({ count }: { count: number }) =>
      `${count} completed ${plural(count, 'stand-up was', 'stand-ups were')} left unchanged.`,

    coverageEmpty: () => 'No holidays have been loaded for the subscribed calendars yet.',

    saved: () => 'Working calendar saved',
    saveFailed: () => 'Could not save the calendar',
    loadFailed: () => 'Could not load the calendar'
  },

  /**
   * Planning gate messages (spec §8.3).
   *
   * The PC/PA wording is quoted from the spec's own failure-message column —
   * it is deliberately blunt ("You are planning to fail unless you cut scope"),
   * and softening it would remove the point of the check.
   */
  planning: {
    pc1: () => 'Write a sprint goal before completing planning.',
    pc2: () => 'This sprint has no tasks.',
    pc3: ({ count }: { count: number }) =>
      `${count} ${plural(count, 'task has', 'tasks have')} no estimate. Estimate them or remove them from the sprint.`,
    pc4: ({ count }: { count: number }) =>
      `${count} ${plural(count, 'task has', 'tasks have')} no description of what done means.`,
    pc5: ({ count }: { count: number }) =>
      `${count} ${plural(count, 'task is', 'tasks are')} missing type or priority.`,
    pc6: () => 'Add team members to this sprint.',
    pc7NoWorkingDays: () => 'This sprint contains no working days.',
    pc7BadRange: () => 'The sprint start date must be on or before its end date.',

    pa1: ({ overBy }: { overBy: string }) =>
      `Scope is ${overBy} over capacity. You are planning to fail unless you cut scope.`,
    pa2: ({ percent }: { percent: number }) =>
      `Scope is only ${percent} percent of capacity. The team will run out of work.`,
    pa3: ({ count }: { count: number }) =>
      `${count} ${plural(count, 'task is', 'tasks are')} larger than a single day. Consider splitting them.`,
    pa4: ({ count }: { count: number }) =>
      `${count} ${plural(count, 'task was', 'tasks were')} estimated without a team vote.`,
    pa5: ({ name, assigned, capacity }: { name: string; assigned: string; capacity: string }) =>
      `${name} is pre-assigned ${assigned} against ${capacity} of capacity.`,
    pa6: ({ name }: { name: string }) =>
      `${name} has nothing assigned. That is fine if you intend to assign at day one stand-up.`,

    /** PLN-19's carve-out, refused under every circumstance. */
    waiverCannotCoverEstimates: () =>
      'A waiver cannot allow an unestimated task to be allocated. Estimate it first.',

    gateNotPassed: () =>
      'This sprint has not completed planning, so its stand-ups cannot run.'
  },

  impact: {
    none: () => 'This change does not affect any stand-ups.',

    willCreate: ({ date }: { date: string }) =>
      `A stand-up will be created for ${date}, and later day numbers will shift.`,

    willSkip: ({ date }: { date: string }) =>
      `The stand-up on ${date} will be skipped as a holiday.`,

    /** Kept as one sentence rather than appended to `willSkip`. */
    willSkipWithCarryForward: ({ date, count }: { date: string; count: number }) =>
      `The stand-up on ${date} will be skipped as a holiday. Its ${count} carry-forward ${plural(
        count,
        'item',
        'items'
      )} will move to the next working day.`,

    missedBecomesHoliday: ({ date }: { date: string }) =>
      `The missed stand-up on ${date} will be reclassified as a holiday and will no longer count as missed.`,

    inProgressUntouched: ({ date }: { date: string }) =>
      `The stand-up on ${date} is in progress and will not be changed. Its facilitator will be warned that the date is now non-working.`,

    /** CAL-16 — completed stand-ups are never modified. */
    completedBlocked: ({ date }: { date: string }) =>
      `The stand-up on ${date} is already completed and cannot be changed. A calendar anomaly note will be recorded against it and the sprint.`,

    alreadySkipped: ({ date }: { date: string }) => `${date} is already skipped.`,
    alreadyCancelled: ({ date }: { date: string }) => `${date} is already cancelled.`,

    noStandupExists: ({ date }: { date: string }) =>
      `${date} will no longer be a working day. No stand-up exists for it.`,

    alreadyHasStandup: ({ date, status }: { date: string; status: string }) =>
      `${date} already has a ${status} stand-up.`
  },

  holidayImport: {
    /** CAL-10 — nothing is written when any row fails. */
    rejected: ({ rows }: { rows: number[] }) =>
      `Nothing was imported. ${rows.length} ${plural(
        rows.length,
        'row',
        'rows'
      )} failed validation (${plural(rows.length, 'row', 'rows')} ${rows.join(', ')}).`,

    imported: ({ count, from, to }: { count: number; from: string; to: string }) =>
      `Imported ${count} ${plural(count, 'holiday', 'holidays')} covering ${from} to ${to}.`,

    headerMismatch: ({ expected, actual }: { expected: string; actual: string }) =>
      `The header row must be exactly "${expected}", received "${actual}".`
  },

  capacity: {
    title: () => 'Capacity and Members',
    subtitle: () =>
      'The hours the stand-up board will hold you to every day. Set real availability, not aspiration.',

    datedChangeNotice: () =>
      'Stand-ups before this date keep the capacity that applied then, so past variance stays accurate.',

    noMembers: () => 'This project has no team members yet.',
    noMembersHint: () => 'Add people on the Team tab, then set their daily capacity here.',

    /** NFR-A4 — hour values are announced with their unit. */
    announceCapacity: ({ minutes, locale }: { minutes: Minutes; locale?: string }) =>
      `capacity ${formatMinutesAsHours(minutes, { locale, withUnit: false })} hours`,

    projectStandard: ({ minutes, locale }: { minutes: Minutes; locale?: string }) =>
      `Project standard day is ${formatMinutesAsHours(minutes, { locale })}. Members marked "Default" inherit it.`,

    /** Named adjustment reasons shown on the capacity breakdown. */
    adjustment: {
      partialDay: () => 'Half day',
      leave: () => 'Approved leave',
      absentPlanned: () => 'Absent (planned)',
      absentUnplanned: () => 'Absent (unplanned)',
      partialAttendance: () => 'Working a partial day'
    }
  },

  allocationStatus: {
    /**
     * NFR-A1 — the capacity meter's state must carry a text label as well as a
     * colour, so colour is never the only carrier of meaning.
     */
    full: () => 'FULL',
    under: ({ minutes, locale }: { minutes: Minutes; locale?: string }) =>
      `GAP ${formatMinutesAsHours(minutes, { locale })}`,
    over: ({ minutes, locale }: { minutes: Minutes; locale?: string }) =>
      `OVER ${formatMinutesAsHours(minutes, { locale })}`,
    zero: () => 'Nothing planned',
    unavailable: () => 'Unavailable'
  },

  config: {
    title: () => 'Stand-up Configuration',
    subtitle: () => 'When the stand-up runs, and the rules it holds the team to.',

    /**
     * The overrun policy explanations. Full sentences because a PM choosing
     * between these is choosing whether tomorrow's plan is aspirational or
     * honest, which is not inferable from the label alone.
     */
    absorbTitle: () => 'Absorb',
    absorbSummary: () => 'Capacity stays at full tomorrow.',
    absorbDetail: () =>
      'When someone goes over estimate, their day tomorrow is still eight hours and the overrun shows as estimate debt they are expected to make up. Choose this if your culture is that the estimate is the commitment.',

    reduceTitle: () => 'Reduce',
    reduceSummary: () => "Tomorrow's capacity drops by the overrun.",
    reduceDetail: () =>
      'Burn two hours over and the board will only let you plan six hours of new work. Choose this if you want the plan to reflect reality rather than intention.',

    policyChangeScope: () =>
      'Changing this only affects stand-ups that have not been completed.',

    saved: () => 'Stand-up settings saved',
    saveFailed: () => 'Could not save stand-up settings'
  },

  /**
   * Plain-language variance explanations (spec §15.8.5).
   *
   * §15.8.5 states this copy "is a requirement, not decoration" — it is the
   * sentence that makes a PM understand *why* two hours are missing rather than
   * just seeing a number. Phase 5 fills these in as the outcome classifier is
   * built; the namespace exists now so that copy is written into the catalogue
   * from its first commit rather than inlined into a component and retrofitted.
   */
  variance: {
    // Intentionally empty until Phase 5. See the note above.
  }
} as const

export type StandupStrings = typeof standupStrings
