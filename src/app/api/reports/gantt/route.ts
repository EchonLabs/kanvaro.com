import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/db-config'
import { generateGanttData } from '@/lib/gantt'
import { authenticateUser } from '@/lib/auth-utils'
import { Project } from '@/models/Project'
import { PermissionService } from '@/lib/permissions/permission-service'
import { canReadProject, projectScopeOf } from '@/lib/permissions/project-scope'

export async function GET(req: NextRequest) {
  try {
    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const organizationId = authResult.user.organization

    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')
    const sprintId = searchParams.get('sprintId')
    const assigneeId = searchParams.get('assigneeId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    await connectDB()

    // Only tasks in the caller's organisation and in projects they can see.
    // This route had no check at all: without projectId it returned every task
    // in the database, and with one any project's tasks and sprints.
    const permissions = await PermissionService.getUserPermissions(authResult.user.id)
    const scope = projectScopeOf(permissions)

    if (projectId) {
      const inOrganisation =
        mongoose.Types.ObjectId.isValid(projectId) &&
        (await Project.exists({ _id: projectId, organization: organizationId }))
      if (!inOrganisation) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }
      if (!canReadProject(scope, projectId)) {
        return NextResponse.json({ error: 'You do not have access to this project' }, { status: 403 })
      }
    }

    const ganttData = await generateGanttData(
      { organizationId, projectIds: scope.allProjects ? undefined : scope.projectIds },
      projectId || undefined,
      sprintId || undefined,
      assigneeId || undefined,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    )

    return NextResponse.json(ganttData)
  } catch (error) {
    console.error('Gantt data error:', error)
    return NextResponse.json({ error: 'Failed to generate Gantt data' }, { status: 500 })
  }
}
