import { NextResponse } from 'next/server'
import '@/models/CustomRole' // Ensure CustomRole model is registered for populate
import { normalizeUploadUrl } from '@/lib/file-utils'
import { authenticateUserWithDocument } from '@/lib/auth-utils'

export const dynamic = 'force-dynamic'

/**
 * The signed-in user's own profile.
 *
 * Uses the shared sign-in check (decision record F3), so it accepts an
 * `Authorization: Bearer` token as well as the browser cookies; it used to
 * read only the cookies, carrying its own copy of the token logic. The shared
 * check already loads the user, and that document is reused here, so this
 * polled route makes no more queries than before.
 */
export async function GET() {
  try {
    const auth = await authenticateUserWithDocument()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const user = auth.document
    await user.populate('customRole', 'name')

    return NextResponse.json({
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      memberId: user.memberId,
      email: user.email,
      role: user.role,
      customRole: user.customRole ? {
        _id: (user.customRole as any)._id.toString(),
        name: (user.customRole as any).name
      } : null,
      organization: user.organization,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      avatar: normalizeUploadUrl(user.avatar || ''),
      timezone: user.timezone,
      language: user.language,
      currency: user.currency,
      preferences: user.preferences,
      twoFactorEnabled: user.twoFactorEnabled ?? false,
      security: {
        loginAlerts: user.security?.loginAlerts ?? true,
        sessionTimeout: user.security?.sessionTimeout ?? 240,
        requirePasswordChange: user.security?.requirePasswordChange ?? false
      },
      lastLogin: user.lastLogin
    })
  } catch (error) {
    console.error('Auth check error:', error)
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    )
  }
}
