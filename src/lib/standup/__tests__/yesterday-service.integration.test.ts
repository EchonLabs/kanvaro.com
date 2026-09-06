/**
 * Panel 2's loader (Phase 8, Task 11 — §10.2 step 2, RUN-9, RUN-12, E39).
 *
 * Two properties are proven against the database because neither can be
 * reasoned about safely:
 *
 *   **"Yesterday" is the previous stand-up in the sprint that actually ran.**
 *   Not the previous calendar date, and not a skipped or cancelled day. Get it
 *   wrong after a weekend and the panel compares Monday against Sunday, which
 *   planned nothing.
 *
 *   **Unplanned work appears (E39).** Time logged against a task nobody
 *   planned for that member is real work; a panel that only renders
 *   allocations makes it disappear, and the member's logged total stops adding
 *   up against what the board showed.
 */
import { Allocation } from '@/models/Allocation'
import { Standup } from '@/models/Standup'
import { Task } from '@/models/Task'
import { TimeEntry } from '@/models/TimeEntry'

import { loadYesterdayPanel } from '../yesterday-service'

import { useMongo } from './helpers/mongo'
import { FIXTURE_DAY_3, seedWorkedExample } from './helpers/worked-example-seed'

const allRows = (panel: Awaited<ReturnType<typeof loadYesterdayPanel>>) =>
  panel.buckets.flatMap((bucket) => bucket.rows)

const rowFor = (panel: Awaited<ReturnType<typeof loadYesterdayPanel>>, key: string) =>
  allRows(panel).find((row) => row.taskKey === key)!

describe('loadYesterdayPanel', () => {
  useMongo()

  it('reads yesterday as the previous stand-up in the sprint', async () => {
    const { day3, day4 } = await seedWorkedExample()
    const panel = await loadYesterdayPanel(day4)
    expect(panel.previousStandupId).toBe(day3)
    expect(panel.previousStandupDate).toBe(FIXTURE_DAY_3)
  })

  it('skips a stand-up that never ran when resolving yesterday', async () => {
    const { day3, day4, day5 } = await seedWorkedExample()
    await Standup.updateOne({ _id: day4 }, { $set: { status: 'Skipped_Holiday' } })
    expect((await loadYesterdayPanel(day5)).previousStandupId).toBe(day3)
  })

  it('returns four empty buckets for a stand-up with no yesterday', async () => {
    const { day3 } = await seedWorkedExample()
    const panel = await loadYesterdayPanel(day3)
    expect(panel.previousStandupId).toBeUndefined()
    expect(panel.buckets).toHaveLength(4)
    expect(allRows(panel)).toEqual([])
  })

  it('shows every RUN-12 field on a planned row', async () => {
    const { day4, kasunId } = await seedWorkedExample()
    const row = rowFor(await loadYesterdayPanel(day4), 'KAN-214')

    expect(row).toMatchObject({
      taskKey: 'KAN-214',
      title: 'Invoice model',
      memberId: kasunId,
      memberName: 'Kasun Perera',
      previousStatus: 'in_progress',
      currentStatus: 'in_progress',
      plannedMinutes: 360,
      loggedMinutes: 480,
      dayVarianceMinutes: 120,
      unplanned: false
    })
    expect(row.allocationId).toBeDefined()
    expect(row.ageInStandups).toBe(1)
  })

  it('reports a negative day variance for planned time nobody spent', async () => {
    const { day4 } = await seedWorkedExample()
    const row = rowFor(await loadYesterdayPanel(day4), 'KAN-231')
    expect(row.loggedMinutes).toBe(0)
    expect(row.dayVarianceMinutes).toBe(-120)
  })

  it('buckets the worked example the way §12.3 describes', async () => {
    const { day4 } = await seedWorkedExample()
    const panel = await loadYesterdayPanel(day4)

    const inProgress = panel.buckets.find((bucket) => bucket.bucket === 'in_progress')!
    const notStarted = panel.buckets.find((bucket) => bucket.bucket === 'not_started')!

    expect(inProgress.rows.map((row) => row.taskKey)).toEqual(['KAN-214'])
    expect(notStarted.rows.map((row) => row.taskKey)).toEqual(['KAN-231'])
  })

  it('moves a finished task into the completed bucket', async () => {
    const { day4, kan214 } = await seedWorkedExample()
    await Task.updateOne({ _id: kan214 }, { $set: { status: 'done' } })

    const panel = await loadYesterdayPanel(day4)
    expect(
      panel.buckets.find((bucket) => bucket.bucket === 'completed')!.rows.map((row) => row.taskKey)
    ).toEqual(['KAN-214'])
  })

  it('shows time logged against an unallocated task as an unplanned row (E39)', async () => {
    const example = await seedWorkedExample()
    const stray = await Task.create({
      title: 'Production incident',
      organization: example.organizationId,
      project: example.projectId,
      sprint: example.sprintId,
      createdBy: example.pmId,
      taskNumber: 999,
      displayId: 'KAN-999',
      status: 'in_progress'
    })
    await TimeEntry.create({
      user: example.kasunId,
      organization: example.organizationId,
      project: example.projectId,
      task: stray._id,
      description: 'incident',
      startTime: new Date(`${FIXTURE_DAY_3}T16:00:00+05:30`),
      duration: 90,
      isBillable: false,
      status: 'completed'
    })

    const row = rowFor(await loadYesterdayPanel(example.day4), 'KAN-999')
    expect(row.unplanned).toBe(true)
    expect(row.allocationId).toBeUndefined()
    expect(row.loggedMinutes).toBe(90)
    expect(row.plannedMinutes).toBe(0)
  })

  it('ages a carried allocation past its first stand-up (RUN-12)', async () => {
    const example = await seedWorkedExample()
    await Allocation.updateOne(
      { _id: example.allocations['KAN-214'] },
      { $set: { carryChainRoot: example.allocations['KAN-214'] } }
    )
    expect(rowFor(await loadYesterdayPanel(example.day4), 'KAN-214').ageInStandups).toBe(2)
  })

  it('prefers the task spill count once Phase 9 maintains it', async () => {
    const example = await seedWorkedExample()
    await Task.updateOne({ _id: example.kan214 }, { $set: { standupSpillCount: 5 } })
    expect(rowFor(await loadYesterdayPanel(example.day4), 'KAN-214').ageInStandups).toBe(5)
  })
})
