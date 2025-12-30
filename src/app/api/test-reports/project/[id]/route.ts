import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db-config'
import { TestCase, TestExecution, TestSuite, TestPlan, Project } from '@/models'
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

    const projectId = params.id

    // Check if user has access to the project
    const project = await Project.findById(projectId)
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 })
    }
    const hasAccess = project.teamMembers.includes(authResult.user.id) || 
                     project.createdBy.toString() === authResult.user.id ||
                     project.projectRoles.some((role: any) => 
                       role.user.toString() === authResult.user.id && 
                       ['project_manager', 'project_qa_lead', 'project_tester'].includes(role.role)
                     )

    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }

    // Get test statistics
    const totalTestCases = await TestCase.countDocuments({ project: projectId, isActive: true })
    const totalTestSuites = await TestSuite.countDocuments({ project: projectId, isActive: true })
    const totalTestPlans = await TestPlan.countDocuments({ project: projectId, isActive: true })

    // Get execution statistics
    const executions = await TestExecution.find({ project: projectId })
    const totalExecutions = executions.length

    const statusCounts = executions.reduce((acc, execution) => {
      acc[execution.status] = (acc[execution.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const passRate = totalExecutions > 0 ? 
      ((statusCounts.passed || 0) / totalExecutions * 100).toFixed(1) : '0'

    // Get test cases by category
    const testCasesByCategory = await TestCase.aggregate([
      { $match: { project: projectId, isActive: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ])

    // Get test cases by priority
    const testCasesByPriority = await TestCase.aggregate([
      { $match: { project: projectId, isActive: true } },
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ])

    // Get test cases by automation status
    const testCasesByAutomation = await TestCase.aggregate([
      { $match: { project: projectId, isActive: true } },
      { $group: { _id: '$automationStatus', count: { $sum: 1 } } }
    ])

    // Get recent executions
    const recentExecutions = await TestExecution.find({ project: projectId })
      .populate('executedBy', 'firstName lastName email')
      .populate('testCase', 'title priority')
      .sort({ executedAt: -1 })
      .limit(10)

    // Get execution trends (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const executionTrends = await TestExecution.aggregate([
      { $match: { project: projectId, executedAt: { $gte: thirtyDaysAgo } } },
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

    const report = {
      summary: {
        totalTestCases,
        totalTestSuites,
        totalTestPlans,
        totalExecutions,
        passRate: parseFloat(passRate),
        statusCounts
      },
      testCasesByCategory,
      testCasesByPriority,
      testCasesByAutomation,
      recentExecutions,
      executionTrends
    }

    return NextResponse.json({
      success: true,
      data: report
    })
  } catch (error) {
    console.error('Error generating project test report:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to generate project test report' },
      { status: 500 }
    )
  }
}
