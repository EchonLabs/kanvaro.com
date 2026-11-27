/**
 * Test database helper. Uses MONGODB_TEST_URI (default mongodb://localhost:27017) and a
 * fresh, uniquely named database per test file, dropped afterwards.
 *
 * If MongoDB is not reachable the database tests are skipped locally, but fail when
 * REQUIRE_MONGO=1 (set in CI), so a missing database never hides failures there.
 */
import { randomBytes } from 'node:crypto'
import { MongoClient } from 'mongodb'

export const TEST_URI = process.env.MONGODB_TEST_URI ?? 'mongodb://localhost:27017'

export async function mongoAvailable(): Promise<boolean> {
  const client = new MongoClient(TEST_URI, { serverSelectionTimeoutMS: 1500 })
  try {
    await client.connect()
    await client.db('admin').command({ ping: 1 })
    return true
  } catch {
    if (process.env.REQUIRE_MONGO === '1') throw new Error(`REQUIRE_MONGO=1 but MongoDB is not reachable at the test URI`)
    return false
  } finally {
    await client.close().catch(() => undefined)
  }
}

export const testDbName = (label: string): string => `kanvaro_mcp_test_${label}_${randomBytes(4).toString('hex')}`
