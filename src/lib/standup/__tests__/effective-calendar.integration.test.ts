/**
 * A project that has never saved a calendar inherits the organisation's time
 * zone from Global Settings (and its day length from the org calendar) with no
 * PM action, and follows later changes to that setting.
 */
import { Organization } from '@/models/Organization'
import { Project } from '@/models/Project'
import { WorkingCalendar } from '@/models/WorkingCalendar'

import { loadEffectiveCalendarSettings } from '../effective-calendar'
import { ids, useMongo } from './helpers/mongo'

const { organization, project, user } = ids

describe('loadEffectiveCalendarSettings', () => {
  useMongo()

  beforeEach(async () => {
    await Organization.collection.insertOne({
      _id: organization,
      name: 'Org',
      timezone: 'Asia/Colombo'
    } as any)
    await Project.collection.insertOne({ _id: project, name: 'P', organization } as any)
  })

  it('inherits the Global Settings time zone when the project has no calendar', async () => {
    const result = await loadEffectiveCalendarSettings([String(project)])

    expect(result.get(String(project))).toEqual({
      timezone: 'Asia/Colombo',
      standardMinutesPerDay: 480,
      inherited: true
    })
  })

  it('follows a later change to the Global Settings time zone', async () => {
    await WorkingCalendar.create({
      scope: 'organization',
      organization,
      timezone: 'UTC', // stale seed from when the org calendar was first created
      standardMinutesPerDay: 420
    })
    await Organization.collection.updateOne({ _id: organization }, { $set: { timezone: 'Asia/Kolkata' } })

    const result = await loadEffectiveCalendarSettings([String(project)])

    expect(result.get(String(project))).toMatchObject({
      timezone: 'Asia/Kolkata',
      standardMinutesPerDay: 420,
      inherited: true
    })
  })

  it("keeps a project's own calendar when it has saved one", async () => {
    await WorkingCalendar.create({
      scope: 'project',
      organization,
      project,
      timezone: 'America/New_York',
      standardMinutesPerDay: 360,
      createdBy: user
    })

    const result = await loadEffectiveCalendarSettings([String(project)])

    expect(result.get(String(project))).toEqual({
      timezone: 'America/New_York',
      standardMinutesPerDay: 360,
      inherited: false
    })
  })
})
