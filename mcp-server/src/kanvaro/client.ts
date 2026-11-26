/**
 * Kanvaro API client (task 1.5).
 *
 * The only module that talks to Kanvaro's REST API.
 * - Sends ONLY the user's Kanvaro API token (from token exchange, decision D10). It never
 *   sees the MCP token, so token passthrough is impossible by construction.
 * - Timeout and response-size limit on every call; redirects are never followed (a
 *   redirect to Kanvaro's login page must not be mistaken for data).
 * - Errors become a small set of plain kinds. Kanvaro's short 4xx messages (validation,
 *   "no permission") are passed on; 5xx details never are (some Kanvaro routes put
 *   database errors there).
 * - List calls get `page` and `limit` set here (limit 1–100, default 25).
 * - `organizationId` / `userId` can't come from tool input: they are refused in query and
 *   body unless the server adds them itself through `serverIdentity`.
 */
import { serverInfo } from '../index.js'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export type QueryValue = string | number | boolean | undefined | readonly (string | number)[]

export interface RequestOptions {
  /** The user's Kanvaro API token (never the MCP token). */
  token: string
  query?: Readonly<Record<string, QueryValue>>
  body?: unknown
  /** For list calls: page (from 1) and limit (clamped to 1–100, default 25). */
  paging?: { page?: number; limit?: number }
  /** Identity the SERVER adds for routes that need it in the query (e.g. time tracking). */
  serverIdentity?: { userId: string; organizationId: string }
  requestId?: string
  signal?: AbortSignal
}

export interface KanvaroResponse<T = unknown> {
  status: number
  data: T
}

export type KanvaroErrorKind =
  | 'invalid_input'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'unavailable'
  | 'unexpected'

const PLAIN: Record<KanvaroErrorKind, string> = {
  invalid_input: 'Kanvaro rejected the request as invalid.',
  unauthorized: 'Your Kanvaro session is no longer valid.',
  forbidden: 'You do not have permission to do this in Kanvaro.',
  not_found: 'Not found, or you do not have access to it.',
  conflict: 'Kanvaro reported a conflict; reload and try again.',
  rate_limited: 'Too many requests to Kanvaro; try again shortly.',
  unavailable: 'Kanvaro is not reachable right now; try again later.',
  unexpected: 'Kanvaro returned an unexpected response.',
}

/** A Kanvaro call failed. `message` is safe to show to the user and the AI client. */
export class KanvaroError extends Error {
  constructor(
    readonly kind: KanvaroErrorKind,
    message: string = PLAIN[kind],
    readonly status?: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message)
    this.name = 'KanvaroError'
  }
}

/** Kanvaro answered 401: the caller should exchange the token again once, then give up. */
export class KanvaroAuthError extends KanvaroError {
  constructor(status = 401) {
    super('unauthorized', PLAIN.unauthorized, status)
    this.name = 'KanvaroAuthError'
  }
}

/** A programming mistake in a tool (bad path, forbidden field). Never shown as Kanvaro's fault. */
export class KanvaroUsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KanvaroUsageError'
  }
}

export interface KanvaroClientOptions {
  baseUrl: string
  timeoutMs: number
  maxResponseBytes?: number
  /** For tests. */
  fetchImpl?: typeof fetch
}

export interface KanvaroClient {
  request<T = unknown>(method: HttpMethod, path: string, opts: RequestOptions): Promise<KanvaroResponse<T>>
  get<T = unknown>(path: string, opts: RequestOptions): Promise<KanvaroResponse<T>>
  post<T = unknown>(path: string, opts: RequestOptions): Promise<KanvaroResponse<T>>
  put<T = unknown>(path: string, opts: RequestOptions): Promise<KanvaroResponse<T>>
  patch<T = unknown>(path: string, opts: RequestOptions): Promise<KanvaroResponse<T>>
  delete<T = unknown>(path: string, opts: RequestOptions): Promise<KanvaroResponse<T>>
}

export const DEFAULT_LIMIT = 25
export const MAX_LIMIT = 100
const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024
const IDENTITY_KEYS = ['organizationId', 'organization', 'orgId', 'userId'] as const
const MAX_MESSAGE = 200

/**
 * Builds an API path from segments, encoding each one, e.g.
 * apiPath('tasks', taskId, 'comments') → "/api/tasks/<encoded id>/comments".
 */
export function apiPath(...segments: (string | number)[]): string {
  if (segments.length === 0) throw new KanvaroUsageError('apiPath needs at least one segment')
  return `/api/${segments
    .map(s => {
      const v = String(s)
      if (v === '' || v === '.' || v === '..') throw new KanvaroUsageError('apiPath segment is empty or a dot segment')
      return encodeURIComponent(v)
    })
    .join('/')}`
}

export function createKanvaroClient(options: KanvaroClientOptions): KanvaroClient {
  const base = new URL(options.baseUrl)
  const doFetch = options.fetchImpl ?? fetch
  const maxBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES

  async function request<T>(method: HttpMethod, path: string, opts: RequestOptions): Promise<KanvaroResponse<T>> {
    if (!opts.token || opts.token.trim() === '') throw new KanvaroUsageError('A Kanvaro API token is required')
    const url = buildUrl(base, path, opts)
    if (opts.body !== undefined) refuseIdentity(opts.body, 'body')

    const headers: Record<string, string> = {
      Authorization: `Bearer ${opts.token}`,
      Accept: 'application/json',
      'User-Agent': `${serverInfo.name}/${serverInfo.version}`,
    }
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
    if (opts.requestId) headers['X-Request-Id'] = opts.requestId

    const timeout = AbortSignal.timeout(options.timeoutMs)
    const signal = opts.signal ? AbortSignal.any([timeout, opts.signal]) : timeout

    let res: Response
    try {
      res = await doFetch(url, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        redirect: 'manual',
        signal,
      })
    } catch {
      // Network error, timeout or abort. No detail: it could name internal hosts.
      throw new KanvaroError('unavailable')
    }

    const text = await readLimited(res, maxBytes)

    if (res.status >= 200 && res.status < 300) {
      if (text === '') return { status: res.status, data: undefined as T }
      try {
        return { status: res.status, data: JSON.parse(text) as T }
      } catch {
        throw new KanvaroError('unexpected', undefined, res.status)
      }
    }
    throw toError(res, text)
  }

  return {
    request,
    get: (p, o) => request('GET', p, o),
    post: (p, o) => request('POST', p, o),
    put: (p, o) => request('PUT', p, o),
    patch: (p, o) => request('PATCH', p, o),
    delete: (p, o) => request('DELETE', p, o),
  }
}

function buildUrl(base: URL, path: string, opts: RequestOptions): URL {
  if (!path.startsWith('/api/') || path.includes('..') || path.includes('//') || /[?#\s]/.test(path)) {
    throw new KanvaroUsageError('Kanvaro paths must start with /api/ and contain no query, fragment or dot segments (use apiPath and the query option)')
  }
  const url = new URL(path, base)
  if (url.origin !== base.origin) throw new KanvaroUsageError('Kanvaro path must stay on the Kanvaro host')

  const query = opts.query ?? {}
  refuseIdentity(query, 'query')
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue
    if (Array.isArray(value)) url.searchParams.set(key, value.join(','))
    else url.searchParams.set(key, String(value))
  }
  if (opts.paging) {
    const page = Math.max(1, Math.floor(opts.paging.page ?? 1))
    const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(opts.paging.limit ?? DEFAULT_LIMIT)))
    url.searchParams.set('page', String(page))
    url.searchParams.set('limit', String(limit))
  }
  if (opts.serverIdentity) {
    url.searchParams.set('userId', opts.serverIdentity.userId)
    url.searchParams.set('organizationId', opts.serverIdentity.organizationId)
  }
  return url
}

function refuseIdentity(value: unknown, where: 'query' | 'body'): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  for (const key of IDENTITY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      throw new KanvaroUsageError(`"${key}" may not be sent in the ${where}; the server sets identity itself (serverIdentity)`)
    }
  }
}

async function readLimited(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => undefined)
    throw new KanvaroError('unexpected', 'Kanvaro returned more data than allowed; narrow the request.', res.status)
  }
  if (!res.body) return ''
  const reader = (res.body as ReadableStream<Uint8Array>).getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    let part: Awaited<ReturnType<typeof reader.read>>
    try {
      part = await reader.read()
    } catch {
      throw new KanvaroError('unavailable')
    }
    if (part.done) break
    total += part.value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new KanvaroError('unexpected', 'Kanvaro returned more data than allowed; narrow the request.', res.status)
    }
    chunks.push(part.value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

function toError(res: Response, text: string): KanvaroError {
  const s = res.status
  if (s === 401) return new KanvaroAuthError(s)
  if (s >= 300 && s < 400) return new KanvaroError('unexpected', undefined, s)
  if (s === 429) {
    const retry = Number(res.headers.get('retry-after'))
    return new KanvaroError('rate_limited', undefined, s, Number.isFinite(retry) && retry > 0 ? retry : undefined)
  }
  if (s >= 500) return new KanvaroError('unavailable', undefined, s)

  const kind: KanvaroErrorKind = s === 403 ? 'forbidden' : s === 404 ? 'not_found' : s === 409 ? 'conflict' : s >= 400 ? 'invalid_input' : 'unexpected'
  // 404 always gets the generic message: Kanvaro's wording can reveal whether something exists.
  const detail = kind === 'not_found' ? undefined : safeMessage(text)
  return new KanvaroError(kind, detail ? `${PLAIN[kind]} ${detail}` : PLAIN[kind], s)
}

/** Kanvaro's own short error text, only if it is a plain sentence. */
function safeMessage(text: string): string | undefined {
  let msg: unknown
  try {
    const body = JSON.parse(text) as { error?: unknown; message?: unknown }
    msg = body.error ?? body.message
  } catch {
    return undefined
  }
  if (typeof msg !== 'string') return undefined
  // Replace control characters (codes 0–31 and 127) with spaces.
  const clean = Array.from(msg, ch => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch)).join('').trim()
  if (clean === '' || clean.length > MAX_MESSAGE) return undefined
  // Drop anything that looks like an internal detail (stack, host, id, query).
  if (/\bat\s+\S+\s*\(|mongo|E11000|\bfile:|https?:\/\/|[{}<>]|\b[0-9a-f]{24}\b/i.test(clean)) return undefined
  return clean.endsWith('.') ? clean : `${clean}.`
}
