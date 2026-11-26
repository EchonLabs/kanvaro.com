/**
 * Protected-resource metadata (task 3.1, RFC 9728).
 *
 * Tells clients: "this is the Kanvaro MCP server; to use it, sign in at Kanvaro" (D10).
 * Served at both the path-specific URL clients try first
 * (/.well-known/oauth-protected-resource/mcp) and the root one.
 *
 * - Public, no credentials: CORS open (browser-based clients read it cross-origin) and
 *   cacheable for an hour.
 * - The authorization-server metadata is NOT served here: it belongs to Kanvaro, which
 *   is the issuer. Serving a copy could mislead clients about who the issuer is.
 */
import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/server'
import type { Express, Request, Response } from 'express'

export const SCOPE = 'kanvaro'
const ROOT_PATH = '/.well-known/oauth-protected-resource'

export interface ResourceMetadata {
  resource: string
  authorization_servers: string[]
  scopes_supported: string[]
  bearer_methods_supported: string[]
  resource_name: string
}

export interface ResourceMetadataConfig {
  /** Canonical MCP URL, e.g. https://mcp.example.com/mcp — also the token audience. */
  resourceUrl: string
  /** Kanvaro's issuer, e.g. https://kanvaro.example.com */
  issuer: string
}

export function resourceMetadata(c: ResourceMetadataConfig): ResourceMetadata {
  return {
    resource: c.resourceUrl,
    authorization_servers: [c.issuer],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'Kanvaro',
  }
}

/** The metadata URL to name in 401 challenges, e.g. https://mcp.example.com/.well-known/oauth-protected-resource/mcp */
export function resourceMetadataUrl(resourceUrl: string): string {
  return getOAuthProtectedResourceMetadataUrl(new URL(resourceUrl))
}

/** Mounts the metadata routes. Call before finishApp(). */
export function mountResourceMetadata(app: Express, c: ResourceMetadataConfig): void {
  const body = resourceMetadata(c)
  const paths = [...new Set([new URL(resourceMetadataUrl(c.resourceUrl)).pathname, ROOT_PATH])]

  const cors = (res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'MCP-Protocol-Version')
  }
  for (const path of paths) {
    app.get(path, (_req: Request, res: Response) => {
      cors(res)
      res.setHeader('Cache-Control', 'public, max-age=3600')
      res.json(body)
    })
    app.options(path, (_req: Request, res: Response) => {
      cors(res)
      res.setHeader('Access-Control-Max-Age', '86400')
      res.status(204).end()
    })
  }
}
