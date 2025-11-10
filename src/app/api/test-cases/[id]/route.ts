import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db-config'
import { TestCase, TestSuite, Project } from '@/models'
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

    const testCase = await TestCase.findById(params.id)
      .populate('createdBy', 'firstName lastName email')
      .populate('testSuite', 'name')
      .populate('project', 'name')

    if (!testCase) {
      return NextResponse.json({ success: false, error: 'Test case not found' }, { status: 404 })
    }

    // Check if user has access to the project (safe ObjectId comparisons)
    const project = await Project.findById(testCase.project)
    const userIdStr_GET = authResult.user.id?.toString?.() || String(authResult.user.id)
    const teamHasUser_GET = Array.isArray(project?.teamMembers)
      ? project.teamMembers.some((m: any) => m?.toString?.() === userIdStr_GET)
      : false
    const createdByStr_GET = project?.createdBy?.toString?.()
    const roleHasUser_GET = Array.isArray(project?.projectRoles)
      ? project.projectRoles.some(
          (role: any) => role?.user?.toString?.() === userIdStr_GET && ['project_manager', 'project_qa_lead', 'project_tester'].includes(role.role)
        )
      : false
    const hasAccess = !!project && (createdByStr_GET === userIdStr_GET || teamHasUser_GET || roleHasUser_GET)

    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }

    return NextResponse.json({
      success: true,
      data: testCase
    })
  } catch (error) {
    console.error('Error fetching test case:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch test case' },
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

    const {
      title,
      description,
      preconditions,
      steps,
      expectedResult,
      testData,
      priority,
      category,
      automationStatus,
      requirements,
      estimatedExecutionTime,
      testSuiteId,
      isActive,
      tags,
      customFields
    } = await req.json()

    const testCase = await TestCase.findById(params.id)

    if (!testCase) {
      return NextResponse.json({ success: false, error: 'Test case not found' }, { status: 404 })
    }

    // Check if user has access to the project (safe ObjectId comparisons)
    const project = await Project.findById(testCase.project)
    const userIdStr = authResult.user.id?.toString?.() || String(authResult.user.id)
    const teamHasUser = Array.isArray(project?.teamMembers)
      ? project.teamMembers.some((m: any) => m?.toString?.() === userIdStr)
      : false
    const createdByStr = project?.createdBy?.toString?.()
    const roleHasUser = Array.isArray(project?.projectRoles)
      ? project.projectRoles.some(
          (role: any) => role?.user?.toString?.() === userIdStr && ['project_manager', 'project_qa_lead'].includes(role.role)
        )
      : false
    const hasAccess = !!project && (createdByStr === userIdStr || teamHasUser || roleHasUser)

    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }

    // Check if test suite exists and belongs to the same project
    if (testSuiteId && testSuiteId !== testCase.testSuite.toString()) {
      const testSuite = await TestSuite.findById(testSuiteId)
      if (!testSuite || testSuite.project.toString() !== testCase.project.toString()) {
        return NextResponse.json(
          { success: false, error: 'Invalid test suite' },
          { status: 400 }
        )
      }
    }

    // Update test case
    testCase.title = title || testCase.title
    testCase.description = description !== undefined ? description : testCase.description
    testCase.preconditions = preconditions !== undefined ? preconditions : testCase.preconditions
    testCase.steps = steps !== undefined ? steps : testCase.steps
    testCase.expectedResult = expectedResult !== undefined ? expectedResult : testCase.expectedResult
    testCase.testData = testData !== undefined ? testData : testCase.testData
    testCase.priority = priority || testCase.priority
    testCase.category = category || testCase.category
    testCase.automationStatus = automationStatus || testCase.automationStatus
    testCase.requirements = requirements !== undefined ? requirements : testCase.requirements
    testCase.estimatedExecutionTime = estimatedExecutionTime !== undefined ? estimatedExecutionTime : testCase.estimatedExecutionTime
    testCase.testSuite = testSuiteId || testCase.testSuite
    testCase.isActive = isActive !== undefined ? isActive : testCase.isActive
    testCase.tags = tags || testCase.tags
    testCase.customFields = customFields || testCase.customFields

    await testCase.save()
    await testCase.populate('createdBy', 'firstName lastName email')
    await testCase.populate('testSuite', 'name')
    await testCase.populate('project', 'name')

    return NextResponse.json({
      success: true,
      data: testCase
    })
  } catch (error) {
    console.error('Error updating test case:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update test case' },
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

    const testCase = await TestCase.findById(params.id)

    if (!testCase) {
      return NextResponse.json({ success: false, error: 'Test case not found' }, { status: 404 })
    }

    // Check if user has access to the project (safe ObjectId comparisons)
    const project = await Project.findById(testCase.project)
    const userIdStr_DEL = authResult.user.id?.toString?.() || String(authResult.user.id)
    const teamHasUser_DEL = Array.isArray(project?.teamMembers)
      ? project.teamMembers.some((m: any) => m?.toString?.() === userIdStr_DEL)
      : false
    const createdByStr_DEL = project?.createdBy?.toString?.()
    const roleHasUser_DEL = Array.isArray(project?.projectRoles)
      ? project.projectRoles.some(
          (role: any) => role?.user?.toString?.() === userIdStr_DEL && ['project_manager', 'project_qa_lead'].includes(role.role)
        )
      : false
    const hasAccess = !!project && (createdByStr_DEL === userIdStr_DEL || teamHasUser_DEL || roleHasUser_DEL)

    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }

    await TestCase.findByIdAndDelete(params.id)

    return NextResponse.json({
      success: true,
      message: 'Test case deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting test case:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete test case' },
      { status: 500 }
    )
  }
}
