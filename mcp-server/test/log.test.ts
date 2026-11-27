import { describe, expect, it } from 'vitest'
import { REDACTED, clientRequestIdFrom, createLogger, isSensitiveKey, newRequestId, sanitize, scrubString } from '../src/log.js'
import type { LogLevel } from '../src/log.js'

const JWT = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ1MSIsImF1ZCI6Im1jcCJ9.c2lnbmF0dXJlLXZhbHVlLWhlcmU'
const SECRETS = ['tok-access-111', 'tok-refresh-222', 'client-secret-333', 'p@ssw0rd-444', 'db-pass-555', 'code-666', JWT, 'otp-777', 'confirm-888']

/** A logger whose output lines are collected for inspection. */
function capture(level: LogLevel = 'debug') {
  const lines: string[] = []
  const log = createLogger({ level, destination: { write: (s: string) => { lines.push(s) } } })
  const text = () => lines.join('')
  const parsed = () => lines.map(l => JSON.parse(l) as Record<string, unknown>)
  return { log, text, parsed }
}

describe('secrets never reach the log output', () => {
  it('blanks sensitive keys at any depth, and scrubs strings everywhere', () => {
    const { log, text } = capture()
    log.info({
      req: { headers: { authorization: 'Bearer tok-access-111', cookie: 'accessToken=tok-access-111', 'x-request-id': 'r1' } },
      exchange: { response: { body: { access_token: 'tok-access-111', refresh_token: 'tok-refresh-222' } } },
      config: { kanvaro: { clientSecret: 'client-secret-333' }, database: { uri: 'mongodb://mcp:db-pass-555@db:27017/kanvaro_mcp' } },
      user: { password: 'p@ssw0rd-444', passwordResetOtp: 'otp-777' },
      tool: { input: { confirm: 'confirm-888', authorizationCode: 'code-666' } },
      deep: { a: { b: { c: { d: { subjectToken: JWT } } } } },
      list: [{ token: 'tok-access-111' }],
    }, 'exchanged token')
    const out = text()
    for (const s of SECRETS) expect(out, s).not.toContain(s)
    expect(out).toContain(REDACTED)
    expect(out).toContain('db:27017/kanvaro_mcp') // the non-secret parts of the URI survive
  })

  it('scrubs secrets inside the message text', () => {
    const { log, text } = capture()
    log.warn(`Kanvaro said Bearer tok-access-111 was invalid; jwt ${JWT}; url https://k/cb?code=code-666&state=ok`)
    const out = text()
    for (const s of ['tok-access-111', JWT, 'code-666']) expect(out).not.toContain(s)
    expect(out).toContain('state=ok')
  })

  it('scrubs errors: message, stack and cause', () => {
    const { log, text } = capture()
    const cause = new Error('connect failed for mongodb://mcp:db-pass-555@db')
    const err = Object.assign(new Error(`refused Bearer tok-access-111`, { cause }), { accessToken: 'tok-access-111' })
    log.error({ err }, 'exchange failed')
    const out = text()
    expect(out).not.toContain('tok-access-111')
    expect(out).not.toContain('db-pass-555')
    expect(out).toContain('exchange failed')
  })

  it('does not change the objects it logs', () => {
    const input = { headers: { authorization: 'Bearer tok-access-111' } }
    sanitize(input)
    expect(input.headers.authorization).toBe('Bearer tok-access-111')
  })

  it('handles circular objects and binary data', () => {
    const a: Record<string, unknown> = { name: 'a' }
    a.self = a
    expect(sanitize({ a, buf: Buffer.from('secret-bytes') })).toEqual({ a: { name: 'a', self: '[circular]' }, buf: '[binary]' })
  })
})

describe('sensitive key names', () => {
  it.each(['authorization', 'Authorization', 'cookie', 'set-cookie', 'access_token', 'refreshToken', 'subject_token', 'client_secret', 'clientSecret', 'password', 'passwordResetOtp', 'authorization_code', 'code_verifier', 'confirm', 'x-api-key', 'kanvaroToken'])('treats %s as sensitive', key => {
    expect(isSensitiveKey(key)).toBe(true)
  })
  it.each(['userId', 'projectId', 'status', 'title', 'requestId', 'tokenType', 'clientId', 'description'])('keeps %s', key => {
    expect(isSensitiveKey(key)).toBe(false)
  })
  it('scrubs Basic credentials too', () => {
    expect(scrubString('Authorization: Basic a21jcDpzZWNyZXQ=')).toBe(`Authorization: Basic ${REDACTED}`)
  })
})

describe('log lines', () => {
  it('are JSON with level, time, service, version and message', () => {
    const { log, parsed } = capture()
    log.info({ requestId: 'r-1' }, 'started')
    expect(parsed()[0]).toMatchObject({ level: 'info', service: 'kanvaro-mcp-server', version: '0.1.0', requestId: 'r-1', msg: 'started' })
    expect(typeof parsed()[0]?.time).toBe('string')
  })

  it('respect the level', () => {
    const { log, parsed } = capture('warn')
    log.info('hidden')
    log.warn('shown')
    expect(parsed().map(l => l.msg)).toEqual(['shown'])
  })

  it('carry the request id on child loggers', () => {
    const { log, parsed } = capture()
    log.child({ requestId: 'abc-123' }).info('tool call')
    expect(parsed()[0]).toMatchObject({ requestId: 'abc-123', msg: 'tool call' })
  })
})

describe('request ids', () => {
  it('makes a new UUID per request', () => {
    expect(newRequestId()).toMatch(/^[0-9a-f-]{36}$/)
    expect(newRequestId()).not.toBe(newRequestId())
  })
  it('keeps a short, plain caller id for the logs', () => expect(clientRequestIdFrom('req-42.a_b:c')).toBe('req-42.a_b:c'))
  it.each([undefined, '', 'x'.repeat(65), 'line\nbreak', 'has space', '{"json":1}', ['array']])('drops the caller id %j', value => {
    expect(clientRequestIdFrom(value)).toBeUndefined()
  })
})

describe('codes are not secrets', () => {
  it('keeps outcome codes, error codes and session names', () => {
    expect(sanitize({ code: 'forbidden 403', session: 'abc', err: { code: 'ECONNREFUSED' } })).toEqual({ code: 'forbidden 403', session: 'abc', err: { code: 'ECONNREFUSED' } })
  })
  it('still scrubs an OAuth code in a URL', () => {
    expect(scrubString('/callback?code=abc123&state=x')).toBe(`/callback?code=${REDACTED}&state=x`)
  })
})
