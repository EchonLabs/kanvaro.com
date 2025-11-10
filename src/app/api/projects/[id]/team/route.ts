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

    // Check if user can access this project
    const canAccessProject = await PermissionService.canAccessProject(userId, projectId)
    if (!canAccessProject) {
      return NextResponse.json(
        { error: 'Access denied to project' },
        { status: 403 }
      )
    }

    // Find project and populate team members
    const project = await Project.findOne({
      _id: projectId,
      organization: organizationId,
      is_deleted: { $ne: true }
    })
      .populate('teamMembers', 'firstName lastName email avatar role')
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
      .select('firstName lastName email avatar role')
      .lean()

    // Normalize avatar URLs for all members
    const normalizeUserAvatar = (user: any) => {
      if (!user) return user
      return {
        ...user,
        avatar: normalizeUploadUrl(user.avatar || '')
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        teamMembers: Array.isArray(project.teamMembers) 
          ? project.teamMembers.map(normalizeUserAvatar)
          : project.teamMembers ? [normalizeUserAvatar(project.teamMembers)] : [],
        projectRoles: (project.projectRoles || []).map((pr: any) => ({
          ...pr,
          user: pr.user ? normalizeUserAvatar(pr.user) : pr.user
        })),
        createdBy: normalizeUserAvatar(project.createdBy),
        client: normalizeUserAvatar(project.client),
        availableMembers: organizationMembers.map(normalizeUserAvatar)
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
    if (project.teamMembers.includes(memberId)) {
      return NextResponse.json(
        { error: 'Member is already in the project team' },
        { status: 400 }
      )
    }

    // Add member to team
    project.teamMembers.push(memberId)

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
      .populate('teamMembers', 'firstName lastName email avatar role')
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
    project.teamMembers = project.teamMembers.filter(
      (member: any) => member.toString() !== memberId
    )

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

