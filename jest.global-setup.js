/**
 * Starts one in-memory MongoDB for the whole test run.
 *
 * Each integration file used to create its own `MongoMemoryServer`. That works
 * when a file is run alone, but under Jest's parallel workers several `mongod`
 * processes start at once and contend for CPU and ports — which showed up as an
 * integration suite that passed in isolation and failed intermittently in the
 * full run. One server, started once, removes the contention entirely and is
 * substantially faster.
 *
 * Workers isolate themselves by database name, not by server (see
 * `__tests__/helpers/mongo.ts`), so parallelism is preserved.
 */
const { MongoMemoryServer } = require('mongodb-memory-server')

module.exports = async function globalSetup() {
  const server = await MongoMemoryServer.create()

  // `globalTeardown` runs in a different module scope, so the handle is stashed
  // on globalThis rather than in a module-level variable.
  globalThis.__MONGO_SERVER__ = server
  process.env.MONGO_TEST_URI = server.getUri()
}
