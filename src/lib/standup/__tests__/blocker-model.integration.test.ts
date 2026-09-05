/**
 * The `StandupBlocker` document against the database (Phase 10, Task 1).
 *
 * The model enforces two key validation rules:
 * 1. A blocker description must be at least 10 characters.
 * 2. A resolution note is required and must be at least 10 characters when
 *    a blocker status moves to `resolved` or `wont_resolve`.
 *
 * Both are proven here against the actual schema validators.
 */
import mongoose from 'mongoose'

import { StandupBlocker } from '@/models/StandupBlocker'

import { ids, syncIndexes, useMongo } from './helpers/mongo'

const { organization, project, sprint, member: raisedBy } = ids

const standup = new mongoose.Types.ObjectId()

const baseBlocker = (overrides: Record<string, unknown> = {}) => ({
  standup,
  sprint,
  project,
  organization,
  raisedBy,
  description: 'Vendor sandbox is down',
  blockerType: 'external_party',
  severity: 'high',
  ...overrides
})

describe('StandupBlocker model', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(StandupBlocker)
  })

  it('rejects a description under 10 characters', async () => {
    await expect(StandupBlocker.create(baseBlocker({ description: 'too short' }))).rejects.toThrow(
      /10 characters/
    )
  })

  it('defaults status to open', async () => {
    const blocker = await StandupBlocker.create(baseBlocker())
    expect(blocker.status).toBe('open')
  })

  it('requires a resolution note of at least 10 characters when resolving', async () => {
    await expect(
      StandupBlocker.create(baseBlocker({ status: 'resolved', resolutionNote: 'ok' }))
    ).rejects.toThrow(/resolution note/)
  })

  it('accepts a resolved blocker with a full resolution note', async () => {
    const blocker = await StandupBlocker.create(
      baseBlocker({ status: 'resolved', resolutionNote: 'Vendor restored sandbox access this morning.' })
    )
    expect(blocker.status).toBe('resolved')
  })
})
