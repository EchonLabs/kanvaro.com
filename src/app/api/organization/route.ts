import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { hasDatabaseConfig } from '@/lib/db-config'
import { Organization } from '@/models/Organization'
import { TimeTrackingSettings } from '@/models/TimeTrackingSettings'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { ensureDirectoryExists, getUploadDirectory, getUploadUrl, normalizeUploadUrl } from '@/lib/file-utils'

// Helper function to save logo files
async function saveLogoFile(file: File | any, organizationId: string, type: 'light' | 'dark'): Promise<string> {
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  
  // Get file type and name (handle both File and File-like objects)
  const fileType = file.type || 'application/octet-stream'
  const fileName = file.name || `logo-${type}.png`
  
  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
  if (!allowedTypes.includes(fileType)) {
    throw new Error('Invalid file type. Only JPEG, PNG, GIF, WebP, and SVG are allowed.')
  }
  
  // Validate file size (5MB max)
  const maxSize = 5 * 1024 * 1024 // 5MB
  if (file.size > maxSize) {
    throw new Error('File too large. Maximum size is 5MB.')
  }
  
  // Ensure uploads directory exists with proper permissions
  const uploadsDir = getUploadDirectory('logos')
  await ensureDirectoryExists(uploadsDir)
  
  // Generate unique filename
  const timestamp = Date.now()
  const extension = fileName.split('.').pop() || 'png'
  const filename = `${organizationId}-${type}-${timestamp}.${extension}`
  const filepath = join(uploadsDir, filename)
  
  // Save file
  await writeFile(filepath, buffer)
  
  // Return public URL (uses API route if files are stored outside public directory)
  return getUploadUrl('logos', filename)
}

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

    // Allow any authenticated user to read basic organization info
    // Detailed management actions remain protected in PUT routes

    // Check if database is configured
    const isConfigured = await hasDatabaseConfig()
    if (!isConfigured) {
      // Return mock organization for demo purposes when DB is not configured
      const mockOrganization = {
        id: '1',
        name: 'Kanvaro',
        domain: 'kanvaro.com',
        logo: '/logo-light.svg',
        darkLogo: '/logo-dark.svg',
        logoMode: 'both',
        timezone: 'UTC',
        currency: 'USD',
        language: 'en',
        industry: 'Technology',
        size: 'small',
        settings: {
          allowSelfRegistration: false,
          defaultUserRole: 'team_member',
          projectTemplates: [],
          timeTracking: {
            allowTimeTracking: true,
            allowManualTimeSubmission: true
          }
        },
        billing: {
          plan: 'free',
          maxUsers: 5,
          maxProjects: 3,
          features: ['basic_project_management', 'time_tracking', 'basic_reporting']
        }
      }
      return NextResponse.json(mockOrganization)
    }
    
    await connectDB()
    
    // Get the first organization (in a real app, this would be based on user's organization)
    const organization = await Organization.findOne()
    
    if (!organization) {
      // Return default organization when none exists
      const defaultOrganization = {
        id: '1',
        name: 'Kanvaro',
        domain: 'kanvaro.com',
        logo: '/logo-light.svg',
        darkLogo: '/logo-dark.svg',
        logoMode: 'both',
        timezone: 'UTC',
        currency: 'USD',
        language: 'en',
        industry: 'Technology',
        size: 'small',
        settings: {
          allowSelfRegistration: false,
          defaultUserRole: 'team_member',
          projectTemplates: [],
          timeTracking: {
            allowTimeTracking: true,
            allowManualTimeSubmission: true
          }
        },
        billing: {
          plan: 'free',
          maxUsers: 5,
          maxProjects: 3,
          features: ['basic_project_management', 'time_tracking', 'basic_reporting']
        }
      }
      return NextResponse.json(defaultOrganization)
    }
    
    return NextResponse.json({
      id: organization._id,
      name: organization.name,
      domain: organization.domain,
      logo: normalizeUploadUrl(organization.logo || ''),
      darkLogo: normalizeUploadUrl(organization.darkLogo || ''),
      logoMode: organization.logoMode,
      timezone: organization.timezone,
      currency: organization.currency,
      language: organization.language,
      industry: organization.industry,
      size: organization.size,
      settings: organization.settings,
      billing: organization.billing
    })
  } catch (error) {
    console.error('Organization fetch failed:', error)
    return NextResponse.json(
      { error: 'Failed to fetch organization' },
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

    // Check if user can update organization
    const canUpdateOrganization = await PermissionService.hasPermission(user.id, Permission.ORGANIZATION_UPDATE)
    if (!canUpdateOrganization) {
      return NextResponse.json(
        { error: 'Insufficient permissions to update organization' },
        { status: 403 }
      )
    }

    // Get organization ID early for logo file naming
    const isConfigured = await hasDatabaseConfig()
    let organizationId: string = 'default'
    if (isConfigured) {
      await connectDB()
      const existingOrg = await Organization.findOne()
      if (existingOrg) {
        organizationId = existingOrg._id.toString()
      }
    }

    // Parse body (support JSON or form data)
    // Note: When FormData is sent via fetch, browser automatically sets Content-Type with boundary
    // We need to check for both explicit JSON and try FormData for everything else
    const contentType = request.headers.get('content-type') || ''
    let updateData: any
    let logoFile: File | null = null
    let darkLogoFile: File | null = null
    
    try {
      // If explicitly JSON, parse as JSON
      if (contentType.includes('application/json') && !contentType.includes('multipart')) {
        updateData = await request.json()
      } else {
        // Try to parse as FormData (handles multipart/form-data and form-urlencoded)
        const form = await request.formData()
        
        // Extract logo files from FormData BEFORE parsing JSON
        const logoFormData = form.get('logo')
        const darkLogoFormData = form.get('darkLogo')
        
        // Check if it's a File object (works in Node.js 18+ with native File support)
        // Also handle Blob-like objects that have size and type properties
        const isFile = (value: FormDataEntryValue | null): value is File => {
          if (!value) return false
          // In Node.js 18+, File is available globally
          if (typeof File !== 'undefined' && value instanceof File) return true
          // Fallback: check for File-like object (has size, type, name properties)
          if (typeof value === 'object' && 'size' in value && 'type' in value && 'name' in value) {
            return (value as any).size > 0
          }
          return false
        }
        
        if (isFile(logoFormData)) {
          logoFile = logoFormData
        }
        
        if (isFile(darkLogoFormData)) {
          darkLogoFile = darkLogoFormData
        }
        
        const toBool = (v: FormDataEntryValue | null) => {
          if (v === null) return undefined
          const s = String(v).toLowerCase()
          if (['true','1','yes','on'].includes(s)) return true
          if (['false','0','no','off'].includes(s)) return false
          return undefined
        }
        
        // Many clients (OrganizationSettings) send a JSON blob under the 'data' field
        let parsed: any = {}
        const rawData = form.get('data')
        if (typeof rawData === 'string') {
          try { 
            parsed = JSON.parse(rawData)
            // If we successfully parsed JSON data, use it directly as updateData
            // This ensures all nested structures (like timeTracking) are preserved
            if (parsed && typeof parsed === 'object') {
              updateData = {
                ...parsed,
                logoMode: parsed.logoMode // Ensure logoMode is set
              }
            }
          } catch (e) {
            console.error('Failed to parse JSON data from form:', e)
          }
        }
        
        // If parsed data wasn't used, fall back to individual form fields
        if (!updateData || Object.keys(updateData).length === 0) {
          updateData = {
            name: form.get('name') ?? parsed.name ?? undefined,
            domain: form.get('domain') ?? parsed.domain ?? undefined,
            logo: typeof parsed.logo === 'string' ? parsed.logo : undefined,
            darkLogo: typeof parsed.darkLogo === 'string' ? parsed.darkLogo : undefined,
            logoMode: (form.get('logoMode') ?? parsed.logoMode) ?? undefined,
            timezone: form.get('timezone') ?? parsed.timezone ?? undefined,
            currency: form.get('currency') ?? parsed.currency ?? undefined,
            language: form.get('language') ?? parsed.language ?? undefined,
            industry: form.get('industry') ?? parsed.industry ?? undefined,
            size: form.get('size') ?? parsed.size ?? undefined,
            allowSelfRegistration: toBool(form.get('allowSelfRegistration') ?? form.get('settings.allowSelfRegistration') ?? (parsed.settings?.allowSelfRegistration ?? parsed.allowSelfRegistration ?? null)),
            defaultUserRole: (form.get('defaultUserRole') ?? form.get('settings.defaultUserRole') ?? parsed.settings?.defaultUserRole ?? parsed.defaultUserRole) ?? undefined,
            timeTracking: parsed.timeTracking ?? {
              allowTimeTracking: toBool(form.get('timeTracking.allowTimeTracking') ?? form.get('settings.timeTracking.allowTimeTracking') ?? (parsed.settings?.timeTracking?.allowTimeTracking ?? parsed.timeTracking?.allowTimeTracking ?? null)),
              allowManualTimeSubmission: toBool(form.get('timeTracking.allowManualTimeSubmission') ?? form.get('settings.timeTracking.allowManualTimeSubmission') ?? (parsed.settings?.timeTracking?.allowManualTimeSubmission ?? parsed.timeTracking?.allowManualTimeSubmission ?? null)),
            },
          }
        }
      }
    } catch (e) {
      console.error('Request parsing error:', e)
      console.error('Content-Type:', contentType)
      console.error('Error details:', e instanceof Error ? e.stack : String(e))
      return NextResponse.json(
        { error: 'Invalid request payload. Expect JSON or form data.', details: e instanceof Error ? e.message : String(e) },
        { status: 400 }
      )
    }

    // Handle logo file uploads
    let logoUrl: string | undefined = undefined
    let darkLogoUrl: string | undefined = undefined
    
    if (logoFile) {
      try {
        logoUrl = await saveLogoFile(logoFile, organizationId, 'light')
      } catch (error) {
        console.error('Logo upload error:', error)
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Failed to upload logo' },
          { status: 400 }
        )
      }
    }
    
    if (darkLogoFile) {
      try {
        darkLogoUrl = await saveLogoFile(darkLogoFile, organizationId, 'dark')
      } catch (error) {
        console.error('Dark logo upload error:', error)
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Failed to upload dark logo' },
          { status: 400 }
        )
      }
    }

    // Normalize nested settings if provided
    // If updateData already has timeTracking (from parsed JSON), use it directly
    // Otherwise, extract from nested settings structure
    const sourceTimeTracking = updateData.timeTracking ?? updateData.settings?.timeTracking
    
    const normalized = {
      name: updateData.name,
      domain: updateData.domain,
      // Use uploaded logo URLs if files were provided, otherwise use existing URLs from updateData
      logo: logoUrl ?? updateData.logo,
      darkLogo: darkLogoUrl ?? updateData.darkLogo,
      logoMode: updateData.logoMode,
      timezone: updateData.timezone,
      currency: updateData.currency,
      language: updateData.language,
      industry: updateData.industry,
      size: updateData.size,
      allowSelfRegistration: updateData.allowSelfRegistration ?? updateData.settings?.allowSelfRegistration,
      defaultUserRole: updateData.defaultUserRole ?? updateData.settings?.defaultUserRole,
      timeTracking: sourceTimeTracking ? {
        allowTimeTracking: sourceTimeTracking.allowTimeTracking ?? undefined,
        allowManualTimeSubmission: sourceTimeTracking.allowManualTimeSubmission ?? undefined,
        requireApproval: sourceTimeTracking.requireApproval ?? undefined,
        allowBillableTime: sourceTimeTracking.allowBillableTime ?? undefined,
        defaultHourlyRate: sourceTimeTracking.defaultHourlyRate ?? undefined,
        maxDailyHours: sourceTimeTracking.maxDailyHours ?? undefined,
        maxWeeklyHours: sourceTimeTracking.maxWeeklyHours ?? undefined,
        maxSessionHours: sourceTimeTracking.maxSessionHours ?? undefined,
        allowOvertime: sourceTimeTracking.allowOvertime ?? undefined,
        requireDescription: sourceTimeTracking.requireDescription ?? undefined,
        requireCategory: sourceTimeTracking.requireCategory ?? undefined,
        allowFutureTime: sourceTimeTracking.allowFutureTime ?? undefined,
        allowPastTime: sourceTimeTracking.allowPastTime ?? undefined,
        pastTimeLimitDays: sourceTimeTracking.pastTimeLimitDays ?? undefined,
        roundingRules: sourceTimeTracking.roundingRules ? {
          enabled: sourceTimeTracking.roundingRules.enabled ?? undefined,
          increment: sourceTimeTracking.roundingRules.increment ?? undefined,
          roundUp: sourceTimeTracking.roundingRules.roundUp ?? undefined,
        } : undefined,
        notifications: sourceTimeTracking.notifications ? {
          onTimerStart: sourceTimeTracking.notifications.onTimerStart ?? undefined,
          onTimerStop: sourceTimeTracking.notifications.onTimerStop ?? undefined,
          onOvertime: sourceTimeTracking.notifications.onOvertime ?? undefined,
          onApprovalNeeded: sourceTimeTracking.notifications.onApprovalNeeded ?? undefined,
          onTimeSubmitted: sourceTimeTracking.notifications.onTimeSubmitted ?? undefined,
        } : undefined,
      } : undefined,
    }

    // Check if database is configured
    if (!isConfigured) {
      return NextResponse.json(
        { message: 'Organization settings updated successfully (demo mode)' },
        { status: 200 }
      )
    }
    
    // Build update doc only with provided fields
    const updateDoc: any = {}
    const setIfDefined = (path: string, val: any) => {
      if (val !== undefined) updateDoc[path] = val
    }
    setIfDefined('name', normalized.name)
    setIfDefined('domain', normalized.domain)
    setIfDefined('logo', normalized.logo)
    setIfDefined('darkLogo', normalized.darkLogo)
    setIfDefined('logoMode', normalized.logoMode)
    setIfDefined('timezone', normalized.timezone)
    setIfDefined('currency', normalized.currency)
    setIfDefined('language', normalized.language)
    setIfDefined('industry', normalized.industry)
    setIfDefined('size', normalized.size)
    setIfDefined('settings.allowSelfRegistration', normalized.allowSelfRegistration)
    setIfDefined('settings.defaultUserRole', normalized.defaultUserRole)
    
    // Only set timeTracking fields if timeTracking object exists
    const timeTracking = normalized.timeTracking
    if (timeTracking) {
      setIfDefined('settings.timeTracking.allowTimeTracking', timeTracking.allowTimeTracking)
      setIfDefined('settings.timeTracking.allowManualTimeSubmission', timeTracking.allowManualTimeSubmission)
      setIfDefined('settings.timeTracking.requireApproval', timeTracking.requireApproval)
      setIfDefined('settings.timeTracking.allowBillableTime', timeTracking.allowBillableTime)
      setIfDefined('settings.timeTracking.defaultHourlyRate', timeTracking.defaultHourlyRate)
      setIfDefined('settings.timeTracking.maxDailyHours', timeTracking.maxDailyHours)
      setIfDefined('settings.timeTracking.maxWeeklyHours', timeTracking.maxWeeklyHours)
      setIfDefined('settings.timeTracking.maxSessionHours', timeTracking.maxSessionHours)
      setIfDefined('settings.timeTracking.allowOvertime', timeTracking.allowOvertime)
      setIfDefined('settings.timeTracking.requireDescription', timeTracking.requireDescription)
      setIfDefined('settings.timeTracking.requireCategory', timeTracking.requireCategory)
      setIfDefined('settings.timeTracking.allowFutureTime', timeTracking.allowFutureTime)
      setIfDefined('settings.timeTracking.allowPastTime', timeTracking.allowPastTime)
      setIfDefined('settings.timeTracking.pastTimeLimitDays', timeTracking.pastTimeLimitDays)
      
      const roundingRules = timeTracking.roundingRules
      if (roundingRules) {
        setIfDefined('settings.timeTracking.roundingRules.enabled', roundingRules.enabled)
        setIfDefined('settings.timeTracking.roundingRules.increment', roundingRules.increment)
        setIfDefined('settings.timeTracking.roundingRules.roundUp', roundingRules.roundUp)
      }
      
      const notifications = timeTracking.notifications
      if (notifications) {
        setIfDefined('settings.timeTracking.notifications.onTimerStart', notifications.onTimerStart)
        setIfDefined('settings.timeTracking.notifications.onTimerStop', notifications.onTimerStop)
        setIfDefined('settings.timeTracking.notifications.onOvertime', notifications.onOvertime)
        setIfDefined('settings.timeTracking.notifications.onApprovalNeeded', notifications.onApprovalNeeded)
        setIfDefined('settings.timeTracking.notifications.onTimeSubmitted', notifications.onTimeSubmitted)
      }
    }

    // Update the organization
    const organization = await Organization.findOneAndUpdate(
      {},
      updateDoc,
      { new: true, upsert: true }
    )
    
    if (!organization) {
      return NextResponse.json(
        { error: 'Failed to update organization' },
        { status: 500 }
      )
    }

    // Sync TimeTrackingSettings collection with organization settings if timeTracking was updated
    if (timeTracking) {
      try {
        // Prepare update object - use values from timeTracking, fallback to organization defaults
        const updateFields: any = {
          organization: organization._id,
          project: null
        }

        // Set all fields explicitly, handling undefined values properly
        if (timeTracking.allowTimeTracking !== undefined) updateFields.allowTimeTracking = timeTracking.allowTimeTracking
        if (timeTracking.allowManualTimeSubmission !== undefined) updateFields.allowManualTimeSubmission = timeTracking.allowManualTimeSubmission
        if (timeTracking.requireApproval !== undefined) updateFields.requireApproval = timeTracking.requireApproval
        if (timeTracking.allowBillableTime !== undefined) updateFields.allowBillableTime = timeTracking.allowBillableTime
        if (timeTracking.defaultHourlyRate !== undefined) updateFields.defaultHourlyRate = timeTracking.defaultHourlyRate
        if (timeTracking.maxDailyHours !== undefined) updateFields.maxDailyHours = timeTracking.maxDailyHours
        if (timeTracking.maxWeeklyHours !== undefined) updateFields.maxWeeklyHours = timeTracking.maxWeeklyHours
        if (timeTracking.maxSessionHours !== undefined) updateFields.maxSessionHours = timeTracking.maxSessionHours
        if (timeTracking.allowOvertime !== undefined) updateFields.allowOvertime = timeTracking.allowOvertime
        if (timeTracking.requireDescription !== undefined) updateFields.requireDescription = timeTracking.requireDescription
        if (timeTracking.requireCategory !== undefined) updateFields.requireCategory = timeTracking.requireCategory
        if (timeTracking.allowFutureTime !== undefined) updateFields.allowFutureTime = timeTracking.allowFutureTime
        if (timeTracking.allowPastTime !== undefined) updateFields.allowPastTime = timeTracking.allowPastTime
        if (timeTracking.pastTimeLimitDays !== undefined) updateFields.pastTimeLimitDays = timeTracking.pastTimeLimitDays
        if (timeTracking.roundingRules !== undefined) updateFields.roundingRules = timeTracking.roundingRules
        if (timeTracking.notifications !== undefined) updateFields.notifications = timeTracking.notifications

        // Find or create the organization-level TimeTrackingSettings (project: null)
        const orgTimeTrackingSettings = await TimeTrackingSettings.findOneAndUpdate(
          {
            organization: organization._id,
            project: null
          },
          {
            $set: updateFields
          },
          {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true
          }
        )

        if (!orgTimeTrackingSettings) {
          console.warn('Failed to sync TimeTrackingSettings collection with organization settings')
        } else {
          console.log('TimeTrackingSettings synced successfully:', {
            requireDescription: orgTimeTrackingSettings.requireDescription,
            requireApproval: orgTimeTrackingSettings.requireApproval,
            allowOvertime: orgTimeTrackingSettings.allowOvertime,
            allowFutureTime: orgTimeTrackingSettings.allowFutureTime
          })
        }
      } catch (error) {
        console.error('Error syncing TimeTrackingSettings:', error)
        // Don't fail the entire request if TimeTrackingSettings sync fails
        // The Organization document is already updated
      }
    }
    
    return NextResponse.json({
      message: 'Organization settings updated successfully',
      organization: {
        id: organization._id,
        name: organization.name,
        domain: organization.domain,
        logo: normalizeUploadUrl(organization.logo || ''),
        darkLogo: normalizeUploadUrl(organization.darkLogo || ''),
        logoMode: organization.logoMode,
        timezone: organization.timezone,
        currency: organization.currency,
        language: organization.language,
        industry: organization.industry,
        size: organization.size,
        settings: organization.settings
      }
    })
  } catch (error) {
    console.error('Organization update failed:', error)
    return NextResponse.json(
      { error: 'Failed to update organization' },
      { status: 500 }
    )
  }
}