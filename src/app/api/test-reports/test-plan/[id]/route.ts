import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db-config'
import { TestExecution, TestPlan, TestCase, Project } from '@/models'
// import { getServerSession } from 'next-auth'
import { authenticateUser } from '@/lib/auth-utils'
import { hasTestPermission } from '@/lib/permissions/test-permission-helper'
import { Permission } from '@/lib/permissions/permission-definitions'

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

    const testPlanId = params.id

    // Check if user has access to the test plan
    const testPlan = await TestPlan.findById(testPlanId)
      .populate('project', 'name')
      .populate('testCases', 'title priority category automationStatus')

    if (!testPlan) {
      return NextResponse.json({ success: false, error: 'Test plan not found' }, { status: 404 })
    }

    const project = await Project.findById(testPlan.project)
    const userIdStr = authResult.user.id?.toString?.() || String(authResult.user.id)
    const roleStr = (authResult.user.role || '').toString()
    const hasRolePerm = await hasTestPermission(userIdStr, roleStr, Permission.TEST_REPORT_VIEW)
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

    // Get test plan statistics
    const totalTestCases = testPlan.testCases.length
    const testCases = testPlan.testCases as any[]

    // Get execution statistics for this test plan
    const executions = await TestExecution.find({ testPlan: testPlanId })
      .populate('executedBy', 'firstName lastName email')
      .populate('testCase', 'title priority category')

    const totalExecutions = executions.length

    const statusCounts = executions.reduce((acc, execution) => {
      acc[execution.status] = (acc[execution.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const passRate = totalExecutions > 0 ? 
      ((statusCounts.passed || 0) / totalExecutions * 100).toFixed(1) : '0'

    // Get execution progress by test case
    const testCaseExecutions = await TestExecution.aggregate([
      { $match: { testPlan: testPlanId } },
      {
        $group: {
          _id: '$testCase',
          executions: { $sum: 1 },
          lastExecution: { $max: '$executedAt' },
          lastStatus: { $last: '$status' }
        }
      }
    ])

    // Get execution trends
    const executionTrends = await TestExecution.aggregate([
      { $match: { testPlan: testPlanId } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$executedAt' } },
            status: '$status'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.date': 1 } }
    ])

    // Get tester productivity
    const testerProductivity = await TestExecution.aggregate([
      { $match: { testPlan: testPlanId } },
      {
        $group: {
          _id: '$executedBy',
          executions: { $sum: 1 },
          passed: { $sum: { $cond: [{ $eq: ['$status', 'passed'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          blocked: { $sum: { $cond: [{ $eq: ['$status', 'blocked'] }, 1, 0] } }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'tester'
        }
      },
      {
        $project: {
          tester: { $arrayElemAt: ['$tester', 0] },
          executions: '$executions',
          passed: '$passed',
          failed: '$failed',
          blocked: '$blocked',
          passRate: { $multiply: [{ $divide: ['$passed', '$executions'] }, 100] }
        }
      }
    ])

    const report = {
      testPlan: {
        _id: testPlan._id,
        name: testPlan.name,
        description: testPlan.description,
        status: testPlan.status,
        version: testPlan.version,
        startDate: testPlan.startDate,
        endDate: testPlan.endDate,
        assignedTo: testPlan.assignedTo
      },
      summary: {
        totalTestCases,
        totalExecutions,
        passRate: parseFloat(passRate),
        statusCounts
      },
      testCaseExecutions,
      executionTrends,
      testerProductivity,
      recentExecutions: executions.slice(0, 10)
    }

    return NextResponse.json({
      success: true,
      data: report
    })
  } catch (error) {
    console.error('Error generating test plan report:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to generate test plan report' },
      { status: 500 }
    )
  }
}
