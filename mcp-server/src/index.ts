/**
 * Kanvaro MCP server — entry point.
 *
 * Phase 1 builds this up step by step: configuration (1.2), database (1.3),
 * token encryption (1.4), Kanvaro API client (1.5), logging (1.6), the HTTP
 * server and health endpoint (1.7) and the MCP endpoint (1.8).
 */
export const serverInfo = {
  name: 'kanvaro-mcp-server',
  version: '0.1.0',
} as const
