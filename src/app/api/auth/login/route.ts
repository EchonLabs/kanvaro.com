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
    console.log('Login attempt for email:', email)

    if (!email || !password) {
      console.log('Missing email or password')
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    // Always use database authentication
    console.log('Using database authentication for email:', email)
    
    try {
      // Check if we have stored database configuration
      const hasStoredConfig = await hasDatabaseConfig()
      console.log('Has stored database config:', hasStoredConfig)
      
      let db
      if (hasStoredConfig) {
        // Use stored database configuration from setup
        console.log('Using stored database configuration')
        db = await connectWithStoredConfig()
      } else {
        // Fall back to environment variable
        console.log('Using environment variable database configuration')
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
      
      console.log('Database connected successfully')
      
      // Ensure connection is ready
      if (db.connection.readyState !== 1) {
        console.log('Waiting for database connection to be ready...')
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
      
      console.log('Database connection is ready')
    } catch (dbError) {
      console.error('Database connection failed:', dbError)
      return NextResponse.json(
        { error: 'Database connection failed', details: dbError instanceof Error ? dbError.message : 'Unknown error' },
        { status: 500 }
      )
    }

    // Find user by email
    console.log('Looking for user with email:', email.toLowerCase())
    const user = await User.findOne({ email: email.toLowerCase() })
    console.log('User found:', user ? 'Yes' : 'No')
    
    if (!user) {
      console.log('User not found in database')
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

    // Check email verification if required by organization
    const Organization = (await import('@/models/Organization')).Organization
    const organization = await Organization.findById(user.organization)

    const requireEmailVerification = organization?.settings?.requireEmailVerification ?? true

    if (requireEmailVerification && !user.emailVerified) {
      return NextResponse.json(
        {
          error: 'Email verification required',
          requiresVerification: true,
          email: user.email
        },
        { status: 403 }
      )
    }

    // Verify password
    console.log('Verifying password for user:', user.email)
    const isPasswordValid = await bcrypt.compare(password, user.password)
    console.log('Password valid:', isPasswordValid)
    
    if (!isPasswordValid) {
      console.log('Password verification failed')
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Update last login timestamp
    user.lastLogin = new Date()
    await user.save()

    // Create JWT tokens
    console.log('Creating JWT tokens for user:', user.email)
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
    
    console.log('JWT tokens created successfully')

    // Set HTTP-only cookies
    console.log('Setting cookies for user:', user.email)
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
      console.log('Cookies set successfully')
    } catch (cookieError) {
      console.error('Failed to set cookies:', cookieError)
      return NextResponse.json(
        { error: 'Failed to set authentication cookies' },
        { status: 500 }
      )
    }

    // Return user data (without password)
    console.log('Preparing user data for response')
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

    console.log('Login successful for user:', user.email)
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
