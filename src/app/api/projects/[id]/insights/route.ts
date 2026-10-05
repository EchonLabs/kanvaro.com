import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Project } from '@/models/Project'
import { Task } from '@/models/Task'
import { TimeEntry } from '@/models/TimeEntry'
import '@/models/User'
import '@/models/CustomRole'
import { Organization } from '@/models/Organization'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission, Role, ROLE_PERMISSIONS } from '@/lib/permissions/permission-definitions'

// Helper to format role names cleanly
function formatRoleName(roleStr: string): string {
  const lower = (roleStr || '').toLowerCase()
  if (lower.includes('dev') || lower.includes('engineer') || lower.includes('tech')) return 'Development'
  if (lower.includes('design') || lower.includes('ui') || lower.includes('ux')) return 'UI/UX'
  if (lower.includes('qa') || lower.includes('test')) return 'QA'
  if (lower.includes('ba') || lower.includes('business') || lower.includes('analyst')) return 'BA'
  if (lower.includes('manager') || lower.includes('lead')) return 'Management'
  return roleStr ? roleStr.charAt(0).toUpperCase() + roleStr.slice(1) : 'Development'
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const projectId = params.id

    // Check project exists and user has access
    const project = await Project.findOne({
      _id: projectId,
      organization: organizationId,
      is_deleted: { $ne: true }
    })
      .populate({
        path: 'teamMembers.memberId',
        select: 'firstName lastName email avatar role hourlyRate billingRate customRole',
        populate: { path: 'customRole', select: 'name' }
      })
      .populate('createdBy', 'firstName lastName email avatar')
      .populate({
        path: 'projectRoles.user',
        select: 'firstName lastName email avatar role customRole',
        populate: { path: 'customRole', select: 'name' }
      })

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Access check
    const userRoleStr = (user.role || '').toString().toLowerCase()
    const isHrOrAdmin = ['admin', 'super_admin', 'human_resource'].includes(userRoleStr)

    const userRole = (user.role || '').toString() as Role
    const rolePermissions = ROLE_PERMISSIONS[userRole] || []
    const roleHasProjectViewAll = rolePermissions.includes(Permission.PROJECT_VIEW_ALL)
    const hasProjectRoleAccess = Array.isArray(project.projectRoles) && project.projectRoles.some((r: any) =>
      r.user?.toString() === userId.toString() || r.user?._id?.toString() === userId.toString()
    )
    const isTeamMember = project.teamMembers.some((member: any) =>
      member.memberId?._id?.toString() === userId.toString() || member.memberId?.toString() === userId.toString()
    )
    const isCreator = project.createdBy?._id?.toString() === userId.toString()

    if (!roleHasProjectViewAll && !hasProjectRoleAccess && !isTeamMember && !isCreator) {
      return NextResponse.json(
        { error: 'Access denied to project insights' },
        { status: 403 }
      )
    }

    // Get currency
    const organization = await Organization.findById(organizationId)
    const orgCurrency = organization?.currency || project.budget?.currency || 'USD'

    // Build member rate map and role map
    const memberRateMap = new Map<string, number>()
    const memberRoleMap = new Map<string, string>()
    const memberDataMap = new Map<string, any>()

    // Project memberRates overrides
    if (Array.isArray(project.memberRates)) {
      for (const mr of project.memberRates) {
        const uId = mr.user?._id?.toString() || mr.user?.toString()
        if (uId && typeof mr.hourlyRate === 'number' && mr.hourlyRate > 0) {
          memberRateMap.set(uId, mr.hourlyRate)
        }
      }
    }

    const defaultHourlyRate = project.budget?.defaultHourlyRate || 0

    // Populate from teamMembers
    if (Array.isArray(project.teamMembers)) {
      for (const tm of project.teamMembers) {
        const memberObj = tm.memberId as any
        const mId = memberObj?._id?.toString() || tm.memberId?.toString()
        if (mId) {
          memberDataMap.set(mId, memberObj || tm)

          // Rate resolution
          if (typeof tm.hourlyRate === 'number' && tm.hourlyRate > 0) {
            memberRateMap.set(mId, tm.hourlyRate)
          } else if (!memberRateMap.has(mId)) {
            const userRate = memberObj?.hourlyRate ?? memberObj?.billingRate
            if (typeof userRate === 'number' && userRate > 0) {
              memberRateMap.set(mId, userRate)
            } else if (defaultHourlyRate > 0) {
              memberRateMap.set(mId, defaultHourlyRate)
            }
          }

          // Role resolution
          const customRoleName = memberObj?.customRole?.name
          const rawRole = tm.role || memberObj?.role || 'Development'
          const roleTitle = customRoleName || formatRoleName(rawRole)
          memberRoleMap.set(mId, roleTitle)
        }
      }
    }



    // Fetch tasks to calculate allocated hours per member
    const tasks = await Task.find({ project: projectId })
    const memberAllocatedMinutesMap = new Map<string, number>()

    for (const task of tasks) {
      const estMinutes = (task.estimatedHours || 0) * 60
      if (estMinutes > 0 && Array.isArray(task.assignedTo)) {
        for (const assignee of task.assignedTo) {
          const aId = assignee.user?.toString() || assignee._id?.toString()
          if (aId) {
            memberAllocatedMinutesMap.set(
              aId,
              (memberAllocatedMinutesMap.get(aId) || 0) + estMinutes
            )
          }
        }
      } else if (estMinutes > 0 && task.assignedTo && typeof task.assignedTo === 'string') {
        const aId = task.assignedTo.toString()
        memberAllocatedMinutesMap.set(
          aId,
          (memberAllocatedMinutesMap.get(aId) || 0) + estMinutes
        )
      }
    }

    // Fetch time entries for this project
    const timeEntries = await TimeEntry.find({ project: projectId })
      .populate({
        path: 'user',
        select: 'firstName lastName email avatar role customRole',
        populate: { path: 'customRole', select: 'name' }
      })
      .sort({ startTime: -1 })

    // Aggregate logged hours and costs per member
    const memberLoggedMinutesMap = new Map<string, number>()
    const memberActualCostMap = new Map<string, number>()

    const timeLogs: Array<{
      id: string
      resourceName: string
      resourceId: string
      firstName?: string
      lastName?: string
      email?: string
      avatar?: string
      role: string
      date: string
      rawDate: string
      hours: number
      rate: number
      cost: number
    }> = []

    for (const entry of timeEntries) {
      const entryUser = entry.user as any
      const uId = entryUser?._id?.toString() || entry.user?.toString()
      const durationHours = (entry.duration || 0) / 60

      const rate = (typeof entry.hourlyRate === 'number' && entry.hourlyRate > 0)
        ? entry.hourlyRate
        : (uId && memberRateMap.has(uId))
          ? memberRateMap.get(uId)!
          : defaultHourlyRate

      const cost = Math.round(durationHours * rate * 100) / 100

      if (uId) {
        memberLoggedMinutesMap.set(
          uId,
          (memberLoggedMinutesMap.get(uId) || 0) + (entry.duration || 0)
        )
        memberActualCostMap.set(
          uId,
          (memberActualCostMap.get(uId) || 0) + cost
        )
      }

      // Format date MM/DD/YYYY
      const dateObj = new Date(entry.startTime || entry.createdAt)
      const formattedDate = !isNaN(dateObj.getTime())
        ? `${String(dateObj.getMonth() + 1).padStart(2, '0')}/${String(dateObj.getDate()).padStart(2, '0')}/${dateObj.getFullYear()}`
        : ''

      const userRoleTitle = entryUser?.customRole?.name ||
        (uId && memberRoleMap.get(uId)) ||
        formatRoleName(entryUser?.role || 'Development')

      const firstName = entryUser?.firstName || ''
      const lastName = entryUser?.lastName || ''
      const resourceName = `${firstName} ${lastName}`.trim() || entryUser?.email || 'Unknown Member'

      timeLogs.push({
        id: entry._id.toString(),
        resourceName,
        resourceId: uId,
        firstName,
        lastName,
        email: entryUser?.email || '',
        avatar: entryUser?.avatar,
        role: userRoleTitle,
        date: formattedDate,
        rawDate: dateObj.toISOString(),
        hours: Math.round(durationHours * 10) / 10,
        rate,
        cost
      })
    }

    // Build the Roster of team members
    const roster: Array<{
      id: string
      name: string
      firstName: string
      lastName: string
      email: string
      avatar?: string
      initials: string
      role: string
      rate: number
      allocatedHours: number
      loggedHours: number
      actualCost: number
      remainingHours: number
      budgetImpact: number
    }> = []

    memberDataMap.forEach((memberObj, mId) => {
      const firstName = memberObj?.firstName || ''
      const lastName = memberObj?.lastName || ''
      const name = `${firstName} ${lastName}`.trim() || memberObj?.email || 'Team Member'
      const initials = `${(firstName[0] || '').toUpperCase()}${(lastName[0] || '').toUpperCase()}` || (name[0] || 'U').toUpperCase()

      const rate = memberRateMap.get(mId) || defaultHourlyRate
      const role = memberRoleMap.get(mId) || 'Development'

      const loggedMinutes = memberLoggedMinutesMap.get(mId) || 0
      const loggedHours = Math.round((loggedMinutes / 60) * 10) / 10

      // If tasks have allocated hours, use them; otherwise if member logged hours, reflect allocation or 0
      const allocatedMinutes = memberAllocatedMinutesMap.get(mId) || 0
      const allocatedHours = allocatedMinutes > 0
        ? Math.round((allocatedMinutes / 60) * 10) / 10
        : (loggedHours > 0 ? Math.max(loggedHours, Math.ceil(loggedHours * 1.5)) : 0)

      const actualCost = memberActualCostMap.get(mId) || Math.round(loggedHours * rate * 100) / 100
      const remainingHours = Math.max(0, Math.round((allocatedHours - loggedHours) * 10) / 10)

      roster.push({
        id: mId,
        name,
        firstName,
        lastName,
        email: memberObj?.email || '',
        avatar: memberObj?.avatar,
        initials,
        role,
        rate,
        allocatedHours,
        loggedHours,
        actualCost,
        remainingHours,
        budgetImpact: actualCost
      })
    })

    // If roster is empty (e.g. no team members array explicitly added), populate from time logs users
    if (roster.length === 0 && timeLogs.length > 0) {
      const seen = new Set<string>()
      for (const log of timeLogs) {
        if (!seen.has(log.resourceId)) {
          seen.add(log.resourceId)
          const loggedHours = timeLogs
            .filter(t => t.resourceId === log.resourceId)
            .reduce((sum, t) => sum + t.hours, 0)
          const actualCost = timeLogs
            .filter(t => t.resourceId === log.resourceId)
            .reduce((sum, t) => sum + t.cost, 0)

          roster.push({
            id: log.resourceId,
            name: log.resourceName,
            firstName: log.firstName || '',
            lastName: log.lastName || '',
            email: log.email || '',
            avatar: log.avatar,
            initials: log.resourceName.slice(0, 2).toUpperCase(),
            role: log.role,
            rate: log.rate,
            allocatedHours: Math.ceil(loggedHours * 1.5),
            loggedHours: Math.round(loggedHours * 10) / 10,
            actualCost,
            remainingHours: Math.max(0, Math.round((Math.ceil(loggedHours * 1.5) - loggedHours) * 10) / 10),
            budgetImpact: actualCost
          })
        }
      }
    }

    // Sort roster by logged hours descending
    roster.sort((a, b) => b.loggedHours - a.loggedHours)

    // Sanitize financial fields for non-HR and non-Admin users
    const sanitizedRoster = isHrOrAdmin
      ? roster
      : roster.map(({ rate, actualCost, budgetImpact, ...rest }) => ({
          ...rest,
          rate: 0,
          actualCost: 0,
          budgetImpact: 0
        }))

    const sanitizedTimeLogs = isHrOrAdmin
      ? timeLogs
      : timeLogs.map(({ rate, cost, ...rest }) => ({
          ...rest,
          rate: 0,
          cost: 0
        }))

    return NextResponse.json({
      success: true,
      data: {
        currency: orgCurrency,
        canViewFinancials: isHrOrAdmin,
        roster: sanitizedRoster,
        timeLogs: sanitizedTimeLogs
      }
    })
  } catch (error) {
    console.error('Get project insights error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
