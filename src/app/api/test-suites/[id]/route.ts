import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db-config'
import { TestSuite, Project } from '@/models'
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

    const testSuite = await TestSuite.findById(params.id)
      .populate('createdBy', 'firstName lastName email')
      .populate('parentSuite', 'name')
      .populate('project', 'name')

    if (!testSuite) {
      return NextResponse.json({ success: false, error: 'Test suite not found' }, { status: 404 })
    }

    // Check if user has access to the project (compare as strings)
    const project = await Project.findById(testSuite.project)
    const userIdStr = authResult.user.id?.toString?.() || String(authResult.user.id)
    const createdByStr = project?.createdBy?.toString?.()
    const teamHasUser = Array.isArray(project?.teamMembers)
      ? project!.teamMembers.some((m: any) => m?.toString?.() === userIdStr)
      : false
    const roleHasUser = Array.isArray(project?.projectRoles)
      ? project!.projectRoles.some(
          (role: any) => role?.user?.toString?.() === userIdStr && ['project_manager', 'project_qa_lead', 'project_tester'].includes(role.role)
        )
      : false
    const hasAccess = !!project && (createdByStr === userIdStr || teamHasUser || roleHasUser)

    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }

    return NextResponse.json({
      success: true,
      data: testSuite
    })
  } catch (error) {
    console.error('Error fetching test suite:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch test suite' },
      { status: 500 }
    )
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

    const { name, description, parentSuiteId, order, isActive, tags, customFields } = await req.json()

    const testSuite = await TestSuite.findById(params.id)

    if (!testSuite) {
      return NextResponse.json({ success: false, error: 'Test suite not found' }, { status: 404 })
    }

    // Check if user has access to the project (compare as strings)
    const project = await Project.findById(testSuite.project)
    const userIdStr = authResult.user.id?.toString?.() || String(authResult.user.id)
    const createdByStr = project?.createdBy?.toString?.()
    const teamHasUser = Array.isArray(project?.teamMembers)
      ? project!.teamMembers.some((m: any) => m?.toString?.() === userIdStr)
      : false
    const roleHasUser = Array.isArray(project?.projectRoles)
      ? project!.projectRoles.some(
          (role: any) => role?.user?.toString?.() === userIdStr && ['project_manager', 'project_qa_lead', 'project_tester'].includes(role.role)
        )
      : false
    const hasAccess = !!project && (createdByStr === userIdStr || teamHasUser || roleHasUser)

    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }

    // Check if parent suite exists and belongs to the same project
    if (parentSuiteId && parentSuiteId !== testSuite.parentSuite?.toString?.()) {
      const parentSuite = await TestSuite.findById(parentSuiteId)
      if (!parentSuite || parentSuite.project?.toString?.() !== testSuite.project?.toString?.()) {
        return NextResponse.json(
          { success: false, error: 'Invalid parent suite' },
          { status: 400 }
        )
      }
    }

    // Update test suite
    testSuite.name = name || testSuite.name
    testSuite.description = description !== undefined ? description : testSuite.description
    testSuite.parentSuite = parentSuiteId || testSuite.parentSuite
    testSuite.order = order !== undefined ? order : testSuite.order
    testSuite.isActive = isActive !== undefined ? isActive : testSuite.isActive
    testSuite.tags = tags || testSuite.tags
    testSuite.customFields = customFields || testSuite.customFields

    await testSuite.save()
    await testSuite.populate('createdBy', 'firstName lastName email')
    await testSuite.populate('parentSuite', 'name')

    return NextResponse.json({
      success: true,
      data: testSuite
    })
  } catch (error) {
    console.error('Error updating test suite:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update test suite' },
      { status: 500 }
    )
  }
}

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

    const testSuite = await TestSuite.findById(params.id)

    if (!testSuite) {
      return NextResponse.json({ success: false, error: 'Test suite not found' }, { status: 404 })
    }

    // Check if user has access to the project (compare as strings)
    const project = await Project.findById(testSuite.project)
    const userIdStr = authResult.user.id?.toString?.() || String(authResult.user.id)
    const createdByStr = project?.createdBy?.toString?.()
    const teamHasUser = Array.isArray(project?.teamMembers)
      ? project!.teamMembers.some((m: any) => m?.toString?.() === userIdStr)
      : false
    const roleHasUser = Array.isArray(project?.projectRoles)
      ? project!.projectRoles.some(
          (role: any) => role?.user?.toString?.() === userIdStr && ['project_manager', 'project_qa_lead', 'project_tester'].includes(role.role)
        )
      : false
    const hasAccess = !!project && (createdByStr === userIdStr || teamHasUser || roleHasUser)

    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }

    // Check if test suite has child suites
    const childSuites = await TestSuite.find({ parentSuite: params.id })
    if (childSuites.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete test suite with child suites' },
        { status: 400 }
      )
    }

    await TestSuite.findByIdAndDelete(params.id)

    return NextResponse.json({
      success: true,
      message: 'Test suite deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting test suite:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete test suite' },
      { status: 500 }
    )
  }
}
