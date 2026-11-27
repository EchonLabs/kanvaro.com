/**
 * Process entry point.
 * 1. Load configuration — exit 1 with the list of problems if anything is wrong (1.2).
 * 2. Connect to the database and create the audit log indexes — exit 1 if it can't be
 *    reached (1.3). The server fails closed: no database, no service.
 * 3. Start the HTTP server (1.7) with the MCP endpoint at /mcp (1.8), and stop both
 *    gracefully on SIGTERM / SIGINT.
 * All output is structured JSON logs with secrets removed (1.6).
 */
import { createAuditLog } from './audit.js'
import { mountResourceMetadata, resourceMetadataUrl } from './auth/metadata.js'
import { createTokenExchanger, kanvaroTokenUrl } from './auth/exchange.js'
import { requireKanvaroExchange, requireKanvaroToken } from './auth/middleware.js'
import { createTokenVerifier, kanvaroJwksUrl } from './auth/verify.js'
import type { Config } from './config.js'
import { ConfigError, describeConfig, loadConfig } from './config.js'
import { DatabaseError, connectDatabase, ensureIndexes } from './db/index.js'
import type { Database } from './db/index.js'
import { createApp, finishApp } from './http/app.js'
import { databaseCheck, kanvaroCheck } from './http/health.js'
import { startServer } from './http/server.js'
import { createLogger } from './log.js'
import { createKanvaroClient } from './kanvaro/client.js'
import { createMcpEndpoint, mountMcp } from './mcp/server.js'
import { tools } from './tools/index.js'
import { createRateLimiter } from './tools/limits.js'

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
  const audit = createAuditLog(database.collections.auditLog, log)
  // Discovery: "to use this server, sign in at Kanvaro" (3.1).
  mountResourceMetadata(app, { resourceUrl: config.server.resourceUrl, issuer: config.kanvaro.issuer })
  // Token check (3.2): Kanvaro-issued tokens, verified against Kanvaro's published keys.
  const authenticate = requireKanvaroToken({
    verify: createTokenVerifier({
      issuer: config.kanvaro.issuer,
      audience: config.server.resourceUrl,
      jwksUrl: kanvaroJwksUrl(config.kanvaro.apiBaseUrl),
    }),
    resourceMetadataUrl: resourceMetadataUrl(config.server.resourceUrl),
    resourceUrl: config.server.resourceUrl,
    audit,
  })
  // Token exchange (3.3): the verified MCP token → a Kanvaro API token, in memory only.
  // Refusal → 401 (sign in again); outage → 503 (3.4). Both audited.
  const exchange = requireKanvaroExchange({
    exchanger: createTokenExchanger({
      tokenUrl: kanvaroTokenUrl(config.kanvaro.apiBaseUrl),
      clientId: config.kanvaro.clientId,
      clientSecret: config.kanvaro.clientSecret,
      timeoutMs: config.kanvaro.requestTimeoutMs,
    }),
    resourceMetadataUrl: resourceMetadataUrl(config.server.resourceUrl),
    audit,
  })
  // Kanvaro tools (4.1): each call runs as the signed-in user, rate-limited, filtered, audited.
  const mcp = createMcpEndpoint(log, {
    tools,
    runtime: {
      kanvaro: createKanvaroClient({ baseUrl: config.kanvaro.apiBaseUrl, timeoutMs: config.kanvaro.requestTimeoutMs }),
      audit,
      limiter: createRateLimiter(),
      log,
    },
  })
  mountMcp(app, mcp, {
    publicBaseUrl: config.server.publicBaseUrl,
    host: config.server.host,
    allowedOrigins: config.server.allowedOrigins,
    authenticate: [authenticate, exchange],
    log,
  })
  finishApp(app)

  const server = await startServer(app, config.server.host, config.server.port)
  log.info({ url: server.url, mcp: `${config.server.publicBaseUrl}/mcp`, config: describeConfig(config) }, 'listening')

  let stopping = false
  const stop = (signal: string) => {
    if (stopping) return
    stopping = true
    log.info({ signal }, 'shutting down')
    void server
      .close()
      .then(() => mcp.close())
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
