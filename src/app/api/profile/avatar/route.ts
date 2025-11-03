import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { User } from '@/models/User'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { authenticateUser } from '@/lib/auth-utils'
import { ensureDirectoryExists, getUploadDirectory, getUploadUrl } from '@/lib/file-utils'

export async function POST(request: NextRequest) {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const userId = authResult.user.id
    const organizationId = authResult.user.organization

    const formData = await request.formData()
    const file = formData.get('avatar') as File

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.' },
        { status: 400 }
      )
    }

    // Validate file size (2MB max)
    const maxSize = 2 * 1024 * 1024 // 2MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 2MB.' },
        { status: 400 }
      )
    }

    // Find user
    const user = await User.findOne({
      _id: userId,
      organization: organizationId
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Ensure uploads directory exists with proper permissions
    const uploadsDir = getUploadDirectory('avatars')
    await ensureDirectoryExists(uploadsDir)

    // Generate unique filename
    const fileExtension = file.name.split('.').pop()
    const fileName = `${userId}-${Date.now()}.${fileExtension}`
    const filePath = join(uploadsDir, fileName)

    // Save file
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filePath, buffer)

    // Update user avatar (uses API route if files are stored outside public directory)
    const avatarUrl = getUploadUrl('avatars', fileName)
    user.avatar = avatarUrl
    await user.save()

    return NextResponse.json({
      success: true,
      message: 'Avatar uploaded successfully',
      data: {
        avatar: avatarUrl
      }
    })

  } catch (error) {
    console.error('Avatar upload error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
