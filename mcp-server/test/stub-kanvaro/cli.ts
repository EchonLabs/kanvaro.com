/**
 * Runs the Kanvaro sign-in stand-in on its own (task 3.5), for manual tests with
 * Claude Code while Kanvaro's real endpoints (K-1 to K-8) don't exist yet.
 *
 *   npm run stub:kanvaro
 *
 * Settings (all optional):
 *   STUB_PORT           default 3300
 *   MCP_RESOURCE        default http://localhost:3100/mcp  (must equal the MCP server's PUBLIC_BASE_URL + /mcp)
 *   STUB_CLIENT_SECRET  default stub-mcp-server-secret     (the MCP server's KANVARO_CLIENT_SECRET)
 *   STUB_USER_ID / STUB_USER_EMAIL / STUB_USER_ROLE        the user signed in without a login screen
 *   KANVARO_JWT_SECRET  dev only: the LOCAL Kanvaro's JWT_SECRET, so exchanged tokens work on
 *                       the local Kanvaro API. Never a shared or production secret.
 */
import { startStubKanvaro } from './stub.js'

const env = process.env
const mcpResource = env.MCP_RESOURCE ?? 'http://localhost:3100/mcp'
const secret = env.STUB_CLIENT_SECRET ?? 'stub-mcp-server-secret'

const stub = await startStubKanvaro({
  mcpResource,
  port: Number(env.STUB_PORT ?? 3300),
  mcpServerClient: { id: 'kanvaro-mcp-server', secret },
  users: [{
    id: env.STUB_USER_ID ?? 'stub-user-1',
    email: env.STUB_USER_EMAIL ?? 'stub.user@kanvaro.test',
    role: env.STUB_USER_ROLE ?? 'team_member',
    organizationId: 'stub-org',
    active: true,
  }],
  ...(env.KANVARO_JWT_SECRET ? { kanvaroJwtSecret: env.KANVARO_JWT_SECRET } : {}),
})

process.stdout.write(
  [
    `Kanvaro sign-in stand-in running at ${stub.url}  (TEST ONLY)`,
    '',
    'MCP server settings (.env):',
    `  KANVARO_PUBLIC_URL=${stub.issuer}`,
    `  KANVARO_API_BASE_URL=${stub.url}`,
    '  KANVARO_CLIENT_ID=kanvaro-mcp-server',
    `  KANVARO_CLIENT_SECRET=${secret}`,
    '',
    'Claude Code:',
    `  claude mcp add --transport http --client-id kanvaro-claude-code --callback-port 33418 kanvaro ${mcpResource}`,
    '',
    'Ctrl+C to stop.',
    '',
  ].join('\n'),
)

const stop = () => { void stub.close().then(() => process.exit(0)) }
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
