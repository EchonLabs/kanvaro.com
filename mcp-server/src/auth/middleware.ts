/**
 * Sign-in middleware for /mcp: token check (3.2), token exchange (3.3), and the
 * sign-in-again path with audit entries (3.4).
 *
 * Only the Authorization header counts (a token in the URL is ignored). On success the token
 * check sets `req.auth` — which the SDK's Node adapter passes to the MCP server as `authInfo` —
 * and adds the user and client to the request's log context.
 *
 *   no token                       → 401  WWW-Authenticate: Bearer resource_metadata="…", scope="kanvaro"
 *   bad / expired token            → 401  … error="invalid_token"         audit: token.rejected
 *   missing scope                  → 403  … error="insufficient_scope"    audit: token.rejected
 *   Kanvaro keys unreachable       → 503  Retry-After                     audit: token.check_failed
 *   exchange refused (access ended) → 401  … error="invalid_token"         audit: exchange.refused
 *   exchange failed / misconfigured → 503  Retry-After                     audit: exchange.failed
 *   first exchange of a session    → continue                             audit: session.exchange
 *
 * A 401 makes clients such as Claude Code refresh their token or sign in again; a 503 does
 * not, so an outage never pushes users through sign-in.
 */
import type { AuthInfo } from '@modelcontextprotocol/server'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { AuditLog } from '../audit.js'
import { noAudit } from '../audit.js'
import { localsOf } from '../http/app.js'
import { runSignedIn } from './context.js'
import type { TokenExchanger } from './exchange.js'
import { ExchangeError } from './exchange.js'
import { SCOPE } from './metadata.js'
import type { TokenVerifier, VerifiedToken } from './verify.js'
import { TokenError } from './verify.js'

export interface AuthenticatedLocals {
  auth: VerifiedToken
}

export function authOf(res: Response): VerifiedToken | undefined {
  return (res.locals as Partial<AuthenticatedLocals>).auth
}

const BEARER = /^Bearer[ ]+([A-Za-z0-9\-._~+/]+=*)\s*$/i

const challengeFor = (resourceMetadataUrl: string, error?: 'invalid_token' | 'insufficient_scope') =>
  `Bearer ${error ? `error="${error}", ` : ''}resource_metadata="${resourceMetadataUrl}", scope="${SCOPE}"`

function unavailable(res: Response, description: string): void {
  res.setHeader('Retry-After', '5')
  res.status(503).json({ error: 'temporarily_unavailable', error_description: description })
}

export interface RequireTokenOptions {
  verify: TokenVerifier
  /** e.g. https://mcp.example.com/.well-known/oauth-protected-resource/mcp */
  resourceMetadataUrl: string
  /** This server's /mcp URL (the token audience), passed on as authInfo.resource. */
  resourceUrl: string
  audit?: AuditLog
}

export function requireKanvaroToken(opts: RequireTokenOptions): RequestHandler {
  const audit = opts.audit ?? noAudit

  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.get('authorization')
    const match = header ? BEARER.exec(header) : null
    if (!match?.[1]) {
      // The normal first step of every connection (discovery): not audited.
      res.setHeader('WWW-Authenticate', challengeFor(opts.resourceMetadataUrl))
      res.status(401).json({ error: 'invalid_token', error_description: 'Sign in to Kanvaro to use this server.' })
      return
    }

    opts.verify(match[1]).then(
      verified => {
        const authInfo: AuthInfo = {
          token: verified.token,
          clientId: verified.clientId,
          scopes: verified.scopes,
          expiresAt: verified.expiresAt,
          resource: new URL(opts.resourceUrl),
          extra: { userId: verified.userId, jti: verified.jti },
        }
        ;(req as Request & { auth?: AuthInfo }).auth = authInfo
        res.locals.auth = verified
        const locals = localsOf(res)
        locals.log = locals.log.child({ userId: verified.userId, clientId: verified.clientId })
        next()
      },
      (err: unknown) => {
        const { log, requestId } = localsOf(res)
        const base = { requestId, ...(req.ip ? { ip: req.ip } : {}) }

        if (err instanceof TokenError && err.kind === 'unavailable') {
          log.error({ reason: err.message }, 'token check unavailable')
          void audit.record({ ...base, action: 'token.check_failed', outcome: 'error', detail: err.message })
          unavailable(res, 'Kanvaro sign-in is temporarily unavailable; try again shortly.')
          return
        }
        const scope = err instanceof TokenError && err.kind === 'insufficient_scope'
        const reason = err instanceof TokenError ? err.message : 'token is not valid'
        log.warn({ reason }, 'token rejected')
        // The token is not trusted, so no user id is recorded; capped per IP address.
        void audit.recordLimited({ ...base, action: 'token.rejected', outcome: 'refused', detail: reason })
        res.setHeader('WWW-Authenticate', challengeFor(opts.resourceMetadataUrl, scope ? 'insufficient_scope' : 'invalid_token'))
        if (scope) res.status(403).json({ error: 'insufficient_scope', error_description: reason })
        else res.status(401).json({ error: 'invalid_token', error_description: 'Your sign-in is no longer valid; sign in to Kanvaro again.' })
      },
    )
  }
}

export interface ExchangeOptions {
  exchanger: TokenExchanger
  resourceMetadataUrl: string
  audit?: AuditLog
}

/**
 * Token exchange for /mcp (task 3.3). Runs after requireKanvaroToken: swaps the verified MCP
 * token for a Kanvaro API token (cached) and runs the rest of the request inside the
 * signed-in context, where tools read it with withKanvaroToken().
 */
export function requireKanvaroExchange(opts: ExchangeOptions): RequestHandler {
  const audit = opts.audit ?? noAudit

  return (req: Request, res: Response, next: NextFunction) => {
    const mcp = authOf(res)
    const { log, requestId } = localsOf(res)
    if (!mcp) {
      log.error('exchange middleware ran without a verified token')
      res.status(500).json({ error: 'internal_error', requestId })
      return
    }
    const base = { requestId, userId: mcp.userId, clientId: mcp.clientId, ...(req.ip ? { ip: req.ip } : {}) }

    opts.exchanger.exchangeWithInfo(mcp).then(
      ({ kanvaro, first }) => {
        // First exchange of this session only; the once-a-minute re-checks are not audited.
        if (first) void audit.record({ ...base, action: 'session.exchange', outcome: 'ok' })
        runSignedIn({ requestId, ...(req.ip ? { ip: req.ip } : {}), mcp, kanvaro, exchanger: opts.exchanger }, () => next())
      },
      (err: unknown) => {
        if (err instanceof ExchangeError && err.kind === 'refused') {
          log.warn({ reason: err.message }, 'exchange refused')
          void audit.record({ ...base, action: 'exchange.refused', outcome: 'refused', detail: err.message })
          res.setHeader('WWW-Authenticate', challengeFor(opts.resourceMetadataUrl, 'invalid_token'))
          res.status(401).json({ error: 'invalid_token', error_description: 'Your Kanvaro access has ended; sign in to Kanvaro again.' })
          return
        }
        const kind = err instanceof ExchangeError ? err.kind : 'unavailable'
        const reason = err instanceof Error ? err.message : 'unknown'
        if (kind === 'misconfigured') log.error({ reason, status: (err as ExchangeError).status }, 'exchange misconfigured')
        else log.error({ reason }, 'exchange unavailable')
        void audit.record({ ...base, action: 'exchange.failed', outcome: 'error', detail: `${kind}: ${reason}` })
        unavailable(res, 'Kanvaro is temporarily unavailable; try again shortly.')
      },
    )
  }
}
