import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import connectDB from '@/lib/db-config'
import { User } from '@/models/User'
import '@/models/CustomRole' // Ensure CustomRole model is registered for populate
import jwt from 'jsonwebtoken'
import { normalizeUploadUrl } from '@/lib/file-utils'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key'

export async function GET() {
  try {
    const cookieStore = cookies()
    const accessToken = cookieStore.get('accessToken')?.value
    const refreshToken = cookieStore.get('refreshToken')?.value

    console.log('Auth check - accessToken:', accessToken ? 'present' : 'missing')
    console.log('Auth check - refreshToken:', refreshToken ? 'present' : 'missing')

    // If no tokens, return unauthorized
    if (!accessToken && !refreshToken) {
      console.log('No authentication tokens found')
      return NextResponse.json(
        { error: 'No authentication tokens' },
        { status: 401 }
      )
    }

    let userData = null

    // Try to verify access token first
    if (accessToken) {
      try {
        const decoded = jwt.verify(accessToken, JWT_SECRET) as any
        console.log('Access token verified for user:', decoded.userId)
        
        // Database mode - fetch user from database
        await connectDB()
        const user = await User.findById(decoded.userId).populate('customRole', 'name')
        if (user && user.isActive) {
          console.log('User found in database:', user.email)
          userData = {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
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
            lastLogin: user.lastLogin
          }
        } else {
          console.log('User not found or inactive')
        }
      } catch (error) {
        console.log('Access token invalid, trying refresh token')
        // Access token is invalid, try refresh token
        if (refreshToken) {
          try {
            const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as any
            console.log('Refresh token verified for user:', decoded.userId)
            
            // Database mode - fetch user from database
            await connectDB()
            const user = await User.findById(decoded.userId).populate('customRole', 'name')
            if (user && user.isActive) {
              console.log('User found via refresh token:', user.email)
              
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
                firstName: user.firstName,
                lastName: user.lastName,
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
                lastLogin: user.lastLogin
              }
            } else {
              console.log('User not found or inactive via refresh token')
            }
          } catch (refreshError) {
            console.log('Refresh token also invalid')
            return NextResponse.json(
              { error: 'Invalid authentication tokens' },
              { status: 401 }
            )
          }
        } else {
          console.log('No refresh token available')
          return NextResponse.json(
            { error: 'Invalid access token' },
            { status: 401 }
          )
        }
      }
    } else if (refreshToken) {
      // Only refresh token available
      try {
        const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as any
        console.log('Only refresh token available, verifying for user:', decoded.userId)
        
        await connectDB()
        const user = await User.findById(decoded.userId).populate('customRole', 'name')
        if (user && user.isActive) {
          console.log('User found via refresh token only:', user.email)
          
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
            firstName: user.firstName,
            lastName: user.lastName,
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
            lastLogin: user.lastLogin
          }
        } else {
          console.log('User not found or inactive via refresh token only')
        }
      } catch (error) {
        console.log('Refresh token invalid')
        return NextResponse.json(
          { error: 'Invalid refresh token' },
          { status: 401 }
        )
      }
    }

    if (userData) {
      console.log('Returning user data for:', userData.email)
      return NextResponse.json(userData)
    } else {
      console.log('No valid user data found')
      return NextResponse.json(
        { error: 'User not found or inactive' },
        { status: 401 }
      )
    }

  } catch (error) {
    console.error('Auth check error:', error)
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    )
  }
}