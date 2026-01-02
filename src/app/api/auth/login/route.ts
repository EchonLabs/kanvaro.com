import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import connectDB from '@/lib/db-config'
import { connectWithStoredConfig, hasDatabaseConfig } from '@/lib/db-config'
import { User } from '@/models/User'
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

    // Always use database authentication
    
    try {
      // Check if we have stored database configuration
      const hasStoredConfig = await hasDatabaseConfig()
      
      let db
      if (hasStoredConfig) {
        // Use stored database configuration from setup
        db = await connectWithStoredConfig()
      } else {
        // Fall back to environment variable
        const isConfigured = await hasDatabaseConfig()
        if (!isConfigured) {
          console.error('No database configuration found')
          return NextResponse.json(
            { error: 'Database not configured. Please complete the setup process first.' },
            { status: 500 }
          )
        }
        db = await connectDB()
      }
      
      
      // Ensure connection is ready
      if (db.connection.readyState !== 1) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Database connection timeout'))
          }, 10000) // 10 second timeout
          
          const checkConnection = () => {
            if (db.connection.readyState === 1) {
              clearTimeout(timeout)
              resolve(true)
            } else {
              setTimeout(checkConnection, 100)
            }
          }
          checkConnection()
        })
      }
      
    } catch (dbError) {
      console.error('Database connection failed:', dbError)
      return NextResponse.json(
        { error: 'Database connection failed', details: dbError instanceof Error ? dbError.message : 'Unknown error' },
        { status: 500 }
      )
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() })
    
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Check if user is active
    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Account is deactivated' },
        { status: 401 }
      )
    }


    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password)
    
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Update last login timestamp
    user.lastLogin = new Date()
    await user.save()

    // Create JWT tokens
    const accessToken = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '15m' }
    )

    const refreshToken = jwt.sign(
      { userId: user._id, email: user.email },
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
        maxAge: 15 * 60, // 15 minutes
        path: '/'
      })

      cookieStore.set('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60, // 7 days
        path: '/'
      })
    } catch (cookieError) {
      console.error('Failed to set cookies:', cookieError)
      return NextResponse.json(
        { error: 'Failed to set authentication cookies' },
        { status: 500 }
      )
    }

    // Return user data (without password)
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
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    return NextResponse.json(
      { 
        error: 'Login failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
