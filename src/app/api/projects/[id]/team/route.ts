import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Project } from '@/models/Project'
import { User } from '@/models/User'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'
import { normalizeUploadUrl } from '@/lib/file-utils'

// GET /api/projects/[id]/team - Get project team members
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const projectId = params.id

    // Check if user has budget handling permission
    const hasBudgetPermission = await PermissionService.hasPermission(userId, Permission.BUDGET_HANDLING)

    // Find project and populate team members
    const project = await Project.findOne({
      _id: projectId,
      organization: organizationId,
      is_deleted: { $ne: true }
    })
      .populate('teamMembers.memberId', 'firstName lastName email avatar role')
      .populate('createdBy', 'firstName lastName email avatar')
      .populate('client', 'firstName lastName email avatar')
      .populate('projectRoles.user', 'firstName lastName email avatar')

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Get all organization members who are not yet in the team
    const organizationMembers = await User.find({
      organization: organizationId,
      isActive: true,
      _id: { $nin: project.teamMembers }
    })
      .select('firstName lastName email avatar role hourlyRate')
      .lean()

    // Normalize avatar URLs for all members
    const normalizeUserAvatar = (user: any) => {
      if (!user) return user
      return {
        ...user,
        avatar: normalizeUploadUrl(user.avatar || '')
      }
    }

    // Enhance team members with rate info if user has permission
    const enhanceMemberWithRate = (member: any) => {
      // Handle both old ObjectId format and new object format
      const memberId = member.memberId || member._id || member
      const memberHourlyRate = member.hourlyRate

      const normalizedMember = normalizeUserAvatar(typeof member === 'object' && member.memberId ? member.memberId : member)
      if (!hasBudgetPermission) {
        const { hourlyRate, ...memberWithoutRate } = normalizedMember
        return memberWithoutRate
      }

      // Use hourly rate from teamMembers if available, otherwise fall back to memberRates
      let projectRate = memberHourlyRate
      if (projectRate === undefined) {
        const projectRateEntry = project.memberRates?.find(
          (r: any) => r.user.toString() === memberId.toString()
        )
        projectRate = projectRateEntry ? projectRateEntry.hourlyRate : undefined
      }

      return {
        ...normalizedMember,
        projectHourlyRate: projectRate,
        // user.hourlyRate is already in member object
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        teamMembers: Array.isArray(project.teamMembers)
          ? project.teamMembers.map(enhanceMemberWithRate)
          : project.teamMembers ? [enhanceMemberWithRate(project.teamMembers)] : [],
        projectRoles: (project.projectRoles || []).map((pr: any) => ({
          ...pr,
          user: pr.user ? normalizeUserAvatar(pr.user) : pr.user
        })),
        createdBy: normalizeUserAvatar(project.createdBy),
        client: normalizeUserAvatar(project.client),
        availableMembers: organizationMembers.map(normalizeUserAvatar),
        // Include project budget info if user has permission
        budget: hasBudgetPermission ? project.budget : undefined
      }
    })

  } catch (error) {
    console.error('Get project team error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/projects/[id]/team - Update team member rate (or other details)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const projectId = params.id
    const { memberId, hourlyRate } = await request.json()


    if (!memberId) {
      return NextResponse.json(
        { error: 'Member ID is required' },
        { status: 400 }
      )
    }

    // If updating hourly rate, check budget permission
    if (hourlyRate !== undefined) {
      const hasBudgetPermission = await PermissionService.hasPermission(userId.toString(), Permission.BUDGET_HANDLING)
      if (!hasBudgetPermission) {
        return NextResponse.json(
          { error: 'Insufficient permissions to manage budget/rates' },
          { status: 403 }
        )
      }
    } else {
       // If updating other things (future use), check project manage team permission
       const canManageTeam = await PermissionService.hasPermission(userId, Permission.PROJECT_MANAGE_TEAM, projectId)
       if (!canManageTeam) {
         return NextResponse.json(
           { error: 'Insufficient permissions to manage project team' },
           { status: 403 }
         )
       }
    }

    // Find project
    const project = await Project.findOne({
      _id: projectId,
      organization: organizationId,
      is_deleted: { $ne: true }
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Verify member is in team
    const memberExists = Array.isArray(project.teamMembers)
      ? project.teamMembers.some((m: any) => (m.memberId || m).toString() === memberId.toString())
      : project.teamMembers?.toString() === memberId.toString()

    if (!memberExists) {
      return NextResponse.json(
        { error: 'Member is not in the project team' },
        { status: 400 }
      )
    }

    // Update hourly rate directly on team member
    if (hourlyRate !== undefined) {

      // Find and update the team member
      if (Array.isArray(project.teamMembers)) {
        const teamMember = project.teamMembers.find((m: any) => {
          const mId = m.memberId || m
          // Convert both to strings for comparison
          const mIdStr = mId ? mId.toString() : ''
          const memberIdStr = memberId ? memberId.toString() : ''
          const comparison = mIdStr === memberIdStr
          return comparison
        })

        if (teamMember) {
          teamMember.hourlyRate = hourlyRate
          // Mark the teamMembers array as modified
          project.markModified('teamMembers')
        } 
      }

      const existingRateIndex = project.memberRates.findIndex(
        (r: any) => r.user.toString() === memberId
      )

      if (existingRateIndex > -1) {
        // Update existing rate
        if (hourlyRate === null || hourlyRate === '') {
           // Remove if setting to null/empty (reset to default)
           project.memberRates.splice(existingRateIndex, 1)
        } else {
           project.memberRates[existingRateIndex].hourlyRate = Number(hourlyRate)
        }
      } else if (hourlyRate !== null && hourlyRate !== '') {
        // Add new rate
        project.memberRates.push({
          user: memberId,
          hourlyRate: Number(hourlyRate)
        })
      }
    }

    await project.save()


    return NextResponse.json({
      success: true,
      message: 'Team member updated successfully'
    })

  } catch (error) {
    console.error('Update team member error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/projects/[id]/team - Add team member to project
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const projectId = params.id

    // Check if user can manage team for this project
    const canManageTeam = await PermissionService.hasPermission(userId, Permission.PROJECT_MANAGE_TEAM, projectId)
    if (!canManageTeam) {
      return NextResponse.json(
        { error: 'Insufficient permissions to manage project team' },
        { status: 403 }
      )
    }

    const { memberId, role } = await request.json()

    if (!memberId) {
      return NextResponse.json(
        { error: 'Member ID is required' },
        { status: 400 }
      )
    }

    // Find project
    const project = await Project.findOne({
      _id: projectId,
      organization: organizationId,
      is_deleted: { $ne: true }
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Check if member exists and belongs to organization
    const member = await User.findOne({
      _id: memberId,
      organization: organizationId,
      isActive: true
    })

    if (!member) {
      return NextResponse.json(
        { error: 'Member not found or inactive' },
        { status: 404 }
      )
    }

    // Check if member is already in the team
    const memberAlreadyExists = Array.isArray(project.teamMembers)
      ? project.teamMembers.some((m: any) => (m.memberId || m).toString() === memberId.toString())
      : project.teamMembers?.toString() === memberId.toString()

    if (memberAlreadyExists) {
      return NextResponse.json(
        { error: 'Member is already in the project team' },
        { status: 400 }
      )
    }

    // Add member to team
    if (Array.isArray(project.teamMembers)) {
      project.teamMembers.push({ memberId, hourlyRate: undefined })
    } else {
      project.teamMembers = [{ memberId, hourlyRate: undefined }]
    }

    // Add project role if specified
    if (role && ['project_manager', 'project_member', 'project_viewer', 'project_client', 'project_account_manager', 'project_qa_lead', 'project_tester'].includes(role)) {
      // Remove existing role for this user if any
      project.projectRoles = project.projectRoles.filter(
        (r: any) => r.user.toString() !== memberId
      )
      
      // Add new role
      project.projectRoles.push({
        user: memberId,
        role: role,
        assignedBy: userId,
        assignedAt: new Date()
      })
    }

    await project.save()

    // Populate and return updated team
    const updatedProject = await Project.findById(projectId)
      .populate('teamMembers.memberId', 'firstName lastName email avatar role')
      .populate('projectRoles.user', 'firstName lastName email avatar')

    return NextResponse.json({
      success: true,
      message: 'Team member added successfully',
      data: {
        teamMembers: updatedProject.teamMembers,
        projectRoles: updatedProject.projectRoles
      }
    })

  } catch (error) {
    console.error('Add team member error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/projects/[id]/team - Remove team member from project
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const projectId = params.id

    // Check if user can manage team for this project
    const canManageTeam = await PermissionService.hasPermission(userId, Permission.PROJECT_MANAGE_TEAM, projectId)
    if (!canManageTeam) {
      return NextResponse.json(
        { error: 'Insufficient permissions to manage project team' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const memberId = searchParams.get('memberId')

    if (!memberId) {
      return NextResponse.json(
        { error: 'Member ID is required' },
        { status: 400 }
      )
    }

    // Find project
    const project = await Project.findOne({
      _id: projectId,
      organization: organizationId,
      is_deleted: { $ne: true }
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Prevent removing the project creator
    if (project.createdBy.toString() === memberId) {
      return NextResponse.json(
        { error: 'Cannot remove project creator from team' },
        { status: 400 }
      )
    }

    // Remove member from team
    project.teamMembers = Array.isArray(project.teamMembers)
      ? project.teamMembers.filter((m: any) => (m.memberId || m).toString() !== memberId.toString())
      : []

    // Remove project roles for this user
    project.projectRoles = project.projectRoles.filter(
      (r: any) => r.user.toString() !== memberId
    )

    await project.save()

    return NextResponse.json({
      success: true,
      message: 'Team member removed successfully'
    })

  } catch (error) {
    console.error('Remove team member error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

