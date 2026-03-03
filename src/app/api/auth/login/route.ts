import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import connectDB from '@/lib/db-config'
import { hasDatabaseConfig } from '@/lib/db-config'
import { getOrgConfigs } from '@/lib/config'
import { getOrgConnection, getModelOnConnection } from '@/lib/db-connection-manager'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key'

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const hasConfig = await hasDatabaseConfig()
    if (!hasConfig) {
      return NextResponse.json(
        { error: 'Database not configured. Please complete the setup process first.' },
        { status: 500 }
      )
    }

    // ── Find which org this email belongs to ──────────────────────────────────
    // Try each configured org's database until we find the user.
    const orgs = getOrgConfigs()
    let user: any = null
    let activeOrgId: string = orgs[0]?.id ?? ''

    for (const org of orgs) {
      try {
        await connectDB(org.id)  // sets AsyncLocalStorage for this context
        const conn = await getOrgConnection(org.id)
        const UserModel = getModelOnConnection<any>('User', conn)
        const found = await UserModel.findOne({ email: email.toLowerCase() })
        if (found) {
          user = found
          activeOrgId = org.id
          break
        }
      } catch (err) {
        console.warn(`Could not check org [${org.id}] during login:`, err)
      }
    }

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Account is deactivated' },
        { status: 401 }
      )
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Update last login
    user.lastLogin = new Date()
    await user.save()

    // ── Create JWT tokens (include orgId) ─────────────────────────────────────
    const accessToken = jwt.sign(
      { userId: user._id, email: user.email, role: user.role, orgId: activeOrgId },
      JWT_SECRET,
      { expiresIn: '15m' }
    )

    const refreshToken = jwt.sign(
      { userId: user._id, email: user.email, orgId: activeOrgId },
      JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    )

    // Set HTTP-only cookies
    const cookieStore = cookies()

    try {
      cookieStore.set('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 15 * 60,
        path: '/'
      })

      cookieStore.set('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
        path: '/'
      })

      // Also store orgId as a non-httpOnly cookie so client-side code can read it if needed
      cookieStore.set('orgId', activeOrgId, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
        path: '/'
      })
    } catch (cookieError) {
      console.error('Failed to set cookies:', cookieError)
      return NextResponse.json(
        { error: 'Failed to set authentication cookies' },
        { status: 500 }
      )
    }

    const userData = {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      organization: user.organization,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      timezone: user.timezone,
      language: user.language,
      currency: user.currency,
      preferences: user.preferences,
      lastLogin: user.lastLogin
    }

    return NextResponse.json({
      success: true,
      user: userData,
      message: 'Login successful'
    })

  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      {
        error: 'Login failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

