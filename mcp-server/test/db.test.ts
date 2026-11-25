import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Collection, Document } from 'mongodb'
import type { Database } from '../src/db/index.js'
import { AUDIT_TTL_INDEX, COLLECTIONS, DatabaseError, connectDatabase, ensureIndexes, indexPlan } from '../src/db/index.js'
import { TEST_URI, mongoAvailable, testDbName } from './helpers/mongo.js'

const available = await mongoAvailable()
const DAY = 24 * 60 * 60

interface IndexInfo { name: string; expireAfterSeconds?: number }
const indexesOf = async <T extends Document>(coll: Collection<T>): Promise<IndexInfo[]> =>
  (await coll.listIndexes().toArray()) as IndexInfo[]

describe.skipIf(!available)('database layer (MongoDB)', () => {
  let database: Database

  beforeAll(async () => {
    database = await connectDatabase({ uri: TEST_URI, name: testDbName('db') })
    await ensureIndexes(database.db, 90)
  })
  afterAll(async () => {
    await database.db.dropDatabase()
    await database.close()
  })

  it('creates only the audit log (no token or client collections — decision D10)', async () => {
    const names = (await database.db.listCollections().toArray()).map(c => c.name).sort()
    expect(names).toEqual(Object.values(COLLECTIONS).sort())
    expect(names).toEqual(['audit_log'])
  })

  it('creates every planned index', async () => {
    const names = (await indexesOf(database.collections.auditLog)).map(i => i.name)
    for (const index of indexPlan(90).auditLog) expect(names).toContain(index.name)
  })

  it('expires audit entries after the retention period', async () => {
    const idx = (await indexesOf(database.collections.auditLog)).find(i => i.name === AUDIT_TTL_INDEX)
    expect(idx?.expireAfterSeconds).toBe(90 * DAY)
  })

  it('is safe to run again (idempotent)', async () => {
    const before = (await indexesOf(database.collections.auditLog)).map(i => i.name)
    await ensureIndexes(database.db, 90)
    expect((await indexesOf(database.collections.auditLog)).map(i => i.name)).toEqual(before)
  })

  it('applies a changed retention period to the existing index', async () => {
    await ensureIndexes(database.db, 30)
    const idx = (await indexesOf(database.collections.auditLog)).find(i => i.name === AUDIT_TTL_INDEX)
    expect(idx?.expireAfterSeconds).toBe(30 * DAY)
    await ensureIndexes(database.db, 90)
  })

  it('writes and reads an audit entry', async () => {
    const res = await database.collections.auditLog.insertOne({ at: new Date(), requestId: 'r1', action: 'tasks_list', outcome: 'ok', userId: 'u1', clientId: 'kanvaro-claude-code' })
    expect(await database.collections.auditLog.findOne({ _id: res.insertedId })).toMatchObject({ action: 'tasks_list', outcome: 'ok' })
  })
})

describe('connectDatabase', () => {
  it('fails fast with an error that does not contain the URI', async () => {
    const uri = 'mongodb://user:secret-password@127.0.0.1:1/?directConnection=true'
    const err = await connectDatabase({ uri, name: 'x', serverSelectionTimeoutMS: 300 }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DatabaseError)
    expect(String((err as Error).message)).not.toContain('secret-password')
  })
})
