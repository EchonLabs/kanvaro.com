import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db-config'
import { TestExecution, TestCase, Task, Project } from '@/models'
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

    const { title, description, priority, assignedTo, foundInVersion } = await req.json()

    if (!title) {
      return NextResponse.json(
        { success: false, error: 'Title is required' },
        { status: 400 }
      )
    }

    const testExecution = await TestExecution.findById(params.id)
      .populate('testCase', 'title description steps expectedResult preconditions testData')
      .populate('project', 'name')

    if (!testExecution) {
      return NextResponse.json({ success: false, error: 'Test execution not found' }, { status: 404 })
    }

    // Check if user has access to the project
    const project = await Project.findById(testExecution.project)
    const userIdStr = authResult.user.id?.toString?.() || String(authResult.user.id)
    const roleStr = (authResult.user.role || '').toString()
    const hasRolePerm = await hasTestPermission(userIdStr, roleStr, Permission.TEST_EXECUTION_CREATE)
    const hasAccess = hasRolePerm || (project && (
      project.teamMembers.includes(authResult.user.id) || 
      project.createdBy.toString() === authResult.user.id ||
      project.projectRoles.some((role: any) => 
        role.user.toString() === authResult.user.id && 
        ['project_manager', 'project_qa_lead', 'project_tester'].includes(role.role)
      )
    ))

    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }

    // Create enhanced bug description
    const testCase = testExecution.testCase as any
    const enhancedDescription = `
${description || ''}

--- Test Case Information ---
Test Case: ${testCase.title}
Test Case ID: ${testCase._id}

--- Test Execution Details ---
Executed By: ${testExecution.executedBy}
Execution Date: ${testExecution.executedAt}
Environment: ${testExecution.environment}
Version: ${testExecution.version}

--- Test Case Details ---
Preconditions: ${testCase.preconditions || 'None'}
Steps to Reproduce:
${testCase.steps.map((step: any, index: number) => `${index + 1}. ${step.step}`).join('\n')}

Expected Result: ${testCase.expectedResult}
Actual Result: ${testExecution.actualResult}

Test Data: ${testCase.testData || 'None'}

--- Additional Information ---
Comments: ${testExecution.comments || 'None'}
Execution Time: ${testExecution.executionTime} minutes
    `.trim()

    // Create bug task
    const bugTask = new Task({
      title,
      description: enhancedDescription,
      type: 'bug',
      priority: priority || testCase.priority || 'medium',
      organization: authResult.user.organization,
      project: testExecution.project,
      createdBy: authResult.user.id,
      assignedTo,
      foundInVersion: foundInVersion || testExecution.version,
      linkedTestCase: testCase._id,
      testExecutionId: testExecution._id,
      labels: ['bug', 'test-failure']
    })

    await bugTask.save()

    // Link the bug to the test execution
    testExecution.bugs.push(bugTask._id)
    await testExecution.save()

    await bugTask.populate('assignedTo', 'firstName lastName email')
    await bugTask.populate('createdBy', 'firstName lastName email')

    return NextResponse.json({
      success: true,
      data: bugTask,
      message: 'Bug created successfully from test execution'
    })
  } catch (error) {
    console.error('Error creating bug from test execution:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create bug from test execution' },
      { status: 500 }
    )
  }
}
