import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { TimeEntry } from '@/models/TimeEntry'
import { Task } from '@/models/Task'
import { authenticateUser } from '@/lib/auth-utils'

export async function GET(request: NextRequest) {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const { user } = authResult
    const userId = user.id
    const organizationId = user.organization

    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // Get today's stats
    const todayStats = await TimeEntry.aggregate([
      {
        $match: {
          user: userId,
          organization: organizationId,
          status: 'completed',
          startTime: { $gte: startOfDay, $lte: now }
        }
      },
      {
        $group: {
          _id: null,
          totalDuration: { $sum: '$duration' },
          billableDuration: {
            $sum: {
              $cond: [
                { $eq: ['$isBillable', true] },
                '$duration',
                0
              ]
            }
          },
          tasksCompleted: { $addToSet: '$task' }
        }
      }
    ])

    // Get this week's stats
    const weekStats = await TimeEntry.aggregate([
      {
        $match: {
          user: userId,
          organization: organizationId,
          status: 'completed',
          startTime: { $gte: startOfWeek, $lte: now }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$startTime' }
          },
          dailyDuration: { $sum: '$duration' }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ])

    // Calculate week totals
    const totalWeekDuration = weekStats.reduce((sum, day) => sum + day.dailyDuration, 0)
    const averageDaily = weekStats.length > 0 ? Math.round(totalWeekDuration / weekStats.length) : 0
    const mostActiveDay = weekStats.length > 0
      ? weekStats.reduce((max, day) => day.dailyDuration > max.dailyDuration ? day : max)
      : null

    // Get recent activity (last 5 entries)
    const recentActivity = await TimeEntry.find({
      user: userId,
      organization: organizationId,
      status: 'completed'
    })
    .populate('project', 'name')
    .populate('task', 'title')
    .sort({ startTime: -1 })
    .limit(5)
    .lean()

    const todayData = todayStats[0] || { totalDuration: 0, billableDuration: 0, tasksCompleted: [] }

    return NextResponse.json({
      todaySummary: {
        timeTracked: todayData.totalDuration || 0,
        billableTime: todayData.billableDuration || 0,
        tasksCompleted: todayData.tasksCompleted ? todayData.tasksCompleted.filter((task: any) => task).length : 0
      },
      weekSummary: {
        totalHours: totalWeekDuration,
        averageDaily,
        mostActiveDay: mostActiveDay ? {
          date: mostActiveDay._id,
          duration: mostActiveDay.dailyDuration
        } : null
      },
      recentActivity: recentActivity.map(entry => ({
        _id: entry._id,
        description: entry.description,
        duration: entry.duration,
        startTime: entry.startTime,
        project: entry.project ? { name: entry.project.name } : null,
        task: entry.task ? { title: entry.task.title } : null,
        isBillable: entry.isBillable
      }))
    })

  } catch (error) {
    console.error('Error fetching time tracking stats:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}