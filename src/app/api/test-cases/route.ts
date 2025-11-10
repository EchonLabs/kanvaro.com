import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db-config'
import { TestCase, TestSuite, Project } from '@/models'
// import { getServerSession } from 'next-auth'
import { authenticateUser } from '@/lib/auth-utils'

export async function GET(req: NextRequest) {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    
    if ('error' in authResult) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }

    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')
    const testSuiteId = searchParams.get('testSuiteId')
    const priority = searchParams.get('priority')
    const category = searchParams.get('category')
    const automationStatus = searchParams.get('automationStatus')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    let query: any = { organization: authResult.user.organization }

    if (projectId) {
      query.project = projectId
    }

    if (testSuiteId) {
      query.testSuite = testSuiteId
    }

    if (priority) {
      query.priority = priority
    }

    if (category) {
      query.category = category
    }

    if (automationStatus) {
      query.automationStatus = automationStatus
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ]
    }

    const skip = (page - 1) * limit

    const testCases = await TestCase.find(query)
      .populate('createdBy', 'firstName lastName email')
      .populate('testSuite', 'name')
      .populate('project', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)

    const total = await TestCase.countDocuments(query)

    return NextResponse.json({
      success: true,
      data: testCases,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Error fetching test cases:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch test cases' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
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
      projectId,
      testSuiteId,
      testSuite,
      tags,
      customFields
    } = await req.json()

    const suiteId = testSuiteId || testSuite
console.log("title",title);
console.log("description",description);
console.log("projectId",projectId);
console.log("suiteId",suiteId);

    if (!title || !description || !projectId || !suiteId) {
      return NextResponse.json(
        { success: false, error: 'Title, description, projectId, and testSuiteId are required' },
        { status: 400 }
      )
    }

    // Check if user has access to the project
    const project = await Project.findById(projectId)
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 })
    }

    const userIdStr = authResult.user.id?.toString?.() || String(authResult.user.id)
    const createdByStr = project?.createdBy?.toString?.()
    const teamHasUser = Array.isArray(project?.teamMembers)
      ? project.teamMembers.some((m: any) => m?.toString?.() === userIdStr)
      : false
    const roleHasUser = Array.isArray(project?.projectRoles)
      ? project.projectRoles.some(
          (role: any) => role?.user?.toString?.() === userIdStr && ['project_manager', 'project_qa_lead', 'project_tester'].includes(role.role)
        )
      : false
    const hasAccess = !!project && (createdByStr === userIdStr || teamHasUser || roleHasUser)

    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }

    // Check if test suite exists and belongs to the same project
    const testSuiteDoc = await TestSuite.findById(suiteId)
    if (!testSuiteDoc || testSuiteDoc.project.toString() !== projectId) {
      return NextResponse.json(
        { success: false, error: 'Invalid test suite' },
        { status: 400 }
      )
    }

    const testCase = new TestCase({
      title,
      description,
      preconditions,
      steps: steps || [],
      expectedResult,
      testData,
      priority: priority || 'medium',
      category: category || 'functional',
      automationStatus: automationStatus || 'not_automated',
      requirements: requirements || [],
      estimatedExecutionTime: estimatedExecutionTime || 15,
      organization: authResult.user.organization,
      project: projectId,
      testSuite: suiteId,
      createdBy: authResult.user.id,
      tags: tags || [],
      customFields: customFields || {}
    })

    await testCase.save()
    await testCase.populate('createdBy', 'firstName lastName email')
    await testCase.populate('testSuite', 'name')
    await testCase.populate('project', 'name')

    return NextResponse.json({
      success: true,
      data: testCase
    })
  } catch (error) {
    console.error('Error creating test case:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create test case' },
      { status: 500 }
    )
  }
}
