import {
  OAuthConfigError,
  SCOPE,
  TOKEN_EXCHANGE_GRANT,
  getIssuer,
  oauthError,
  oauthJson,
} from '@/lib/oauth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const issuer = getIssuer()

    return oauthJson({
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/api/oauth/token`,
      jwks_uri: `${issuer}/api/oauth/jwks`,
      revocation_endpoint: `${issuer}/api/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token', TOKEN_EXCHANGE_GRANT],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: [
        'none',
        'client_secret_basic',
        'client_secret_post',
      ],
      revocation_endpoint_auth_methods_supported: [
        'none',
        'client_secret_basic',
        'client_secret_post',
      ],
      scopes_supported: [SCOPE],
      authorization_response_iss_parameter_supported: true,
    })
  } catch (error) {
    if (error instanceof OAuthConfigError) {
      return oauthError('server_error', 'OAuth server is not configured', 500)
    }
    return oauthError('server_error', 'Internal server error', 500)
  }
}
