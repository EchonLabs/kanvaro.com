import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { User } from '@/models/User'
import { Project } from '@/models/Project'
import { UserInvitation } from '@/models/UserInvitation'
import '@/models/CustomRole' // Ensure CustomRole model is registered for populate
import { authenticateUser } from '@/lib/auth-utils'
import { normalizeUploadUrl } from '@/lib/file-utils'
import { Permission } from '@/lib/permissions/permission-definitions'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Role } from '@/lib/permissions/permission-definitions'
import { convertOpenAllocationsToCarryForward } from '@/lib/standup/carry-forward-service'
import { canChangeRoleOf, canGrantSystemRole, canManageRoles, isAdminRole } from '@/lib/permissions/role-grant-policy'
import { escapeRegex } from '@/lib/text/escape-regex'

/** Fields the edit-member form and the project team tab send. Nothing else is saved. */
const EDITABLE_FIELDS = ['firstName', 'lastName', 'memberId', 'isActive', 'hourlyRate', 'role'] as const

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
    const userId = user.id
    const organizationId = user.organization

    // Check if user has permission to view members
    const permissions = await PermissionService.getUserPermissions(userId)
    // user:read and user:update are OWN-scoped ("your own record"), so
    // hasPermissionIn is always true for them; about other people they only
    // count when the role really grants them (PR #927 review).
    const canReadTeam = PermissionService.hasPermissionIn(permissions, Permission.TEAM_READ)
    const canReadUsers = PermissionService.isGrantedIn(permissions, Permission.USER_READ)
    // Pay rates only for people who can edit members (same rule as PUT).
    const canSeeRates =
      PermissionService.isGrantedIn(permissions, Permission.USER_UPDATE) &&
      PermissionService.hasPermissionIn(permissions, Permission.TEAM_EDIT)

    if (!canReadTeam && !canReadUsers) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    // Pickers ask for every member at once (limit=10000), so the ceiling stays
    // at 10000; this only stops absurd or invalid values.
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1)
    const limit = Math.min(10000, Math.max(1, parseInt(searchParams.get('limit') || '10000') || 10000))
    // Escaped: the search text goes into $regex.
    const search = escapeRegex(searchParams.get('search') || '')
    const role = searchParams.get('role') || ''
    const status = searchParams.get('status') || ''

    // Build filters
    const filters: any = { organization: organizationId }

    if (search) {
      filters.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { "projectManager.firstName": { $regex: search, $options: 'i' } },
        { "projectManager.lastName": { $regex: search, $options: 'i' } },
        { "humanResourcePartner.firstName": { $regex: search, $options: 'i' } },
        { "humanResourcePartner.lastName": { $regex: search, $options: 'i' } }
      ]
    }

    if (role) {
      // Check if the role is a system role or custom role
      const systemRoles = Object.values(Role)
      if (systemRoles.includes(role as Role)) {
        // System role - filter by role field
        filters.role = role
      } else {
        // Custom role - filter by customRole field
        filters.customRole = role
      }
    }

    if (status === 'active') {
      filters.isActive = true
    } else if (status === 'inactive') {
      filters.isActive = false
    }

    const isAll = searchParams.get('all') === 'true'
    const minimal = searchParams.get('minimal') === 'true'

    // Fast-path for dropdowns and pickers: skip partner/role populates and return lean member summary
    if (minimal) {
      let query = User.find(filters).select('_id firstName lastName email isActive')
      if (!isAll) {
        query = query.skip((page - 1) * limit).limit(limit)
      }
      const [members, total] = await Promise.all([
        query.lean(),
        User.countDocuments(filters)
      ])

      return NextResponse.json({
        success: true,
        data: {
          members,
          pagination: {
            page: isAll ? 1 : page,
            limit: isAll ? total : limit,
            total,
            totalPages: isAll ? 1 : (Math.ceil(total / limit) || 1)
          }
        }
      })
    }

    // Get members with custom role and partner information
    const members = await User.find(filters)
      // password is excluded here; the reset OTP/token are hidden by the schema.
      .select(canSeeRates ? '-password' : '-password -hourlyRate -billingRate')
      .populate('customRole', 'name description')
      .populate('projectManager', 'firstName lastName email role')
      .populate('humanResourcePartner', 'firstName lastName email role')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()

    // Normalize avatar URLs
    const normalizedMembers = members.map((member: any) => ({
      ...member,
      avatar: normalizeUploadUrl(member.avatar || '')
    }))

    const total = await User.countDocuments(filters)

    // Get pending invitations
    const pendingInvitations = await UserInvitation.find({
      organization: organizationId,
      isAccepted: false,
      expiresAt: { $gt: new Date() }
    })
      // The invitation token is what accepts an invitation; never return it.
      .select('-token')
      .populate('invitedBy', 'firstName lastName email')
      .populate('customRole', 'name')

    return NextResponse.json({
      success: true,
      data: {
        members: normalizedMembers,
        pendingInvitations,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    })

  } catch (error) {
    console.error('Get members error:', error)
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
    const userId = user.id
    const organizationId = user.organization

    const { memberId, updates: rawUpdates } = await request.json()

    // Only known fields are saved (F1/F7: this used to Object.assign the raw
    // body, so a caller could set password, organization or anything else).
    const updates: Record<string, any> = {}
    for (const field of EDITABLE_FIELDS) {
      if (rawUpdates && rawUpdates[field] !== undefined) updates[field] = rawUpdates[field]
    }

    // Check if user has permission to update members (loaded once)
    const actor = await PermissionService.getUserPermissions(userId)
    // OWN-scoped: must be granted to the role, not just "own record" (see GET).
    const canEditMembers = PermissionService.isGrantedIn(actor, Permission.USER_UPDATE)
    const hasTeamEditPermission = PermissionService.hasPermissionIn(actor, Permission.TEAM_EDIT)

    if (!canEditMembers || !hasTeamEditPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    // Find member
    const member = await User.findOne({
      _id: memberId,
      organization: organizationId
    })

    if (!member) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      )
    }

    if (member.role === 'admin') {
      const canManageAdminUsers = PermissionService.hasPermissionIn(actor, Permission.USER_MANAGE_ROLES)
      if (!canManageAdminUsers) {
        return NextResponse.json(
          { error: 'You do not have permission to edit administrator accounts' },
          { status: 403 }
        )
      }
    }

    // F11 rules (lib/permissions/role-grant-policy.ts) for role changes.
    if (updates.role !== undefined && updates.role !== member.role) {
      const decision = [
        canManageRoles(actor),
        canChangeRoleOf(actor, userId, { id: String(member._id), role: member.role }),
        canGrantSystemRole(actor, updates.role)
      ].find((d) => !d.ok)
      if (decision && !decision.ok) {
        return NextResponse.json({ error: decision.error }, { status: 403 })
      }
    }

    // Only admins may deactivate or reactivate an administrator.
    if (
      updates.isActive !== undefined &&
      updates.isActive !== member.isActive &&
      isAdminRole(member.role) &&
      !isAdminRole(actor.userRole)
    ) {
      return NextResponse.json(
        { error: "Only administrators can change an administrator's status" },
        { status: 403 }
      )
    }

    if (updates.firstName !== undefined && updates.firstName.trim().length < 2) {
      return NextResponse.json(
        { error: 'First name must be at least 2 characters' },
        { status: 400 }
      )
    }
    if (updates.lastName !== undefined && updates.lastName.trim().length < 2) {
      return NextResponse.json(
        { error: 'Last name must be at least 2 characters' },
        { status: 400 }
      )
    }

    // Update member
    Object.assign(member, updates)
    await member.save()

    // If hourlyRate was updated, propagate to all projects where this user is a team member
    if (updates.hourlyRate !== undefined) {
      await Project.updateMany(
        { organization: organizationId, 'teamMembers.memberId': memberId },
        { $set: { 'teamMembers.$[elem].hourlyRate': Number(updates.hourlyRate) } },
        { arrayFilters: [{ 'elem.memberId': memberId }] }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Member updated successfully',
      data: {
        id: member._id,
        firstName: member.firstName,
        lastName: member.lastName,
        email: member.email,
        memberId: member.memberId,
        role: member.role,
        isActive: member.isActive
      }
    })

  } catch (error) {
    console.error('Update member error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
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
    const userId = user.id
    const organizationId = user.organization

    const { searchParams } = new URL(request.url)
    const memberId = searchParams.get('memberId')

    if (!memberId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }


    // Check if user has permission to remove members
    const hasDeletePermission = await PermissionService.hasPermission(userId, Permission.TEAM_REMOVE)

    if (!hasDeletePermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    // Find member
    const member = await User.findOne({
      _id: memberId,
      organization: organizationId
    })



    if (!member) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      )
    }

    // Prevent self-deletion
    if (memberId === userId) {
      return NextResponse.json(
        { error: 'Cannot remove yourself' },
        { status: 400 }
      )
    }


    // F11: only administrators remove an administrator.
    if (isAdminRole(member.role)) {
      const actor = await PermissionService.getUserPermissions(userId)
      if (!isAdminRole(actor.userRole)) {
        return NextResponse.json(
          { error: 'You do not have permission to remove administrator accounts' },
          { status: 403 }
        )
      }
    }

    // E60: before detaching the member from any project, convert their still
    // open allocations (rows on a stand-up that has not yet completed) into
    // owner_absent carry-forward register items — the same conversion an
    // absence mark gets via attendance-service.ts, just triggered by removal
    // instead of a daily mark, and done eagerly since a removed member may
    // never attend another stand-up to trigger the completion-time sweep.
    const affectedProjects = (await Project.find({
      organization: organizationId,
      'teamMembers.memberId': memberId
    })
      .select('_id')
      .lean()) as any[]

    for (const affectedProject of affectedProjects) {
      await convertOpenAllocationsToCarryForward({
        projectId: String(affectedProject._id),
        memberId
      })
    }

    // Remove member from any project team member lists
    await Project.updateMany(
      { organization: organizationId, 'teamMembers.memberId': memberId },
      { $pull: { teamMembers: { memberId } } }
    )

    await User.deleteOne({ _id: memberId, organization: organizationId })

    return NextResponse.json({
      success: true,
      message: 'Member deleted successfully'
    })

  } catch (error) {
    console.error('Remove member error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
