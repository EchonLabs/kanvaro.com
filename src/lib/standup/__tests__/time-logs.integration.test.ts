/**
 * The logged-time index (Phase 8, Task 6).
 *
 * Every variance number in the module starts here: A, the minutes a member
 * logged on a task on a date. The two things that can silently corrupt it are
 * both proven against a real database rather than reasoned about.
 *
 * **The day boundary is the project's, not UTC's.** A stand-up's date is a
 * calendar date in the project timezone (§7.1). In Colombo (UTC+5:30) an entry
 * at 22:30 local on the 18th is 17:00Z on the 18th — and an entry at 00:15
 * local on the 19th is 18:45Z on the *18th*. A UTC window gets both wrong, in
 * opposite directions, and the resulting variance is wrong by a whole session
 * of work without anything looking broken.
 *
 * **A running timer is not logged work.** Counting one inflates today's actuals
 * against a plan that has not finished being executed.
 */
import mongoose from 'mongoose'

import { TimeEntry } from '@/models/TimeEntry'

import { loadLoggedMinutes, loadTotalLoggedOnTasks } from '../time-logs'

import { ids, useMongo } from './helpers/mongo'

const { organization, project, member } = ids

const other = new mongoose.Types.ObjectId()
const kan214 = new mongoose.Types.ObjectId()
const kan231 = new mongoose.Types.ObjectId()
const kan999 = new mongoose.Types.ObjectId()

const TIMEZONE = 'Asia/Colombo'
const DATE = '2026-08-19'

async function seedEntry(overrides: {
  user?: mongoose.Types.ObjectId
  task?: mongoose.Types.ObjectId
  minutes: number
  startTime: string
  status?: string
  project?: mongoose.Types.ObjectId
}) {
  return TimeEntry.create({
    user: overrides.user ?? member,
    organization,
    project: overrides.project ?? project,
    task: overrides.task ?? kan214,
    description: 'work',
    startTime: new Date(overrides.startTime),
    duration: overrides.minutes,
    isBillable: false,
    status: overrides.status ?? 'completed'
  })
}

const query = (date = DATE) => ({
  projectId: String(project),
  date,
  timezone: TIMEZONE,
  memberIds: [String(member), String(other)]
})

describe('loadLoggedMinutes', () => {
  useMongo()

  it('sums completed entries for one member on one task on one date', async () => {
    await seedEntry({ minutes: 300, startTime: '2026-08-19T09:00:00+05:30' })
    await seedEntry({ minutes: 180, startTime: '2026-08-19T15:00:00+05:30' })
    const index = await loadLoggedMinutes(query())
    expect(index.forMemberTask(String(member), String(kan214))).toBe(480)
  })

  it('excludes an entry that falls on the previous day in the project timezone', async () => {
    // 17:00Z on the 18th is 22:30 local on the 18th — the day before.
    await seedEntry({ minutes: 60, startTime: '2026-08-18T17:00:00Z' })
    const index = await loadLoggedMinutes(query())
    expect(index.forMemberTask(String(member), String(kan214))).toBe(0)
  })

  it('includes an entry that is the previous day in UTC but this day locally', async () => {
    // 18:45Z on the 18th is 00:15 local on the 19th — a UTC window loses it.
    await seedEntry({ minutes: 45, startTime: '2026-08-18T18:45:00Z' })
    const index = await loadLoggedMinutes(query())
    expect(index.forMemberTask(String(member), String(kan214))).toBe(45)
  })

  it('excludes an entry that falls on the next day in the project timezone', async () => {
    await seedEntry({ minutes: 60, startTime: '2026-08-20T09:00:00+05:30' })
    expect((await loadLoggedMinutes(query())).forMemberTask(String(member), String(kan214))).toBe(0)
  })

  it('excludes a running timer', async () => {
    await seedEntry({ minutes: 120, startTime: '2026-08-19T09:00:00+05:30', status: 'running' })
    expect((await loadLoggedMinutes(query())).forMemberTask(String(member), String(kan214))).toBe(0)
  })

  it('excludes a cancelled entry', async () => {
    await seedEntry({ minutes: 120, startTime: '2026-08-19T09:00:00+05:30', status: 'cancelled' })
    expect((await loadLoggedMinutes(query())).forMemberTask(String(member), String(kan214))).toBe(0)
  })

  it('returns zero for a pair with no entries rather than undefined', async () => {
    expect((await loadLoggedMinutes(query())).forMemberTask(String(member), String(kan231))).toBe(0)
  })

  it('keeps two members on the same task apart', async () => {
    await seedEntry({ minutes: 120, startTime: '2026-08-19T09:00:00+05:30' })
    await seedEntry({ user: other, minutes: 60, startTime: '2026-08-19T09:00:00+05:30' })
    const index = await loadLoggedMinutes(query())
    expect(index.forMemberTask(String(member), String(kan214))).toBe(120)
    expect(index.forMemberTask(String(other), String(kan214))).toBe(60)
  })

  it('ignores members outside the stand-up', async () => {
    const stranger = new mongoose.Types.ObjectId()
    await seedEntry({ user: stranger, minutes: 120, startTime: '2026-08-19T09:00:00+05:30' })
    expect((await loadLoggedMinutes(query())).pairs()).toEqual([])
  })

  it('ignores time logged on another project', async () => {
    await seedEntry({
      minutes: 120,
      startTime: '2026-08-19T09:00:00+05:30',
      project: ids.otherProject
    })
    expect((await loadLoggedMinutes(query())).forMemberTask(String(member), String(kan214))).toBe(0)
  })

  it('lists every logged pair so unplanned work can be found (E39)', async () => {
    await seedEntry({ task: kan999, minutes: 90, startTime: '2026-08-19T09:00:00+05:30' })
    expect((await loadLoggedMinutes(query())).pairs()).toContainEqual({
      memberId: String(member),
      taskId: String(kan999),
      minutes: 90
    })
  })

  it('totals a member across every task they touched', async () => {
    await seedEntry({ task: kan214, minutes: 300, startTime: '2026-08-19T09:00:00+05:30' })
    await seedEntry({ task: kan231, minutes: 120, startTime: '2026-08-19T14:00:00+05:30' })
    expect((await loadLoggedMinutes(query())).totalForMember(String(member))).toBe(420)
  })

  it('totals zero for a member who logged nothing', async () => {
    expect((await loadLoggedMinutes(query())).totalForMember(String(other))).toBe(0)
  })

  it('ignores an entry with no task at all', async () => {
    // Kanvaro permits project-level time with no task; it belongs to no
    // allocation and must not appear as unplanned work against one.
    await TimeEntry.create({
      user: member,
      organization,
      project,
      description: 'project admin',
      startTime: new Date('2026-08-19T09:00:00+05:30'),
      duration: 60,
      isBillable: false,
      status: 'completed'
    })
    expect((await loadLoggedMinutes(query())).pairs()).toEqual([])
  })
})

describe('loadTotalLoggedOnTasks', () => {
  useMongo()

  it('returns the running total per task across members and days', async () => {
    await seedEntry({ minutes: 300, startTime: '2026-08-18T09:00:00+05:30' })
    await seedEntry({ user: other, minutes: 180, startTime: '2026-08-19T09:00:00+05:30' })
    const totals = await loadTotalLoggedOnTasks([String(kan214)])
    expect(totals.get(String(kan214))).toBe(480)
  })

  it('returns zero for a task nobody has logged against', async () => {
    const totals = await loadTotalLoggedOnTasks([String(kan231)])
    expect(totals.get(String(kan231))).toBe(0)
  })

  it('returns an empty map for an empty request without querying', async () => {
    expect((await loadTotalLoggedOnTasks([])).size).toBe(0)
  })
})
