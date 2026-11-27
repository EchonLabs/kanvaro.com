import { NextRequest } from 'next/server'
import connectDB from '@/lib/db-config'
import {
  OAuthConfigError,
  OAuthError,
  TOKEN_EXCHANGE_GRANT,
  authenticateClient,
  exchangeToken,
  oauthError,
  oauthJson,
  readParams,
  redeemAuthorizationCode,
  rotateRefreshToken,
} from '@/lib/oauth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const KNOWN_GRANTS = new Set([
  'authorization_code',
  'refresh_token',
  TOKEN_EXCHANGE_GRANT,
])

export async function POST(request: NextRequest) {
  try {
    const params = await readParams(request)
    const client = authenticateClient(request, params)

    const grantType = params.get('grant_type')
    if (!grantType) {
      throw new OAuthError('invalid_request', 'grant_type is required', 400)
    }

    if (!KNOWN_GRANTS.has(grantType)) {
      throw new OAuthError(
        'unsupported_grant_type',
        `Unsupported grant_type: ${grantType}`,
        400
      )
    }

    if (!client.grants.includes(grantType)) {
      throw new OAuthError(
        'unauthorized_client',
        'Client is not authorized for this grant_type',
        400
      )
    }

    await connectDB()

    if (grantType === 'authorization_code') {
      const result = await redeemAuthorizationCode({
        client,
        code: params.get('code'),
        redirectUri: params.get('redirect_uri'),
        codeVerifier: params.get('code_verifier'),
        resource: params.get('resource'),
      })
      return oauthJson(result, 200)
    }

    if (grantType === 'refresh_token') {
      const result = await rotateRefreshToken({
        client,
        refreshToken: params.get('refresh_token'),
        resource: params.get('resource'),
      })
      return oauthJson(result, 200)
    }

    const result = await exchangeToken({
      client,
      subjectToken: params.get('subject_token'),
      subjectTokenType: params.get('subject_token_type'),
      requestedTokenType: params.get('requested_token_type'),
    })
    return oauthJson(result, 200)
  } catch (error) {
    if (error instanceof OAuthError) {
      return oauthError(error.error, error.description, error.status, error.extraHeaders)
    }
    if (error instanceof OAuthConfigError) {
      return oauthError('server_error', 'OAuth server is not configured', 500)
    }
    console.error(
      'OAuth token error:',
      error instanceof Error ? error.message : 'Unknown error'
    )
    return oauthError('server_error', 'Internal server error', 500)
  }
}
