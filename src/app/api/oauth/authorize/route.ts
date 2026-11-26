import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'
import connectDB from '@/lib/db-config'
import { User } from '@/models/User'
import {
  NO_STORE_HEADERS,
  OAuthConfigError,
  buildRedirect,
  issueAuthorizationCode,
  validateAuthorizeRequest,
} from '@/lib/oauth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key'

async function resolveAuthenticatedUser() {
  const cookieStore = cookies()
  const accessToken = cookieStore.get('accessToken')?.value
  const refreshToken = cookieStore.get('refreshToken')?.value

  if (!accessToken && !refreshToken) {
    return null
  }

  await connectDB()

  if (accessToken) {
    try {
      const decoded = jwt.verify(accessToken, JWT_SECRET) as { userId?: string }
      if (decoded?.userId) {
        const user = await User.findById(decoded.userId)
        if (user && user.isActive) {
          return user
        }
      }
    } catch {
      // Fall through to refreshToken check
    }
  }

  if (refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as { userId?: string }
      if (decoded?.userId) {
        const user = await User.findById(decoded.userId)
        if (user && user.isActive) {
          return user
        }
      }
    } catch {
      // Both tokens invalid
    }
  }

  return null
}

function isOriginValid(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true
  const host = request.headers.get('host')
  if (!host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = (request.headers.get('content-type') || '').toLowerCase()
    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json' },
        { status: 415, headers: NO_STORE_HEADERS }
      )
    }

    if (!isOriginValid(request)) {
      return NextResponse.json(
        { error: 'Invalid request origin' },
        { status: 403, headers: NO_STORE_HEADERS }
      )
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { error: 'Invalid JSON request body', validParams: false },
        { status: 400, headers: NO_STORE_HEADERS }
      )
    }

    const action = body.action
    if (action !== 'check' && action !== 'approve' && action !== 'deny') {
      return NextResponse.json(
        { error: 'Invalid action', validParams: false },
        { status: 400, headers: NO_STORE_HEADERS }
      )
    }

    const validation = validateAuthorizeRequest({
      client_id: body.client_id,
      redirect_uri: body.redirect_uri,
      response_type: body.response_type,
      code_challenge: body.code_challenge,
      code_challenge_method: body.code_challenge_method,
      state: body.state,
      resource: body.resource,
      scope: body.scope,
    })

    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error, validParams: false },
        { status: 400, headers: NO_STORE_HEADERS }
      )
    }

    if (action === 'deny') {
      return NextResponse.json(
        {
          redirectUrl: buildRedirect(validation.redirectUri, {
            error: 'access_denied',
            state: validation.state,
          }),
        },
        { status: 200, headers: NO_STORE_HEADERS }
      )
    }

    const user = await resolveAuthenticatedUser()
    const cookieStore = cookies()

    if (!user) {
      cookieStore.delete('accessToken')
      cookieStore.delete('refreshToken')

      return NextResponse.json(
        { authenticated: false, validParams: true },
        { status: 401, headers: NO_STORE_HEADERS }
      )
    }

    if (action === 'check') {
      return NextResponse.json(
        {
          authenticated: true,
          client: {
            id: validation.client.id,
            name: validation.client.name,
          },
          user: {
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
          },
          resource: validation.resource,
        },
        { status: 200, headers: NO_STORE_HEADERS }
      )
    }

    const code = await issueAuthorizationCode({
      client: validation.client,
      userId: user._id.toString(),
      redirectUri: validation.redirectUri,
      codeChallenge: validation.codeChallenge,
      resource: validation.resource,
    })

    return NextResponse.json(
      {
        redirectUrl: buildRedirect(validation.redirectUri, {
          code,
          state: validation.state,
        }),
      },
      { status: 200, headers: NO_STORE_HEADERS }
    )
  } catch (error) {
    if (error instanceof OAuthConfigError) {
      return NextResponse.json(
        { error: 'OAuth server is not configured', validParams: false },
        { status: 500, headers: NO_STORE_HEADERS }
      )
    }
    console.error(
      'OAuth authorize error:',
      error instanceof Error ? error.message : 'Unknown error'
    )
    return NextResponse.json(
      { error: 'Failed to process authorization request' },
      { status: 500, headers: NO_STORE_HEADERS }
    )
  }
}
