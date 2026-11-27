import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db-config'
import { BurnRate } from '@/models/BurnRate'
import { Project } from '@/models/Project'
import { Sprint } from '@/models/Sprint'
import { TimeEntry } from '@/models/TimeEntry'
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
    const sprintId = searchParams.get('sprintId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const groupBy = searchParams.get('groupBy') || 'day' // day, week, month

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    // Check if user has access to this project. F8: project:read is held
    // globally by every role, so it never limited this; use project access.
    const hasAccess = await PermissionService.canAccessProject(authResult.user.id, projectId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    let query: any = { project: projectId }
    
    if (sprintId) {
      query.sprint = sprintId
    }

    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    }

    const burnRates = await BurnRate.find(query)
      .populate('project', 'name')
      .populate('sprint', 'name')
      .sort({ date: 1 })

    return NextResponse.json(burnRates)
  } catch (error) {
    console.error('Error fetching burn rates:', error)
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
    const { projectId, sprintId, date, plannedBurn, actualBurn, velocity, capacity, utilization, notes } = body

    // Check if user has permission to manage budget for this project
    const hasAccess = await hasPermission(authResult.user.id, Permission.FINANCIAL_MANAGE_BUDGET, projectId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Get project to calculate remaining budget
    const project = await Project.findById(projectId)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const budgetRemaining = project.budget ? project.budget.total - project.budget.spent : 0

    // Calculate forecasted completion if burn rate is consistent
    let forecastedCompletion
    if (actualBurn > 0 && budgetRemaining > 0) {
      const daysToComplete = Math.ceil(budgetRemaining / actualBurn)
      forecastedCompletion = new Date(date)
      forecastedCompletion.setDate(forecastedCompletion.getDate() + daysToComplete)
    }

    const burnRate = new BurnRate({
      project: projectId,
      sprint: sprintId,
      date: new Date(date),
      plannedBurn,
      actualBurn,
      velocity,
      capacity,
      utilization,
      budgetRemaining,
      forecastedCompletion,
      notes
    })

    await burnRate.save()

    const populatedBurnRate = await BurnRate.findById(burnRate._id)
      .populate('project', 'name')
      .populate('sprint', 'name')

    return NextResponse.json(populatedBurnRate, { status: 201 })
  } catch (error) {
    console.error('Error creating burn rate entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
