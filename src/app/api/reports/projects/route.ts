import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db-config'
import { Project } from '@/models/Project'
import { Task } from '@/models/Task'
import { Sprint } from '@/models/Sprint'
import { TimeEntry } from '@/models/TimeEntry'
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
    
    if (startDate || endDate) {
      query.startDate = {}
      if (startDate) query.startDate.$gte = new Date(startDate)
      if (endDate) query.startDate.$lte = new Date(endDate)
    }

    // Build sort for DB-sortable fields; computed fields (completion, budget) sorted in memory after stats
    const dbSortableFields = ['name', 'status', 'startDate', 'endDate', 'createdAt']
    const dbSort: any = {}
    if (dbSortableFields.includes(sortBy)) {
      dbSort[sortBy] = sortOrder === 'asc' ? 1 : -1
    } else {
      dbSort.name = 1
    }

    // Get projects with populated data
    const projects = await Project.find(query)
      .populate('teamMembers', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')
      .sort(dbSort)
      .lean()

    // Batch aggregate task, sprint, and time tracking data for all projects
    const projectIds = projects.map(p => p._id)

    const [taskStatsAgg, sprintStatsAgg, timeStatsAgg] = await Promise.all([
      projectIds.length > 0 ? Task.aggregate([
        { $match: { project: { $in: projectIds } } },
        {
          $group: {
            _id: '$project',
            totalTasks: { $sum: 1 },
            completedTasks: {
              $sum: {
                $cond: [{ $in: ['$status', ['done', 'completed']] }, 1, 0]
              }
            }
          }
        }
      ]) : [],
      projectIds.length > 0 ? Sprint.aggregate([
        { $match: { project: { $in: projectIds } } },
        {
          $group: {
            _id: '$project',
            totalSprints: { $sum: 1 },
            activeSprints: {
              $sum: {
                $cond: [{ $eq: ['$status', 'active'] }, 1, 0]
              }
            }
          }
        }
      ]) : [],
      projectIds.length > 0 ? TimeEntry.aggregate([
        { $match: { project: { $in: projectIds } } },
        {
          $group: {
            _id: '$project',
            totalTimeLogged: { $sum: '$duration' },
            entries: { $sum: 1 }
          }
        }
      ]) : []
    ])

    const taskStatsMap = new Map(taskStatsAgg.map((s: any) => [s._id.toString(), s]))
    const sprintStatsMap = new Map(sprintStatsAgg.map((s: any) => [s._id.toString(), s]))
    const timeStatsMap = new Map(timeStatsAgg.map((s: any) => [s._id.toString(), s]))

    // Assemble statistics for each project
    const projectsWithStats = projects.map((project: any) => {
      const pid = String(project._id)
      const tStats = taskStatsMap.get(pid)
      const totalTasks = tStats?.totalTasks || 0
      const completedTasks = tStats?.completedTasks || 0
      const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

      const sStats = sprintStatsMap.get(pid)
      const totalSprints = sStats?.totalSprints || 0
      const activeSprints = sStats?.activeSprints || 0

      const timeData = timeStatsMap.get(pid)
      const totalTimeLogged = timeData?.totalTimeLogged || 0
      const timeEntriesCount = timeData?.entries || 0

      // Get budget statistics — use project.budget for both total and spent for consistency
      const totalBudget = project.budget?.total || 0
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
            totalHours: totalTimeLogged / 60,
            entries: timeEntriesCount
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

    // Sort in memory for computed fields that can't be sorted in the DB query
    if (sortBy === 'completion') {
      projectsWithStats.sort((a, b) => sortOrder === 'asc'
        ? a.stats.tasks.completionRate - b.stats.tasks.completionRate
        : b.stats.tasks.completionRate - a.stats.tasks.completionRate)
    } else if (sortBy === 'budget') {
      projectsWithStats.sort((a, b) => sortOrder === 'asc'
        ? a.stats.budget.total - b.stats.budget.total
        : b.stats.budget.total - a.stats.budget.total)
    }

    // Calculate summary statistics
    // Exclude zero-task projects from completion average to avoid skewing the metric
    const projectsWithTasks = projectsWithStats.filter(p => p.stats.tasks.total > 0)
    const summary = {
      totalProjects: projectsWithStats.length,
      activeProjects: projectsWithStats.filter(p => p.status === 'active').length,
      completedProjects: projectsWithStats.filter(p => p.status === 'completed').length,
      totalBudget: projectsWithStats.reduce((sum, p) => sum + p.stats.budget.total, 0),
      totalSpent: projectsWithStats.reduce((sum, p) => sum + p.stats.budget.spent, 0),
      averageCompletionRate: projectsWithTasks.length > 0
        ? projectsWithTasks.reduce((sum, p) => sum + p.stats.tasks.completionRate, 0) / projectsWithTasks.length
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
