import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db-config'
import { TestExecution, TestCase, Project } from '@/models'
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

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const testCase = await TestCase.findById(params.id)

    if (!testCase) {
      return NextResponse.json({ success: false, error: 'Test case not found' }, { status: 404 })
    }

    // Check if user has access to the project
    const project = await Project.findById(testCase.project)
    const hasAccess = project && (
      project.teamMembers.includes(authResult.user.id) || 
      project.createdBy.toString() === authResult.user.id ||
      project.projectRoles.some((role: any) => 
        role.user.toString() === authResult.user.id && 
        ['project_manager', 'project_qa_lead', 'project_tester'].includes(role.role)
      )
    )

    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }

    const skip = (page - 1) * limit

    const executions = await TestExecution.find({ testCase: params.id })
      .populate('executedBy', 'firstName lastName email')
      .populate('testPlan', 'name')
      .sort({ executedAt: -1 })
      .skip(skip)
      .limit(limit)

    const total = await TestExecution.countDocuments({ testCase: params.id })

    return NextResponse.json({
      success: true,
      data: executions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Error fetching test case execution history:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch test case execution history' },
      { status: 500 }
    )
  }
}
