import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db-config'
import { TestCase, TestSuite, Project } from '@/models'
// import { getServerSession } from 'next-auth'
import { authenticateUser } from '@/lib/auth-utils'
import { hasTestPermission } from '@/lib/permissions/test-permission-helper'
import { Permission } from '@/lib/permissions/permission-definitions'

export async function POST(req: NextRequest) {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    
    if ('error' in authResult) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }

    const { action, testCaseIds, updates } = await req.json()

    if (!action || !testCaseIds || !Array.isArray(testCaseIds)) {
      return NextResponse.json(
        { success: false, error: 'Action and testCaseIds are required' },
        { status: 400 }
      )
    }

    // Check if user has access to all test cases
    const userIdStr = authResult.user.id?.toString?.() || String(authResult.user.id)
    const roleStr = (authResult.user.role || '').toString()
    const hasRolePerm = await hasTestPermission(userIdStr, roleStr, Permission.TEST_CASE_UPDATE)
    const testCases = await TestCase.find({ _id: { $in: testCaseIds } })
    
    if (!hasRolePerm) {
      for (const testCase of testCases) {
        const project = await Project.findById(testCase.project)
        const hasAccess = project && (
          project.teamMembers.includes(authResult.user.id) || 
          project.createdBy.toString() === authResult.user.id ||
          project.projectRoles.some((role: any) => 
            role.user.toString() === authResult.user.id && 
            ['project_manager', 'project_qa_lead'].includes(role.role)
          )
        )

        if (!hasAccess) {
          return NextResponse.json({ success: false, error: 'Access denied to one or more test cases' }, { status: 403 })
        }
      }
    }

    let result

    switch (action) {
      case 'update':
        if (!updates) {
          return NextResponse.json(
            { success: false, error: 'Updates are required for update action' },
            { status: 400 }
          )
        }

        // Validate test suite if being updated
        if (updates.testSuite) {
          const testSuite = await TestSuite.findById(updates.testSuite)
          if (!testSuite) {
            return NextResponse.json(
              { success: false, error: 'Invalid test suite' },
              { status: 400 }
            )
          }
        }

        result = await TestCase.updateMany(
          { _id: { $in: testCaseIds } },
          { $set: updates }
        )
        break

      case 'delete':
        result = await TestCase.deleteMany({ _id: { $in: testCaseIds } })
        break

      case 'activate':
        result = await TestCase.updateMany(
          { _id: { $in: testCaseIds } },
          { $set: { isActive: true } }
        )
        break

      case 'deactivate':
        result = await TestCase.updateMany(
          { _id: { $in: testCaseIds } },
          { $set: { isActive: false } }
        )
        break

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        )
    }

    return NextResponse.json({
      success: true,
      data: result,
      message: `Bulk ${action} completed successfully`
    })
  } catch (error) {
    console.error('Error performing bulk operation:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to perform bulk operation' },
      { status: 500 }
    )
  }
}
