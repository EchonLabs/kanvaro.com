import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db-config'
import { TestPlan, TestCase, Project } from '@/models'
// import { getServerSession } from 'next-auth'
import { authenticateUser } from '@/lib/auth-utils'
import { hasTestPermission } from '@/lib/permissions/test-permission-helper'
import { Permission } from '@/lib/permissions/permission-definitions'

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

    const { testCaseIds } = await req.json()

    if (!testCaseIds || !Array.isArray(testCaseIds)) {
      return NextResponse.json(
        { success: false, error: 'testCaseIds array is required' },
        { status: 400 }
      )
    }

    const testPlan = await TestPlan.findById(params.id)

    if (!testPlan) {
      return NextResponse.json({ success: false, error: 'Test plan not found' }, { status: 404 })
    }

    // Check if user has access to the project
    const project = await Project.findById(testPlan.project)
    const userIdStr = authResult.user.id?.toString?.() || String(authResult.user.id)
    const roleStr = (authResult.user.role || '').toString()
    const hasRolePerm = await hasTestPermission(userIdStr, roleStr, Permission.TEST_PLAN_MANAGE)
    const hasAccess = hasRolePerm || (project && (
      project.teamMembers.includes(authResult.user.id) || 
      project.createdBy.toString() === authResult.user.id ||
      project.projectRoles.some((role: any) => 
        role.user.toString() === authResult.user.id && 
        ['project_manager', 'project_qa_lead'].includes(role.role)
      )
    ))

    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }

    // Check if all test cases exist and belong to the same project
    const testCases = await TestCase.find({ _id: { $in: testCaseIds } })
    
    if (testCases.length !== testCaseIds.length) {
      return NextResponse.json(
        { success: false, error: 'One or more test cases not found' },
        { status: 400 }
      )
    }

    for (const testCase of testCases) {
      if (testCase.project.toString() !== testPlan.project.toString()) {
        return NextResponse.json(
          { success: false, error: 'All test cases must belong to the same project as the test plan' },
          { status: 400 }
        )
      }
    }

    // Add test cases to test plan (avoid duplicates)
    const existingTestCaseIds = testPlan.testCases.map((id: any) => id.toString())
    const newTestCaseIds = testCaseIds.filter((id: any) => !existingTestCaseIds.includes(id))
    
    testPlan.testCases.push(...newTestCaseIds)
    await testPlan.save()

    await testPlan.populate('testCases', 'title priority category automationStatus')

    return NextResponse.json({
      success: true,
      data: testPlan,
      message: `${newTestCaseIds.length} test cases added to test plan`
    })
  } catch (error) {
    console.error('Error adding test cases to test plan:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to add test cases to test plan' },
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

    const { testCaseIds } = await req.json()

    if (!testCaseIds || !Array.isArray(testCaseIds)) {
      return NextResponse.json(
        { success: false, error: 'testCaseIds array is required' },
        { status: 400 }
      )
    }

    const testPlan = await TestPlan.findById(params.id)

    if (!testPlan) {
      return NextResponse.json({ success: false, error: 'Test plan not found' }, { status: 404 })
    }

    // Check if user has access to the project
    const project = await Project.findById(testPlan.project)
    const userIdStr_DEL = authResult.user.id?.toString?.() || String(authResult.user.id)
    const roleStr_DEL = (authResult.user.role || '').toString()
    const hasRolePerm_DEL = await hasTestPermission(userIdStr_DEL, roleStr_DEL, Permission.TEST_PLAN_MANAGE)
    const hasAccess = hasRolePerm_DEL || (project && (
      project.teamMembers.includes(authResult.user.id) || 
      project.createdBy.toString() === authResult.user.id ||
      project.projectRoles.some((role: any) => 
        role.user.toString() === authResult.user.id && 
        ['project_manager', 'project_qa_lead'].includes(role.role)
      )
    ))

    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }

    // Remove test cases from test plan
    testPlan.testCases = testPlan.testCases.filter((id: any) => !testCaseIds.includes(id.toString()))
    await testPlan.save()

    await testPlan.populate('testCases', 'title priority category automationStatus')

    return NextResponse.json({
      success: true,
      data: testPlan,
      message: `${testCaseIds.length} test cases removed from test plan`
    })
  } catch (error) {
    console.error('Error removing test cases from test plan:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to remove test cases from test plan' },
      { status: 500 }
    )
  }
}
