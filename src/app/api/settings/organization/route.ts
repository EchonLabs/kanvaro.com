import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Organization } from '@/models/Organization'
import { authenticateUser } from '@/lib/auth-utils'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { ensureDirectoryExists, getUploadDirectory, getUploadUrl, normalizeUploadUrl } from '@/lib/file-utils'

export async function GET(request: NextRequest) {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const { user } = authResult
    const organizationId = user.organization

    const organization = await Organization.findById(organizationId)
    if (!organization) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      )
    }

    // Normalize logo URLs before returning
    const responseData = {
      ...organization.toObject(),
      logo: normalizeUploadUrl(organization.logo || ''),
      darkLogo: normalizeUploadUrl(organization.darkLogo || '')
    }

    return NextResponse.json({
      success: true,
      data: responseData
    })

  } catch (error) {
    console.error('Get organization error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const { user } = authResult
    const organizationId = user.organization

    // Check if user has permission to update organization
    if (!['admin'].includes(user.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const formData = await request.formData()
    
    const updateData: any = {
      name: formData.get('name'),
      domain: formData.get('domain'),
      timezone: formData.get('timezone'),
      currency: formData.get('currency'),
      language: formData.get('language'),
      industry: formData.get('industry'),
      size: formData.get('size'),
      logoMode: formData.get('logoMode')
    }

    // Handle logo uploads
    const logoFile = formData.get('logo') as File
    const darkLogoFile = formData.get('darkLogo') as File

    if (logoFile && logoFile.size > 0) {
      const logoUrl = await saveLogoFile(logoFile, organizationId, 'light')
      updateData.logo = logoUrl
    }

    if (darkLogoFile && darkLogoFile.size > 0) {
      const darkLogoUrl = await saveLogoFile(darkLogoFile, organizationId, 'dark')
      updateData.darkLogo = darkLogoUrl
    }

    const organization = await Organization.findByIdAndUpdate(
      organizationId,
      updateData,
      { new: true }
    )

    if (!organization) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      )
    }

    // Normalize logo URLs before returning
    const responseData = {
      ...organization.toObject(),
      logo: normalizeUploadUrl(organization.logo || ''),
      darkLogo: normalizeUploadUrl(organization.darkLogo || '')
    }

    return NextResponse.json({
      success: true,
      message: 'Organization updated successfully',
      data: responseData
    })

  } catch (error) {
    console.error('Update organization error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function saveLogoFile(file: File, organizationId: string, type: 'light' | 'dark'): Promise<string> {
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  
  // Ensure uploads directory exists with proper permissions
  const uploadsDir = getUploadDirectory('logos')
  await ensureDirectoryExists(uploadsDir)
  
  // Generate unique filename
  const timestamp = Date.now()
  const extension = file.name.split('.').pop()
  const filename = `${organizationId}-${type}-${timestamp}.${extension}`
  const filepath = join(uploadsDir, filename)
  
  // Save file
  await writeFile(filepath, buffer)
  
  // Return public URL (uses API route if files are stored outside public directory)
  return getUploadUrl('logos', filename)
}
