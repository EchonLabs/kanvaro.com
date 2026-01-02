import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db-config'
import { Project } from '@/models'
// import { getServerSession } from 'next-auth'
import { authenticateUser } from '@/lib/auth-utils'

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; versionId: string } }
) {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    
    if ('error' in authResult) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }

    const { id: projectId, versionId } = params
    const { name, version, description, releaseDate, isReleased } = await req.json()

    const project = await Project.findById(projectId)

    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 })
    }

    // Check if user has permission to manage project
    const hasPermission =
      (Array.isArray(project.teamMembers)
        ? project.teamMembers.some((m: any) => ((m.memberId || m).toString() === authResult.user.id))
        : project.teamMembers && project.teamMembers.toString() === authResult.user.id
      ) ||
      (project.createdBy && project.createdBy.toString() === authResult.user.id) ||
      (Array.isArray(project.projectRoles) &&
      project.projectRoles.some(
          (role: any) =>
            role.user &&
            role.user.toString() === authResult.user.id &&
            ['project_manager', 'project_qa_lead'].includes(role.role)
        )
      );

    if (!hasPermission) {
      return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 })
    }

    const versionIndex = project.versions.findIndex((v: any) => v._id?.toString() === versionId)
    
    if (versionIndex === -1) {
      return NextResponse.json({ success: false, error: 'Version not found' }, { status: 404 })
    }

    // Check if new version name conflicts with existing versions
    if (version && version !== project.versions[versionIndex].version) {
      const existingVersion = project.versions.find((v: any) => v.version === version && v._id?.toString() !== versionId)
      if (existingVersion) {
        return NextResponse.json(
          { success: false, error: 'Version already exists' },
          { status: 400 }
        )
      }
    }

    // Update version
    project.versions[versionIndex] = {
      ...project.versions[versionIndex],
      name: name || project.versions[versionIndex].name,
      version: version || project.versions[versionIndex].version,
      description: description !== undefined ? description : project.versions[versionIndex].description,
      releaseDate: releaseDate ? new Date(releaseDate) : project.versions[versionIndex].releaseDate,
      isReleased: isReleased !== undefined ? isReleased : project.versions[versionIndex].isReleased
    }

    await project.save()

    return NextResponse.json({
      success: true,
      data: project.versions[versionIndex]
    })
  } catch (error) {
    console.error('Error updating project version:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update project version' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; versionId: string } }
) {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    
    if ('error' in authResult) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }

    const { id: projectId, versionId } = params

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

    const versionIndex = project.versions.findIndex((v: any) => v._id?.toString() === versionId)
    
    if (versionIndex === -1) {
      return NextResponse.json({ success: false, error: 'Version not found' }, { status: 404 })
    }

    // Remove version
    project.versions.splice(versionIndex, 1)
    await project.save()

    return NextResponse.json({
      success: true,
      message: 'Version deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting project version:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete project version' },
      { status: 500 }
    )
  }
}
