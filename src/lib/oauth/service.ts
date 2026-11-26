import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { NextRequest, NextResponse } from 'next/server'
import { OAuthAuthorizationCode, OAuthRefreshToken } from '@/models/OAuth'
import { User } from '@/models/User'
import {
  ACCESS_TOKEN_TTL,
  ACCESS_TOKEN_TYPE,
  CLAUDE_CODE_CLIENT_ID,
  CODE_TTL,
  MCP_SERVER_CLIENT_ID,
  OAuthClientConfig,
  REFRESH_TOKEN_TTL,
  SCOPE,
  getClient,
  getIssuer,
  getMcpResource,
  normalizeUrl,
  redirectUriMatches,
} from './config'
import {
  McpAccessTokenPayload,
  randomToken,
  safeEqualHex,
  sha256Hex,
  signMcpAccessToken,
  verifyMcpAccessToken,
  verifyPkceS256,
} from './tokens'

export const NO_STORE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
}

export class OAuthError extends Error {
  error: string
  description: string
  status: number
  extraHeaders?: Record<string, string>

  constructor(
    error: string,
    description: string,
    status = 400,
    extraHeaders?: Record<string, string>
  ) {
    super(description)
    this.name = 'OAuthError'
    this.error = error
    this.description = description
    this.status = status
    this.extraHeaders = extraHeaders
  }
}

export function oauthJson(
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string>
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { ...NO_STORE_HEADERS, ...extraHeaders },
  })
}

export function oauthError(
  error: string,
  description: string,
  status = 400,
  extraHeaders?: Record<string, string>
): NextResponse {
  return NextResponse.json(
    { error, error_description: description },
    { status, headers: { ...NO_STORE_HEADERS, ...extraHeaders } }
  )
}

export async function readParams(request: NextRequest): Promise<URLSearchParams> {
  const contentType = (request.headers.get('content-type') || '').toLowerCase()

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await request.text()
    return new URLSearchParams(text)
  }

  if (contentType.includes('application/json')) {
    let parsed: unknown
    try {
      parsed = await request.json()
    } catch {
      throw new OAuthError('invalid_request', 'Invalid JSON body', 400)
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new OAuthError('invalid_request', 'JSON body must be an object', 400)
    }

    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== 'string') {
        throw new OAuthError('invalid_request', `Parameter "${key}" must be a string`, 400)
      }
      params.set(key, value)
    }
    return params
  }

  throw new OAuthError(
    'invalid_request',
    'Content-Type must be application/x-www-form-urlencoded or application/json',
    400
  )
}

const INVALID_CLIENT_HEADERS = { 'WWW-Authenticate': 'Basic realm="kanvaro"' }

export function authenticateClient(
  request: NextRequest,
  params: URLSearchParams
): OAuthClientConfig {
  const authHeader = request.headers.get('authorization') || ''
  const hasBasic = /^basic\s+/i.test(authHeader)
  const bodyClientId = params.get('client_id')
  const bodyClientSecret = params.get('client_secret')

  if (hasBasic && (bodyClientId !== null || bodyClientSecret !== null)) {
    throw new OAuthError(
      'invalid_request',
      'Client credentials must not be sent in both Authorization header and request body',
      400
    )
  }

  let clientId: string | null = null
  let clientSecret: string | null = null

  if (hasBasic) {
    const encoded = authHeader.replace(/^basic\s+/i, '').trim()
    let decoded: string
    try {
      decoded = Buffer.from(encoded, 'base64').toString('utf8')
    } catch {
      throw new OAuthError(
        'invalid_client',
        'Invalid Basic authorization header',
        401,
        INVALID_CLIENT_HEADERS
      )
    }

    const colonIndex = decoded.indexOf(':')
    if (colonIndex === -1) {
      throw new OAuthError(
        'invalid_client',
        'Invalid Basic authorization header',
        401,
        INVALID_CLIENT_HEADERS
      )
    }

    try {
      clientId = decodeURIComponent(decoded.slice(0, colonIndex).replace(/\+/g, ' '))
      clientSecret = decodeURIComponent(decoded.slice(colonIndex + 1).replace(/\+/g, ' '))
    } catch {
      throw new OAuthError(
        'invalid_client',
        'Malformed Basic credentials',
        401,
        INVALID_CLIENT_HEADERS
      )
    }
  } else {
    clientId = bodyClientId
    clientSecret = bodyClientSecret
  }

  if (!clientId || !clientId.trim()) {
    throw new OAuthError(
      'invalid_client',
      'Missing client credentials',
      401,
      INVALID_CLIENT_HEADERS
    )
  }

  const client = getClient(clientId)
  if (!client) {
    throw new OAuthError('invalid_client', 'Unknown client', 401, INVALID_CLIENT_HEADERS)
  }

  if (client.type === 'confidential') {
    const expectedHash = process.env.OAUTH_MCP_SERVER_CLIENT_SECRET_HASH || ''
    if (!clientSecret || !expectedHash || !safeEqualHex(sha256Hex(clientSecret), expectedHash)) {
      throw new OAuthError(
        'invalid_client',
        'Invalid client credentials',
        401,
        INVALID_CLIENT_HEADERS
      )
    }
  }

  return client
}

export interface AuthorizeQuery {
  client_id?: string | null
  redirect_uri?: string | null
  response_type?: string | null
  code_challenge?: string | null
  code_challenge_method?: string | null
  state?: string | null
  resource?: string | null
  scope?: string | null
}

export type ValidateAuthorizeResult =
  | {
      ok: true
      client: OAuthClientConfig
      redirectUri: string
      state: string
      resource: string
      codeChallenge: string
    }
  | {
      ok: false
      error: string
      redirectable: false
    }

export function validateAuthorizeRequest(q: AuthorizeQuery): ValidateAuthorizeResult {
  const clientId = typeof q.client_id === 'string' ? q.client_id.trim() : ''
  if (!clientId) {
    return { ok: false, error: 'Missing required parameter: client_id', redirectable: false }
  }

  const client = getClient(clientId)
  if (!client || !client.grants.includes('authorization_code')) {
    return { ok: false, error: 'Invalid or unauthorized client_id', redirectable: false }
  }

  const redirectUri = typeof q.redirect_uri === 'string' ? q.redirect_uri.trim() : ''
  if (!redirectUri) {
    return { ok: false, error: 'Missing required parameter: redirect_uri', redirectable: false }
  }

  const matchesRegistered = client.redirectUris.some((reg) =>
    redirectUriMatches(reg, redirectUri)
  )
  if (!matchesRegistered) {
    return {
      ok: false,
      error: 'redirect_uri does not match any registered return address',
      redirectable: false,
    }
  }

  if (q.response_type !== 'code') {
    return {
      ok: false,
      error: 'Unsupported response_type. Expected "code"',
      redirectable: false,
    }
  }

  const codeChallenge = typeof q.code_challenge === 'string' ? q.code_challenge : ''
  if (!/^[A-Za-z0-9\-_]{43,128}$/.test(codeChallenge)) {
    return { ok: false, error: 'Missing or invalid code_challenge', redirectable: false }
  }

  if (q.code_challenge_method !== 'S256') {
    return {
      ok: false,
      error: 'Unsupported or missing code_challenge_method. Must be "S256"',
      redirectable: false,
    }
  }

  const state = typeof q.state === 'string' ? q.state : ''
  if (!state.trim()) {
    return { ok: false, error: 'Missing required parameter: state', redirectable: false }
  }

  const rawResource = typeof q.resource === 'string' ? q.resource : ''
  if (!rawResource.trim()) {
    return { ok: false, error: 'Missing required parameter: resource', redirectable: false }
  }

  const normalizedResource = normalizeUrl(rawResource)
  if (normalizedResource !== getMcpResource()) {
    return { ok: false, error: 'Invalid resource parameter', redirectable: false }
  }

  if (typeof q.scope === 'string' && q.scope.trim().length > 0) {
    const scopes = q.scope.trim().split(/\s+/)
    if (scopes.some((s) => s !== SCOPE)) {
      return { ok: false, error: 'Unsupported scope requested', redirectable: false }
    }
  }

  return {
    ok: true,
    client,
    redirectUri,
    state,
    resource: normalizedResource,
    codeChallenge,
  }
}

export function buildRedirect(
  redirectUri: string,
  params: Record<string, string | undefined>
): string {
  const url = new URL(redirectUri)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value)
    }
  }
  url.searchParams.set('iss', getIssuer())
  return url.toString()
}

export async function issueAuthorizationCode(params: {
  client: OAuthClientConfig
  userId: string
  redirectUri: string
  codeChallenge: string
  resource: string
}): Promise<string> {
  const code = randomToken()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + CODE_TTL * 1000)

  await OAuthAuthorizationCode.create({
    codeHash: sha256Hex(code),
    clientId: params.client.id,
    userId: params.userId,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    resource: params.resource,
    scope: SCOPE,
    expiresAt,
    usedAt: null,
    familyId: null,
  })

  return code
}

export async function revokeFamily(familyId: string): Promise<void> {
  await OAuthRefreshToken.updateMany(
    { familyId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  )
}

export async function revokeAllForUser(userId: string): Promise<void> {
  await OAuthRefreshToken.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  )
}

export async function redeemAuthorizationCode(params: {
  client: OAuthClientConfig
  code: string | null
  redirectUri: string | null
  codeVerifier: string | null
  resource?: string | null
}) {
  if (!params.code || !params.redirectUri || !params.codeVerifier) {
    throw new OAuthError(
      'invalid_request',
      'code, redirect_uri, and code_verifier are required',
      400
    )
  }

  const codeHash = sha256Hex(params.code)
  const now = new Date()

  const codeDoc = await OAuthAuthorizationCode.findOneAndUpdate(
    { codeHash, usedAt: null },
    { $set: { usedAt: now } },
    { new: false }
  )

  if (!codeDoc) {
    const existing = await OAuthAuthorizationCode.findOne({ codeHash })
    if (existing && existing.usedAt && existing.familyId) {
      await revokeFamily(existing.familyId)
    }
    throw new OAuthError('invalid_grant', 'Authorization code is invalid or already used', 400)
  }

  if (codeDoc.expiresAt <= now) {
    throw new OAuthError('invalid_grant', 'Authorization code has expired', 400)
  }
  if (codeDoc.clientId !== params.client.id) {
    throw new OAuthError('invalid_grant', 'Client mismatch', 400)
  }
  if (codeDoc.redirectUri !== params.redirectUri) {
    throw new OAuthError('invalid_grant', 'redirect_uri mismatch', 400)
  }
  if (params.resource && normalizeUrl(params.resource) !== codeDoc.resource) {
    throw new OAuthError('invalid_grant', 'resource mismatch', 400)
  }
  if (!verifyPkceS256(params.codeVerifier, codeDoc.codeChallenge)) {
    throw new OAuthError('invalid_grant', 'Invalid PKCE code_verifier', 400)
  }

  const user = await User.findById(codeDoc.userId)
  if (!user || !user.isActive) {
    throw new OAuthError('invalid_grant', 'User not found or inactive', 400)
  }

  const familyId = crypto.randomUUID()
  await OAuthAuthorizationCode.updateOne({ _id: codeDoc._id }, { $set: { familyId } })

  const { token: accessToken, expiresIn } = signMcpAccessToken({
    userId: user._id.toString(),
    clientId: params.client.id,
    resource: codeDoc.resource,
    familyId,
  })

  const refreshToken = randomToken()
  await OAuthRefreshToken.create({
    tokenHash: sha256Hex(refreshToken),
    userId: user._id,
    clientId: params.client.id,
    familyId,
    resource: codeDoc.resource,
    scope: codeDoc.scope,
    expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL * 1000),
    rotatedAt: null,
    revokedAt: null,
  })

  return {
    access_token: accessToken,
    token_type: 'Bearer' as const,
    expires_in: expiresIn,
    refresh_token: refreshToken,
    scope: codeDoc.scope,
  }
}

export async function rotateRefreshToken(params: {
  client: OAuthClientConfig
  refreshToken: string | null
  resource?: string | null
}) {
  if (!params.refreshToken) {
    throw new OAuthError('invalid_request', 'refresh_token is required', 400)
  }

  const tokenHash = sha256Hex(params.refreshToken)
  const now = new Date()

  const tokenDoc = await OAuthRefreshToken.findOneAndUpdate(
    {
      tokenHash,
      rotatedAt: null,
      revokedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { rotatedAt: now } },
    { new: false }
  )

  if (!tokenDoc) {
    const existing = await OAuthRefreshToken.findOne({ tokenHash })
    if (existing && existing.rotatedAt) {
      await revokeFamily(existing.familyId)
    }
    throw new OAuthError('invalid_grant', 'Refresh token is invalid or expired', 400)
  }

  if (tokenDoc.clientId !== params.client.id) {
    await revokeFamily(tokenDoc.familyId)
    throw new OAuthError('invalid_grant', 'Client mismatch', 400)
  }

  if (params.resource && normalizeUrl(params.resource) !== tokenDoc.resource) {
    throw new OAuthError('invalid_grant', 'resource mismatch', 400)
  }

  const user = await User.findById(tokenDoc.userId)
  if (!user || !user.isActive) {
    await revokeAllForUser(tokenDoc.userId.toString())
    throw new OAuthError('invalid_grant', 'User not found or inactive', 400)
  }

  const { token: accessToken, expiresIn } = signMcpAccessToken({
    userId: user._id.toString(),
    clientId: params.client.id,
    resource: tokenDoc.resource,
    familyId: tokenDoc.familyId,
  })

  const newRefreshToken = randomToken()
  await OAuthRefreshToken.create({
    tokenHash: sha256Hex(newRefreshToken),
    userId: user._id,
    clientId: params.client.id,
    familyId: tokenDoc.familyId,
    resource: tokenDoc.resource,
    scope: tokenDoc.scope,
    expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL * 1000),
    rotatedAt: null,
    revokedAt: null,
  })

  return {
    access_token: accessToken,
    token_type: 'Bearer' as const,
    expires_in: expiresIn,
    refresh_token: newRefreshToken,
    scope: tokenDoc.scope,
  }
}

export async function exchangeToken(params: {
  client: OAuthClientConfig
  subjectToken: string | null
  subjectTokenType: string | null
  requestedTokenType?: string | null
}) {
  if (params.client.id !== MCP_SERVER_CLIENT_ID) {
    throw new OAuthError('unauthorized_client', 'Client is not authorized for token exchange', 400)
  }

  if (!params.subjectToken || params.subjectTokenType !== ACCESS_TOKEN_TYPE) {
    throw new OAuthError(
      'invalid_request',
      'subject_token and valid subject_token_type are required',
      400
    )
  }

  if (params.requestedTokenType && params.requestedTokenType !== ACCESS_TOKEN_TYPE) {
    throw new OAuthError('invalid_request', 'Unsupported requested_token_type', 400)
  }

  let payload: McpAccessTokenPayload
  try {
    payload = verifyMcpAccessToken(params.subjectToken)
  } catch {
    throw new OAuthError('invalid_grant', 'subject token invalid', 400)
  }

  if (payload.client_id !== CLAUDE_CODE_CLIENT_ID) {
    throw new OAuthError('invalid_grant', 'subject token invalid', 400)
  }

  const scopes = typeof payload.scope === 'string' ? payload.scope.split(/\s+/) : []
  if (!scopes.includes(SCOPE)) {
    throw new OAuthError('invalid_grant', 'subject token missing required scope', 400)
  }

  if (payload.sid) {
    const revoked = await OAuthRefreshToken.exists({
      familyId: payload.sid,
      revokedAt: { $ne: null },
    })
    if (revoked) {
      throw new OAuthError('invalid_grant', 'Token session has been revoked', 400)
    }
  }

  if (!payload.sub) {
    throw new OAuthError('invalid_grant', 'subject token invalid', 400)
  }

  const user = await User.findById(payload.sub)
  if (!user || !user.isActive) {
    throw new OAuthError('invalid_grant', 'User not found or inactive', 400)
  }

  const nowSec = Math.floor(Date.now() / 1000)
  const remaining = typeof payload.exp === 'number' ? payload.exp - nowSec : 0
  const expiresIn = Math.min(ACCESS_TOKEN_TTL, remaining)
  if (expiresIn < 1) {
    throw new OAuthError('invalid_grant', 'subject token expired', 400)
  }

  const jwtSecret = process.env.JWT_SECRET || 'your-secret-key'
  const apiToken = jwt.sign(
    {
      userId: user._id,
      email: user.email,
      role: user.role,
    },
    jwtSecret,
    { expiresIn }
  )

  return {
    access_token: apiToken,
    issued_token_type: ACCESS_TOKEN_TYPE,
    token_type: 'Bearer' as const,
    expires_in: expiresIn,
  }
}

export async function revokeToken(params: {
  client: OAuthClientConfig
  token: string
}): Promise<void> {
  const tokenHash = sha256Hex(params.token)
  const refreshDoc = await OAuthRefreshToken.findOne({ tokenHash })

  if (refreshDoc) {
    if (refreshDoc.clientId === params.client.id) {
      await revokeFamily(refreshDoc.familyId)
    }
    return
  }

  if (params.token.split('.').length === 3) {
    try {
      const payload = verifyMcpAccessToken(params.token, { ignoreExpiration: true })
      if (payload.client_id === params.client.id && payload.sid) {
        await revokeFamily(payload.sid)
      }
    } catch {
      // RFC 7009: never throw for unknown or invalid tokens
    }
  }
}
