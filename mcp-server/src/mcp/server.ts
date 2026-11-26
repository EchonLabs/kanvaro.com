/**
 * The MCP endpoint (task 1.8).
 *
 * - One server factory serves both protocol eras: 2026-07-28 (stateless, per-request
 *   envelope) and the 2025 handshake as a stateless fallback, so the two can't drift apart.
 *   A fresh server instance is built per request; nothing is kept between requests.
 * - Mounted on Express at /mcp behind Host-header (DNS rebinding) and Origin checks: the
 *   SDK handler itself performs no such validation.
 * - Tools are added in Phase 4; for now there is one placeholder, `ping`.
 * - Sign-in (Phase 3) will pass the verified token as `authInfo`; the factory receives it.
 */
import { hostHeaderValidation, originValidation } from '@modelcontextprotocol/express'
import { toNodeHandler } from '@modelcontextprotocol/node'
import type { McpHttpHandler, McpRequestContext } from '@modelcontextprotocol/server'
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server'
import type { Express, NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import { localsOf } from '../http/app.js'
import { serverInfo } from '../index.js'
import type { Logger } from '../log.js'

export const MCP_PATH = '/mcp'

export const INSTRUCTIONS =
  'Kanvaro project management, as the signed-in user: projects, tasks, sprints, stories, ' +
  'epics, stand-ups and more. Every action runs with that user\'s own Kanvaro permissions.'

/** Builds the MCP server for one request. Used for both protocol eras. */
export function buildMcpServer(_ctx: McpRequestContext): McpServer {
  const server = new McpServer(
    { name: serverInfo.name, title: 'Kanvaro', version: serverInfo.version },
    { instructions: INSTRUCTIONS },
  )

  server.registerTool(
    'ping',
    {
      title: 'Ping',
      description:
        'Checks that the Kanvaro MCP server is reachable and returns its name and version. ' +
        'Example input: {}. It does not contact Kanvaro and returns no Kanvaro data.',
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    () => ({
      content: [{ type: 'text', text: `pong from ${serverInfo.name} ${serverInfo.version}` }],
      structuredContent: { status: 'ok', server: serverInfo.name, version: serverInfo.version },
    }),
  )

  return server
}

export function createMcpEndpoint(log: Logger): McpHttpHandler {
  return createMcpHandler(buildMcpServer, {
    onerror: err => log.warn({ err }, 'mcp request rejected'),
  })
}

export interface MountOptions {
  /** Public origin of this server, e.g. https://mcp.example.com. */
  publicBaseUrl: string
  /** Address the server listens on; loopback adds the localhost names to the Host allow-list. */
  host: string
  /** Browser origins allowed to call /mcp (full origins from config). */
  allowedOrigins: readonly string[]
  log: Logger
}

const LOOPBACK_NAMES = ['localhost', '127.0.0.1', '[::1]']
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/** Host names accepted in the Host header (DNS rebinding protection). */
export function allowedHostnames(publicBaseUrl: string, host: string): string[] {
  const names = new Set([new URL(publicBaseUrl).hostname])
  if (LOOPBACK_HOSTS.has(host) || LOOPBACK_HOSTS.has(new URL(publicBaseUrl).hostname)) for (const n of LOOPBACK_NAMES) names.add(n)
  return [...names]
}

/** Origin host names accepted from browsers. Requests without an Origin (e.g. Claude Code) always pass. */
export function allowedOriginHostnames(allowedOrigins: readonly string[]): string[] {
  return [...new Set(allowedOrigins.map(o => new URL(o).hostname))]
}

/** Mounts the MCP endpoint on the app. Call before finishApp(). */
export function mountMcp(app: Express, handler: McpHttpHandler, opts: MountOptions): void {
  // The adapter answers 500 itself when converting the request or calling the handler fails.
  const node = toNodeHandler(handler, {
    onerror: (err: unknown) => opts.log.error({ err }, 'mcp adapter error'),
  })
  app.all(
    MCP_PATH,
    hostHeaderValidation(allowedHostnames(opts.publicBaseUrl, opts.host)),
    originValidation(allowedOriginHostnames(opts.allowedOrigins)),
    (req: Request, res: Response, next: NextFunction) => {
      node(req, res).catch((err: unknown) => {
        localsOf(res).log.error({ err }, 'mcp handler failed')
        next(err)
      })
    },
  )
}
