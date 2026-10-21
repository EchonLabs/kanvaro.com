/**
 * The reconciler matrix: nine SCH-6 triggers × eight §10.1 statuses.
 *
 * The spec names calendar change propagation the module's highest-risk area,
 * and the plan requires this matrix to exist *before* any individual case. Each
 * row below states what happens to one stand-up in one status when one trigger
 * fires — every cell, including the boring ones, because a rule that silently
 * does nothing in a cell nobody tested is exactly how a completed stand-up gets
 * destroyed.
 *
 * Fixture: a 10-working-day sprint, 10–21 August 2026, Mon–Fri. The stand-up
 * under test sits on Tuesday 18 August (day 7) unless the trigger needs it
 * somewhere else.
 */
import { STANDUP_STATUSES, type StandupStatus } from '@/models/Standup'

import {
  planReconcile,
  type ExistingStandupRow,
  type ReconcileAction,
  type ReconcileTrigger
} from '../reconcile-rules'

const SPRINT_DATES = [
  '2026-08-10',
  '2026-08-11',
  '2026-08-12',
  '2026-08-13',
  '2026-08-14',
  '2026-08-17',
  '2026-08-18',
  '2026-08-19',
  '2026-08-20',
  '2026-08-21'
]

const SUBJECT_DATE = '2026-08-18'

/** Statuses that are themselves a record of a day that does not run. */
const NON_RUNNING: StandupStatus[] = ['Skipped_Holiday', 'Cancelled']

function rows(subjectStatus: StandupStatus, extraDates: string[] = []): ExistingStandupRow[] {
  const dates = SPRINT_DATES.concat(extraDates).sort()

  return dates.map((date, index) => ({
    id: `standup-${date}`,
    date,
    status: date === SUBJECT_DATE ? subjectStatus : ('Scheduled' as StandupStatus),
    sprintDayNumber: index + 1,
    totalSprintDays: dates.length,
    shape:
      index === 0 ? 'day_one' : index === dates.length - 1 ? 'final_day' : 'mid_sprint',
    carryForwardCount: date === SUBJECT_DATE ? 3 : 0
  }))
}

/** Working days after the change. A skipped or cancelled day is not working. */
function workingDates(subjectStatus: StandupStatus, dates: string[] = SPRINT_DATES) {
  return NON_RUNNING.indexOf(subjectStatus) === -1
    ? dates
    : dates.filter((date) => date !== SUBJECT_DATE)
}

const forSubject = (actions: ReconcileAction[], date = SUBJECT_DATE) =>
  actions.filter((action) => action.date === date)

const kindsFor = (actions: ReconcileAction[], date = SUBJECT_DATE) =>
  forSubject(actions, date)
    .map((action) => action.kind)
    .sort()

describe('planReconcile — SCH-6 × §10.1 matrix', () => {
  describe('sprint start moved earlier: generate the new days, renumber', () => {
    const added = ['2026-08-05', '2026-08-06', '2026-08-07']

    it.each(STANDUP_STATUSES)('leaves a %s stand-up in place', (status) => {
      const plan = planReconcile({
        trigger: 'sprint_start_earlier',
        range: { from: '2026-08-05', to: '2026-08-21' },
        workingDates: added.concat(workingDates(status)),
        existing: rows(status)
      })

      expect(kindsFor(plan.actions)).not.toContain('skip')
      expect(kindsFor(plan.actions)).not.toContain('cancel')

      for (const date of added) {
        expect(kindsFor(plan.actions, date)).toEqual(['create'])
      }
    })

    it('numbers the new days from one and pushes the old day one along', () => {
      const plan = planReconcile({
        trigger: 'sprint_start_earlier',
        range: { from: '2026-08-05', to: '2026-08-21' },
        workingDates: added.concat(SPRINT_DATES),
        existing: rows('Scheduled')
      })

      const first = plan.actions.find(
        (action) => action.kind === 'create' && action.date === '2026-08-05'
      )
      expect(first).toMatchObject({ sprintDayNumber: 1, shape: 'day_one', totalSprintDays: 13 })

      const oldFirst = plan.actions.find(
        (action) => action.kind === 'renumber' && action.date === '2026-08-10'
      )
      expect(oldFirst).toMatchObject({ sprintDayNumber: 4, shape: 'mid_sprint' })
    })
  })

  describe('sprint start moved later: cancel what fell out, refuse to strand history', () => {
    const range = { from: '2026-08-19', to: '2026-08-21' }

    it.each(['Completed', 'Reopened', 'In_Progress'] as StandupStatus[])(
      'refuses the move when a %s stand-up would fall outside (E9, SCH-7)',
      (status) => {
        expect(() =>
          planReconcile({
            trigger: 'sprint_start_later',
            range,
            workingDates: workingDates(status),
            existing: rows(status)
          })
        ).toThrow(/2026-08-18/)
      }
    )

    it.each(['Scheduled', 'Ready', 'Missed'] as StandupStatus[])(
      'cancels a %s stand-up that fell outside the range',
      (status) => {
        const plan = planReconcile({
          trigger: 'sprint_start_later',
          range,
          workingDates: workingDates(status),
          existing: rows(status)
        })

        expect(kindsFor(plan.actions)).toEqual(['cancel'])
      }
    )

    it.each(NON_RUNNING)('leaves an already-%s stand-up alone', (status) => {
      const plan = planReconcile({
        trigger: 'sprint_start_later',
        range,
        workingDates: workingDates(status),
        existing: rows(status)
      })

      expect(kindsFor(plan.actions)).toEqual([])
    })

    it('names every stranded date in the refusal, not just the first', () => {
      const existing = rows('Scheduled').map((row) =>
        row.date === '2026-08-11' || row.date === '2026-08-12'
          ? { ...row, status: 'Completed' as StandupStatus }
          : row
      )

      expect(() =>
        planReconcile({
          trigger: 'sprint_start_later',
          range,
          workingDates: SPRINT_DATES,
          existing
        })
      ).toThrow(/2026-08-11.*2026-08-12|2026-08-12.*2026-08-11/)
    })
  })

  describe('sprint end moved later: generate, renumber, reshape the final day', () => {
    const added = ['2026-08-24', '2026-08-25']

    it.each(STANDUP_STATUSES)('does not disturb a %s stand-up', (status) => {
      const plan = planReconcile({
        trigger: 'sprint_end_later',
        range: { from: '2026-08-10', to: '2026-08-25' },
        workingDates: workingDates(status).concat(added),
        existing: rows(status)
      })

      expect(kindsFor(plan.actions)).not.toContain('skip')
      expect(kindsFor(plan.actions)).not.toContain('cancel')
    })

    it('E8: the old last day loses final_day and the new one gains it', () => {
      const plan = planReconcile({
        trigger: 'sprint_end_later',
        range: { from: '2026-08-10', to: '2026-08-25' },
        workingDates: SPRINT_DATES.concat(added),
        existing: rows('Scheduled')
      })

      const oldLast = plan.actions.find(
        (action) => action.kind === 'renumber' && action.date === '2026-08-21'
      )
      expect(oldLast).toMatchObject({ shape: 'mid_sprint', totalSprintDays: 12 })

      const newLast = plan.actions.find(
        (action) => action.kind === 'create' && action.date === '2026-08-25'
      )
      expect(newLast).toMatchObject({ shape: 'final_day', sprintDayNumber: 12 })
    })
  })

  describe('sprint end moved earlier: same protection as start moved later', () => {
    const range = { from: '2026-08-10', to: '2026-08-17' }

    it.each(['Completed', 'Reopened', 'In_Progress'] as StandupStatus[])(
      'refuses when a %s stand-up would fall outside',
      (status) => {
        expect(() =>
          planReconcile({
            trigger: 'sprint_end_earlier',
            range,
            workingDates: workingDates(status),
            existing: rows(status)
          })
        ).toThrow(/2026-08-18/)
      }
    )

    it.each(['Scheduled', 'Ready', 'Missed'] as StandupStatus[])(
      'cancels a %s stand-up that fell outside',
      (status) => {
        const plan = planReconcile({
          trigger: 'sprint_end_earlier',
          range,
          workingDates: workingDates(status),
          existing: rows(status)
        })

        expect(kindsFor(plan.actions)).toEqual(['cancel'])
      }
    )

    it('the new last day becomes final_day', () => {
      const plan = planReconcile({
        trigger: 'sprint_end_earlier',
        range,
        workingDates: SPRINT_DATES.filter((date) => date <= '2026-08-17'),
        existing: rows('Scheduled')
      })

      const newLast = plan.actions.find(
        (action) => action.kind === 'renumber' && action.date === '2026-08-17'
      )
      expect(newLast).toMatchObject({ shape: 'final_day', totalSprintDays: 6 })
    })
  })

  describe('a date became non-working (CAL-12)', () => {
    const plan = (status: StandupStatus) =>
      planReconcile({
        trigger: 'date_became_non_working',
        range: { from: '2026-08-10', to: '2026-08-21' },
        workingDates: SPRINT_DATES.filter((date) => date !== SUBJECT_DATE),
        existing: rows(status),
        reasonByDate: { [SUBJECT_DATE]: 'Public holiday: Nikini Poya' }
      })

    it.each(['Scheduled', 'Ready'] as StandupStatus[])(
      'skips a %s stand-up and carries its prepared items forward',
      (status) => {
        const actions = forSubject(plan(status).actions)

        expect(actions).toHaveLength(1)
        expect(actions[0]).toMatchObject({
          kind: 'skip',
          clearMissed: false,
          carryForwardCount: 3,
          reason: 'Public holiday: Nikini Poya'
        })
      }
    )

    it('skips a Missed stand-up and clears the missed flag', () => {
      expect(forSubject(plan('Missed').actions)[0]).toMatchObject({
        kind: 'skip',
        clearMissed: true
      })
    })

    it('warns about an In_Progress stand-up rather than touching it', () => {
      expect(kindsFor(plan('In_Progress').actions)).toEqual(['warn'])
    })

    it.each(['Completed', 'Reopened'] as StandupStatus[])(
      'records an anomaly on a %s stand-up and changes nothing else (AC-4, CAL-16)',
      (status) => {
        const actions = forSubject(plan(status).actions)

        expect(actions.map((action) => action.kind).sort()).toEqual(['anomaly', 'renumber'])
        // CAL-14: the number it displayed is frozen; its live numbers do not move.
        expect(actions.find((action) => action.kind === 'renumber')).toMatchObject({
          freezeDisplayedDayNumber: 7,
          sprintDayNumber: 7
        })
      }
    )

    it.each(NON_RUNNING)('does nothing to an already-%s stand-up', (status) => {
      expect(kindsFor(plan(status).actions)).toEqual([])
    })

    it('renumbers the days after the skipped one (AC-3)', () => {
      const actions = plan('Scheduled').actions

      const nineteenth = actions.find(
        (action) => action.kind === 'renumber' && action.date === '2026-08-19'
      )
      // 19 August was day 8 of 10; with the 18th skipped it becomes day 7 of 9.
      expect(nineteenth).toMatchObject({ sprintDayNumber: 7, totalSprintDays: 9 })
    })
  })

  describe('a date became working (CAL-13)', () => {
    const saturday = '2026-08-15'

    const plan = (status: StandupStatus, includeExisting: boolean) =>
      planReconcile({
        trigger: 'date_became_working',
        range: { from: '2026-08-10', to: '2026-08-21' },
        workingDates: SPRINT_DATES.concat([saturday]).sort(),
        existing: includeExisting
          ? rows('Scheduled', [saturday]).map((row) =>
              row.date === saturday ? { ...row, status } : row
            )
          : rows('Scheduled')
      })

    it('creates a stand-up when the date has none', () => {
      expect(kindsFor(plan('Scheduled', false).actions, saturday)).toEqual(['create'])
    })

    it.each(NON_RUNNING)('revives an existing %s stand-up rather than duplicating it', (status) => {
      const action = forSubject(plan(status, true).actions, saturday)[0]

      expect(action).toMatchObject({ kind: 'create', standupId: `standup-${saturday}` })
    })

    it.each(['Scheduled', 'Ready', 'In_Progress', 'Completed', 'Reopened', 'Missed'] as StandupStatus[])(
      'leaves a %s stand-up that already exists on that date alone',
      (status) => {
        expect(kindsFor(plan(status, true).actions, saturday)).not.toContain('create')
      }
    )
  })

  describe('stand-up time of day changed (SCH-6)', () => {
    const plan = (status: StandupStatus) =>
      planReconcile({
        trigger: 'standup_time_changed',
        range: { from: '2026-08-10', to: '2026-08-21' },
        workingDates: workingDates(status),
        existing: rows(status)
      })

    it('reschedules a Scheduled stand-up', () => {
      expect(kindsFor(plan('Scheduled').actions)).toEqual(['reschedule'])
    })

    it.each(
      ['Ready', 'In_Progress', 'Completed', 'Reopened', 'Missed', 'Skipped_Holiday', 'Cancelled'] as StandupStatus[]
    )('never touches a %s stand-up', (status) => {
      expect(kindsFor(plan(status).actions)).not.toContain('reschedule')
    })
  })

  describe('project timezone changed (SCH-6, E6)', () => {
    const plan = (status: StandupStatus) =>
      planReconcile({
        trigger: 'project_timezone_changed',
        range: { from: '2026-08-10', to: '2026-08-21' },
        workingDates: workingDates(status),
        existing: rows(status)
      })

    it('recomputes Scheduled instants only', () => {
      expect(kindsFor(plan('Scheduled').actions)).toEqual(['reschedule'])
      expect(kindsFor(plan('Ready').actions)).not.toContain('reschedule')
    })

    it('reschedules every Scheduled stand-up in the sprint, not only the changed one', () => {
      const rescheduled = plan('Ready').actions.filter(
        (action) => action.kind === 'reschedule'
      )

      expect(rescheduled).toHaveLength(SPRINT_DATES.length - 1)
    })
  })

  describe('sprint cancelled (SCH-6)', () => {
    const plan = (status: StandupStatus) =>
      planReconcile({
        trigger: 'sprint_cancelled',
        range: { from: '2026-08-10', to: '2026-08-21' },
        workingDates: workingDates(status),
        existing: rows(status)
      })

    it.each(['Scheduled', 'Ready', 'In_Progress', 'Missed'] as StandupStatus[])(
      'cancels a %s stand-up',
      (status) => {
        expect(kindsFor(plan(status).actions)).toEqual(['cancel'])
      }
    )

    it.each(['Completed', 'Reopened'] as StandupStatus[])(
      'leaves a %s stand-up and its history intact (CAL-16)',
      (status) => {
        expect(kindsFor(plan(status).actions)).toEqual([])
      }
    )

    it.each(NON_RUNNING)('does not re-cancel a %s stand-up', (status) => {
      expect(kindsFor(plan(status).actions)).toEqual([])
    })
  })
})
