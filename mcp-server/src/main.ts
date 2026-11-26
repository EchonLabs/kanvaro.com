/**
 * Process entry point.
 * 1. Load configuration — exit 1 with the list of problems if anything is wrong (1.2).
 * 2. Connect to the database and create the audit log indexes — exit 1 if it can't be
 *    reached (1.3). The server fails closed: no database, no service.
 * 3. Start the HTTP server (1.7) and stop it gracefully on SIGTERM / SIGINT.
 * All output is structured JSON logs with secrets removed (1.6).
 */
import type { Config } from './config.js'
import { ConfigError, describeConfig, loadConfig } from './config.js'
import { DatabaseError, connectDatabase, ensureIndexes } from './db/index.js'
import type { Database } from './db/index.js'
import { createApp, finishApp } from './http/app.js'
import { databaseCheck, kanvaroCheck } from './http/health.js'
import { startServer } from './http/server.js'
import { createLogger } from './log.js'

async function main(): Promise<void> {
  // Before the configuration is read, log at the default level.
  const boot = createLogger()

  let config: Config
  try {
    config = loadConfig()
  } catch (err) {
    if (err instanceof ConfigError) {
      boot.fatal({ problems: err.problems }, 'cannot start: invalid configuration')
      process.exit(1)
    }
    throw err
  }
  const log = createLogger({ level: config.log.level })

  let database: Database
  try {
    database = await connectDatabase({ uri: config.database.uri, name: config.database.name })
    await ensureIndexes(database.db, config.audit.retentionDays)
  } catch (err) {
    if (err instanceof DatabaseError) {
      log.fatal({ err }, 'cannot start: database unavailable')
      process.exit(1)
    }
    throw err
  }

  const app = createApp({
    log,
    trustProxy: config.server.trustProxy,
    readiness: { database: databaseCheck(database.db), kanvaro: kanvaroCheck(config.kanvaro.apiBaseUrl) },
  })
  // The MCP endpoint (1.8) and sign-in parts (Phase 3) are registered here, before finishApp.
  finishApp(app)

  const server = await startServer(app, config.server.host, config.server.port)
  log.info({ url: server.url, config: describeConfig(config) }, 'listening')

  let stopping = false
  const stop = (signal: string) => {
    if (stopping) return
    stopping = true
    log.info({ signal }, 'shutting down')
    void server
      .close()
      .then(() => database.close())
      .then(() => {
        log.info('stopped')
        process.exit(0)
      })
      .catch((err: unknown) => {
        log.error({ err }, 'shutdown failed')
        process.exit(1)
      })
  }
  process.once('SIGTERM', () => stop('SIGTERM'))
  process.once('SIGINT', () => stop('SIGINT'))
}

await main()
