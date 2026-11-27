import { NextRequest } from 'next/server'
import connectDB from '@/lib/db-config'
import {
  OAuthConfigError,
  OAuthError,
  authenticateClient,
  oauthError,
  oauthJson,
  readParams,
  revokeToken,
} from '@/lib/oauth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const params = await readParams(request)
    const client = authenticateClient(request, params)

    const token = params.get('token')
    if (!token || !token.trim()) {
      throw new OAuthError('invalid_request', 'Missing required parameter: token', 400)
    }

    await connectDB()
    await revokeToken({ client, token })

    return oauthJson({}, 200)
  } catch (error) {
    if (error instanceof OAuthError) {
      return oauthError(error.error, error.description, error.status, error.extraHeaders)
    }
    if (error instanceof OAuthConfigError) {
      return oauthError('server_error', 'OAuth server is not configured', 500)
    }
    console.error(
      'OAuth revoke error:',
      error instanceof Error ? error.message : 'Unknown error'
    )
    return oauthError('server_error', 'Internal server error', 500)
  }
}
