import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db-config'
import { BudgetEntry } from '@/models/BudgetEntry'
import { Project } from '@/models/Project'
import { User } from '@/models/User'
import { authenticateUser } from '@/lib/auth-utils'
import { hasPermission } from '@/lib/permissions/permission-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'

export async function GET(req: NextRequest) {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')
    const category = searchParams.get('category')
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')

    let query: any = {}

    // F8: project:read is held globally by every role (viewers and clients
    // too), so it limited nothing, and with no projectId this listed every
    // budget entry in the database. Reads now follow project access.
    if (projectId) {
      // Check if user has access to this project
      const project = await Project.findById(projectId)
      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }

      const hasAccess = await PermissionService.canAccessProject(authResult.user.id, projectId)
      if (!hasAccess) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
      }

      query.project = projectId
    } else {
      query.project = { $in: await PermissionService.getAccessibleProjects(authResult.user.id) }
    }

    if (category) {
      query.category = category
    }

    if (status) {
      query.status = status
    }

    const skip = (page - 1) * limit

    const [budgetEntries, total] = await Promise.all([
      BudgetEntry.find(query)
        .populate('project', 'name')
        .populate('addedBy', 'firstName lastName email')
        .populate('approvedBy', 'firstName lastName email')
        .sort({ addedAt: -1 })
        .skip(skip)
        .limit(limit),
      BudgetEntry.countDocuments(query)
    ])

    return NextResponse.json({
      budgetEntries,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Error fetching budget entries:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const body = await req.json()
    const { projectId, amount, currency, category, description, billingReference, isRecurring, recurringFrequency, notes } = body

    // Check if user has permission to manage budget for this project
    const hasAccess = await hasPermission(authResult.user.id, Permission.FINANCIAL_MANAGE_BUDGET, projectId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Verify project exists
    const project = await Project.findById(projectId)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const budgetEntry = new BudgetEntry({
      project: projectId,
      amount,
      currency: currency || 'USD',
      category,
      description,
      billingReference,
      addedBy: authResult.user.id,
      isRecurring,
      recurringFrequency,
      notes
    })

    await budgetEntry.save()

    // Update project budget
    if (project.budget) {
      project.budget.total += amount
      project.budget.categories[category] = (project.budget.categories[category] || 0) + amount
      project.budget.lastUpdated = new Date()
      project.budget.updatedBy = authResult.user.id
      await project.save()
    }

    const populatedEntry = await BudgetEntry.findById(budgetEntry._id)
      .populate('project', 'name')
      .populate('addedBy', 'firstName lastName email')

    return NextResponse.json(populatedEntry, { status: 201 })
  } catch (error) {
    console.error('Error creating budget entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
