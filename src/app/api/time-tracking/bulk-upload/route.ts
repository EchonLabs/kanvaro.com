import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { TimeEntry } from '@/models/TimeEntry'
import { TimeTrackingSettings } from '@/models/TimeTrackingSettings'
import { Project } from '@/models/Project'
import { User } from '@/models/User'
import { Organization } from '@/models/Organization'
import { Task } from '@/models/Task'
import { applyRoundingRules } from '@/lib/utils'
import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'
import { Permission } from '@/lib/permissions/permission-definitions'
import { PermissionService } from '@/lib/permissions/permission-service'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key'

interface CSVRow {
  'Task No': string
  'Start Date': string
  'Start Time': string
  'End Date': string
  'End Time': string
  'Description'?: string
}

interface ValidationResult {
  isValid: boolean
  error?: string
  task?: any
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  console.log('[Bulk Upload] Starting bulk upload process')

  try {
    await connectDB()
    console.log('[Bulk Upload] Database connected successfully')

    // Authenticate requester from cookies
    const cookieStore = cookies()
    const accessToken = cookieStore.get('accessToken')?.value
    const refreshToken = cookieStore.get('refreshToken')?.value

    if (!accessToken && !refreshToken) {
      console.error('[Bulk Upload] No authentication tokens provided')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let requester: any = null
    let requesterId: string = ''
    try {
      if (accessToken) {
        const decoded: any = jwt.verify(accessToken, JWT_SECRET)
        requester = await User.findById(decoded.userId)
      }
    } catch (error) {
      console.error('[Bulk Upload] Access token verification failed:', error)
    }
    if (!requester && refreshToken) {
      try {
        const decoded: any = jwt.verify(refreshToken, JWT_REFRESH_SECRET)
        requester = await User.findById(decoded.userId)
      } catch (error) {
        console.error('[Bulk Upload] Refresh token verification failed:', error)
      }
    }
    if (!requester || !requester.isActive) {
      console.error('[Bulk Upload] User not found or inactive')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    requesterId = requester._id.toString()
    console.log('[Bulk Upload] User authenticated:', requesterId)

    // Check if user has bulk upload permission
    const hasBulkUploadAll = await PermissionService.hasPermission(requesterId, Permission.TIME_TRACKING_BULK_UPLOAD_ALL)
    const hasViewAll = await PermissionService.hasPermission(requesterId, Permission.TIME_TRACKING_VIEW_ALL)

    console.log('[Bulk Upload] User permissions - bulkUploadAll:', hasBulkUploadAll, 'viewAll:', hasViewAll)

    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      console.error('[Bulk Upload] No file provided')
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      console.error('[Bulk Upload] Invalid file type:', file.name)
      return NextResponse.json({ error: 'Only CSV files are allowed' }, { status: 400 })
    }

    console.log('[Bulk Upload] Processing CSV file:', file.name)

    // Read and parse CSV
    const csvText = await file.text()
    const rows = parseCSV(csvText)

    if (rows.length === 0) {
      console.error('[Bulk Upload] CSV file is empty')
      return NextResponse.json({ error: 'CSV file is empty' }, { status: 400 })
    }

    console.log(`[Bulk Upload] Processing ${rows.length} rows`)

    const results = {
      successful: 0,
      failed: 0,
      errors: [] as Array<{ row: number; error: string }>,
      processed: 0
    }

    // Get organization from requester
    const organizationId = requester.organization.toString()
    console.log('[Bulk Upload] Organization ID:', organizationId)

    // Get organization-wide time tracking settings
    let orgSettings = await TimeTrackingSettings.findOne({
      organization: organizationId,
      project: null
    })

    if (!orgSettings) {
      const organization = await Organization.findById(organizationId)
      if (!organization || !organization.settings?.timeTracking?.allowTimeTracking) {
        console.error('[Bulk Upload] Time tracking not enabled for organization')
        return NextResponse.json({ error: 'Time tracking not enabled' }, { status: 403 })
      }

      // Create default settings
      const orgTimeTracking = organization.settings?.timeTracking || {}
      orgSettings = new TimeTrackingSettings({
        organization: organizationId,
        project: null,
        allowTimeTracking: orgTimeTracking.allowTimeTracking ?? true,
        allowManualTimeSubmission: orgTimeTracking.allowManualTimeSubmission ?? true,
        requireApproval: orgTimeTracking.requireApproval ?? false,
        allowBillableTime: orgTimeTracking.allowBillableTime ?? true,
        defaultHourlyRate: orgTimeTracking.defaultHourlyRate,
        maxDailyHours: orgTimeTracking.maxDailyHours ?? 24,
        maxWeeklyHours: orgTimeTracking.maxWeeklyHours ?? 168,
        maxSessionHours: orgTimeTracking.maxSessionHours ?? 12,
        allowOvertime: orgTimeTracking.allowOvertime ?? false,
      //  requireDescription: orgTimeTracking.requireDescription ?? false,
        requireCategory: orgTimeTracking.requireCategory ?? false,
        allowFutureTime: orgTimeTracking.allowFutureTime ?? false,
        allowPastTime: orgTimeTracking.allowPastTime ?? true,
        pastTimeLimitDays: orgTimeTracking.pastTimeLimitDays ?? 30,
        roundingRules: orgTimeTracking.roundingRules || { enabled: false, increment: 15, roundUp: false },
        notifications: orgTimeTracking.notifications || {
          onTimerStart: false,
          onTimerStop: false,
          onOvertime: false,
          onApprovalNeeded: false,
          onTimeSubmitted: false
        }
      })
      await orgSettings.save()
    }

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowNum = i + 2 // +2 because we skip header row and make it 1-indexed for user

      try {
        console.log(`[Bulk Upload] Processing row ${rowNum}:`, row)

        // Validate row data
        const validation = await validateRow(row, requesterId, organizationId, hasViewAll, hasBulkUploadAll)
        if (!validation.isValid) {
          results.errors.push({ row: rowNum, error: validation.error! })
          results.failed++
          continue
        }

        const task = validation.task!

        // Get project-specific settings or fall back to org settings
        let settings = orgSettings
        if (task.project) {
          const projectSettings = await TimeTrackingSettings.findOne({
            organization: organizationId,
            project: task.project
          })
          if (projectSettings) {
            settings = projectSettings
          }
        }

        // Validate description if required
     //   const requireDescription = settings.requireDescription === true
        const hasDescription = row.Description && typeof row.Description === 'string' && row.Description.trim().length > 0

        if ( !hasDescription) {
          results.errors.push({ row: rowNum, error: 'Memo is required for time entries' })
          results.failed++
          continue
        }

        // Parse and validate dates/times with flexible parsing
        const parseFlexibleDate = (dateStr: string): Date | null => {
          if (!dateStr) return null
          
          // Try YYYY-MM-DD format first
          const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
          if (isoMatch) {
            const [, year, month, day] = isoMatch
            const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
            return isNaN(date.getTime()) ? null : date
          }
          
          // Try MM/DD/YYYY format
          const usMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
          if (usMatch) {
            const [, month, day, year] = usMatch
            const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
            return isNaN(date.getTime()) ? null : date
          }
          
          // Try DD/MM/YYYY format
          const euMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
          if (euMatch) {
            const [, day, month, year] = euMatch
            const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
            return isNaN(date.getTime()) ? null : date
          }
          
          // Try DD-MM-YYYY format
          const dashMatch = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
          if (dashMatch) {
            const [, day, month, year] = dashMatch
            const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
            return isNaN(date.getTime()) ? null : date
          }
          
          return null
        }

        const parseFlexibleTime = (timeStr: string): string | null => {
          if (!timeStr) return null
          
          // Remove spaces, lowercase
          let val = timeStr.trim().toLowerCase()
          
          // Replace common AM/PM formats
          val = val.replace(/\s*am$/i, ' am').replace(/\s*pm$/i, ' pm')
          
          // Try to match HH:mm(:ss)? (with optional AM/PM)
          const timeMatch = val.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?$/)
          if (timeMatch) {
            let hour = parseInt(timeMatch[1], 10)
            let minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0
            const ampm = timeMatch[4]
            
            if (ampm) {
              if (ampm === 'pm' && hour < 12) hour += 12
              if (ampm === 'am' && hour === 12) hour = 0
            }
            
            // Clamp values
            hour = Math.max(0, Math.min(23, hour))
            minute = Math.max(0, Math.min(59, minute))
            
            // Format as HH:mm
            return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
          }
          
          // Try to match just hour with AM/PM
          const hourMatch = val.match(/^(\d{1,2})\s*(am|pm)$/)
          if (hourMatch) {
            let hour = parseInt(hourMatch[1], 10)
            const ampm = hourMatch[2]
            if (ampm === 'pm' && hour < 12) hour += 12
            if (ampm === 'am' && hour === 12) hour = 0
            hour = Math.max(0, Math.min(23, hour))
            return `${hour.toString().padStart(2, '0')}:00`
          }
          
          // Try to match just hour (24h)
          const hourOnlyMatch = val.match(/^(\d{1,2})$/)
          if (hourOnlyMatch) {
            let hour = parseInt(hourOnlyMatch[1], 10)
            hour = Math.max(0, Math.min(23, hour))
            return `${hour.toString().padStart(2, '0')}:00`
          }
          
          return null
        }

        const startDate = parseFlexibleDate(row['Start Date'])
        const startTime = parseFlexibleTime(row['Start Time'])
        const endDate = parseFlexibleDate(row['End Date'])
        const endTime = parseFlexibleTime(row['End Time'])

        if (!startDate) {
          results.errors.push({ row: rowNum, error: 'Invalid start date format. Use YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, or DD-MM-YYYY' })
          results.failed++
          continue
        }

        if (!startTime) {
          results.errors.push({ row: rowNum, error: 'Invalid start time format. Use HH:MM, H:MM AM/PM, or just H AM/PM' })
          results.failed++
          continue
        }

        if (!endDate) {
          results.errors.push({ row: rowNum, error: 'Invalid end date format. Use YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, or DD-MM-YYYY' })
          results.failed++
          continue
        }

        if (!endTime) {
          results.errors.push({ row: rowNum, error: 'Invalid end time format. Use HH:MM, H:MM AM/PM, or just H AM/PM' })
          results.failed++
          continue
        }

        // Combine date and time - avoid timezone issues by formatting date directly
        const formatDateForTime = (date: Date): string => {
          const year = date.getFullYear()
          const month = String(date.getMonth() + 1).padStart(2, '0')
          const day = String(date.getDate()).padStart(2, '0')
          return `${year}-${month}-${day}`
        }

        const startDateTime = new Date(`${formatDateForTime(startDate)}T${startTime}`)
        const endDateTime = new Date(`${formatDateForTime(endDate)}T${endTime}`)

        if (isNaN(startDateTime.getTime())) {
          results.errors.push({ row: rowNum, error: 'Invalid start date/time combination' })
          results.failed++
          continue
        }

        if (isNaN(endDateTime.getTime())) {
          results.errors.push({ row: rowNum, error: 'Invalid end date/time combination' })
          results.failed++
          continue
        }

        if (startDateTime >= endDateTime) {
          results.errors.push({ row: rowNum, error: 'End time must be after start time' })
          results.failed++
          continue
        }

        // Check time limits
        const durationMinutes = (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60)
        if (settings.maxSessionHours && durationMinutes > settings.maxSessionHours * 60) {
          results.errors.push({ row: rowNum, error: `Session duration exceeds maximum allowed hours (${settings.maxSessionHours})` })
          results.failed++
          continue
        }

        // Check if time is in the past/future according to settings
        const now = new Date()
        if (!settings.allowFutureTime && startDateTime > now) {
          results.errors.push({ row: rowNum, error: 'Future time entries are not allowed' })
          results.failed++
          continue
        }

        if (!settings.allowPastTime) {
          results.errors.push({ row: rowNum, error: 'Past time entries are not allowed' })
          results.failed++
          continue
        }

        if (settings.pastTimeLimitDays && settings.allowPastTime) {
          const pastLimit = new Date()
          pastLimit.setDate(pastLimit.getDate() - settings.pastTimeLimitDays)
          if (startDateTime < pastLimit) {
            results.errors.push({ row: rowNum, error: `Time entries older than ${settings.pastTimeLimitDays} days are not allowed` })
            results.failed++
            continue
          }
        }

        // Apply rounding rules if enabled
        let finalDuration = durationMinutes
        if (settings.roundingRules?.enabled) {
          finalDuration = applyRoundingRules(durationMinutes, settings.roundingRules)
        }

        // Get project for billable default
        const project = await Project.findById(task.project)
        if (!project) {
          results.errors.push({ row: rowNum, error: 'Project not found' })
          results.failed++
          continue
        }

        // Create time entry
        const timeEntry = new TimeEntry({
          user: requesterId,
          organization: organizationId,
          project: task.project,
          task: task._id,
          description: row.Description?.trim() || '',
          startTime: startDateTime,
          endTime: endDateTime,
          duration: Math.round(finalDuration),
          isBillable: project.settings?.isBillableByDefault ?? true,
          hourlyRate: requester.hourlyRate,
          status: 'completed',
          tags: [],
          isApproved: !settings.requireApproval,
          isReject: false
        })

        await timeEntry.save()
        results.successful++
        console.log(`[Bulk Upload] Successfully created time entry for row ${rowNum}`)

      } catch (error) {
        console.error(`[Bulk Upload] Error processing row ${rowNum}:`, error)
        results.errors.push({
          row: rowNum,
          error: error instanceof Error ? error.message : 'Unknown error occurred'
        })
        results.failed++
      }

      results.processed++
    }

    const totalTime = Date.now() - startTime
    console.log(`[Bulk Upload] Completed in ${totalTime}ms. Successful: ${results.successful}, Failed: ${results.failed}`)

    return NextResponse.json({
      success: true,
      message: `Bulk upload completed. ${results.successful} successful, ${results.failed} failed.`,
      results
    })

  } catch (error) {
    const totalTime = Date.now() - startTime
    console.error(`[Bulk Upload] Unexpected error after ${totalTime}ms:`, error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function validateRow(
  row: CSVRow,
  userId: string,
  organizationId: string,
  hasViewAll: boolean,
  hasBulkUploadAll: boolean
): Promise<ValidationResult> {
  // Validate required fields
  if (!row['Task No'] || !row['Start Date'] || !row['Start Time'] || !row['End Date'] || !row['End Time']) {
    return { isValid: false, error: 'Missing required fields: Task No, Start Date, Start Time, End Date, End Time' }
  }

  // Find task by displayId
  const task = await Task.findOne({
    organization: organizationId,
    displayId: row['Task No'].trim()
  }).populate('project', 'settings')

  if (!task) {
    return { isValid: false, error: `Task with ID '${row['Task No']}' not found` }
  }

  // Check task assignment if user doesn't have view_all permission
  if (!hasViewAll) {
    const isAssignedToTask = task.assignedTo?.some((assigned: any) => {
      const assignedUserId = typeof assigned === 'string' ? assigned : assigned?.user?.toString() || assigned?._id?.toString()
      return assignedUserId === userId
    })

    if (!isAssignedToTask) {
      return { isValid: false, error: 'Task is not assigned to you' }
    }
  }

  return { isValid: true, task }
}

function parseCSV(csvText: string): CSVRow[] {
  const lines = csvText.split('\n').filter(line => line.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))

  // Validate headers
  const requiredHeaders = ['Task No', 'Start Date', 'Start Time', 'End Date', 'End Time']
  const hasRequiredHeaders = requiredHeaders.every(header => headers.includes(header))

  if (!hasRequiredHeaders) {
    throw new Error('CSV must contain required columns: Task No, Start Date, Start Time, End Date, End Time')
  }

  const rows: CSVRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length === headers.length) {
      const row: any = {}
      headers.forEach((header, index) => {
        row[header] = values[index]?.trim().replace(/"/g, '') || ''
      })
      rows.push(row as CSVRow)
    }
  }

  return rows
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"'
        i++ // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }

  // Add the last field
  result.push(current)

  return result
}