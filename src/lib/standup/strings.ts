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
    },

    /**
     * DN-6 — the breakdown must say when ceremonies were *not* deducted.
     * Otherwise a full eight-hour day on a day holding a two-hour review looks
     * like a bug rather than a setting.
     */
    ceremoniesNotDeducted: () =>
      'Ceremonies not deducted. Meetings do not reduce capacity on this project.',

    /**
     * RUN-7 — hours still sitting on somebody who is not there. States the
     * amount rather than the task count, because the amount is what the rest of
     * the board is measured in and what has to be placed somewhere else today.
     */
    strandedAllocations: ({ minutes, locale }: { minutes: Minutes; locale?: string }) =>
      `${formatMinutesAsHours(minutes, { locale })} is still allocated to this member, who has no capacity today. Reassign it or carry it forward.`,

    strandedAllocationsAction: () => 'Reassign these hours'
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

  /**
   * The shared allocation primitives (Phase 7, Task 9).
   *
   * Every one of these has an accessible-name job as well as a visible one.
   * NFR-A1 to NFR-A4 require the board to be operable and legible without
   * colour and without a mouse, and an unlabelled stepper or an unnamed drop
   * zone fails that whether or not it looks right.
   */
  allocation: {
    /** The meter's accessible name. The visible label is `allocationStatus`. */
    meterLabel: ({
      name,
      allocated,
      capacity,
      locale
    }: {
      name: string
      allocated: Minutes
      capacity: Minutes
      locale?: string
    }) =>
      `${name}: ${formatMinutesAsHours(allocated, { locale })} of ${formatMinutesAsHours(capacity, { locale })} planned.`,

    /** The two meter segments, so the split is audible as well as visible. */
    meterCarriedSegment: ({ minutes, locale }: { minutes: Minutes; locale?: string }) =>
      `${formatMinutesAsHours(minutes, { locale })} carried from previous days`,
    meterNewSegment: ({ minutes, locale }: { minutes: Minutes; locale?: string }) =>
      `${formatMinutesAsHours(minutes, { locale })} planned today`,
    meterOverSegment: ({ minutes, locale }: { minutes: Minutes; locale?: string }) =>
      `${formatMinutesAsHours(minutes, { locale })} beyond capacity`,

    stepperLabel: ({ task }: { task: string }) => `Planned hours for ${task}`,
    stepperIncrease: () => 'Add fifteen minutes',
    stepperDecrease: () => 'Remove fifteen minutes',
    /** ALO-7's split helper, shown under a partial allocation. */
    stepperSplit: ({
      planned,
      remaining,
      carries,
      locale
    }: {
      planned: Minutes
      remaining: Minutes
      carries: Minutes
      locale?: string
    }) =>
      `${formatMinutesAsHours(planned, { locale })} of ${formatMinutesAsHours(remaining, { locale })} remaining, ${formatMinutesAsHours(carries, { locale })} will carry to tomorrow.`,

    /** ALO-8. Advisory only — nothing may block on it. */
    largerThanOneDay: () =>
      'This task is larger than one day. Consider splitting it into subtasks so progress is visible daily.',

    /**
     * The keyboard equivalent of the drop zone (§15.8.7 "Quick add").
     *
     * Not a convenience. Drag-and-drop has no keyboard path of its own, so this
     * combobox *is* how a keyboard user allocates work, and it ships alongside
     * the drop zone rather than after it.
     */
    quickAddLabel: ({ name }: { name: string }) => `Add a task to ${name}'s day`,
    quickAddPlaceholder: () => 'Search sprint tasks…',
    quickAddEmpty: () => 'No matching task in this sprint.',
    quickAddHint: () => 'Type to search, then press Enter to allocate.',

    /** ALO-17's fit indicator, against the selected member's remaining gap. */
    fitsExact: () => 'Fits exactly',
    fitsUnder: ({ minutes, locale }: { minutes: Minutes; locale?: string }) =>
      `Leaves ${formatMinutesAsHours(minutes, { locale })}`,
    fitsOver: ({ minutes, locale }: { minutes: Minutes; locale?: string }) =>
      `${formatMinutesAsHours(minutes, { locale })} over`,

    removeRow: ({ task }: { task: string }) => `Remove ${task} from this day`,
    dropZone: ({ name }: { name: string }) => `Drop a task here to add it to ${name}'s day`,

    /** The member drawer's accessible name and its close control. */
    drawerLabel: ({ name }: { name: string }) => `${name}'s day`,
    drawerClose: () => 'Close',

    /** Opens the capacity breakdown. Named per member so the board's buttons differ. */
    breakdownTrigger: ({ name }: { name: string }) => `Show capacity breakdown for ${name}`,
    breakdownNominal: () => 'Full day',
    breakdownEffective: () => 'Available today',
    breakdownNoAdjustments: () => 'Nothing is reducing this day.',

    /** §15.8.7 — shown only when there is debt, so its presence is the signal. */
    debtBadge: ({ minutes, locale }: { minutes: Minutes; locale?: string }) =>
      `${formatMinutesAsHours(minutes, { locale })} estimate debt`,

    /**
     * The per-row source chip (§15.8.7). Carried work is the one that changes
     * how a PM reads the row — it is a commitment already made, not a choice
     * being made now — so the words stay distinct rather than collapsing into
     * a generic "added".
     */
    source: {
      pre_assigned: () => 'Pre-assigned',
      assigned_in_standup: () => 'New',
      carried_forward: () => 'Carried',
      auto_prefilled: () => 'Auto',
      self_selected: () => 'Self-selected'
    },

    memberCount: ({ count }: { count: number }) =>
      count === 1 ? '1 member' : `${count} members`
  },

  /** The unassigned pool (§15.8.7, ALO-13 … ALO-17). */
  pool: {
    title: () => "Today's pool",

    /** ALO-14's two tabs. Counts are in the label, per the spec's table. */
    tabUnassigned: ({ count }: { count: number }) => `Unassigned (${count})`,
    tabAssignedNotPlanned: ({ count }: { count: number }) =>
      `Assigned but not planned today (${count})`,

    searchLabel: () => 'Search the pool',
    searchPlaceholder: () => 'Search by key, title or label…',
    filterType: () => 'Type',
    filterPriority: () => 'Priority',
    sortLabel: () => 'Sort',
    sortPriority: () => 'Priority',
    sortEstimateAsc: () => 'Smallest first',
    sortEstimateDesc: () => 'Largest first',
    sortBacklogRank: () => 'Backlog rank',

    /** Distinguished from a filtered-empty list: the two mean opposite things. */
    emptyUnassigned: () => 'Every sprint task has an owner.',
    emptyAssignedNotPlanned: () => "Everybody's assigned work is planned for today.",
    emptyFiltered: () => 'No task matches these filters.',
    clearFilters: () => 'Clear filters',

    /** D-K — the pool paginates rather than loading an unbounded sprint. */
    showingCount: ({ shown, total }: { shown: number; total: number }) =>
      `Showing ${shown} of ${total}`,
    showMore: () => 'Show more',

    /** The selected member the "fits" indicator measures against (ALO-17). */
    fitsAgainst: ({ name }: { name: string }) => `Fits shown against ${name}'s remaining gap`,
    selectMemberFirst: () => 'Select a member to see which tasks close their day.',
    addToMember: ({ task, name }: { task: string; name: string }) =>
      `Add ${task} to ${name}'s day`
  },

  /** The stand-up run screen (§15.8). */
  run: {
    dayOf: ({ day, total }: { day: number; total: number }) => `Day ${day} of ${total}`,
    facilitator: ({ name }: { name: string }) => `Facilitator: ${name}`,
    presentOf: ({ present, total }: { present: number; total: number }) =>
      `Present ${present} of ${total}`,
    joinCall: () => 'Join call',
    refresh: () => 'Refresh',
    complete: () => 'Complete stand-up',

    /** The §15.8.1 jump bar. One entry per panel, all seven, always. */
    panel1: () => 'Attendance',
    panel2: () => 'Yesterday',
    panel3: () => 'Variance',
    panel4: () => 'Carry forward',
    panel5: () => "Today's allocation",
    panel6: () => 'Blockers',
    panel7: () => 'Complete',

    /**
     * A panel this release cannot fill yet.
     *
     * Rendered rather than hidden, naming the phase that will build it, for the
     * same reason `not_evaluated` completion checks are rendered: a screen that
     * silently omits three of its seven steps looks finished, and the PM has no
     * way to tell a missing panel from an empty one.
     */
    panelPending: ({ phase }: { phase: string }) =>
      `Not built yet — arrives in ${phase}.`,

    /** RUN-25's rollback toast. */
    editRejected: () => 'That change was not saved. The board has been put back.',
    /** RUN-23 lost the race. */
    staleReload: () =>
      'Somebody else changed this stand-up. Reloading so you are working from their version.',
    /** RUN-26. */
    lockedForMembers: () =>
      'The stand-up has started, so your own row is now read-only.',

    /** Panel 1. */
    attendanceTitle: () => 'Attendance',
    attendanceFor: ({ name }: { name: string }) => `Attendance for ${name}`,
    partialHoursFor: ({ name }: { name: string }) => `Hours available for ${name}`,
    absenceReasonFor: ({ name }: { name: string }) => `Absence reason for ${name}`,
    statePresent: () => 'Present',
    stateAbsentPlanned: () => 'Absent (planned)',
    stateAbsentUnplanned: () => 'Absent (unplanned)',
    statePartial: () => 'Partial day',

    /** RUN-7's prompt, and its bulk action. */
    reassignPrompt: ({ name, count }: { name: string; count: number }) =>
      count === 1
        ? `Reassign ${name}'s 1 open task?`
        : `Reassign ${name}'s ${count} open tasks?`,
    reassignTo: () => 'Reassign to',
    reassignConfirm: () => 'Reassign',
    reassignDismiss: () => 'Leave for now',

    /** Panel 7. */
    completionTitle: () => 'Completion checks',
    checkNotEvaluated: ({ phase }: { phase: string }) => `Not checked yet (${phase})`,
    completeBlockedBy: ({ message }: { message: string }) =>
      `Cannot complete: ${message}`,
    completeReady: () => 'All checks passed.',
    jumpToFailure: () => 'Fix',

    /** Day one (§15.8.10, ALO-20/21). */
    dayOneProgress: ({
      assigned,
      totalTasks,
      placed,
      capacity
    }: {
      assigned: number
      totalTasks: number
      placed: string
      capacity: string
    }) =>
      `${assigned} of ${totalTasks} tasks assigned, ${placed} of ${capacity} placed.`,
    dayOneUnassignedWarning: ({ count }: { count: number }) =>
      count === 1
        ? '1 task is still unassigned. It will appear in tomorrow’s pool.'
        : `${count} tasks are still unassigned. They will appear in tomorrow’s pool.`
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

    /** DN-6 — the ceremonies opt-out. */
    ceremoniesTitle: () => 'Ceremonies reduce capacity',
    ceremoniesHint: () =>
      'A sprint review, retro or demo removes its own length from the day of everyone attending it. Off means meetings are treated as outside the working day.',

    /**
     * DN-4 — an event with nobody on it deducts from nobody. Named as a
     * question about the event rather than a system error, because it is a
     * data problem the PM fixes on the Sprint Events screen.
     */
    unattendedCeremonies: ({ count }: { count: number }) =>
      count === 1
        ? '1 upcoming event has no attendees, so it reduces nobody’s capacity.'
        : `${count} upcoming events have no attendees, so they reduce nobody’s capacity.`,
    unattendedCeremoniesHint: () =>
      'Add attendees on the Sprint Events screen and the time will start coming out of their day.',

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
    /**
     * One entry per outcome, each a complete sentence.
     *
     * Never assembled from fragments: §12.2's twelve outcomes read differently
     * in different languages, and a sentence concatenated from "Planned", a
     * number and "not started" cannot be translated at all. The two the
     * worked example fixes (§12.3) are reproduced here word for word — the
     * tests assert them character by character, because a paraphrase there is
     * a spec deviation, not a style choice.
     */
    deliveredUnder: ({
      planned,
      logged,
      under,
      locale
    }: {
      planned: Minutes
      logged: Minutes
      under: Minutes
      locale?: string
    }) =>
      `Planned ${formatMinutesAsHours(planned, { locale })}, logged ${formatMinutesAsHours(
        logged,
        { locale }
      )}, done with ${formatMinutesAsHours(under, { locale })} to spare. ` +
      'That time is credited back against estimate debt.',

    deliveredOnEstimate: ({
      planned,
      logged,
      locale
    }: {
      planned: Minutes
      logged: Minutes
      locale?: string
    }) =>
      `Planned ${formatMinutesAsHours(planned, { locale })}, logged ${formatMinutesAsHours(
        logged,
        { locale }
      )}, done on estimate.`,

    deliveredOver: ({
      planned,
      logged,
      over,
      locale
    }: {
      planned: Minutes
      logged: Minutes
      over: Minutes
      locale?: string
    }) =>
      `Planned ${formatMinutesAsHours(planned, { locale })}, logged ${formatMinutesAsHours(
        logged,
        { locale }
      )}, over by ${formatMinutesAsHours(over, { locale })}. Done, but the estimate was short.`,

    openUnderConsumed: ({
      planned,
      logged,
      under,
      locale
    }: {
      planned: Minutes
      logged: Minutes
      under: Minutes
      locale?: string
    }) =>
      `Planned ${formatMinutesAsHours(planned, { locale })}, logged ${formatMinutesAsHours(
        logged,
        { locale }
      )}, so ${formatMinutesAsHours(under, { locale })} of planned time went elsewhere. ` +
      'Still in progress and carrying forward.',

    openFullyConsumed: ({
      planned,
      logged,
      locale
    }: {
      planned: Minutes
      logged: Minutes
      locale?: string
    }) =>
      `Planned ${formatMinutesAsHours(planned, { locale })}, logged ${formatMinutesAsHours(
        logged,
        { locale }
      )}, all of it spent. Still in progress and carrying forward.`,

    /** §12.3's KAN-214 sentence, verbatim. */
    openOverConsumed: ({
      planned,
      logged,
      over,
      totalOnTask,
      estimate,
      taskOver,
      locale
    }: {
      planned: Minutes
      logged: Minutes
      over: Minutes
      totalOnTask: Minutes
      estimate: Minutes
      taskOver: Minutes
      locale?: string
    }) =>
      `Planned ${formatMinutesAsHours(planned, { locale })}, logged ${formatMinutesAsHours(
        logged,
        { locale }
      )}, over by ${formatMinutesAsHours(over, { locale })}. Still in progress. ` +
      `Total on task ${formatMinutesAsHours(totalOnTask, {
        locale
      })} against a ${formatMinutesAsHours(estimate, { locale })} estimate, task is ` +
      `${formatMinutesAsHours(taskOver, { locale })} over estimate. ` +
      'Revised remaining estimate required.',

    /** §12.3's KAN-231 sentence, verbatim. */
    notStarted: ({ planned, locale }: { planned: Minutes; locale?: string }) =>
      `Planned ${formatMinutesAsHours(planned, {
        locale
      })}, logged 0.0h, not started. ${formatMinutesAsHours(planned, {
        locale
      })} of planned work did not happen. Reason required.`,

    blocked: ({ planned, locale }: { planned: Minutes; locale?: string }) =>
      `Blocked. The ${formatMinutesAsHours(planned, {
        locale
      })} planned here is not counted as an overrun — the blocker owns this row.`,

    descoped: () =>
      'Removed from the sprint. Logged time is kept for reporting, and the carry-forward item closes.',

    reassigned: ({ logged, locale }: { logged: Minutes; locale?: string }) =>
      `Reassigned after the day was planned. The ${formatMinutesAsHours(logged, {
        locale
      })} logged stays with the person who worked it, and the remaining estimate moves with the task.`,

    ownerAbsent: () =>
      'The owner was away, so nothing here counts as an overrun and no estimate debt accrues.',

    noTimeLoggedButProgressed: () =>
      'Status moved but no time was logged. Enter the actual hours — nothing accrues until they exist.',

    /**
     * §12.3's absorb-policy banner. Says what the debt *means* for today's
     * plan, because a number alone tells a PM nothing they can act on.
     */
    debtBanner: ({ minutes: value, locale }: { minutes: Minutes; locale?: string }) =>
      `Carrying ${formatMinutesAsHours(value, {
        locale
      })} of estimate debt. Today’s plan assumes estimates hold. If they do not, this debt grows.`,

    /** AC-16's sentence for the reduce policy, verbatim. */
    capacityReduced: ({
      nominal,
      effective,
      debt,
      locale
    }: {
      nominal: Minutes
      effective: Minutes
      debt: Minutes
      locale?: string
    }) =>
      `Capacity ${formatMinutesAsHours(nominal, { locale })} reduced to ${formatMinutesAsHours(
        effective,
        { locale }
      )} by ${formatMinutesAsHours(debt, { locale })} of estimate debt.`,

    /**
     * VAR-6 / E42. A negative balance is surplus and gets its own word.
     * "-2.0h of debt" would tell somebody they owe negative work.
     */
    surplus: ({ minutes: value, locale }: { minutes: Minutes; locale?: string }) =>
      `Ahead of estimate by ${formatMinutesAsHours(value, { locale })}.`,

    /**
     * VAR-10 / NFR-14. Factual, never punitive: it states a number about the
     * work, not a judgement about the person.
     */
    memberFacingDebt: ({ minutes: value, locale }: { minutes: Minutes; locale?: string }) =>
      `You are ${formatMinutesAsHours(value, { locale, withUnit: false })} hours over estimate ` +
      'on this sprint’s completed and in-flight work.',

    chronicSpill: ({ chainLength }: { chainLength: number }) =>
      `Spilled across ${chainLength} ${plural(chainLength, 'stand-up', 'stand-ups')}.`,

    /** E43 — debt now larger than a whole day. */
    notRecoverable: () =>
      'Estimate debt now exceeds a full day. This plan is not recoverable without descoping or writing debt off.',

    /** VAR-13's roll-up strip labels. */
    rollUpPlanned: () => 'Planned yesterday',
    rollUpLogged: () => 'Logged yesterday',
    rollUpDayVariance: () => 'Net day variance',
    rollUpDebt: () => 'Estimate debt',
    rollUpNeedingRevision: ({ count }: { count: number }) =>
      `${count} ${plural(count, 'task needs', 'tasks need')} a revised estimate`,

    /** VAR-12's words. Colour is never the only signal (NFR-A2). */
    labelOver: () => 'over',
    labelUnder: () => 'under',
    labelOnEstimate: () => 'on estimate',
    labelNotStarted: () => 'not started',

    /** §15.11, the revision modal. */
    reviseTitle: () => 'Revise remaining estimate',
    reviseHoursLabel: () => 'How many hours are left?',
    reviseOriginalUnchanged: () => 'This will not change the original estimate.',
    reviseProjectedTotal: ({
      name,
      total,
      locale
    }: {
      name: string
      total: Minutes
      locale?: string
    }) =>
      `${name}’s new total on this task would be ${formatMinutesAsHours(total, { locale })}.`,
    reviseDetailRequired: ({ minLength }: { minLength: number }) =>
      `Say a little more — at least ${minLength} characters.`,
    reasonRequired: ({ minLength }: { minLength: number }) =>
      `Give a reason of at least ${minLength} characters for the planned time that did not happen.`
  },

  /**
   * Panel 2, the yesterday review (§15.8.4, RUN-9..RUN-13).
   *
   * The bucket headings are the panel's structure, so all four are returned
   * even when three are empty: a PM who sees three headings cannot tell
   * "nothing is blocked" from "the blocked bucket did not render".
   */
  yesterday: {
    title: () => 'Yesterday',
    bucketCompleted: () => 'Completed since last stand-up',
    bucketInProgress: () => 'In progress',
    bucketNotStarted: () => 'Not started',
    bucketBlocked: () => 'Blocked',
    bucketCount: ({ label, count }: { label: string; count: number }) => `${label} (${count})`,
    noPreviousStandup: () =>
      'This is the first stand-up of the sprint, so there is no previous day to review.',
    emptyBucket: () => 'Nothing here.',
    /** E39 — time logged against a task nobody planned for this member. */
    unplannedBadge: () => 'Unplanned',
    unplannedHint: () =>
      'Time was logged against this task yesterday, but it was not on the plan.',
    markAllConfirmed: () => 'Mark all confirmed',
    ageBadge: ({ standups }: { standups: number }) =>
      `Open across ${standups} ${plural(standups, 'stand-up', 'stand-ups')}`,
    previousStatus: () => 'Was',
    currentStatus: () => 'Now',
    /** RUN-11 — a status the PM changed for somebody else. */
    changedOnBehalfOf: ({ name }: { name: string }) => `Changed by the facilitator for ${name}`,
    /** RUN-10 — the one-line note action. */
    saveNote: () => 'Add note',
    noteSaved: () => 'Saved'
  },

  /**
   * The estimate-debt ledger drawer and the write-off dialog (VAR-5, VAR-8).
   *
   * The entry types are labelled in plain language rather than by their stored
   * names: "accrual" is a bookkeeping word, and the drawer is read by the
   * person the number is about.
   */
  debt: {
    title: () => 'Estimate debt',
    ledgerTitle: () => 'Estimate debt ledger',
    empty: () => 'Nothing has been recorded on this sprint yet.',
    outstanding: ({ minutes: value, locale }: { minutes: Minutes; locale?: string }) =>
      `${formatMinutesAsHours(value, { locale })} outstanding`,
    entryType: {
      accrual: () => 'Went over estimate',
      credit: () => 'Came in under estimate',
      settlement: () => 'Worked off against capacity',
      writeoff: () => 'Written off',
      carry_in: () => 'Carried in from the previous sprint'
    },
    writeOff: () => 'Write off debt',
    writeOffConfirm: () => 'Confirm write-off',
    writeOffReasonLabel: () => 'Why is this debt being written off?',
    writeOffReasonTooShort: ({ minLength }: { minLength: number }) =>
      `A write-off needs a justification of at least ${minLength} characters.`,
    writeOffTooLarge: ({ outstanding, locale }: { outstanding: Minutes; locale?: string }) =>
      `Only ${formatMinutesAsHours(outstanding, { locale })} is outstanding, so no more than that can be written off.`,
    writeOffNotPermitted: () => 'Only a project manager can write estimate debt off.',
    /** VAR-9's confirmation, shown at the new sprint's planning completion. */
    carryInConfirm: ({ count }: { count: number }) =>
      `${count} ${plural(count, 'person carries', 'people carry')} estimate debt into this sprint.`
  },

  /**
   * The Schedule hub (spec §15.6, UI-8, UI-9).
   *
   * The status labels are deliberately plain-language rather than the internal
   * state names: "Skipped — public holiday" tells a PM what happened;
   * "Skipped_Holiday" tells them what the database calls it.
   */
  schedule: {
    title: () => 'Stand-up schedule',
    empty: () =>
      'No stand-ups have been generated for this sprint yet. They are created when the planning session completes.',
    today: () => 'Today',
    dayLabel: ({ number, total }: { number: number; total: number }) =>
      `Day ${number} of ${total}`,
    dayOne: () => 'Day one — assignment',
    finalDay: () => 'Final day — sprint close',
    frozenDayNumber: ({ number }: { number: number }) => `Ran as day ${number}`,
    backfilled: () => 'Back-filled',
    calendarAnomaly: () =>
      'The calendar changed after this stand-up ran. Its record was left untouched.',
    loading: () => 'Loading the schedule…',
    sprintsLoadFailed: () => "Could not load this project's sprints.",
    scheduleLoadFailed: () => 'Could not load the stand-up schedule.',
    status: {
      Scheduled: 'Scheduled',
      Ready: 'Ready to start',
      In_Progress: 'In progress',
      Completed: 'Completed',
      Reopened: 'Reopened',
      Missed: 'Missed',
      Skipped_Holiday: 'Skipped — not a working day',
      Cancelled: 'Cancelled'
    } as Record<string, string>
  },

  /**
   * Scheduler notifications (spec §9.5 — N1, N2, N8).
   *
   * Each says what the reader has to *do*. "Stand-up is ready" tells a
   * facilitator nothing they cannot see; "your 09:00 stand-up opens in fifteen
   * minutes" tells them whether to stop what they are doing.
   */
  notifications: {
    readyTitle: () => 'Your stand-up is ready to start',
    readyMessage: ({ localTime, minutesUntil }: { localTime: string; minutesUntil: number }) =>
      `The ${localTime} stand-up opens in ${minutesUntil} ${plural(
        minutesUntil,
        'minute',
        'minutes'
      )}. Its numbers are prepared.`,

    reminderTitle: () => 'Update your tasks before stand-up',
    reminderMessage: ({ localTime }: { localTime: string }) =>
      `Stand-up is at ${localTime}. Update your task statuses and log your time before it starts.`,

    missedTitle: () => 'Yesterday`s stand-up was missed',
    missedMessage: ({ date }: { date: string }) =>
      `The stand-up for ${date} was never started. Its work has been carried into the next one, and you can still back-fill it.`,

    missedTwiceTitle: () => 'Two stand-ups missed in a row',
    missedTwiceMessage: ({ count }: { count: number }) =>
      `${count} stand-ups have now been missed consecutively on this sprint.`,

    missedThriceTitle: () => 'Three stand-ups missed in a row',
    missedThriceMessage: ({ count }: { count: number }) =>
      `${count} consecutive stand-ups have been missed. This sprint's plan is no longer being tracked daily.`,

    /** CFW-3, N9. */
    carryForwardEscalatedTitle: () => 'A carry-forward item is escalated',
    carryForwardEscalatedMessage: ({ label, age }: { label: string; age: number }) =>
      `${label} has been open for ${age} stand-ups without closing.`,
    carryForwardChronicTitle: () => 'A carry-forward item is now chronic',
    carryForwardChronicMessage: ({ label, age }: { label: string; age: number }) =>
      `${label} has been open for ${age} stand-ups. It needs a documented decision: continue, descope, or split.`
  },

  /**
   * Lifecycle refusals (spec §10.1, RUN-2..RUN-5, E51, E52).
   *
   * These are refusals a PM reads mid-meeting, so each one says what to do
   * next — the time the stand-up opens, or which stand-up is holding the lock —
   * rather than only that the action was rejected.
   */
  lifecycle: {
    notStartableYet: ({ localTime, localDate }: { localTime: string; localDate: string }) =>
      `This stand-up becomes available at ${localTime} on ${localDate}.`,
    notStartableFromStatus: ({ status }: { status: string }) =>
      `A stand-up in ${status} cannot be started.`,
    anotherInProgress: ({ date }: { date: string }) =>
      `The stand-up for ${date} is still in progress. Complete or cancel it first.`,
    invalidTransition: ({ from, to }: { from: string; to: string }) =>
      `A stand-up cannot move from ${from} to ${to}.`,
    reopenReasonTooShort: ({ minLength }: { minLength: number }) =>
      `Give a reason of at least ${minLength} characters for reopening this stand-up.`,
    reopenWindowExpired: ({ hours }: { hours: number }) =>
      `The ${hours}-hour reopen window has passed. Only an organisation admin can reopen this stand-up now.`,
    reopenSprintCompleted: () =>
      'This sprint is completed, so its stand-ups can no longer be reopened.'
  },

  /**
   * Notices for capabilities release one deliberately ships without (plan §3).
   *
   * Each entry leads with the **effect on the reader**, not the cause: a PM
   * needs to know stand-ups are not being promoted, not that a heartbeat is
   * missing. The cause belongs in the linked documentation.
   */
  degradation: {
    schedulerStaleNever:
      'Stand-ups are not being promoted automatically. No background run has been recorded yet.',
    schedulerStale: ({ minutes }: { minutes: number }) =>
      `Stand-ups are not being promoted automatically. The last background run was ${minutes} ${plural(
        minutes,
        'minute',
        'minutes'
      )} ago.`,
    schedulerStaleAction: 'How to fix this',
    cronRoutesUnauthenticated:
      'Background job URLs can be triggered by anyone who knows the address. Set CRON_SECRET to require a token.',
    cronRoutesUnauthenticatedAction: 'How to set CRON_SECRET',
    holidayCoverageGap: ({ setName, coveredTo }: { setName: string; coveredTo: string }) =>
      `${setName} has no dates loaded after ${coveredTo}. Stand-ups generated after ` +
      'that date may fall on public holidays.',
    holidayCoverageNone: ({ setName }: { setName: string }) =>
      `${setName} has no holidays loaded at all. Every date is being treated as a working day.`,
    holidayCoverageAction: 'Import holidays'
  },

  /**
   * Panel 4 — the carry-forward register (spec §13, CFW-1..11).
   *
   * "The register is the module's memory" (§13.1), so its copy leans on that:
   * every label says what is still owed and for how long, never just a status
   * word.
   */
  carryForward: {
    title: () => 'Carry forward',
    subtitle: () =>
      'Anything open that did not close. It keeps appearing until it is resolved.',
    empty: () => 'Nothing carried forward. A clean board.',

    itemTypeLabel: (type: string) => {
      switch (type) {
        case 'unfinished_task':
          return 'Unfinished task'
        case 'unrevised_estimate':
          return 'Estimate needs revising'
        case 'open_blocker':
          return 'Open blocker'
        case 'owner_absent':
          return 'Owner absent'
        case 'unassigned_task':
          return 'Unassigned task'
        case 'missed_standup_rollup':
          return 'Rolled from a missed stand-up'
        case 'override_followup':
          return 'Override follow-up'
        case 'not_started_commitment':
          return 'Not started'
        case 'cross_sprint':
          return 'Carried from last sprint'
        default:
          return 'Carried forward'
      }
    },

    ageBadge: ({ age }: { age: number }) =>
      age === 1 ? '1 stand-up' : `${age} stand-ups`,
    escalatedBadge: () => 'Escalated',
    chronicBadge: () => 'Chronic',

    /** CFW-11's summary strip. */
    summaryOpen: ({ count }: { count: number }) => `${count} open`,
    summaryNeedingNote: ({ count }: { count: number }) => `${count} need a note today`,
    summaryEscalated: ({ count }: { count: number }) => `${count} escalated`,
    summaryResolved: ({ count }: { count: number }) => `${count} resolved`,

    /** CFW-4's mandatory note, and its two rejections. */
    noteRequired: () =>
      'This item has been open long enough that a note is mandatory before completion (CC-4).',
    notePlaceholder: () => "What's the update today?",
    noteTooShort: ({ minLength }: { minLength: number }) =>
      `Add at least ${minLength} characters.`,
    noteUnchanged: () => 'Add today’s update, not yesterday’s.',
    addNote: () => 'Add note',
    noteHistory: () => 'Note history',

    /** CFW-7's inline resolve. */
    resolve: () => 'Resolve',
    resolveDone: () => 'Done',
    resolveReassigned: () => 'Reassigned',
    resolveDescoped: () => 'Descoped',
    resolveAcknowledged: () => 'Acknowledged',
    resolveOther: () => 'Other',
    resolveCommentPlaceholder: () => 'Optional comment',

    /** CFW-10's filters. */
    filterType: () => 'Type',
    filterOwner: () => 'Owner',
    filterAgeBand: () => 'Age',
    filterStatus: () => 'Status',
    sortedByAge: () => 'Sorted oldest first'
  },

  /**
   * The override modal (§15.12, OVR-1..7).
   *
   * §14.2's checks are refusals by default — this is the one screen where a
   * PM can push past one, so every string here leans toward accountability:
   * the modal names who is doing this and why, and the attribution notice is
   * never optional copy.
   */
  override: {
    title: ({ type }: { type: string }) => {
      switch (type) {
        case 'over_allocation':
          return 'Override: allocate beyond capacity'
        case 'skip_reestimate':
          return 'Override: defer the re-estimate'
        case 'duplicate_allocation':
          return 'Override: allow duplicate allocation'
        case 'under_allocation':
        default:
          return 'Override: allocate below capacity'
      }
    },

    gapLine: ({
      name,
      gapMinutes,
      allocatedMinutes,
      effectiveMinutes
    }: {
      name: string
      gapMinutes: number
      allocatedMinutes: number
      effectiveMinutes: number
    }) =>
      `${name}: ${Math.round(allocatedMinutes / 60)}h of ${Math.round(effectiveMinutes / 60)}h planned, ${Math.round(Math.abs(gapMinutes) / 60)}h gap.`,

    reasonLabel: ({ code }: { code: string }) => {
      switch (code) {
        case 'no_work_available':
          return 'No work available'
        case 'blocked_capacity':
          return 'Blocked on something outside their control'
        case 'skills_mismatch':
          return 'No task matching their skills'
        case 'awaiting_dependency':
          return 'Waiting on a dependency'
        case 'training_or_ceremony':
          return 'Training or ceremony'
        case 'support_rota':
          return 'On support rota'
        case 'part_day_unrecorded':
          return 'Part day, not recorded as attendance'
        case 'onboarding':
          return 'Onboarding'
        case 'deliberate_buffer':
          return 'Deliberate buffer'
        case 'member_agreed_overtime':
          return 'Member agreed to overtime'
        case 'estimates_conservative':
          return 'Estimates were conservative'
        case 'catching_up_debt':
          return 'Catching up on estimate debt'
        case 'critical_deadline':
          return 'Critical deadline'
        case 'task_will_split':
          return 'Task will be split tomorrow'
        case 'other':
        default:
          return 'Other'
      }
    },

    justificationLabel: () => 'Why is this being overridden?',
    justificationPlaceholder: () => 'Explain what actually happened. This is recorded on the audit trail.',

    /**
     * OVR-5. Mirrors `validateJustification`'s two failure codes
     * (`override.ts`) with the copy actually shown to the person overriding —
     * the validation *decision* stays in `override.ts`, but the sentence the
     * reader sees belongs in this catalogue like every other user-facing
     * string in the module.
     */
    validationError: ({ code, minLength }: { code: 'TOO_SHORT' | 'LOW_VALUE'; minLength: number }) => {
      switch (code) {
        case 'TOO_SHORT':
          return `A justification needs at least ${minLength} characters.`
        case 'LOW_VALUE':
        default:
          return 'That justification does not explain anything. Say what actually happened.'
      }
    },

    /** OVR-6 — required only for `over_allocation`. */
    acknowledgement: () => 'The member has agreed to this overtime.',

    /** SEC-3 — the override, who issued it and why, is never anonymous. */
    attributionNotice: () =>
      'This override is recorded against your name and is visible on the audit trail.',

    cancel: () => 'Cancel',
    submit: () => 'Override'
  },

  /**
   * Panel 6 — blockers (§13, RUN-14..18).
   */
  blocker: {
    raise: () => 'Raise a blocker',
    resolve: () => 'Resolve',
    empty: () => 'No blockers right now.',
    general: () => 'General'
  }
} as const

export type StandupStrings = typeof standupStrings
