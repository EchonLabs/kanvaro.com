import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db-config'
import { TestSuite, Project } from '@/models'
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
    const parentSuiteId = searchParams.get('parentSuiteId')

    let query: any = { organization: authResult.user.organization }

    if (projectId) {
      query.project = projectId
    }

    if (parentSuiteId) {
      query.parentSuite = parentSuiteId
    } else if (parentSuiteId === '') {
      // Get root level suites (no parent)
      query.parentSuite = { $exists: false }
    }

    const testSuites = await TestSuite.find(query)
      .populate('createdBy', 'firstName lastName email')
      .populate('parentSuite', 'name')
      .sort({ order: 1, createdAt: 1 })

    return NextResponse.json({
      success: true,
      data: testSuites
    })
  } catch (error) {
    console.error('Error fetching test suites:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch test suites' },
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

    const { name, description, projectId, parentSuiteId, order, tags, customFields } = await req.json()

    const nameTrimmed = typeof name === 'string' ? name.trim() : ''
    const projectIdStr = typeof projectId === 'string' ? projectId : String(projectId || '')

    if (!nameTrimmed || !projectIdStr) {
      return NextResponse.json(
        { success: false, error: 'Name and projectId are required' },
        { status: 400 }
      )
    }

    // Check if user has access to the project
    const project = await Project.findById(projectIdStr)
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 })
    }

    const userIdStr = authResult.user.id?.toString?.() || String(authResult.user.id)
    const createdByStr = project.createdBy?.toString?.()
    const teamHasUser = Array.isArray(project.teamMembers)
      ? project.teamMembers.some((m: any) => m?.toString?.() === userIdStr)
      : false
    const roleHasUser = Array.isArray(project.projectRoles)
      ? project.projectRoles.some(
          (role: any) => role?.user?.toString?.() === userIdStr && ['project_manager', 'project_qa_lead', 'project_tester'].includes(role.role)
        )
      : false
    const hasAccess = createdByStr === userIdStr || teamHasUser || roleHasUser

    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }

    // Check if parent suite exists and belongs to the same project
    if (parentSuiteId) {
      const parentSuite = await TestSuite.findById(parentSuiteId)
      if (!parentSuite || parentSuite.project?.toString?.() !== projectIdStr) {
        return NextResponse.json(
          { success: false, error: 'Invalid parent suite' },
          { status: 400 }
        )
      }
    }

    const testSuite = new TestSuite({
      name: nameTrimmed,
      description: typeof description === 'string' ? description : '',
      organization: authResult.user.organization,
      project: projectIdStr,
      parentSuite: parentSuiteId || undefined,
      createdBy: authResult.user.id,
      order: typeof order === 'number' ? order : 0,
      tags: Array.isArray(tags) ? tags : [],
      customFields: customFields && typeof customFields === 'object' ? customFields : {}
    })

    await testSuite.save()
    await testSuite.populate('createdBy', 'firstName lastName email')
    await testSuite.populate('parentSuite', 'name')

    return NextResponse.json({
      success: true,
      data: testSuite
    })
  } catch (error) {
    console.error('Error creating test suite:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create test suite' },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  try {
    await connectDB()
    const authResult = await authenticateUser()

    if ('error' in authResult) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }

    const { suiteId, name, description, projectId, parentSuiteId, order, tags, customFields } = await req.json()

    const suiteIdStr = typeof suiteId === 'string' ? suiteId : String(suiteId || '')
    const nameTrimmed = typeof name === 'string' ? name.trim() : ''
    const projectIdStr = typeof projectId === 'string' ? projectId : String(projectId || '')

    if (!suiteIdStr || !nameTrimmed || !projectIdStr) {
      return NextResponse.json(
        { success: false, error: 'suiteId, name and projectId are required' },
        { status: 400 }
      )
    }

    const project = await Project.findById(projectIdStr)
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 })
    }

    const userIdStr = authResult.user.id?.toString?.() || String(authResult.user.id)
    const createdByStr = project.createdBy?.toString?.()
    const teamHasUser = Array.isArray(project.teamMembers)
      ? project.teamMembers.some((m: any) => m?.toString?.() === userIdStr)
      : false
    const roleHasUser = Array.isArray(project.projectRoles)
      ? project.projectRoles.some(
          (role: any) => role?.user?.toString?.() === userIdStr && ['project_manager', 'project_qa_lead', 'project_tester'].includes(role.role)
        )
      : false
    const hasAccess = createdByStr === userIdStr || teamHasUser || roleHasUser

    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }

    const existing = await TestSuite.findById(suiteIdStr)
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Test suite not found' }, { status: 404 })
    }

    if (existing.project?.toString?.() !== projectIdStr) {
      return NextResponse.json({ success: false, error: 'Suite does not belong to the given project' }, { status: 400 })
    }

    if (parentSuiteId) {
      const parentSuite = await TestSuite.findById(parentSuiteId)
      if (!parentSuite || parentSuite.project?.toString?.() !== projectIdStr) {
        return NextResponse.json({ success: false, error: 'Invalid parent suite' }, { status: 400 })
      }
    }

    existing.name = nameTrimmed
    existing.description = typeof description === 'string' ? description : existing.description
    existing.parentSuite = parentSuiteId || undefined
    existing.order = typeof order === 'number' ? order : existing.order
    existing.tags = Array.isArray(tags) ? tags : existing.tags
    existing.customFields = customFields && typeof customFields === 'object' ? customFields : existing.customFields

    await existing.save()
    await existing.populate('createdBy', 'firstName lastName email')
    await existing.populate('parentSuite', 'name')

    return NextResponse.json({ success: true, data: existing })
  } catch (error) {
    console.error('Error updating test suite:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update test suite' },
      { status: 500 }
    )
  }
}
