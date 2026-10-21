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

  /**
   * `toErrorResponse` forwards a validator's message straight to the client,
   * deliberately — it is "the only text that says what to fix", and it is safe
   * precisely because these messages are authored in the schema. `description`
   * holds up its end. The two enums did not, so they fell through to Mongoose's
   * default, and a bad severity reached the user as
   * `` `nuclear` is not a valid enum value for path `severity`. `` — ODM
   * vocabulary, naming an internal path, and not saying what the valid values
   * are. That is the one case the surfacing decision does not cover.
   */
  describe('enum rejections read as authored copy, not as Mongoose internals', () => {
    const cases = [
      { field: 'severity', bad: 'nuclear', expected: /low, medium, high or critical/i },
      { field: 'blockerType', bad: 'interpretive_dance', expected: /blocker type/i }
    ]

    it.each(cases)('$field names the values it will accept', async ({ field, bad, expected }) => {
      await expect(
        StandupBlocker.create(baseBlocker({ [field]: bad }))
      ).rejects.toThrow(expected)
    })

    it.each(cases)('$field does not leak `path` or backticks', async ({ field, bad }) => {
      const error = await StandupBlocker.create(baseBlocker({ [field]: bad })).catch((e) => e)
      const message = error.errors[field].message

      expect(message).not.toMatch(/`/)
      expect(message).not.toMatch(/\bpath\b/i)
      expect(message).not.toMatch(/enum value/i)
    })
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
