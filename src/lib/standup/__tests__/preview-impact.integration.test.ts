/**
 * Integration tests for the UI-1 live impact preview (spec CAL-12, CAL-13, CAL-16).
 *
 * `calendar-impact.test.ts` proves the disposition table against hand-built
 * before/after maps. This suite proves the wiring around it: that a proposed
 * change is resolved against *persisted* calendar data, and that the Phase 3
 * `Standup` lookup engages the moment the model exists.
 *
 * That last point is why this file registers a minimal `Standup` model. Without
 * it `loadExistingStandups` short-circuits to an empty map and every disposition
 * would be `create`/`no_change` — the interesting half of CAL-12 would go
 * untested until Phase 3, which is exactly when a regression there costs most.
 */
import mongoose, { Schema } from 'mongoose'

import { Holiday } from '@/models/Holiday'
import { HolidaySet } from '@/models/HolidaySet'
import { WorkingCalendar } from '@/models/WorkingCalendar'
import {
  previewCalendarChange,
  previewOverrideRemoval,
  previewWorkingWeekChange
} from '../preview-impact'
import type { StandupStatusForImpact } from '../calendar-impact'
import { ids, useMongo } from './helpers/mongo'

const { organization, project, user } = ids

/**
 * A stand-in for the Phase 3 `Standup` collection.
 *
 * Only the two fields `loadExistingStandups` selects are modelled. When the real
 * model lands it registers under the same name and these tests keep working —
 * if they break, the field contract changed and the preview would have silently
 * started reporting "nothing is affected".
 */
const StandupStub =
  mongoose.models.Standup ??
  mongoose.model(
    'Standup',
    new Schema(
      {
        project: { type: Schema.Types.ObjectId, required: true },
        standupDate: { type: String, required: true },
        status: { type: String, required: true }
      },
      { collection: 'standups' }
    )
  )

async function addStandup(standupDate: string, status: StandupStatusForImpact) {
  return StandupStub.create({ project, standupDate, status })
}

async function createCalendar(overrides: Record<string, unknown> = {}) {
  return WorkingCalendar.create({
    scope: 'project',
    organization,
    project,
    workingDaysOfWeek: [1, 2, 3, 4, 5],
    standardMinutesPerDay: 480,
    timezone: 'Asia/Colombo',
    ...overrides
  })
}

// 2026-08-20 is a Thursday, 2026-08-21 a Friday, 2026-08-22 a Saturday.
const THURSDAY = '2026-08-20'
const FRIDAY = '2026-08-21'
const SATURDAY = '2026-08-22'

describe('previewCalendarChange — closing a working day (CAL-12)', () => {
  useMongo()

  it('reports no affected stand-up when none exists yet', async () => {
    await createCalendar()

    const preview = await previewCalendarChange(project.toString(), {
      date: THURSDAY,
      effect: 'non_working'
    })

    expect(preview.items).toHaveLength(1)
    expect(preview.items[0].disposition).toBe('no_change')
    expect(preview.blockedCount).toBe(0)
  })

  it('skips a Scheduled stand-up', async () => {
    await createCalendar()
    await addStandup(THURSDAY, 'Scheduled')

    const preview = await previewCalendarChange(project.toString(), {
      date: THURSDAY,
      effect: 'non_working'
    })

    expect(preview.items[0].disposition).toBe('skip')
    expect(preview.items[0].currentStatus).toBe('Scheduled')
    expect(preview.hasApplicableChanges).toBe(true)
  })

  it('warns rather than touching an In_Progress stand-up', async () => {
    await createCalendar()
    await addStandup(THURSDAY, 'In_Progress')

    const preview = await previewCalendarChange(project.toString(), {
      date: THURSDAY,
      effect: 'non_working'
    })

    expect(preview.items[0].disposition).toBe('warn_in_progress')
  })

  it('CAL-16 — blocks the change on a Completed stand-up', async () => {
    await createCalendar()
    await addStandup(THURSDAY, 'Completed')

    const preview = await previewCalendarChange(project.toString(), {
      date: THURSDAY,
      effect: 'non_working'
    })

    expect(preview.items[0].disposition).toBe('blocked_completed')
    expect(preview.items[0].blocked).toBe(true)
    expect(preview.blockedCount).toBe(1)
    expect(preview.hasApplicableChanges).toBe(false)
  })

  it('clears the missed flag when skipping a Missed stand-up', async () => {
    await createCalendar()
    await addStandup(THURSDAY, 'Missed')

    const preview = await previewCalendarChange(project.toString(), {
      date: THURSDAY,
      effect: 'non_working'
    })

    expect(preview.items[0].disposition).toBe('skip_clear_missed')
  })
})

describe('previewCalendarChange — opening a non-working day (CAL-13)', () => {
  useMongo()

  it('predicts a stand-up will be created on a weekend the project chooses to work', async () => {
    await createCalendar()

    const preview = await previewCalendarChange(project.toString(), {
      date: SATURDAY,
      effect: 'observed_as_working'
    })

    expect(preview.items[0].disposition).toBe('create')
    expect(preview.summary).toContain('1')
  })

  it('restores a gazetted holiday and predicts the stand-up', async () => {
    const set = await HolidaySet.create({
      organization,
      name: 'Sri Lanka Public Holidays',
      countryCode: 'LK',
      createdBy: user
    })
    await Holiday.create({
      holidaySet: set._id,
      organization,
      date: THURSDAY,
      name: 'Nikini Full Moon Poya Day',
      type: 'public'
    })
    await createCalendar({ subscribedHolidaySets: [set._id] })

    const preview = await previewCalendarChange(project.toString(), {
      date: THURSDAY,
      effect: 'observed_as_working'
    })

    expect(preview.items[0].disposition).toBe('create')
  })

  it('re-creates a stand-up on a date previously skipped as a holiday', async () => {
    await createCalendar()
    await addStandup(SATURDAY, 'Skipped_Holiday')

    const preview = await previewCalendarChange(project.toString(), {
      date: SATURDAY,
      effect: 'observed_as_working'
    })

    expect(preview.items[0].disposition).toBe('create')
  })
})

describe('previewOverrideRemoval', () => {
  useMongo()

  it('predicts the stand-up disappearing when a work-this-weekend override is removed', async () => {
    const calendar = await createCalendar({
      overrides: [
        {
          date: SATURDAY,
          name: 'Release weekend',
          effect: 'observed_as_working',
          createdBy: user
        }
      ]
    })
    const overrideId = (calendar as any).overrides[0]._id.toString()
    await addStandup(SATURDAY, 'Scheduled')

    const preview = await previewOverrideRemoval(project.toString(), overrideId, SATURDAY)

    expect(preview.items[0].disposition).toBe('skip')
  })

  it('predicts a stand-up appearing when a day-off override is removed', async () => {
    const calendar = await createCalendar({
      overrides: [
        { date: THURSDAY, name: 'Company offsite', effect: 'non_working', createdBy: user }
      ]
    })
    const overrideId = (calendar as any).overrides[0]._id.toString()

    const preview = await previewOverrideRemoval(project.toString(), overrideId, THURSDAY)

    expect(preview.items[0].disposition).toBe('create')
  })

  it('reports no change for an override id that does not exist', async () => {
    await createCalendar()

    const preview = await previewOverrideRemoval(
      project.toString(),
      new mongoose.Types.ObjectId().toString(),
      THURSDAY
    )

    expect(preview.items).toHaveLength(0)
    expect(preview.hasApplicableChanges).toBe(false)
  })
})

describe('previewWorkingWeekChange', () => {
  useMongo()

  it('names every Friday that would lose its stand-up', async () => {
    await createCalendar()
    await addStandup(FRIDAY, 'Scheduled')
    await addStandup('2026-08-28', 'Scheduled')

    const preview = await previewWorkingWeekChange(
      project.toString(),
      { workingDaysOfWeek: [1, 2, 3, 4] },
      { from: '2026-08-17', to: '2026-08-31' }
    )

    const affected = preview.items.map((item) => item.date)
    expect(affected).toEqual(['2026-08-21', '2026-08-28'])
    expect(preview.items.every((item) => item.disposition === 'skip')).toBe(true)
  })

  it('reports the dates that would gain a stand-up when Saturday is added', async () => {
    await createCalendar()

    const preview = await previewWorkingWeekChange(
      project.toString(),
      { workingDaysOfWeek: [1, 2, 3, 4, 5, 6] },
      { from: '2026-08-17', to: '2026-08-31' }
    )

    expect(preview.items.map((item) => item.date)).toEqual([
      '2026-08-22',
      '2026-08-29'
    ])
    expect(preview.items.every((item) => item.disposition === 'create')).toBe(true)
  })

  it('UI-3 — a blocked completed day does not prevent the rest of the change', async () => {
    await createCalendar()
    await addStandup(FRIDAY, 'Completed')
    await addStandup('2026-08-28', 'Scheduled')

    const preview = await previewWorkingWeekChange(
      project.toString(),
      { workingDaysOfWeek: [1, 2, 3, 4] },
      { from: '2026-08-17', to: '2026-08-31' }
    )

    expect(preview.blockedCount).toBe(1)
    // The 28th can still be skipped, so the change is still worth applying.
    expect(preview.hasApplicableChanges).toBe(true)
  })

  it('omits dates whose working-day state does not change', async () => {
    await createCalendar()

    const preview = await previewWorkingWeekChange(
      project.toString(),
      { workingDaysOfWeek: [1, 2, 3, 4, 5] },
      { from: '2026-08-17', to: '2026-08-31' }
    )

    expect(preview.items).toHaveLength(0)
    expect(preview.summary).toBeTruthy()
  })
})
