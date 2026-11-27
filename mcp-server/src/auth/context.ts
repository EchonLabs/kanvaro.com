/**
 * Per-request sign-in context (task 3.3).
 *
 * Set by the exchange middleware and readable anywhere in the same request — including
 * inside MCP tool handlers — through AsyncLocalStorage. This is how tools get the user's
 * Kanvaro API token without it ever passing through anything that is logged or returned.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { KanvaroAuthError } from '../kanvaro/client.js'
import type { ExchangeError, KanvaroToken, TokenExchanger } from './exchange.js'
import type { VerifiedToken } from './verify.js'

export interface SignedInContext {
  requestId: string
  /** Caller's IP address (as resolved with TRUST_PROXY), for audit entries. */
  ip?: string
  /** The verified MCP token (user, client, expiry). */
  mcp: VerifiedToken
  /** The current Kanvaro API token for this user. */
  kanvaro: KanvaroToken
  exchanger: TokenExchanger
}

const storage = new AsyncLocalStorage<SignedInContext>()

export function runSignedIn<T>(ctx: SignedInContext, fn: () => T): T {
  return storage.run(ctx, fn)
}

/** The signed-in context of the current request, or undefined outside one. */
export function currentSignIn(): SignedInContext | undefined {
  return storage.getStore()
}

/** Thrown when Kanvaro no longer accepts the user's access mid-request. */
export class SessionEndedError extends Error {
  constructor(cause?: ExchangeError | KanvaroAuthError) {
    super('Your Kanvaro sign-in has ended. Reconnect to sign in again.', { cause })
    this.name = 'SessionEndedError'
  }
}

/**
 * Runs `fn` with the user's Kanvaro API token. If Kanvaro answers 401 (token expired or
 * revoked in the meantime), the cached token is dropped, exchanged once more, and `fn`
 * retried once; a second 401 or a refused exchange ends the session.
 */
export async function withKanvaroToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
  const ctx = currentSignIn()
  if (!ctx) throw new Error('withKanvaroToken called outside a signed-in request')
  try {
    return await fn(ctx.kanvaro.token)
  } catch (err) {
    if (!(err instanceof KanvaroAuthError)) throw err
    ctx.exchanger.invalidate(ctx.mcp.token)
    try {
      ctx.kanvaro = await ctx.exchanger.exchange(ctx.mcp)
    } catch (exchangeErr) {
      if ((exchangeErr as ExchangeError).kind === 'refused') throw new SessionEndedError(exchangeErr as ExchangeError)
      throw exchangeErr
    }
    try {
      return await fn(ctx.kanvaro.token)
    } catch (again) {
      if (again instanceof KanvaroAuthError) {
        ctx.exchanger.invalidate(ctx.mcp.token)
        throw new SessionEndedError(again)
      }
      throw again
    }
  }
}
