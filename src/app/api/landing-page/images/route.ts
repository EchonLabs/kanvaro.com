import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Organization } from '@/models/Organization'
import { hasDatabaseConfig } from '@/lib/db-config'

/**
 * GET /api/landing-page/images
 * Fetch landing page image URLs (public endpoint, no auth required)
 */
export async function GET() {
  try {
    // Check if database is configured
    const isConfigured = await hasDatabaseConfig()
    if (!isConfigured) {
      // Return empty/default images in demo mode
      return NextResponse.json({
        heroDashboard: null,
        modulePreview: null,
        stepImages: {
          step1: null,
          step2: null,
          step3: null
        },
        showcaseImages: {
          tasks: null,
          projects: null,
          members: null,
          timeLogs: null,
          reports: null
        }
      })
    }

    await connectDB()
    
    // Try to find organization - first check if we have a user context (for authenticated requests)
    let organization = await Organization.findOne().sort({ createdAt: -1 })
    
    // Log for debugging
    if (!organization) {
      console.log('No organization found in database')
    } else {
      console.log('Found organization:', organization._id)
      console.log('Organization has landingPageImages:', !!organization.landingPageImages)
    }
    
    if (!organization) {
      return NextResponse.json({
        heroDashboard: null,
        modulePreview: null,
        stepImages: {
          step1: null,
          step2: null,
          step3: null
        },
        showcaseImages: {
          tasks: null,
          projects: null,
          members: null,
          timeLogs: null,
          reports: null
        }
      })
    }

    // Extract landing page images from organization settings
    const landingImages = (organization as any).landingPageImages || {}
    console.log('Fetched landing page images from organization:', JSON.stringify(landingImages, null, 2))

    return NextResponse.json({
      heroDashboard: landingImages.heroDashboard || null,
      modulePreview: landingImages.modulePreview || null,
      stepImages: {
        step1: landingImages.stepImages?.step1 || null,
        step2: landingImages.stepImages?.step2 || null,
        step3: landingImages.stepImages?.step3 || null
      },
      showcaseImages: {
        tasks: landingImages.showcaseImages?.tasks || null,
        projects: landingImages.showcaseImages?.projects || null,
        members: landingImages.showcaseImages?.members || null,
        timeLogs: landingImages.showcaseImages?.timeLogs || null,
        reports: landingImages.showcaseImages?.reports || null
      }
    })
  } catch (error) {
    console.error('Failed to fetch landing page images:', error)
    return NextResponse.json(
      { error: 'Failed to fetch landing page images' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/landing-page/images
 * Update landing page image URLs (requires authentication)
 */
export async function PUT(request: NextRequest) {
  try {
    // Import auth utilities
    const { authenticateUser } = await import('@/lib/auth-utils')
    const { PermissionService } = await import('@/lib/permissions/permission-service')
    const { Permission } = await import('@/lib/permissions/permission-definitions')

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
        { error: 'Insufficient permissions to update landing page images' },
        { status: 403 }
      )
    }

    const updateData = await request.json()

    // Check if database is configured
    const isConfigured = await hasDatabaseConfig()
    if (!isConfigured) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 400 }
      )
    }

    await connectDB()

    // Try to find organization by user's organization first
    let organization = null
    if (user.organization) {
      organization = await Organization.findById(user.organization)
      console.log('Looking for organization by user.organization:', user.organization, organization ? 'Found' : 'Not found')
    }
    
    // If not found by user's org, try to find any organization
    if (!organization) {
      organization = await Organization.findOne().sort({ createdAt: -1 })
      console.log('Looking for any organization:', organization ? 'Found' : 'Not found')
    }
    
    // If still no organization exists, create one
    if (!organization) {
      // Create organization if it doesn't exist
      organization = await Organization.create({
        name: 'Kanvaro',
        timezone: 'UTC',
        currency: 'USD',
        language: 'en',
        size: 'small',
        settings: {
          allowSelfRegistration: false,
          requireEmailVerification: true,
          defaultUserRole: 'team_member',
          projectTemplates: [],
          timeTracking: {
            allowTimeTracking: true,
            allowManualTimeSubmission: true,
            requireApproval: false,
            allowBillableTime: true,
            maxDailyHours: 12,
            maxWeeklyHours: 60,
            maxSessionHours: 8,
            allowOvertime: false,
            requireDescription: false,
            requireCategory: false,
            allowFutureTime: false,
            allowPastTime: true,
            pastTimeLimitDays: 30,
            roundingRules: {
              enabled: false,
              increment: 15,
              roundUp: true
            },
            notifications: {
              onTimerStart: false,
              onTimerStop: true,
              onOvertime: true,
              onApprovalNeeded: true,
              onTimeSubmitted: true
            }
          }
        },
        billing: {
          plan: 'free',
          maxUsers: 5,
          maxProjects: 3,
          features: []
        }
      })
      console.log('Created new organization for landing page images')
    }

    // Update organization with landing page images
    const landingPageImagesData = {
      heroDashboard: updateData.heroDashboard || null,
      modulePreview: updateData.modulePreview || null,
      stepImages: {
        step1: updateData.stepImages?.step1 || null,
        step2: updateData.stepImages?.step2 || null,
        step3: updateData.stepImages?.step3 || null
      },
      showcaseImages: {
        tasks: updateData.showcaseImages?.tasks || null,
        projects: updateData.showcaseImages?.projects || null,
        members: updateData.showcaseImages?.members || null,
        timeLogs: updateData.showcaseImages?.timeLogs || null,
        reports: updateData.showcaseImages?.reports || null
      }
    }

    console.log('Updating landing page images:', JSON.stringify(landingPageImagesData, null, 2))

    // Directly update and save the document to ensure it's persisted
    // Use set() and markModified() for nested objects to ensure they're saved
    organization.set('landingPageImages', landingPageImagesData)
    organization.markModified('landingPageImages')
    await organization.save()

    // Fetch fresh to verify
    const savedOrg = await Organization.findById(organization._id)
    if (!savedOrg) {
      console.error('Failed to fetch organization after save')
      return NextResponse.json(
        { error: 'Failed to verify landing page images save' },
        { status: 500 }
      )
    }

    console.log('✅ Organization saved successfully!')
    console.log('Saved landingPageImages:', JSON.stringify(savedOrg.landingPageImages, null, 2))

    const landingImages = (savedOrg as any).landingPageImages || {}

    return NextResponse.json({
      success: true,
      message: 'Landing page images updated successfully',
      data: {
        heroDashboard: landingImages.heroDashboard || null,
        modulePreview: landingImages.modulePreview || null,
        stepImages: {
          step1: landingImages.stepImages?.step1 || null,
          step2: landingImages.stepImages?.step2 || null,
          step3: landingImages.stepImages?.step3 || null
        },
        showcaseImages: {
          tasks: landingImages.showcaseImages?.tasks || null,
          projects: landingImages.showcaseImages?.projects || null,
          members: landingImages.showcaseImages?.members || null,
          timeLogs: landingImages.showcaseImages?.timeLogs || null,
          reports: landingImages.showcaseImages?.reports || null
        }
      }
    })
  } catch (error: any) {
    console.error('Failed to update landing page images:', error)
    console.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name
    })
    return NextResponse.json(
      { 
        error: 'Failed to update landing page images',
        details: error?.message || 'Unknown error'
      },
      { status: 500 }
    )
  }
}
