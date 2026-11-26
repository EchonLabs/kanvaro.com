/**
 * Express application (task 1.7).
 *
 * - Every request gets a request id (kept from X-Request-Id if plain, else new), returned
 *   in the X-Request-Id response header and carried on its log lines.
 * - Security headers on every response; no X-Powered-By.
 * - One access-log line per request: method, path (never the query string, which could
 *   hold codes or tokens), status, duration.
 * - Unknown routes → 404 JSON; any error → 500 JSON with the request id and no details.
 *
 * The MCP endpoint (1.8) and the sign-in parts (Phase 3) are added to this app later.
 */
import express from 'express'
import type { Express, NextFunction, Request, Response } from 'express'
import type { Logger } from '../log.js'
import { requestIdFrom } from '../log.js'
import type { ReadinessChecks } from './health.js'
import { runChecks } from './health.js'

export interface AppDeps {
  log: Logger
  readiness: ReadinessChecks
  trustProxy: boolean | number | string
}

export interface RequestLocals {
  requestId: string
  log: Logger
}

/** The request id and logger set by the request-context middleware. */
export function localsOf(res: Response): RequestLocals {
  return res.locals as RequestLocals
}

const QUIET_PATHS = new Set(['/health', '/ready'])

export function createApp(deps: AppDeps): Express {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', deps.trustProxy)

  // Request context: id + child logger.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = requestIdFrom(req.get('x-request-id'))
    res.locals.requestId = requestId
    res.locals.log = deps.log.child({ requestId })
    res.setHeader('X-Request-Id', requestId)
    next()
  })

  // Security headers. Responses are API data: never cached, never sniffed.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Frame-Options', 'DENY')
    next()
  })

  // Access log.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const started = process.hrtime.bigint()
    res.on('finish', () => {
      const entry = { method: req.method, path: req.path, status: res.statusCode, durationMs: Number(process.hrtime.bigint() - started) / 1e6 }
      const { log } = localsOf(res)
      if (QUIET_PATHS.has(req.path)) log.debug(entry, 'request')
      else log.info(entry, 'request')
    })
    next()
  })

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' })
  })

  app.get('/ready', async (_req: Request, res: Response) => {
    const result = await runChecks(deps.readiness)
    res.status(result.ready ? 200 : 503).json({ status: result.ready ? 'ready' : 'not_ready', checks: result.checks })
  })

  return app
}

/** Adds the 404 and error handlers. Call after all routes are registered. */
export function finishApp(app: Express): Express {
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'not_found' })
  })
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const { log, requestId } = localsOf(res)
    log.error({ err }, 'request failed')
    if (res.headersSent) return next(err)
    res.status(500).json({ error: 'internal_error', requestId })
  })
  return app
}
