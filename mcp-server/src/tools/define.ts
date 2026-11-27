/**
 * The shared tool wrapper (task 4.1).
 *
 * Every Kanvaro tool is declared with defineTool(). The wrapper does, in order:
 *   1. Input check   strict schema: unknown fields are refused (the field allow-list)
 *   2. Rate limit    per user: 60 reads and 20 writes a minute
 *   3. Paging        `page` and `limit` (default 25, max 100) for list tools
 *   4. Run           with a Kanvaro client bound to the user's exchanged token
 *   5. Filter        only the fields the tool lists; secrets and rates never leave
 *   6. Size cap      about 100 KB; a longer list is cut, with a note
 *   7. Audit         one entry per call: tool, target, outcome, changed field names (never values)
 *   8. Errors        plain tool errors (isError), no stack traces or Kanvaro internals
 *
 * Tools never see a token: the Kanvaro client gets it from the signed-in request context.
 * Kanvaro checks every permission itself; the wrapper does not repeat those checks.
 */
import type { CallToolResult, McpServer, ToolAnnotations } from '@modelcontextprotocol/server'
import { z } from 'zod'
import type { AuditEntry, AuditLog } from '../audit.js'
import { SessionEndedError, currentSignIn, withKanvaroToken } from '../auth/context.js'
import type { HttpMethod, KanvaroClient, RequestOptions } from '../kanvaro/client.js'
import { DEFAULT_LIMIT, KanvaroError, MAX_LIMIT } from '../kanvaro/client.js'
import type { Logger } from '../log.js'
import type { Shape } from './filter.js'
import { filterResponse } from './filter.js'
import type { RateLimiter } from './limits.js'
import { MAX_RESULT_BYTES, capSize } from './limits.js'

/** read: no changes. write: everyday changes. critical: changes that need confirmation (wave 3). */
export type ToolKind = 'read' | 'write' | 'critical'

/** Options for one Kanvaro call made by a tool (the token and request id are added for it). */
export type CallOptions = Omit<RequestOptions, 'token' | 'requestId'>

/** The Kanvaro API, as the signed-in user. Returns the response body. */
export interface UserKanvaro {
  get<T = unknown>(path: string, opts?: CallOptions): Promise<T>
  post<T = unknown>(path: string, opts?: CallOptions): Promise<T>
  put<T = unknown>(path: string, opts?: CallOptions): Promise<T>
  patch<T = unknown>(path: string, opts?: CallOptions): Promise<T>
  delete<T = unknown>(path: string, opts?: CallOptions): Promise<T>
}

export interface ToolContext {
  /** The signed-in Kanvaro user (for "my …" queries). */
  userId: string
  clientId: string
  requestId: string
  /** For list tools: the page asked for, limit already within 1–100. Pass as `paging`. */
  paging: { page: number; limit: number }
  kanvaro: UserKanvaro
  log: Logger
}

export interface ToolSpec<S extends z.ZodRawShape> {
  /** snake_case, e.g. "tasks_list". */
  name: string
  title: string
  /** What it does, when to use it, one example input, what it cannot do (4.2). */
  description: string
  kind: ToolKind
  /** The only fields the tool accepts. `page` and `limit` are added when `paged` is set. */
  input: S
  paged?: boolean
  /** The fields the tool returns (everything else is dropped). */
  filter: Shape
  /** Keep hourly and billing rates (finance tools only). */
  allowRates?: boolean
  /** What the call acts on, for the audit log, e.g. `task:${input.id}`. */
  target?: (input: z.infer<z.ZodObject<S>>) => string | undefined
  run: (input: z.infer<z.ZodObject<S>>, ctx: ToolContext) => Promise<unknown>
}

/** Shared services every tool call uses (one set per server process). */
export interface ToolRuntime {
  kanvaro: KanvaroClient
  audit: AuditLog
  limiter: RateLimiter
  log: Logger
  maxResultBytes?: number
}

/** A defined tool, ready to register. */
export interface Tool {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly kind: ToolKind
  readonly schema: z.ZodObject<z.ZodRawShape>
  readonly annotations: ToolAnnotations
  call(args: unknown, runtime: ToolRuntime): Promise<CallToolResult>
}

/** A problem with the input that the schema can't express. The message is shown as is. */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolInputError'
  }
}

/** A Kanvaro (MongoDB) id. */
export const kanvaroId = () => z.string().regex(/^[0-9a-f]{24}$/i, 'must be a Kanvaro id (24 hexadecimal characters)')

const PAGING = {
  page: z.number().int().min(1).max(10_000).optional().describe('Page number, from 1 (default 1).'),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Items per page, 1–${MAX_LIMIT} (default ${DEFAULT_LIMIT}).`),
}

const ANNOTATIONS: Record<ToolKind, ToolAnnotations> = {
  read: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  write: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  critical: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
}

const NAME = /^[a-z][a-z0-9_]{0,63}$/
const NOT_AUDITED_FIELDS = new Set(['id', 'page', 'limit'])

export function defineTool<S extends z.ZodRawShape>(spec: ToolSpec<S>): Tool {
  if (!NAME.test(spec.name)) throw new Error(`tool name "${spec.name}" must be snake_case`)
  if (spec.paged && ('page' in spec.input || 'limit' in spec.input)) {
    throw new Error(`tool "${spec.name}": page and limit are added by the wrapper`)
  }
  const schema = z.object(spec.paged ? { ...spec.input, ...PAGING } : spec.input).strict()

  async function call(args: unknown, rt: ToolRuntime): Promise<CallToolResult> {
    const signIn = currentSignIn()
    if (!signIn) {
      rt.log.error({ tool: spec.name }, 'tool called outside a signed-in request')
      return failure('You are not signed in to Kanvaro. Reconnect to sign in.')
    }
    const { requestId, mcp } = signIn
    const log = rt.log.child({ requestId, userId: mcp.userId, clientId: mcp.clientId, tool: spec.name })
    const started = Date.now()
    const audit = (entry: Pick<AuditEntry, 'outcome' | 'target' | 'detail'>, limited = false) => {
      const full: AuditEntry = {
        requestId, userId: mcp.userId, clientId: mcp.clientId,
        ...(signIn.ip ? { ip: signIn.ip } : {}),
        action: spec.name, ...entry,
      }
      void (limited ? rt.audit.recordLimited(full) : rt.audit.record(full))
    }

    // 1. Input check (the SDK has checked once already; this keeps the wrapper safe on its own).
    const parsed = schema.safeParse(args ?? {})
    if (!parsed.success) {
      const message = parsed.error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')
      log.info({ outcome: 'refused' }, 'tool input rejected')
      audit({ outcome: 'refused', detail: 'invalid_input' }, true)
      return failure(`Invalid input — ${message}`)
    }
    const { page, limit, ...rest } = parsed.data as Record<string, unknown> & { page?: number; limit?: number }
    const input = (spec.paged ? rest : parsed.data) as z.infer<z.ZodObject<S>>
    const target = safeTarget(spec, input)
    const fields = spec.kind === 'read' ? undefined : changedFields(parsed.data)

    // 2. Rate limit.
    const wait = rt.limiter.take(mcp.userId, spec.kind === 'read' ? 'read' : 'write')
    if (wait > 0) {
      log.warn({ outcome: 'refused' }, 'tool rate limited')
      audit({ outcome: 'refused', ...(target ? { target } : {}), detail: 'rate_limited' }, true)
      return failure(`Too many ${spec.kind === 'read' ? 'requests' : 'changes'} in a minute. Try again in ${wait} seconds.`)
    }

    // 3. Paging.
    const paging = {
      page: page ?? 1,
      limit: Math.min(MAX_LIMIT, Math.max(1, limit ?? DEFAULT_LIMIT)),
    }

    try {
      // 4. Run.
      const data = await spec.run(input, { userId: mcp.userId, clientId: mcp.clientId, requestId, paging, kanvaro: userKanvaro(rt.kanvaro, requestId), log })

      // 5. Filter, 6. size cap.
      const filtered = filterResponse(data, spec.filter, { allowRates: spec.allowRates === true })
      const capped = capSize(filtered ?? null, rt.maxResultBytes ?? MAX_RESULT_BYTES)
      if (!capped) {
        log.info({ outcome: 'refused', ms: Date.now() - started }, 'tool result too large')
        audit({ outcome: 'refused', ...(target ? { target } : {}), detail: joinDetail('too_large', fields) })
        return failure('The result is too large to return. Narrow the request (filters, a smaller limit).')
      }

      // 7. Audit.
      log.info({ outcome: 'ok', ms: Date.now() - started, ...(capped.truncated ? { truncated: capped.truncated } : {}) }, 'tool call')
      audit({ outcome: 'ok', ...(target ? { target } : {}), ...(fields ? { detail: joinDetail(undefined, fields) } : {}) })

      const content: CallToolResult['content'] = [{ type: 'text', text: JSON.stringify(capped.value) }]
      if (capped.truncated) {
        const { shown, total } = capped.truncated
        content.push({ type: 'text', text: `Only the first ${shown} of ${total} items fit in one result. Ask again with a smaller limit (for example ${shown}) or narrower filters to see the rest.` })
      }
      return { content }
    } catch (err) {
      // 8. Errors.
      const { message, outcome, code } = describeError(err, requestId)
      if (outcome === 'error') log.error({ err, outcome, ms: Date.now() - started }, 'tool call failed')
      else log.info({ outcome, code, ms: Date.now() - started }, 'tool call refused')
      audit({ outcome, ...(target ? { target } : {}), detail: joinDetail(code, fields) })
      return failure(message)
    }
  }

  return {
    name: spec.name,
    title: spec.title,
    description: spec.description,
    kind: spec.kind,
    schema,
    annotations: ANNOTATIONS[spec.kind],
    call,
  }
}

/** Registers the tools on one MCP server instance. */
export function registerTools(server: McpServer, tools: readonly Tool[], runtime: ToolRuntime): void {
  const seen = new Set<string>()
  for (const tool of tools) {
    if (seen.has(tool.name)) throw new Error(`tool "${tool.name}" is defined twice`)
    seen.add(tool.name)
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.schema, annotations: tool.annotations },
      args => tool.call(args, runtime),
    )
  }
}

/** The Kanvaro client as the signed-in user: token from the request context, retried once on 401. */
function userKanvaro(client: KanvaroClient, requestId: string): UserKanvaro {
  const call = <T>(method: HttpMethod, path: string, opts: CallOptions = {}): Promise<T> =>
    withKanvaroToken(token => client.request<T>(method, path, { ...opts, token, requestId })).then(r => r.data)
  return {
    get: (p, o) => call('GET', p, o),
    post: (p, o) => call('POST', p, o),
    put: (p, o) => call('PUT', p, o),
    patch: (p, o) => call('PATCH', p, o),
    delete: (p, o) => call('DELETE', p, o),
  }
}

const REFUSALS = new Set(['invalid_input', 'unauthorized', 'forbidden', 'not_found', 'conflict', 'rate_limited'])

function describeError(err: unknown, requestId: string): { message: string; outcome: 'refused' | 'error'; code: string } {
  if (err instanceof SessionEndedError) return { message: err.message, outcome: 'refused', code: 'session_ended' }
  if (err instanceof ToolInputError) return { message: err.message, outcome: 'refused', code: 'invalid_input' }
  if (err instanceof KanvaroError) {
    const code = err.status ? `${err.kind} ${err.status}` : err.kind
    const retry = err.retryAfterSeconds ? ` Try again in ${err.retryAfterSeconds} seconds.` : ''
    return { message: err.message + retry, outcome: REFUSALS.has(err.kind) ? 'refused' : 'error', code }
  }
  // A bug or an unexpected failure: no detail leaves the server.
  return { message: `Something went wrong in the Kanvaro MCP server (reference ${requestId}).`, outcome: 'error', code: 'internal' }
}

/** The names of the fields a write sends (never their values). */
function changedFields(data: Record<string, unknown>): string[] {
  return Object.keys(data).filter(k => !NOT_AUDITED_FIELDS.has(k) && data[k] !== undefined).sort()
}

function joinDetail(code: string | undefined, fields: string[] | undefined): string {
  const parts = [code, fields?.length ? `fields: ${fields.join(',')}` : undefined].filter(Boolean)
  return parts.join('; ').slice(0, 500)
}

function safeTarget<S extends z.ZodRawShape>(spec: ToolSpec<S>, input: z.infer<z.ZodObject<S>>): string | undefined {
  try {
    return spec.target?.(input)?.slice(0, 200)
  } catch {
    return undefined
  }
}

function failure(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] }
}
