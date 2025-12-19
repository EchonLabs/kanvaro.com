import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Task } from '@/models/Task'
import { Story } from '@/models/Story'
import { Epic } from '@/models/Epic'
import { Project } from '@/models/Project'
import { authenticateUser } from '@/lib/auth-utils'
import '@/models/Sprint'

// Legacy implementation kept for reference (commented out).
// export async function GET(request: NextRequest) {
//   try {
//     await connectDB()

//     const authResult = await authenticateUser()
//     if ('error' in authResult) {
//       return NextResponse.json(
//         { error: authResult.error },
//         { status: authResult.status }
//       )
//     }

//     const { user } = authResult
//     const userId = user.id
//     const organizationId = user.organization

//     const { searchParams } = new URL(request.url)
//     const page = parseInt(searchParams.get('page') || '1')
//     const limit = parseInt(searchParams.get('limit') || '50')
//     const search = searchParams.get('search') || ''
//     const type = searchParams.get('type') || ''
//     const priority = searchParams.get('priority') || ''
//     const status = searchParams.get('status') || ''

//     // Build search filter
//     const searchFilter = search ? {
//       $or: [
//         { title: { $regex: search, $options: 'i' } },
//         { description: { $regex: search, $options: 'i' } }
//       ]
//     } : {}

//     const includeTasks = !type || type === 'task'
//     const includeStories = !type || type === 'story'
//     const includeEpics = !type || type === 'epic'

//     const projectDocs = await Project.find({ organization: organizationId }).select('_id')
//     const projectIds = projectDocs.map(doc => doc._id)

//     if (projectIds.length === 0) {
//       return NextResponse.json({
//         success: true,
//         data: [],
//         pagination: {
//           page,
//           limit,
//           total: 0,
//           totalPages: 0
//         }
//       })
//     }

//     const taskFilter: any = {
//       ...searchFilter,
//       organization: organizationId,
//       project: { $in: projectIds },
//       archived: false
//     }

//     const storyFilter: any = {
//       ...searchFilter,
//       project: { $in: projectIds },
//       archived: false
//     }

//     const epicFilter: any = {
//       ...searchFilter,
//       project: { $in: projectIds },
//       archived: false
//     }

//     if (priority) {
//       taskFilter.priority = priority
//       storyFilter.priority = priority
//       epicFilter.priority = priority
//     }

//     if (status) {
//       const taskStatuses: string[] = []
//       const storyStatuses: string[] = []
//       const epicStatuses: string[] = []

//       switch (status) {
//         case 'backlog':
//           taskStatuses.push('todo')
//           storyStatuses.push('backlog', 'todo')
//           epicStatuses.push('backlog', 'todo')
//           break
//         case 'in_progress':
//           taskStatuses.push('in_progress')
//           storyStatuses.push('in_progress')
//           epicStatuses.push('in_progress')
//           break
//         case 'done':
//           taskStatuses.push('done')
//           storyStatuses.push('done', 'completed')
//           epicStatuses.push('done', 'completed')
//           break
//         default:
//           taskStatuses.push(status)
//           storyStatuses.push(status)
//           epicStatuses.push(status)
//       }

//       if (taskStatuses.length) {
//         taskFilter.status = taskStatuses.length === 1 ? taskStatuses[0] : { $in: taskStatuses }
//       }
//       if (storyStatuses.length) {
//         storyFilter.status = storyStatuses.length === 1 ? storyStatuses[0] : { $in: storyStatuses }
//       }
//       if (epicStatuses.length) {
//         epicFilter.status = epicStatuses.length === 1 ? epicStatuses[0] : { $in: epicStatuses }
//       }
//     }

//     const [tasks, stories, epics] = await Promise.all([
//       includeTasks
//         ? Task.find(taskFilter)
//             .populate('project', 'name')
//             .populate('assignedTo', 'firstName lastName email')
//             .populate('createdBy', 'firstName lastName email')
//             .populate('story', 'title')
//             .populate('sprint', 'name status')
//             .sort({ priority: -1, createdAt: -1 })
//             .skip((page - 1) * limit)
//             .limit(limit)
//         : Promise.resolve([]),

//       includeStories
//         ? Story.find(storyFilter)
//             .populate('project', 'name')
//             .populate('assignedTo', 'firstName lastName email')
//             .populate('createdBy', 'firstName lastName email')
//             .populate('epic', 'title')
//             .populate('sprint', 'name status')
//             .sort({ priority: -1, createdAt: -1 })
//             .skip((page - 1) * limit)
//             .limit(limit)
//         : Promise.resolve([]),

//       includeEpics
//         ? Epic.find(epicFilter)
//             .populate('project', 'name')
//             .populate('assignedTo', 'firstName lastName email')
//             .populate('createdBy', 'firstName lastName email')
//             .sort({ priority: -1, createdAt: -1 })
//             .skip((page - 1) * limit)
//             .limit(limit)
//         : Promise.resolve([])
//     ])

//     // Combine and format all items
//     const requestedStatus = status

//     const allItems = [
//       // Tasks: hide completed work by default (except when explicitly requesting done)
//       ...tasks
//         .filter(task => {
//           if (requestedStatus === 'done') return true
//           const sprintStatus = (task as any).sprint?.status
//           // Hide tasks that are done, especially those in completed sprints
//           if (task.status === 'done' && sprintStatus === 'completed') return false
//           if (task.status === 'done') return false
//           return true
//         })
//         .map(task => ({
//           ...task.toObject(),
//           type: 'task',
//           status: task.status === 'todo' ? 'backlog' : 
//                   task.status === 'in_progress' ? 'in_progress' : 
//                   task.status === 'done' ? 'done' : 'backlog'
//         })),

//       // Stories: show only until done/completed (unless explicitly filtering for done)
//       ...stories
//         .filter(story => {
//           if (requestedStatus === 'done') return true
//           return !['done', 'completed'].includes(story.status)
//         })
//         .map(story => ({
//           ...story.toObject(),
//           type: 'story',
//           status: story.status === 'todo' ? 'backlog' : 
//                   story.status === 'in_progress' ? 'in_progress' : 
//                   story.status === 'done' || story.status === 'completed' ? 'done' : 'backlog'
//         })),

//       // Epics: show only until done/completed (unless explicitly filtering for done)
//       ...epics
//         .filter(epic => {
//           if (requestedStatus === 'done') return true
//           return !['done', 'completed'].includes(epic.status)
//         })
//         .map(epic => ({
//           ...epic.toObject(),
//           type: 'epic',
//           status: epic.status === 'todo' ? 'backlog' : 
//                   epic.status === 'in_progress' ? 'in_progress' : 
//                   epic.status === 'done' || epic.status === 'completed' ? 'done' : 'backlog'
//         }))
//     ]

//     // Sort by priority and creation date
//     allItems.sort((a, b) => {
//       const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 }
//       const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] || 0
//       const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] || 0
      
//       if (aPriority !== bPriority) {
//         return bPriority - aPriority
//       }
      
//       return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
//     })

//     return NextResponse.json({
//       success: true,
//       data: allItems,
//       pagination: {
//         page,
//         limit,
//         total: allItems.length,
//         totalPages: Math.ceil(allItems.length / limit)
//       }
//     })

//   } catch (error) {
//     console.error('Get backlog error:', error)
//     return NextResponse.json(
//       { error: 'Internal server error' },
//       { status: 500 }
//     )
//   }
// }

// New GET: return all tasks, stories, and epics for the organization,
// with simple optional search and type filters.
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
    const organizationId = user.organization

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const search = searchParams.get('search') || ''
    const type = searchParams.get('type') || '' // optional: 'task' | 'story' | 'epic'

    const searchFilter = search
      ? {
          $or: [
            { title: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } }
          ]
        }
      : {}

    const includeTasks = !type || type === 'task'
    const includeStories = !type || type === 'story'
    const includeEpics = !type || type === 'epic'

    const projectDocs = await Project.find({ organization: organizationId }).select('_id')
    const projectIds = projectDocs.map(doc => doc._id)

    if (projectIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: []
      })
    }

    const taskFilter: any = {
      ...searchFilter,
      organization: organizationId,
      project: { $in: projectIds },
      archived: false
    }

    const storyFilter: any = {
      ...searchFilter,
      project: { $in: projectIds },
      archived: false
    }

    const epicFilter: any = {
      ...searchFilter,
      project: { $in: projectIds },
      archived: false
    }

    const [tasks, stories, epics] = await Promise.all([
      includeTasks
        ? Task.find(taskFilter)
            .populate('project', 'name')
            .populate('assignedTo.user', '_id firstName lastName email')
            .populate('createdBy', 'firstName lastName email')
            .populate('story', 'title')
            .populate('sprint', 'name status')
        : Promise.resolve([]),

      includeStories
        ? Story.find(storyFilter)
            .populate('project', 'name')
            .populate('createdBy', 'firstName lastName email')
            .populate('epic', 'title')
            .populate('sprint', 'name status')
        : Promise.resolve([]),

      includeEpics
        ? Epic.find(epicFilter)
            .populate('project', 'name')
            .populate('assignedTo', 'firstName lastName email')
            .populate('createdBy', 'firstName lastName email')
        : Promise.resolve([])
    ])

    const allItems = [
      ...tasks.map(task => {
        const taskObj = task.toObject()
        // assignedTo is already an array of populated user objects
        return {
          ...taskObj,
        type: 'task'
        }
      }),
      ...stories.map(story => {
        const storyObj = story.toObject()
        // Normalize assignedTo for stories: convert single user to array
        const normalizedAssignedTo = storyObj.assignedTo ? [storyObj.assignedTo] : []
        return {
          ...storyObj,
          assignedTo: normalizedAssignedTo,
        type: 'story'
        }
      }),
      ...epics.map(epic => {
        const epicObj = epic.toObject()
        // Normalize assignedTo for epics: convert single user to array
        const normalizedAssignedTo = epicObj.assignedTo ? [epicObj.assignedTo] : []
        return {
          ...epicObj,
          assignedTo: normalizedAssignedTo,
        type: 'epic'
        }
      })
    ]

    // Sort by createdAt descending (newest first)
    allItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // Apply pagination
    const total = allItems.length
    const startIndex = (page - 1) * limit
    const endIndex = startIndex + limit
    const paginatedData = allItems.slice(startIndex, endIndex)

    return NextResponse.json({
      success: true,
      data: paginatedData,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Get backlog error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
