/**
 * Process entry point.
 * 1. Load configuration — exit 1 with the list of problems if anything is wrong (1.2).
 * 2. Connect to the MCP server database and create collections/indexes — exit 1 if the
 *    database can't be reached (1.3). The server fails closed: no database, no service.
 *
 * Later tasks add logging (1.6) and the HTTP/MCP server (1.7, 1.8).
 */
import type { Config } from './config.js'
import { ConfigError, describeConfig, loadConfig } from './config.js'
import { DatabaseError, connectDatabase, ensureIndexes } from './db/index.js'
import { serverInfo } from './index.js'

function fail(message: string): never {
  console.error(`${serverInfo.name}: cannot start.\n${message}`)
  process.exit(1)
}

async function main(): Promise<void> {
  let config: Config
  try {
    config = loadConfig()
  } catch (err) {
    if (err instanceof ConfigError) fail(err.message)
    throw err
  }

  let database
  try {
    database = await connectDatabase({ uri: config.database.uri, name: config.database.name })
    await ensureIndexes(database.db, config.audit.retentionDays)
  } catch (err) {
    if (err instanceof DatabaseError) fail(err.message)
    throw err
  }

  // Temporary until the logging module (1.6) and HTTP server (1.7) exist.
  process.stdout.write(`${JSON.stringify({ msg: 'started', server: serverInfo, config: describeConfig(config), database: 'ready' })}\n`)
  await database.close()
}

await main()
