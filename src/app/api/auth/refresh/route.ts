import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'
import connectDB from '@/lib/db-config'
import { hasDatabaseConfig } from '@/lib/db-config'
import { User } from '@/models/User'
import { normalizeUploadUrl } from '@/lib/file-utils'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key'

export async function POST() {
  try {
    const cookieStore = cookies()
    const refreshToken = cookieStore.get('refreshToken')?.value

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'No refresh token provided' },
        { status: 401 }
      )
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as any

    // Check if database is configured
    const isConfigured = await hasDatabaseConfig()
    if (!isConfigured) {
      // Demo mode - return mock user
      const mockUser = {
        id: '1',
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@kanvaro.com',
        role: 'admin',
        organization: '1',
        isActive: true,
        emailVerified: true,
        timezone: 'UTC',
        language: 'en',
        currency: 'USD',
        preferences: {
          theme: 'system',
          sidebarCollapsed: false,
          notifications: {
            email: true,
            inApp: true,
            push: false
          }
        }
      }

      // Create new access token
      const newAccessToken = jwt.sign(
        { userId: mockUser.id, email: mockUser.email, role: mockUser.role },
        JWT_SECRET,
        { expiresIn: '15m' }
      )

      // Set new access token cookie
      cookieStore.set('accessToken', newAccessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 // 15 minutes
      })

      return NextResponse.json({
        success: true,
        user: mockUser
      })
    }

    await connectDB()

    // Find user
    const user = await User.findById(decoded.userId)
    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: 'User not found or inactive' },
        { status: 401 }
      )
    }

    // Create new access token
    const newAccessToken = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '15m' }
    )

    // Set new access token cookie
    cookieStore.set('accessToken', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 // 15 minutes
    })

    // Return user data
    const userData = {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      organization: user.organization,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      avatar: normalizeUploadUrl(user.avatar || ''),
      timezone: user.timezone,
      language: user.language,
      currency: user.currency,
      preferences: user.preferences
    }

    return NextResponse.json({
      success: true,
      user: userData
    })

  } catch (error) {
    console.error('Token refresh error:', error)
    
    // Clear invalid tokens
    const cookieStore = cookies()
    cookieStore.delete('accessToken')
    cookieStore.delete('refreshToken')
    
    return NextResponse.json(
      { error: 'Token refresh failed' },
      { status: 401 }
    )
  }
}
