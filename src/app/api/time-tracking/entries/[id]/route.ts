import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { TimeEntry } from '@/models/TimeEntry'
import { TimeTrackingSettings } from '@/models/TimeTrackingSettings'
import { User } from '@/models/User'
import { Permission, Role } from '@/lib/permissions/permission-definitions'
import { PermissionService } from '@/lib/permissions/permission-service'
import { authenticateUser } from '@/lib/auth-utils'


/** The signed-in user via the shared sign-in check (F3: Bearer or cookies). */
async function getAuthenticatedUser(): Promise<{ id: string; role: string; organization: string } | null> {
  const auth = await authenticateUser()
  return 'error' in auth ? null : auth.user
}

// The only roles that may change an existing entry's hourly rate. New entries
// never take a rate from the client: POST /api/time-tracking/entries always
// uses the person's billing rate or the organisation default (no screen sends
// one on create).
const RATE_EDIT_ROLES: string[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.HUMAN_RESOURCE]

/**
 * May `viewer` see a time entry owned by `ownerId`? Same rule as the entries
 * list: your own, view_all, or view_assigned for people you are the project
 * manager or HR partner of.
 */
async function canViewEntryOf(viewer: { id: string; organization: string }, ownerId: string): Promise<boolean> {
  if (ownerId === viewer.id) return true
  const permissions = await PermissionService.getUserPermissions(viewer.id)
  if (PermissionService.hasPermissionIn(permissions, Permission.TIME_TRACKING_VIEW_ALL)) return true
  if (!PermissionService.hasPermissionIn(permissions, Permission.TIME_TRACKING_VIEW_ASSIGNED)) return false
  const owner = (await User.findById(ownerId).select('projectManager humanResourcePartner').lean()) as any
  return !!owner && (
    String(owner.projectManager || '') === viewer.id ||
    String(owner.humanResourcePartner || '') === viewer.id
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB()

    // This route had no sign-in at all: anyone could read any entry by id.
    const viewer = await getAuthenticatedUser()
    if (!viewer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const timeEntry = await TimeEntry.findById(params.id)
      .populate('user', 'firstName lastName email')
      .populate('project', 'name')
      .populate('task', 'title')
      .populate('approvedBy', 'firstName lastName')

    // Not found and not allowed look the same, so ids cannot be probed.
    const ownerId = String((timeEntry?.user as any)?._id || timeEntry?.user || '')
    if (
      !timeEntry ||
      String(timeEntry.organization) !== viewer.organization ||
      !(await canViewEntryOf(viewer, ownerId))
    ) {
      return NextResponse.json({ error: 'Time entry not found' }, { status: 404 })
    }

    return NextResponse.json({ timeEntry })
  } catch (error) {
    console.error('Error fetching time entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB()

    const requester = await getAuthenticatedUser()
    const requesterId = requester?.id
    if (!requester || !requesterId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const body = await request.json()
    const { description, startTime, endTime, duration, isBillable, hourlyRate, category, tags, notes } = body

    const timeEntry = await TimeEntry.findById(params.id)

    if (!timeEntry) {
      return NextResponse.json({ error: 'Time entry not found' }, { status: 404 })
    }

    // Authorization: owners can update their own entry (subject to time-based rules);
    // non-owners can update only if they have update permission AND are allowed to view that user's logs.
    const ownerId = timeEntry.user?.toString()
    const isOwner = ownerId === requesterId

    if (!isOwner) {
      const canUpdate = await PermissionService.hasPermission(requesterId, Permission.TIME_TRACKING_UPDATE)
      if (!canUpdate) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const hasViewAll = await PermissionService.hasPermission(requesterId, Permission.TIME_TRACKING_VIEW_ALL)
      const hasViewAssigned = await PermissionService.hasPermission(requesterId, Permission.TIME_TRACKING_VIEW_ASSIGNED)

      if (!hasViewAll) {
        if (!hasViewAssigned) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const target = await User.findById(ownerId).select('organization projectManager humanResourcePartner')
        const sameOrg = target && target.organization && target.organization.toString() === timeEntry.organization?.toString()
        const isAssigned = target && (
          (target.projectManager && target.projectManager.toString() === requesterId) ||
          (target.humanResourcePartner && target.humanResourcePartner.toString() === requesterId)
        )

        if (!sameOrg || !isAssigned) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
      }
    }

    // Check if time entry is already approved
    // if (timeEntry.isApproved) {
    //   return NextResponse.json({ error: 'Cannot modify approved time entry' }, { status: 400 })
    // }

    // Check time-based editing restrictions
    const settings = await TimeTrackingSettings.findOne({
      organization: timeEntry.organization,
      $or: [
        { project: timeEntry.project },
        { project: null }
      ]
    }).sort({ project: -1 }) // Prefer project-specific settings

    if (settings?.timeLogEditMode) {
      const now = new Date()
      const entryDate = new Date(timeEntry.createdAt || timeEntry.startTime)

      if (settings.timeLogEditMode === 'days') {
        const daysDiff = Math.floor((now.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24))
        const maxDays = settings.timeLogEditDays || 30
        if (daysDiff > maxDays) {
          return NextResponse.json({ 
            error: `Cannot modify time entry. Editing is only allowed within ${maxDays} days of creation.` 
          }, { status: 400 })
        }
      } else if (settings.timeLogEditMode === 'dayOfMonth') {
        const maxDayOfMonth = settings.timeLogEditDayOfMonth || 15
        const entryDayOfMonth = entryDate.getDate()
        if (entryDayOfMonth <= maxDayOfMonth) {
          return NextResponse.json({ 
            error: `Cannot modify time entry. Editing is only allowed for entries created after day ${maxDayOfMonth} of each month.` 
          }, { status: 400 })
        }
      }
    }

    // Update fields
    if (description) timeEntry.description = description
    if (startTime) timeEntry.startTime = new Date(startTime)
    if (endTime) timeEntry.endTime = new Date(endTime)
    if (duration !== undefined) timeEntry.duration = duration
    if (isBillable !== undefined) timeEntry.isBillable = isBillable
    // The rate is money: only admin, super admin and HR may change it.
    if (hourlyRate !== undefined && RATE_EDIT_ROLES.includes(requester.role)) timeEntry.hourlyRate = hourlyRate
    if (category) timeEntry.category = category
    if (tags) timeEntry.tags = tags
    if (notes) timeEntry.notes = notes

    // Recalculate duration if start/end times changed
    if (startTime || endTime) {
      const start = timeEntry.startTime
      const end = timeEntry.endTime || new Date()
      timeEntry.duration = Math.round((end.getTime() - start.getTime()) / (1000 * 60))
    }

    await timeEntry.save()

    return NextResponse.json({
      message: 'Time entry updated successfully',
      timeEntry: timeEntry.toObject()
    })
  } catch (error) {
    console.error('Error updating time entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB()

    const requester = await getAuthenticatedUser()
    const requesterId = requester?.id
    if (!requester || !requesterId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const timeEntry = await TimeEntry.findById(params.id)

    if (!timeEntry) {
      return NextResponse.json({ error: 'Time entry not found' }, { status: 404 })
    }

    // Authorization: deleting a time entry always requires the delete permission
    // (own entries included) — only roles granted TIME_TRACKING_DELETE (e.g. Admin, HR) may delete.
    const ownerId = timeEntry.user?.toString()
    const isOwner = ownerId === requesterId

    const canDelete = await PermissionService.hasPermission(requesterId, Permission.TIME_TRACKING_DELETE)
    if (!canDelete) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!isOwner) {
      const hasViewAll = await PermissionService.hasPermission(requesterId, Permission.TIME_TRACKING_VIEW_ALL)
      const hasViewAssigned = await PermissionService.hasPermission(requesterId, Permission.TIME_TRACKING_VIEW_ASSIGNED)

      if (!hasViewAll) {
        if (!hasViewAssigned) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const target = await User.findById(ownerId).select('organization projectManager humanResourcePartner')
        const sameOrg = target && target.organization && target.organization.toString() === timeEntry.organization?.toString()
        const isAssigned = target && (
          (target.projectManager && target.projectManager.toString() === requesterId) ||
          (target.humanResourcePartner && target.humanResourcePartner.toString() === requesterId)
        )

        if (!sameOrg || !isAssigned) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
      }
    }

    // Check if time entry is already approved
    // if (timeEntry.isApproved) {
    //   return NextResponse.json({ error: 'Cannot delete approved time entry' }, { status: 400 })
    // }

    // Check time-based editing restrictions
    const settings = await TimeTrackingSettings.findOne({
      organization: timeEntry.organization,
      $or: [
        { project: timeEntry.project },
        { project: null }
      ]
    }).sort({ project: -1 }) // Prefer project-specific settings

    if (settings?.timeLogEditMode) {
      const now = new Date()
      const entryDate = new Date(timeEntry.createdAt || timeEntry.startTime)

      if (settings.timeLogEditMode === 'days') {
        const daysDiff = Math.floor((now.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24))
        const maxDays = settings.timeLogEditDays || 30
        if (daysDiff > maxDays) {
          return NextResponse.json({ 
            error: `Cannot delete time entry. Deletion is only allowed within ${maxDays} days of creation.` 
          }, { status: 400 })
        }
      } else if (settings.timeLogEditMode === 'dayOfMonth') {
        const maxDayOfMonth = settings.timeLogEditDayOfMonth || 15
        const entryDayOfMonth = entryDate.getDate()
        if (entryDayOfMonth <= maxDayOfMonth) {
          return NextResponse.json({ 
            error: `Cannot delete time entry. Deletion is only allowed for entries created after day ${maxDayOfMonth} of each month.` 
          }, { status: 400 })
        }
      }
    }

    await TimeEntry.findByIdAndDelete(params.id)

    return NextResponse.json({ message: 'Time entry deleted successfully' })
  } catch (error) {
    console.error('Error deleting time entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
