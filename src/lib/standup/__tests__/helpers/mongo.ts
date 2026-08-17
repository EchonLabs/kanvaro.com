/**
 * In-memory MongoDB harness for the stand-up integration suites.
 *
 * The rules layers (`working-day`, `capacity`, `calendar-impact`) are pure and
 * tested without a database. This harness exists for the layers that cannot be:
 * the loaders that translate Mongoose documents into a `CalendarContext`, and
 * the preview services that read whatever is actually persisted. Those are
 * exactly the places where a wrong field name or a forgotten `.lean()` produces
 * a defect no unit test can see.
 *
 * Usage:
 *
 *     useMongo()                       // in the describe body
 *     const { projectId } = await seedProject({ ... })
 *
 * `useMongo` registers the lifecycle hooks. Collections are dropped between
 * tests so ordering never matters.
 */
import mongoose from 'mongoose'

/**
 * Registers connect/cleanup/disconnect hooks for the calling suite.
 *
 * Call this inside a `describe`, not at module top level, so a file can mix
 * database-backed and pure tests.
 *
 * The server itself is started once for the whole run by `jest.global-setup.js`.
 * Each worker gets its own **database** on it, keyed by `JEST_WORKER_ID`, so the
 * `deleteMany` sweep below can never wipe a sibling worker's fixtures.
 */
export function useMongo(): void {
  beforeAll(async () => {
    const uri = process.env.MONGO_TEST_URI
    if (!uri) {
      throw new Error(
        'MONGO_TEST_URI is not set. jest.global-setup.js should have started the ' +
          'in-memory server — check globalSetup in jest.config.js.'
      )
    }

    await mongoose.connect(uri, {
      dbName: `standup-test-${process.env.JEST_WORKER_ID ?? '1'}`
    })
  })

  afterEach(async () => {
    // Deleting documents rather than dropping collections keeps the indexes
    // that `unique` constraints depend on — dropping would silently disable
    // the very constraint several of these tests assert.
    const collections = (await mongoose.connection.db?.collections()) ?? []
    await Promise.all(collections.map((collection) => collection.deleteMany({})))
  })

  afterAll(async () => {
    // Only the connection is torn down here. The shared server is stopped once
    // by `jest.global-teardown.js`.
    await mongoose.disconnect()
  })
}

/**
 * Ensures declared indexes exist before a test relies on one.
 *
 * Mongoose builds indexes lazily in the background, so a uniqueness test that
 * writes immediately after connecting can race the index build and pass for the
 * wrong reason. Await this first in any test that asserts a constraint.
 */
export async function syncIndexes(...models: mongoose.Model<any>[]): Promise<void> {
  await Promise.all(models.map((model) => model.syncIndexes()))
}

/** A throwaway ObjectId, for references a test does not care about. */
export const anyId = (): mongoose.Types.ObjectId => new mongoose.Types.ObjectId()

/** Stable ids so a test can talk about "the project" without threading values. */
export const ids = {
  organization: new mongoose.Types.ObjectId(),
  project: new mongoose.Types.ObjectId(),
  otherProject: new mongoose.Types.ObjectId(),
  member: new mongoose.Types.ObjectId(),
  otherMember: new mongoose.Types.ObjectId(),
  user: new mongoose.Types.ObjectId()
}
