/**
 * OAuth helpers for tests: drive a full sign-in against the Kanvaro stand-in, the way
 * Claude Code does (PKCE, authorize redirect, code exchange), and call token exchange.
 */
import { createHash, randomBytes } from 'node:crypto'
import type { StubKanvaro } from '../stub-kanvaro/stub.js'
import { ACCESS_TOKEN_TYPE, TOKEN_EXCHANGE_GRANT } from '../stub-kanvaro/stub.js'

export const CLAUDE_CLIENT = 'kanvaro-claude-code'
export const REDIRECT = 'http://localhost:33418/callback'

export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

export const form = (body: Record<string, string | undefined>): URLSearchParams =>
  new URLSearchParams(Object.entries(body).filter((e): e is [string, string] => e[1] !== undefined))

export async function tokenRequest(stub: StubKanvaro, body: Record<string, string | undefined>, basic?: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${stub.url}/api/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(basic ? { Authorization: `Basic ${Buffer.from(basic).toString('base64')}` } : {}) },
    body: form(body),
  })
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

export interface SignInResult { accessToken: string; refreshToken: string; code: string; verifier: string; status: number; json: Record<string, unknown> }

/** Full sign-in against the stand-in for its configured user; returns the MCP tokens. */
export async function signIn(stub: StubKanvaro, opts: { redirectUri?: string; resource?: string } = {}): Promise<SignInResult> {
  const redirectUri = opts.redirectUri ?? REDIRECT
  const resource = opts.resource ?? stub.options.mcpResource
  const { verifier, challenge } = pkce()
  const auth = new URL(`${stub.url}/oauth/authorize`)
  for (const [k, v] of Object.entries({ response_type: 'code', client_id: CLAUDE_CLIENT, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: 'S256', state: 'st', resource, scope: 'kanvaro' })) auth.searchParams.set(k, v)
  const loc = (await fetch(auth, { redirect: 'manual' })).headers.get('location')
  const code = loc ? new URL(loc).searchParams.get('code') ?? '' : ''
  const res = await tokenRequest(stub, { grant_type: 'authorization_code', client_id: CLAUDE_CLIENT, code, redirect_uri: redirectUri, code_verifier: verifier, resource })
  const text = (v: unknown) => (typeof v === 'string' ? v : '')
  return { accessToken: text(res.json.access_token), refreshToken: text(res.json.refresh_token), code, verifier, ...res }
}

/** Token exchange as the MCP server. `basic: null` sends no client credentials. */
export function exchangeRequest(stub: StubKanvaro, subject: string, basic: string | null = `${stub.options.mcpServerClient.id}:${stub.options.mcpServerClient.secret}`) {
  return tokenRequest(stub, { grant_type: TOKEN_EXCHANGE_GRANT, subject_token: subject, subject_token_type: ACCESS_TOKEN_TYPE }, basic ?? undefined)
}
