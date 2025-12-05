import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { TimeEntry } from '@/models/TimeEntry'
import { Project } from '@/models/Project'
import { User } from '@/models/User'
import { Organization } from '@/models/Organization'

function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (val: any) => {
    if (val === null || val === undefined) return ''
    const s = String(val)
    if (s.includes('"') || s.includes(',') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"'
    }
    return s
  }
  const lines = [headers.map(escape).join(',')]
  for (const row of rows) {
    lines.push(row.map(escape).join(','))
  }
  return lines.join('\n') + '\n'
}

function csvResponse(csv: string, filename: string) {
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store'
    }
  })
}

export async function GET(request: NextRequest) {
  try {
    await connectDB()
    
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')
    const projectId = searchParams.get('projectId')
    const userId = searchParams.get('userId')
    const assignedBy = searchParams.get('assignedBy')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const reportType = searchParams.get('reportType') || 'summary'
    const format = (searchParams.get('format') || 'json').toLowerCase()

    if (!organizationId) {
      return NextResponse.json({ error: 'Organization ID is required' }, { status: 400 })
    }

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Default to last 30 days
    const end = endDate ? new Date(endDate) : new Date()

    // Build base query - Reports should only show approved time entries
    const baseQuery: any = {
      organization: organizationId,
      startTime: { $gte: start, $lte: end },
      status: 'completed',
      isApproved: true  // Only show approved entries in reports
    }

    if (projectId) baseQuery.project = projectId
    if (userId) baseQuery.user = userId
    if (assignedBy) baseQuery.approvedBy = assignedBy

    switch (reportType) {
      case 'summary':
        return await getSummaryReport(baseQuery, format)
      case 'byUser':
        return await getUserReport(baseQuery, format)
      case 'byProject':
        return await getProjectReport(baseQuery, format)
      case 'byTask':
        return await getTaskReport(baseQuery, format)
      case 'billable':
        return await getBillableReport(baseQuery, format)
      case 'detailed':
        return await getDetailedEntriesReport(baseQuery, format)
      default:
        return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })
    }
  } catch (error) {
    console.error('Error generating time tracking report:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function getSummaryReport(query: any, format: string) {
  // Summary report should only include approved entries
  const approvedQuery = { ...query, isApproved: true }
  
  const summary = await TimeEntry.aggregate([
    { $match: approvedQuery },
    {
      $group: {
        _id: null,
        totalEntries: { $sum: 1 },
        totalDuration: { $sum: '$duration' },
        totalCost: { $sum: { $multiply: ['$duration', { $divide: ['$hourlyRate', 60] }] } },
        billableDuration: { $sum: { $cond: ['$isBillable', '$duration', 0] } },
        billableCost: { $sum: { $cond: ['$isBillable', { $multiply: ['$duration', { $divide: ['$hourlyRate', 60] }] }, 0] } },
        approvedEntries: { $sum: 1 }, // All entries in this query are approved
        pendingEntries: { $sum: 0 } // No pending entries in approved-only query
      }
    }
  ])

  const dailyBreakdown = await TimeEntry.aggregate([
    { $match: approvedQuery },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$startTime' } },
        duration: { $sum: '$duration' },
        cost: { $sum: { $multiply: ['$duration', { $divide: ['$hourlyRate', 60] }] } }
      }
    },
    { $sort: { _id: 1 } }
  ])

  const summaryData = summary[0] || {
    totalEntries: 0,
    totalDuration: 0,
    totalCost: 0,
    billableDuration: 0,
    billableCost: 0,
    approvedEntries: 0,
    pendingEntries: 0
  }

  if (format === 'csv') {
    const parts: string[] = []
    const summaryCsv = buildCsv(
      ['metric', 'value'],
      [
        ['totalEntries', summaryData.totalEntries],
        ['totalDuration', summaryData.totalDuration],
        ['totalCost', Number(summaryData.totalCost).toFixed(2)],
        ['billableDuration', summaryData.billableDuration],
        ['billableCost', Number(summaryData.billableCost).toFixed(2)],
        ['approvedEntries', summaryData.approvedEntries],
        ['pendingEntries', summaryData.pendingEntries],
      ]
    )
    parts.push('# Summary')
    parts.push(summaryCsv)
    parts.push('# Daily Breakdown')
    const breakdownCsv = buildCsv(
      ['date', 'duration', 'cost'],
      dailyBreakdown.map((d: any) => [d._id, d.duration, Number(d.cost).toFixed(2)])
    )
    parts.push(breakdownCsv)
    const csv = parts.join('\n')
    return csvResponse(csv, 'time-report-summary.csv')
  }

  return NextResponse.json({ summary: summaryData, dailyBreakdown })
}

async function getUserReport(query: any, format: string) {
  // User report should only include approved entries
  const approvedQuery = { ...query, isApproved: true }
  
  const userReport = await TimeEntry.aggregate([
    { $match: approvedQuery },
    {
      $group: {
        _id: '$user',
        totalDuration: { $sum: '$duration' },
        totalCost: { $sum: { $multiply: ['$duration', { $divide: ['$hourlyRate', 60] }] } },
        billableDuration: { $sum: { $cond: ['$isBillable', '$duration', 0] } },
        billableCost: { $sum: { $cond: ['$isBillable', { $multiply: ['$duration', { $divide: ['$hourlyRate', 60] }] }, 0] } },
        entryCount: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: '$user' },
    {
      $project: {
        userId: '$_id',
        userName: { $concat: ['$user.firstName', ' ', '$user.lastName'] },
        userEmail: '$user.email',
        totalDuration: 1,
        totalCost: 1,
        billableDuration: 1,
        billableCost: 1,
        entryCount: 1
      }
    },
    { $sort: { totalDuration: -1 } }
  ])

  if (format === 'csv') {
    const csv = buildCsv(
      ['userId', 'userName', 'userEmail', 'totalDuration', 'totalCost', 'billableDuration', 'billableCost', 'entryCount'],
      userReport.map((u: any) => [
        u.userId,
        u.userName,
        u.userEmail,
        u.totalDuration,
        Number(u.totalCost).toFixed(2),
        u.billableDuration,
        Number(u.billableCost).toFixed(2),
        u.entryCount
      ])
    )
    return csvResponse(csv, 'time-report-by-user.csv')
  }

  return NextResponse.json({ userReport })
}

async function getProjectReport(query: any, format: string) {
  // Project report should only include approved entries
  const approvedQuery = { ...query, isApproved: true }
  
  const projectReport = await TimeEntry.aggregate([
    { $match: approvedQuery },
    {
      $group: {
        _id: '$project',
        totalDuration: { $sum: '$duration' },
        totalCost: { $sum: { $multiply: ['$duration', { $divide: ['$hourlyRate', 60] }] } },
        billableDuration: { $sum: { $cond: ['$isBillable', '$duration', 0] } },
        billableCost: { $sum: { $cond: ['$isBillable', { $multiply: ['$duration', { $divide: ['$hourlyRate', 60] }] }, 0] } },
        entryCount: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: 'projects',
        localField: '_id',
        foreignField: '_id',
        as: 'project'
      }
    },
    { $unwind: '$project' },
    {
      $project: {
        projectId: '$_id',
        projectName: '$project.name',
        totalDuration: 1,
        totalCost: 1,
        billableDuration: 1,
        billableCost: 1,
        entryCount: 1
      }
    },
    { $sort: { totalDuration: -1 } }
  ])

  if (format === 'csv') {
    const csv = buildCsv(
      ['projectId', 'projectName', 'totalDuration', 'totalCost', 'billableDuration', 'billableCost', 'entryCount'],
      projectReport.map((p: any) => [
        p.projectId,
        p.projectName,
        p.totalDuration,
        Number(p.totalCost).toFixed(2),
        p.billableDuration,
        Number(p.billableCost).toFixed(2),
        p.entryCount
      ])
    )
    return csvResponse(csv, 'time-report-by-project.csv')
  }

  return NextResponse.json({ projectReport })
}

async function getTaskReport(query: any, format: string) {
  // Task report should only include approved entries
  const approvedQuery = { ...query, isApproved: true, task: { $exists: true, $ne: null } }
  
  const taskReport = await TimeEntry.aggregate([
    { $match: approvedQuery },
    {
      $group: {
        _id: '$task',
        totalDuration: { $sum: '$duration' },
        totalCost: { $sum: { $multiply: ['$duration', { $divide: ['$hourlyRate', 60] }] } },
        billableDuration: { $sum: { $cond: ['$isBillable', '$duration', 0] } },
        billableCost: { $sum: { $cond: ['$isBillable', { $multiply: ['$duration', { $divide: ['$hourlyRate', 60] }] }, 0] } },
        entryCount: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: 'tasks',
        localField: '_id',
        foreignField: '_id',
        as: 'task'
      }
    },
    { $unwind: '$task' },
    {
      $project: {
        taskId: '$_id',
        taskTitle: '$task.title',
        totalDuration: 1,
        totalCost: 1,
        billableDuration: 1,
        billableCost: 1,
        entryCount: 1
      }
    },
    { $sort: { totalDuration: -1 } }
  ])

  if (format === 'csv') {
    const csv = buildCsv(
      ['taskId', 'taskTitle', 'totalDuration', 'totalCost', 'billableDuration', 'billableCost', 'entryCount'],
      taskReport.map((t: any) => [
        t.taskId,
        t.taskTitle,
        t.totalDuration,
        Number(t.totalCost).toFixed(2),
        t.billableDuration,
        Number(t.billableCost).toFixed(2),
        t.entryCount
      ])
    )
    return csvResponse(csv, 'time-report-by-task.csv')
  }

  return NextResponse.json({ taskReport })
}

async function getBillableReport(query: any, format: string) {
  // Billable report should only include approved entries
  const billableQuery = { ...query, isBillable: true, isApproved: true }
  
  const billableReport = await TimeEntry.aggregate([
    { $match: billableQuery },
    {
      $group: {
        _id: {
          user: '$user',
          project: '$project'
        },
        totalDuration: { $sum: '$duration' },
        totalCost: { $sum: { $multiply: ['$duration', { $divide: ['$hourlyRate', 60] }] } },
        entryCount: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id.user',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $lookup: {
        from: 'projects',
        localField: '_id.project',
        foreignField: '_id',
        as: 'project'
      }
    },
    { $unwind: '$user' },
    { $unwind: '$project' },
    {
      $project: {
        userId: '$_id.user',
        userName: { $concat: ['$user.firstName', ' ', '$user.lastName'] },
        userEmail: '$user.email',
        projectId: '$_id.project',
        projectName: '$project.name',
        totalDuration: 1,
        totalCost: 1,
        entryCount: 1
      }
    },
    { $sort: { totalCost: -1 } }
  ])

  if (format === 'csv') {
    const csv = buildCsv(
      ['userId', 'userName', 'userEmail', 'projectId', 'projectName', 'totalDuration', 'totalCost', 'entryCount'],
      billableReport.map((r: any) => [
        r.userId,
        r.userName,
        r.userEmail,
        r.projectId,
        r.projectName,
        r.totalDuration,
        Number(r.totalCost).toFixed(2),
        r.entryCount
      ])
    )
    return csvResponse(csv, 'time-report-billable.csv')
  }

  return NextResponse.json({ billableReport })
}

async function getDetailedEntriesReport(query: any, format: string) {
  // Detailed entries report should only include approved entries
  const approvedQuery = { ...query, isApproved: true }
  
  // Fetch organization to get currency
  const organization = await Organization.findById(query.organization).lean()
  const currency = organization?.currency || 'USD'
  
  const entries = await TimeEntry.find(approvedQuery)
    .populate('user', 'firstName lastName email')
    .populate({
      path: 'project',
      select: 'name budget'
    })
    .populate('task', 'title')
    .populate('approvedBy', 'firstName lastName email')
    .sort({ startTime: -1 })
    .lean()

  const formattedEntries = entries.map((entry: any) => {
    const userName = entry.user 
      ? `${entry.user.firstName || ''} ${entry.user.lastName || ''}`.trim() || entry.user.email
      : 'Unknown User'
    const projectName = entry.project?.name || 'Unknown Project'
    const projectCurrency = entry.project?.budget?.currency || currency // Use project currency, fallback to org currency
    const taskTitle = entry.task?.title || ''
    const date = entry.startTime ? new Date(entry.startTime).toISOString().split('T')[0] : ''
    const startTime = entry.startTime ? new Date(entry.startTime).toISOString() : ''
    const endTime = entry.endTime ? new Date(entry.endTime).toISOString() : ''
    const duration = entry.duration || 0
    const hourlyRate = entry.hourlyRate || 0
    const cost = (duration / 60) * hourlyRate
    const notes = entry.notes || entry.description || ''
    const isBillable = entry.isBillable || false

    return {
      _id: entry._id,
      userId: entry.user?._id || entry.user,
      userName,
      userEmail: entry.user?.email || '',
      projectId: entry.project?._id || entry.project,
      projectName,
      projectCurrency, // Add project currency
      taskId: entry.task?._id || entry.task,
      taskTitle,
      date,
      startTime,
      endTime,
      duration,
      hourlyRate,
      cost,
      notes,
      isBillable,
      approvedBy: entry.approvedBy?._id || entry.approvedBy,
      approvedByName: entry.approvedBy 
        ? `${entry.approvedBy.firstName || ''} ${entry.approvedBy.lastName || ''}`.trim() || entry.approvedBy.email
        : ''
    }
  })

  if (format === 'csv') {
    // Format: Id (sequential), Task, Employee, Start Time, End Time, Total Hours, Earnings, Status
    const rows = formattedEntries.map((e: any, index: number) => {
      // Format duration as "X hrs Y m" or "X hrs" or "Y m"
      const hours = Math.floor(e.duration / 60)
      const minutes = e.duration % 60
      let durationStr = ''
      if (hours > 0 && minutes > 0) {
        durationStr = `${hours} hrs ${minutes} m`
      } else if (hours > 0) {
        durationStr = `${hours} hrs`
      } else if (minutes > 0) {
        durationStr = `${minutes} m`
      } else {
        durationStr = '0 m'
      }

      // Format start and end times as date-time strings (MM-DD-YYYY HH:MM format)
      const formatDateTime = (dateStr: string) => {
        if (!dateStr) return ''
        const date = new Date(dateStr)
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const year = date.getFullYear()
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = String(date.getMinutes()).padStart(2, '0')
        return `${month}-${day}-${year} ${hours}:${minutes}`
      }
      
      const startTimeStr = formatDateTime(e.startTime)
      const endTimeStr = formatDateTime(e.endTime)

      return [
        (index + 1).toString(), // Id (sequential: 1, 2, 3...)
        e.taskTitle || '', // Task
        e.userName, // Employee
        startTimeStr, // Start Time
        endTimeStr, // End Time
        durationStr, // Total Hours
        e.cost > 0 ? `${e.projectCurrency}${Math.round(e.cost)}` : `${e.projectCurrency}0`, // Earnings (using project currency)
        e.cost.toFixed(2), // Cost (numeric value)
        'Approved' // Status (all entries are approved)
      ]
    })

    const csv = buildCsv(
      ['Id', 'Task', 'Employee', 'Start Time', 'End Time', 'Total Hours', 'Earnings', 'Cost', 'Status'],
      rows
    )
    
    // Add BOM for UTF-8 encoding (Excel compatibility)
    const bom = '\uFEFF'
    const csvWithBom = bom + csv
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, -5)
    return new NextResponse(csvWithBom, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="All_time_log_${timestamp}.csv"`,
        'Cache-Control': 'no-store'
      }
    })
  }

  return NextResponse.json({ 
    detailedEntries: formattedEntries,
    organizationCurrency: currency // Include organization currency in response
  })
}
