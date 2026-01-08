import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { hasDatabaseConfig } from '@/lib/db-config'
import { User } from '@/models/User'
import bcrypt from 'bcryptjs'
import { authenticateUser } from '@/lib/auth-utils'

export async function PUT(request: NextRequest) {
  try {
    // Authenticate user
    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const { user } = authResult
    const { currentPassword, newPassword } = await request.json()

    // Check if database is configured
    const isConfigured = await hasDatabaseConfig()
    if (!isConfigured) {
      return NextResponse.json(
        { message: 'Password updated successfully (demo mode)' },
        { status: 200 }
      )
    }

    await connectDB()

    // Find the authenticated user
    const dbUser = await User.findById(user.id)

    if (!dbUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }
    
    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, dbUser.password)

    if (!isCurrentPasswordValid) {
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 400 }
      )
    }

    // Hash the new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12)

    // Update the user's password
    await User.findByIdAndUpdate(dbUser._id, {
      password: hashedNewPassword
    })
    
    return NextResponse.json({
      message: 'Password updated successfully'
    })
  } catch (error) {
    console.error('Password update failed:', error)
    return NextResponse.json(
      { error: 'Failed to update password' },
      { status: 500 }
    )
  }
}
