import connectDB from '@/lib/db-config'
import { Task } from '@/models/Task'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'
import { cache } from '@/lib/redis'
import crypto from 'crypto'

export interface TaskFilters {
  search?: string
  status?: string
  priority?: string
  type?: string
  project?: string
  after?: string
  limit?: number
}

export interface TasksResult {
  data: any[]
  pagination: {
    nextCursor?: string | null
    pageSize: number
    hasMore?: boolean
    page?: number
    total?: number
    totalPages?: number
  }
}

export async function getTasksServer(filters: TaskFilters = {}): Promise<TasksResult> {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    
    if ('error' in authResult) {
      const defaultPageSize = Math.min(filters.limit || 20, 100)
      return {
        data: [],
        pagination: {
          nextCursor: null,
          pageSize: defaultPageSize,
          hasMore: false
        }
      }
    }

    const { user } = authResult
    const userId = user.id
    const organizationId = user.organization

    const {
      search = '',
      status = '',
      priority = '',
      type = '',
      project = '',
      after,
      limit = 20
    } = filters

    // Use cursor pagination if 'after' is provided, otherwise fallback to skip/limit
    const useCursorPagination = !!after
    const PAGE_SIZE = Math.min(limit, 100)
    const sort = { createdAt: -1 as const }

    // Only users with PROJECT_VIEW_ALL can see all tasks; otherwise default to "My Tasks"
    const canViewAllTasks = await PermissionService.hasPermission(userId, Permission.PROJECT_VIEW_ALL)

    // Build filters
    const dbFilters: any = { 
      organization: organizationId,
      archived: false
    }
    
    // If user can't view all tasks, filter to tasks assigned to or created by the user (My Tasks)
    if (!canViewAllTasks) {
      dbFilters.$or = [
        { assignedTo: userId },
        { createdBy: userId }
      ]
    }
    
    // Optimized search: use text index for longer queries, regex for short ones
    if (search) {
      if (search.length >= 3) {
        dbFilters.$text = { $search: search }
      } else {
        dbFilters.$and = [
          {
            $or: [
              { title: { $regex: search, $options: 'i' } },
              { description: { $regex: search, $options: 'i' } }
            ]
          }
        ]
      }
    }
    
    if (status) {
      dbFilters.status = status
    }
    
    if (priority) {
      dbFilters.priority = priority
    }
    
    if (type) {
      dbFilters.type = type
    }
    
    if (project) {
      dbFilters.project = project
    }

    // Add cursor filter for cursor pagination
    if (useCursorPagination && after) {
      dbFilters.createdAt = { $lt: new Date(after) }
    }

    // Create cache key
    const filterHash = crypto.createHash('md5').update(JSON.stringify(dbFilters)).digest('hex')
    const cacheKey = `tasks:v2:org:${organizationId}:user:${userId}:f:${filterHash}:after:${after || 'null'}:l:${PAGE_SIZE}`

    // Use Redis cache with 30s TTL
    const result = await cache(cacheKey, 30, async () => {
      // Define fields to project (only what we need for list/kanban)
      const fields = 'title status priority type project position labels createdAt updatedAt assignedTo createdBy storyPoints dueDate estimatedHours actualHours'

      let query = Task.find(dbFilters, fields)
        .populate('project', '_id name')
        .populate('assignedTo', 'firstName lastName email')
        .populate('createdBy', 'firstName lastName email')
        .sort(sort)
        .lean()

      if (useCursorPagination) {
        // Cursor pagination: fetch one extra to determine if there are more
        const items = await query.limit(PAGE_SIZE + 1)
        const itemsWithProject = items.filter((t: any) => !!t.project)
        const hasMore = itemsWithProject.length > PAGE_SIZE
        const data = hasMore ? itemsWithProject.slice(0, PAGE_SIZE) : itemsWithProject
        const nextCursor = hasMore ? data[data.length - 1].createdAt.toISOString() : null
        
        return {
          data,
          pagination: {
            nextCursor,
            pageSize: PAGE_SIZE,
            hasMore
          }
        }
      } else {
        // Legacy skip/limit pagination
        const items = await query.limit(PAGE_SIZE)
        const data = items.filter((t: any) => !!t.project)
        const total = await Task.countDocuments(dbFilters)
        
        return {
          data,
          pagination: {
            page: 1,
            limit: PAGE_SIZE,
            total,
            totalPages: Math.ceil(total / PAGE_SIZE)
          }
        }
      }
    })

    return result as any
  } catch (error) {
    console.error('Get tasks server error:', error)
    const defaultPageSize = Math.min(filters.limit || 20, 100)
    return {
      data: [],
      pagination: {
        nextCursor: null,
        pageSize: defaultPageSize,
        hasMore: false
      }
    }
  }
}
