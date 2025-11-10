import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db-config'
import { Project } from '@/models/Project'
import { Task } from '@/models/Task'
import { Sprint } from '@/models/Sprint'
import { TimeEntry } from '@/models/TimeEntry'
import { BudgetEntry } from '@/models/BudgetEntry'
import { authenticateUser } from '@/lib/auth-utils'
import { hasPermission } from '@/lib/permissions/permission-utils'
import { Permission } from '@/lib/permissions/permission-definitions'

export async function GET(req: NextRequest) {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    // Check if user has reporting permissions
    const hasAccess = await hasPermission(authResult.user.id, Permission.REPORTING_VIEW)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')
    const status = searchParams.get('status')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const sortBy = searchParams.get('sortBy') || 'name'
    const sortOrder = searchParams.get('sortOrder') || 'asc'

    // Build query
    let query: any = {}
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ]
    }
    
    if (status && status !== 'all') {
      query.status = status
    }
    
    if (startDate && endDate) {
      query.startDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    }

    // Build sort object
    const sort: any = {}
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1

    // Get projects with populated data
    const projects = await Project.find(query)
      .populate('teamMembers', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')
      .sort(sort)
      .lean()

    // Get additional data for each project
    const projectsWithStats = await Promise.all(
      projects.map(async (project) => {
        // Get task statistics
        const totalTasks = await Task.countDocuments({ project: project._id })
        const completedTasks = await Task.countDocuments({ 
          project: project._id, 
          status: 'completed' 
        })
        const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

        // Get sprint statistics
        const totalSprints = await Sprint.countDocuments({ project: project._id })
        const activeSprints = await Sprint.countDocuments({ 
          project: project._id, 
          status: 'active' 
        })

        // Get time tracking statistics
        const timeEntries = await TimeEntry.find({ project: project._id })
        const totalTimeLogged = timeEntries.reduce((sum, entry) => sum + entry.duration, 0)

        // Get budget statistics
        const budgetEntries = await BudgetEntry.find({ 
          project: project._id, 
          status: 'active' 
        })
        const totalBudget = budgetEntries.reduce((sum, entry) => sum + entry.amount, 0)
        const spent = project.budget?.spent || 0
        const remaining = totalBudget - spent
        const utilizationRate = totalBudget > 0 ? (spent / totalBudget) * 100 : 0

        return {
          ...project,
          status: project.status,
          stats: {
            tasks: {
              total: totalTasks,
              completed: completedTasks,
              completionRate
            },
            sprints: {
              total: totalSprints,
              active: activeSprints
            },
            timeTracking: {
              totalHours: totalTimeLogged / 3600,
              entries: timeEntries.length
            },
            budget: {
              total: totalBudget,
              spent,
              remaining,
              utilizationRate
            }
          }
        }
      })
    )

    // Calculate summary statistics
    const summary = {
      totalProjects: projectsWithStats.length,
      activeProjects: projectsWithStats.filter(p => p.status === 'active').length,
      completedProjects: projectsWithStats.filter(p => p.status === 'completed').length,
      totalBudget: projectsWithStats.reduce((sum, p) => sum + p.stats.budget.total, 0),
      totalSpent: projectsWithStats.reduce((sum, p) => sum + p.stats.budget.spent, 0),
      averageCompletionRate: projectsWithStats.length > 0 
        ? projectsWithStats.reduce((sum, p) => sum + p.stats.tasks.completionRate, 0) / projectsWithStats.length 
        : 0
    }

    // Calculate trends
    const trends = {
      projectVelocity: calculateProjectVelocity(projectsWithStats),
      budgetUtilization: summary.totalBudget > 0 ? (summary.totalSpent / summary.totalBudget) * 100 : 0,
      teamUtilization: calculateTeamUtilization(projectsWithStats)
    }

    return NextResponse.json({
      projects: projectsWithStats,
      summary,
      trends
    })
  } catch (error) {
    console.error('Error fetching project reports:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function calculateProjectVelocity(projects: any[]): number {
  // Calculate projects completed per month over the last 6 months
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  
  const recentCompleted = projects.filter(p => 
    p.status === 'completed' && 
    p.endDate && 
    new Date(p.endDate) >= sixMonthsAgo
  )
  
  return recentCompleted.length / 6 // Projects per month
}

function calculateTeamUtilization(projects: any[]): number {
  // Calculate average team utilization across all projects
  const totalTeamMembers = projects.reduce((sum, p) => sum + (p.teamMembers?.length || 0), 0)
  const activeTeamMembers = projects
    .filter(p => p.status === 'active')
    .reduce((sum, p) => sum + (p.teamMembers?.length || 0), 0)
  
  return totalTeamMembers > 0 ? (activeTeamMembers / totalTeamMembers) * 100 : 0
}
