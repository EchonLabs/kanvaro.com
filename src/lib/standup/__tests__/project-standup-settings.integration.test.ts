/**
 * `ProjectStandupSettings` cross-field validation on the **update** path.
 *
 * The `carryForwardEscalationThreshold` validator compares against a sibling
 * field. Mongoose binds `this` to the document on `save()` but to the *Query*
 * on `findOneAndUpdate()`, so a validator written as `this.siblingField` reads
 * `undefined` on the path the settings API actually uses — and every save of
 * every field on the settings screen fails with a 500, whatever the payload.
 *
 * The model tests covered `save()` only, which is precisely the path where the
 * bug cannot appear. These cases pin the update path.
 */
import {
  ProjectStandupSettings,
  type IProjectStandupSettings
} from '@/models/ProjectStandupSettings'

import { ids, useMongo } from './helpers/mongo'

const base = () => ({
  project: ids.project,
  organization: ids.organization
})

describe('ProjectStandupSettings — carry-forward threshold validation', () => {
  useMongo()

  it('accepts an unrelated field change through findOneAndUpdate', async () => {
    const updated = (await ProjectStandupSettings.findOneAndUpdate(
      { project: ids.project },
      { $set: { ...base(), ceremoniesConsumeCapacity: false } },
      { new: true, upsert: true, runValidators: true }
    ).lean()) as IProjectStandupSettings | null

    expect(updated?.ceremoniesConsumeCapacity).toBe(false)
  })

  it('accepts a valid escalation threshold set alongside its note threshold', async () => {
    const updated = (await ProjectStandupSettings.findOneAndUpdate(
      { project: ids.project },
      {
        $set: {
          ...base(),
          carryForwardNoteThreshold: 3,
          carryForwardEscalationThreshold: 9
        }
      },
      { new: true, upsert: true, runValidators: true }
    ).lean()) as IProjectStandupSettings | null

    expect(updated?.carryForwardEscalationThreshold).toBe(9)
  })

  it('accepts an escalation threshold that clears the stored note threshold', async () => {
    await ProjectStandupSettings.create({ ...base(), carryForwardNoteThreshold: 4 })

    const updated = (await ProjectStandupSettings.findOneAndUpdate(
      { project: ids.project },
      { $set: { carryForwardEscalationThreshold: 6 } },
      { new: true, runValidators: true }
    ).lean()) as IProjectStandupSettings | null

    expect(updated?.carryForwardEscalationThreshold).toBe(6)
  })

  it('still rejects an escalation threshold at or below the note threshold', async () => {
    await expect(
      ProjectStandupSettings.findOneAndUpdate(
        { project: ids.project },
        {
          $set: {
            ...base(),
            carryForwardNoteThreshold: 5,
            carryForwardEscalationThreshold: 5
          }
        },
        { new: true, upsert: true, runValidators: true }
      )
    ).rejects.toThrow(/Escalation threshold must exceed the note threshold/)
  })

  it('still rejects one that falls below the stored note threshold', async () => {
    await ProjectStandupSettings.create({
      ...base(),
      carryForwardNoteThreshold: 8,
      carryForwardEscalationThreshold: 9
    })

    await expect(
      ProjectStandupSettings.findOneAndUpdate(
        { project: ids.project },
        { $set: { carryForwardEscalationThreshold: 6 } },
        { new: true, runValidators: true }
      )
    ).rejects.toThrow(/Escalation threshold must exceed the note threshold/)
  })

  it('still rejects on the save() path, which already worked', async () => {
    await expect(
      ProjectStandupSettings.create({
        ...base(),
        carryForwardNoteThreshold: 5,
        carryForwardEscalationThreshold: 2
      })
    ).rejects.toThrow(/Escalation threshold must exceed the note threshold/)
  })
})
