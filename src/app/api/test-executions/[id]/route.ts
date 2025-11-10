import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db-config'
import { TestExecution, Project } from '@/models'
// import { getServerSession } from 'next-auth'
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

    const testExecution = await TestExecution.findById(params.id)
      .populate('executedBy', 'firstName lastName email')
      .populate('testCase', 'title priority category')
      .populate('testPlan', 'name version')
      .populate('project', 'name')
      .populate('bugs', 'title status priority')

    if (!testExecution) {
      return NextResponse.json({ success: false, error: 'Test execution not found' }, { status: 404 })
    }

    const project = await Project.findById(testExecution.project)
    const userIdStr = (authResult as any)?.user?.id?.toString?.() || String((authResult as any)?.user?.id)
    const isExecutor = (testExecution as any)?.executedBy?.toString?.() === userIdStr
    const roleStr = (authResult as any)?.user?.role ?? (authResult as any)?.role
    const isAdmin = typeof roleStr === 'string' && ['admin', 'super_admin', 'superadmin'].includes(roleStr.toLowerCase())
    const createdByStr = project?.createdBy?.toString?.()
    const teamHasUser = Array.isArray(project?.teamMembers)
      ? project.teamMembers.some((m: any) => m?.toString?.() === userIdStr)
      : false
    const roleHasUser = Array.isArray(project?.projectRoles)
      ? project.projectRoles.some(
          (role: any) => role?.user?.toString?.() === userIdStr && ['project_manager', 'project_qa_lead', 'project_tester'].includes(role.role)
        )
      : false
    const hasAccess = isExecutor || (!!project && (isAdmin || createdByStr === userIdStr || teamHasUser || roleHasUser))

    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }

    return NextResponse.json({ success: true, data: testExecution })
  } catch (error) {
    console.error('Error fetching test execution:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch test execution' }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB()
    const authResult = await authenticateUser()

    if ('error' in authResult) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }

    const {
      status,
      actualResult,
      comments,
      executionTime,
      environment,
      version,
      attachments
    } = await req.json()

    const testExecution = await TestExecution.findById(params.id)
    if (!testExecution) {
      return NextResponse.json({ success: false, error: 'Test execution not found' }, { status: 404 })
    }

    const project = await Project.findById(testExecution.project)
    const userIdStr = (authResult as any)?.user?.id?.toString?.() || String((authResult as any)?.user?.id)
    const isExecutor = (testExecution as any)?.executedBy?.toString?.() === userIdStr
    const roleStr = (authResult as any)?.user?.role ?? (authResult as any)?.role
    const isAdmin = typeof roleStr === 'string' && ['admin', 'super_admin', 'superadmin'].includes(roleStr.toLowerCase())
    const createdByStr = project?.createdBy?.toString?.()
    const teamHasUser = Array.isArray(project?.teamMembers)
      ? project.teamMembers.some((m: any) => m?.toString?.() === userIdStr)
      : false
    const roleHasUser = Array.isArray(project?.projectRoles)
      ? project.projectRoles.some(
          (role: any) => role?.user?.toString?.() === userIdStr && ['project_manager', 'project_qa_lead', 'project_tester'].includes(role.role)
        )
      : false
    const hasAccess = isExecutor || (!!project && (isAdmin || createdByStr === userIdStr || teamHasUser || roleHasUser))

    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }

    // Update fields
    if (status !== undefined) testExecution.status = status
    if (actualResult !== undefined) testExecution.actualResult = actualResult
    if (comments !== undefined) testExecution.comments = comments
    if (executionTime !== undefined) testExecution.executionTime = executionTime
    if (environment !== undefined) testExecution.environment = environment
    if (version !== undefined) testExecution.version = version
    if (attachments !== undefined) testExecution.attachments = attachments

    await testExecution.save()
    await testExecution.populate('executedBy', 'firstName lastName email')
    await testExecution.populate('testCase', 'title priority category')
    await testExecution.populate('testPlan', 'name version')
    await testExecution.populate('project', 'name')

    return NextResponse.json({ success: true, data: testExecution })
  } catch (error) {
    console.error('Error updating test execution:', error)
    return NextResponse.json({ success: false, error: 'Failed to update test execution' }, { status: 500 })
  }
}

// DELETE /api/test-executions/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB()
    const authResult = await authenticateUser()

    if ('error' in authResult) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }

    const testExecution = await TestExecution.findById(params.id)
    if (!testExecution) {
      return NextResponse.json({ success: false, error: 'Test execution not found' }, { status: 404 })
    }

    const project = await Project.findById(testExecution.project)
    const userIdStr = (authResult as any)?.user?.id?.toString?.() || String((authResult as any)?.user?.id)
    const isExecutor = (testExecution as any)?.executedBy?.toString?.() === userIdStr
    const roleStr = (authResult as any)?.user?.role ?? (authResult as any)?.role
    const isAdmin = typeof roleStr === 'string' && ['admin', 'super_admin', 'superadmin'].includes(roleStr.toLowerCase())
    const createdByStr = project?.createdBy?.toString?.()
    const teamHasUser = Array.isArray(project?.teamMembers) ? project.teamMembers.some((m: any) => m?.toString?.() === userIdStr) : false
    const roleHasUser = Array.isArray(project?.projectRoles)
      ? project.projectRoles.some((role: any) => role?.user?.toString?.() === userIdStr && ['project_manager', 'project_qa_lead', 'project_tester'].includes(role.role))
      : false
    const hasAccess = isExecutor || (!!project && (isAdmin || createdByStr === userIdStr || teamHasUser || roleHasUser))

    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }

    await TestExecution.findByIdAndDelete(params.id)
    return NextResponse.json({ success: true, message: 'Test execution deleted successfully' })
  } catch (error) {
    console.error('Error deleting test execution:', error)
    return NextResponse.json({ success: false, error: 'Failed to delete test execution' }, { status: 500 })
  }
}
