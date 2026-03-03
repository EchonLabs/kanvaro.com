import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { hasDatabaseConfig } from '@/lib/db-config'
import { Organization } from '@/models/Organization'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'
import { normalizeUploadUrl } from '@/lib/file-utils'

export async function GET() {
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

    // Check if user can read organization settings
    const canReadSettings = await PermissionService.hasPermission(user.id, Permission.ORGANIZATION_READ)
    if (!canReadSettings) {
      return NextResponse.json(
        { error: 'Insufficient permissions to read organization settings' },
        { status: 403 }
      )
    }

    // Check if database is configured
    const isConfigured = await hasDatabaseConfig()
    if (!isConfigured) {
      // Demo mode - return minimal organization settings without contact info
      const mockSettings = {
        id: '1',
        name: 'Kanvaro',
        logo: null,
        darkLogo: null,
        logoMode: 'auto',
        contactInfo: null,
        isConfigured: false
      }
      return NextResponse.json(mockSettings)
    }

    await connectDB()
    
    // Find organization settings
    const organization = await Organization.findOne()
    
    if (!organization) {
      return NextResponse.json({
        id: null,
        name: 'Kanvaro',
        logo: null,
        darkLogo: null,
        logoMode: 'auto',
        contactInfo: null,
        isConfigured: false
      })
    }

    // Return organization settings with contact info
    const settings = {
      id: organization._id,
      name: organization.name,
      logo: normalizeUploadUrl(organization.logo || ''),
      darkLogo: normalizeUploadUrl(organization.darkLogo || ''),
      logoMode: organization.logoMode,
      contactInfo: organization.contactInfo || null,
      isConfigured: !!organization.contactInfo
    }

    return NextResponse.json(settings)
  } catch (error) {
    console.error('Failed to fetch organization settings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch organization settings' },
      { status: 500 }
    )
  }
}

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

    // Check if user can update organization settings
    const canUpdateSettings = await PermissionService.hasPermission(user.id, Permission.ORGANIZATION_UPDATE)
    if (!canUpdateSettings) {
      return NextResponse.json(
        { error: 'Insufficient permissions to update organization settings' },
        { status: 403 }
      )
    }

    const updateData = await request.json()

    // Check if database is configured
    const isConfigured = await hasDatabaseConfig()
    if (!isConfigured) {
      return NextResponse.json(
        { message: 'Organization settings updated successfully (demo mode)' },
        { status: 200 }
      )
    }

    await connectDB()

    // Update organization settings
    const organization = await Organization.findOneAndUpdate(
      {},
      {
        name: updateData.name,
        logo: updateData.logo,
        darkLogo: updateData.darkLogo,
        logoMode: updateData.logoMode,
        contactInfo: updateData.contactInfo
      },
      { new: true, upsert: true }
    )

    if (!organization) {
      return NextResponse.json(
        { error: 'Failed to update organization settings' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Organization settings updated successfully',
      data: {
        id: organization._id,
        name: organization.name,
        logo: normalizeUploadUrl(organization.logo || ''),
        darkLogo: normalizeUploadUrl(organization.darkLogo || ''),
        logoMode: organization.logoMode,
        contactInfo: organization.contactInfo,
        isConfigured: !!organization.contactInfo
      }
    })
  } catch (error) {
    console.error('Failed to update organization settings:', error)
    return NextResponse.json(
      { error: 'Failed to update organization settings' },
      { status: 500 }
    )
  }
}
