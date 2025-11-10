import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db-config'
import { TestPlan, Project } from '@/models'
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
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    let query: any = { organization: authResult.user.organization }

    if (projectId) {
      query.project = projectId
    }

    if (status) {
      query.status = status
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ]
    }

    const skip = (page - 1) * limit

    const testPlans = await TestPlan.find(query)
      .populate('createdBy', 'firstName lastName email')
      .populate('assignedTo', 'firstName lastName email')
      .populate('project', 'name')
      .populate('testCases', 'title priority category')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)

    const total = await TestPlan.countDocuments(query)

    return NextResponse.json({
      success: true,
      data: testPlans,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Error fetching test plans:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch test plans' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    console.log('authResult', authResult);
    // Normalize user id to string regardless of shape
    const userIdStr = (authResult as any)?.user?.id
      ? (authResult as any).user.id.toString()
      : (authResult as any)?.id?.toString?.()
    const orgIdStr = (authResult as any)?.user?.organization
      ? (authResult as any).user.organization.toString()
      : (authResult as any)?.organization?.toString?.()
    const roleStr = (authResult as any)?.user?.role ?? (authResult as any)?.role
    const isAdmin = typeof roleStr === 'string' && ['admin', 'super_admin', 'superadmin'].includes(roleStr.toLowerCase())
    
    if ('error' in authResult) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }

    const {
      name,
      description,
      projectId,
      version,
      assignedTo,
      startDate,
      endDate,
      testCases,
      tags,
      customFields
    } = await req.json()

    console.log('name', name);
    console.log('projectId', projectId);
    console.log('version', version);
    console.log('assignedTo', assignedTo);
    console.log('startDate', startDate);
    console.log('endDate', endDate);
    console.log('testCases', testCases);
    console.log('tags', tags);
    console.log('customFields', customFields);
    
    if (!name || !projectId) {
      return NextResponse.json(
        { success: false, error: 'Name and projectId are required' },
        { status: 400 }
      )
    }

    // Check if user has access to the project
    const project = await Project.findById(projectId)
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 })
    }
    const createdByStr = project.createdBy?.toString?.()
    const teamHasUser = Array.isArray(project.teamMembers)
      ? project.teamMembers.some((m: any) => m?.toString?.() === userIdStr)
      : false
    const roleHasUser = Array.isArray(project.projectRoles)
      ? project.projectRoles.some(
          (role: any) => role?.user?.toString?.() === userIdStr && ['project_manager', 'project_qa_lead'].includes(role.role)
        )
      : false
    const hasAccess = !!userIdStr && (isAdmin || createdByStr === userIdStr || teamHasUser || roleHasUser)
    console.log('createdByStr', createdByStr, 'userIdStr', userIdStr, { isAdmin, teamHasUser, roleHasUser, hasAccess })

    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }

    const assignedToId = typeof assignedTo === 'string' && assignedTo.trim().length > 0 ? assignedTo : undefined
    const testPlan = new TestPlan({
      name,
      description,
      organization: orgIdStr,
      project: projectId,
      version,
      createdBy: userIdStr,
      assignedTo: assignedToId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      testCases: testCases || [],
      tags: tags || [],
      customFields: customFields || {}
    })

    await testPlan.save()
    await testPlan.populate('createdBy', 'firstName lastName email')
    await testPlan.populate('assignedTo', 'firstName lastName email')
    await testPlan.populate('project', 'name')
    await testPlan.populate('testCases', 'title priority category')

    return NextResponse.json({
      success: true,
      data: testPlan
    })
  } catch (error) {
    console.error('Error creating test plan:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create test plan' },
      { status: 500 }
    )
  }
}
