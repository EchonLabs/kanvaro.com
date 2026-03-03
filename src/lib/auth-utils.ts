import connectDB from '@/lib/db-config'
import { User } from '@/models/User'
import jwt from 'jsonwebtoken'
import { cookies } from 'next/headers'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key'

export interface AuthUser {
  id: string
  organization: string
  email: string
  role: string
}

export async function withAuth(request: any, handler: (user: AuthUser) => Promise<any>) {
  const authResult = await authenticateUser()
  
  if ('error' in authResult) {
    return new Response(JSON.stringify({ error: authResult.error }), { 
      status: authResult.status,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  return handler(authResult.user)
}

export async function authenticateUser(): Promise<{ user: AuthUser } | { error: string; status: number }> {
  try {
    await connectDB()

    const cookieStore = cookies()
    const accessToken = cookieStore.get('accessToken')?.value
    const refreshToken = cookieStore.get('refreshToken')?.value

    // If no tokens, return unauthorized
    if (!accessToken && !refreshToken) {
      return { error: 'No authentication tokens', status: 401 }
    }

    let userData = null

    // Try to verify access token first
    if (accessToken) {
      try {
        const decoded = jwt.verify(accessToken, JWT_SECRET) as any
        const user = await User.findById(decoded.userId)
        if (user && user.isActive) {
          userData = {
            id: user._id,
            organization: user.organization,
            email: user.email,
            role: user.role
          }
        }
      } catch (error) {
        // Access token is invalid, try refresh token
        if (refreshToken) {
          try {
            const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as any
            const user = await User.findById(decoded.userId)
            if (user && user.isActive) {
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

              userData = {
                id: user._id,
                organization: user.organization,
                email: user.email,
                role: user.role
              }
            }
          } catch (refreshError) {
            return { error: 'Invalid authentication tokens', status: 401 }
          }
        } else {
          return { error: 'Invalid access token', status: 401 }
        }
      }
    } else if (refreshToken) {
      // Only refresh token available
      try {
        const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as any
        const user = await User.findById(decoded.userId)
        if (user && user.isActive) {
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

          userData = {
            id: user._id,
            organization: user.organization,
            email: user.email,
            role: user.role
          }
        }
      } catch (error) {
        return { error: 'Invalid refresh token', status: 401 }
      }
    }

    if (!userData) {
      return { error: 'User not found or inactive', status: 401 }
    }

    return { user: userData }
  } catch (error) {
    console.error('Authentication error:', error)
    return { error: 'Internal server error', status: 500 }
  }
}
