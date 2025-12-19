import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db-config'
import { Project } from '@/models'
import { authenticateUser } from '@/lib/auth-utils'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB()
    
    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }

    const projectId = params.id
    const project = await Project.findById(projectId)

    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 })
    }

    // Check if user has access to this project
    const hasAccess = Array.isArray(project.teamMembers)
      ? project.teamMembers.some((m: any) => (m.memberId || m).toString() === authResult.user.id)
      : project.teamMembers?.toString() === authResult.user.id ||
        project.createdBy.toString() === authResult.user.id ||
        project.projectRoles.some((role: any) => role.user.toString() === authResult.user.id)

    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }

    return NextResponse.json({
      success: true,
      data: project.versions || []
    })
  } catch (error) {
    console.error('Error fetching project versions:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch project versions' },
      { status: 500 }
    )
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB()
    
    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }

    const projectId = params.id
    const { name, version, description, releaseDate, isReleased } = await req.json()

    if (!name || !version) {
      return NextResponse.json(
        { success: false, error: 'Name and version are required' },
        { status: 400 }
      )
    }

    const project = await Project.findById(projectId)

    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 })
    }

    // Check if user has permission to manage project
    const hasPermission = Array.isArray(project.teamMembers)
      ? project.teamMembers.some((m: any) => (m.memberId || m).toString() === authResult.user.id)
      : project.teamMembers?.toString() === authResult.user.id ||
        project.createdBy.toString() === authResult.user.id ||
        project.projectRoles.some((role: any) =>
          role.user.toString() === authResult.user.id &&
          ['project_manager', 'project_qa_lead'].includes(role.role)
        )

    if (!hasPermission) {
      return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 })
    }

    // Check if version already exists
    const existingVersion = project.versions.find((v: any) => v.version === version)
    if (existingVersion) {
      return NextResponse.json(
        { success: false, error: 'Version already exists' },
        { status: 400 }
      )
    }

    const newVersion = {
      name,
      version,
      description,
      releaseDate: releaseDate ? new Date(releaseDate) : undefined,
      isReleased: isReleased || false,
      createdBy: authResult.user.id,
      createdAt: new Date()
    }

    project.versions.push(newVersion)
    await project.save()

    return NextResponse.json({
      success: true,
      data: newVersion
    })
  } catch (error) {
    console.error('Error creating project version:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create project version' },
      { status: 500 }
    )
  }
}
