import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { authenticateUser } from '@/lib/auth-utils'
import { User, IUser } from '@/models/User'

const DEFAULT_SECURITY_SETTINGS = {
  loginAlerts: true,
  sessionTimeout: 30,
  requirePasswordChange: false
}

const sanitizeSessionTimeout = (value?: number) => {
  const parsed = Number(value)
  if (Number.isNaN(parsed)) {
    return DEFAULT_SECURITY_SETTINGS.sessionTimeout
  }
  return Math.min(Math.max(Math.round(parsed), 5), 1440)
}

const buildSecurityResponse = (user: IUser | null) => ({
  twoFactorEnabled: user?.twoFactorEnabled ?? false,
  loginAlerts: user?.security?.loginAlerts ?? DEFAULT_SECURITY_SETTINGS.loginAlerts,
  sessionTimeout: sanitizeSessionTimeout(user?.security?.sessionTimeout),
  requirePasswordChange: user?.security?.requirePasswordChange ?? DEFAULT_SECURITY_SETTINGS.requirePasswordChange
})

export async function GET() {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const user = await User.findById(authResult.user.id)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: buildSecurityResponse(user)
    })
  } catch (error) {
    console.error('Fetch security settings error:', error)
    return NextResponse.json({ error: 'Failed to load security settings' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const payload = await request.json().catch(() => null)
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 })
    }

    const user = await User.findById(authResult.user.id)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const currentSecurity = user.security ?? DEFAULT_SECURITY_SETTINGS

    const loginAlerts = typeof payload.loginAlerts === 'boolean'
      ? payload.loginAlerts
      : currentSecurity.loginAlerts ?? DEFAULT_SECURITY_SETTINGS.loginAlerts

    const requirePasswordChange = typeof payload.requirePasswordChange === 'boolean'
      ? payload.requirePasswordChange
      : currentSecurity.requirePasswordChange ?? DEFAULT_SECURITY_SETTINGS.requirePasswordChange

    let boundedSessionTimeout: number
    if (payload.sessionTimeout !== undefined) {
      const parsedTimeout = Number(payload.sessionTimeout)
      if (Number.isNaN(parsedTimeout)) {
        return NextResponse.json({ error: 'Session timeout must be a number' }, { status: 400 })
      }
      if (parsedTimeout < 5 || parsedTimeout > 1440) {
        return NextResponse.json({ error: 'Session timeout must be between 5 and 1440 minutes' }, { status: 400 })
      }
      boundedSessionTimeout = Math.min(Math.max(Math.round(parsedTimeout), 5), 1440)
    } else {
      boundedSessionTimeout = sanitizeSessionTimeout(currentSecurity.sessionTimeout)
    }

    const securityUpdate = {
      loginAlerts,
      sessionTimeout: boundedSessionTimeout,
      requirePasswordChange
    }

    const updatePayload: Record<string, unknown> = {
      security: securityUpdate
    }

    if (typeof payload.twoFactorEnabled === 'boolean') {
      updatePayload.twoFactorEnabled = payload.twoFactorEnabled
    }

    const updatedUser = await User.findByIdAndUpdate(user._id, updatePayload, { new: true })
    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      message: 'Security settings updated successfully',
      data: buildSecurityResponse(updatedUser)
    })
  } catch (error) {
    console.error('Update security settings error:', error)
    return NextResponse.json({ error: 'Failed to update security settings' }, { status: 500 })
  }
}
