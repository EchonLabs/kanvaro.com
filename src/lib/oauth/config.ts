export const ACCESS_TOKEN_TTL = 900 // 15 minutes
export const REFRESH_TOKEN_TTL = 7 * 24 * 3600 // 7 days
export const CODE_TTL = 60 // 60 seconds
export const SCOPE = 'kanvaro'
export const TOKEN_EXCHANGE_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange'
export const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token'
export const CLAUDE_CODE_CLIENT_ID = 'kanvaro-claude-code'
export const MCP_SERVER_CLIENT_ID = 'kanvaro-mcp-server'

export class OAuthConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OAuthConfigError'
  }
}

export interface OAuthClientConfig {
  id: string
  name: string
  type: 'public' | 'confidential'
  grants: string[]
  redirectUris: string[]
}

export function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

export function getIssuer(): string {
  const raw = process.env.OAUTH_ISSUER || process.env.NEXT_PUBLIC_APP_URL
  if (!raw || !raw.trim()) {
    throw new OAuthConfigError('OAUTH_ISSUER is not configured')
  }
  return normalizeUrl(raw)
}

export function getMcpResource(): string {
  const raw = process.env.MCP_SERVER_RESOURCE
  if (!raw || !raw.trim()) {
    throw new OAuthConfigError('MCP_SERVER_RESOURCE is not configured')
  }
  return normalizeUrl(raw)
}

function getClaudeCodeRedirectUris(): string[] {
  const raw = process.env.OAUTH_CLAUDE_CODE_REDIRECT_URIS
  if (!raw || !raw.trim()) {
    return ['http://localhost:33418/callback']
  }
  const uris = raw
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)
  return uris.length > 0 ? uris : ['http://localhost:33418/callback']
}

export function getClient(id: string): OAuthClientConfig | null {
  if (id === CLAUDE_CODE_CLIENT_ID) {
    return {
      id: CLAUDE_CODE_CLIENT_ID,
      name: 'Claude Code',
      type: 'public',
      grants: ['authorization_code', 'refresh_token'],
      redirectUris: getClaudeCodeRedirectUris(),
    }
  }

  if (id === MCP_SERVER_CLIENT_ID) {
    return {
      id: MCP_SERVER_CLIENT_ID,
      name: 'Kanvaro MCP Server',
      type: 'confidential',
      grants: [TOKEN_EXCHANGE_GRANT],
      redirectUris: [],
    }
  }

  return null
}

export function getJwtSecret(): string {
  return (process.env.JWT_SECRET || '').trim() || 'your-secret-key'
}

export function getJwtRefreshSecret(): string {
  return (
    process.env.JWT_REFRESH_SECRET ||
    process.env.REFRESH_TOKEN_SECRET ||
    ''
  ).trim() || 'your-refresh-secret-key'
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export function redirectUriMatches(registered: string, requested: string): boolean {
  if (registered.includes('#') || requested.includes('#')) {
    return false
  }

  let regUrl: URL
  let reqUrl: URL

  try {
    regUrl = new URL(registered)
    reqUrl = new URL(requested)
  } catch {
    return false
  }

  if (regUrl.hash !== '' || reqUrl.hash !== '') return false
  if (regUrl.protocol !== 'http:' && regUrl.protocol !== 'https:') return false
  if (reqUrl.protocol !== 'http:' && reqUrl.protocol !== 'https:') return false
  if (regUrl.username !== '' || regUrl.password !== '') return false
  if (reqUrl.username !== '' || reqUrl.password !== '') return false

  if (
    regUrl.protocol !== reqUrl.protocol ||
    regUrl.hostname !== reqUrl.hostname ||
    regUrl.pathname !== reqUrl.pathname ||
    regUrl.search !== reqUrl.search
  ) {
    return false
  }

  if (LOOPBACK_HOSTS.has(reqUrl.hostname)) {
    return true
  }

  return regUrl.href === reqUrl.href
}
