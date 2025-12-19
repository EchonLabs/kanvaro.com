import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { User, Project, Task, Story, Epic, Sprint } from '@/models'
import { DocsLoader } from '@/lib/docs/loader'
import { authenticateUser } from '@/lib/auth-utils'
import { Permission } from '@/lib/permissions/permission-definitions'

interface SearchFilters {
  type?: string[]
  status?: string[]
  priority?: string[]
  assignee?: string[]
  project?: string[]
  dateRange?: {
    start: string
    end: string
  }
}

interface SearchOptions {
  limit?: number
  offset?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  includeArchived?: boolean
}

interface SearchResult {
  id: string
  title: string
  description?: string
  type: 'project' | 'task' | 'story' | 'epic' | 'sprint' | 'user' | 'documentation'
  url: string
  score: number
  highlights: string[]
  metadata: {
    status?: string
    priority?: string
    assignee?: string
    project?: string
    createdAt: string
    updatedAt: string
    category?: string
    audience?: string
  }
}

interface SearchResponse {
  results: SearchResult[]
  total: number
  aggregations: {
    types: Record<string, number>
    statuses: Record<string, number>
    priorities: Record<string, number>
    projects: Record<string, number>
    categories?: Record<string, number>
    audiences?: Record<string, number>
  }
  suggestions: string[]
  took: number
}

// Fuzzy search scoring algorithm
function calculateScore(query: string, text: string, type: string): number {
  const queryLower = query.toLowerCase()
  const textLower = text.toLowerCase()
  
  // Exact match gets highest score
  if (textLower === queryLower) return 100
  
  // Starts with query gets high score
  if (textLower.startsWith(queryLower)) return 90
  
  // Contains query gets medium score
  if (textLower.includes(queryLower)) return 70
  
  // Fuzzy matching for typos
  const fuzzyScore = fuzzyMatch(queryLower, textLower)
  if (fuzzyScore > 0.7) return 60
  
  // Word boundary matching
  const words = textLower.split(/\s+/)
  const queryWords = queryLower.split(/\s+/)
  let wordMatches = 0
  
  for (const queryWord of queryWords) {
    for (const word of words) {
      if (word.includes(queryWord) || queryWord.includes(word)) {
        wordMatches++
        break
      }
    }
  }
  
  if (wordMatches === queryWords.length) return 50
  
  return 0
}

// Simple fuzzy matching algorithm
function fuzzyMatch(query: string, text: string): number {
  if (query.length === 0) return 1
  if (text.length === 0) return 0
  
  const matrix: number[][] = []
  for (let i = 0; i <= query.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= text.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= query.length; i++) {
    for (let j = 1; j <= text.length; j++) {
      if (query[i - 1] === text[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + 1
        )
      }
    }
  }
  
  const distance = matrix[query.length][text.length]
  return 1 - distance / Math.max(query.length, text.length)
}

// Generate search highlights
function generateHighlights(query: string, text: string): string[] {
  const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 0)
  const highlights: string[] = []
  
  for (const word of queryWords) {
    const regex = new RegExp(`(${word})`, 'gi')
    if (regex.test(text)) {
      highlights.push(word)
    }
  }
  
  return highlights
}

// Parse search query for advanced features
function parseQuery(query: string): { searchText: string; filters: SearchFilters } {
  const filters: SearchFilters = {}
  let searchText = query
  
  // Extract type filters (type:project, type:task, etc.)
  const typeMatch = query.match(/type:(\w+)/g)
  if (typeMatch) {
    filters.type = typeMatch.map(match => match.replace('type:', ''))
    searchText = searchText.replace(/type:\w+/g, '').trim()
  }
  
  // Extract status filters (status:active, status:completed, etc.)
  const statusMatch = query.match(/status:(\w+)/g)
  if (statusMatch) {
    filters.status = statusMatch.map(match => match.replace('status:', ''))
    searchText = searchText.replace(/status:\w+/g, '').trim()
  }
  
  // Extract priority filters (priority:high, priority:low, etc.)
  const priorityMatch = query.match(/priority:(\w+)/g)
  if (priorityMatch) {
    filters.priority = priorityMatch.map(match => match.replace('priority:', ''))
    searchText = searchText.replace(/priority:\w+/g, '').trim()
  }
  
  // Extract assignee filters (assignee:john, assignee:sarah, etc.)
  const assigneeMatch = query.match(/assignee:(\w+)/g)
  if (assigneeMatch) {
    filters.assignee = assigneeMatch.map(match => match.replace('assignee:', ''))
    searchText = searchText.replace(/assignee:\w+/g, '').trim()
  }
  
  // Extract project filters (project:website, project:mobile, etc.)
  const projectMatch = query.match(/project:(\w+)/g)
  if (projectMatch) {
    filters.project = projectMatch.map(match => match.replace('project:', ''))
    searchText = searchText.replace(/project:\w+/g, '').trim()
  }
  
  return { searchText, filters }
}

export async function GET(request: NextRequest) {
  try {
    const startTime = Date.now()
    const { searchParams } = new URL(request.url)

    const query = (searchParams.get('q') || '').trim()
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')
    const sortBy = searchParams.get('sortBy') || 'score'
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc'
    const includeArchived = searchParams.get('includeArchived') === 'true'

    // Authenticate user for documentation search
    const auth = await authenticateUser()
    const hasDocSearchPermission = auth && !('error' in auth) // Any authenticated user can search docs

    const isProjectNumber = /^\d+$/.test(query)
    const isTaskDisplayId = /^\d+\.\d+$/.test(query)

    if (query.length < 2 && !isProjectNumber && !isTaskDisplayId) {
      return NextResponse.json({
        results: [],
        total: 0,
        aggregations: {
          types: {},
          statuses: {},
          priorities: {},
          projects: {}
        },
        suggestions: [],
        took: Date.now() - startTime
      })
    }
    
    // Connect to database
    await connectDB()
    
    const { searchText, filters } = parseQuery(query)
    const results: SearchResult[] = []

    // Fast path: exact ID searches
    if (isProjectNumber) {
      const pn = parseInt(query, 10)
      const projects = await Project.find({ projectNumber: pn }).lean()
      for (const project of projects) {
        results.push({
          id: (project._id as any).toString(),
          title: project.name,
          description: project.description,
          type: 'project',
          url: `/projects/${(project._id as any).toString()}`,
          score: 100,
          highlights: [query],
          metadata: {
            status: project.status,
            createdAt: project.createdAt.toISOString(),
            updatedAt: project.updatedAt.toISOString()
          }
        })
      }
      return NextResponse.json({
        results: results.slice(0, limit),
        total: results.length,
        aggregations: { types: { project: results.length }, statuses: {}, priorities: {}, projects: {} },
        suggestions: [],
        took: Date.now() - startTime
      })
    }

    if (isTaskDisplayId) {
      const tasks = await Task.find({ displayId: query }).lean()
      for (const task of tasks) {
        results.push({
          id: (task._id as any).toString(),
          title: task.title,
          description: task.description,
          type: 'task',
          url: `/tasks/${(task._id as any).toString()}`,
          score: 100,
          highlights: [query],
          metadata: {
            status: task.status,
            priority: task.priority,
            project: task.project?.toString(),
            createdAt: task.createdAt.toISOString(),
            updatedAt: task.updatedAt.toISOString()
          }
        })
      }
      return NextResponse.json({
        results: results.slice(0, limit),
        total: results.length,
        aggregations: { types: { task: results.length }, statuses: {}, priorities: {}, projects: {} },
        suggestions: [],
        took: Date.now() - startTime
      })
    }
    
    // Search Projects
    if (!filters.type || filters.type.includes('project')) {
      const projectQuery: any = {
        $or: [
          { name: { $regex: searchText, $options: 'i' } },
          { description: { $regex: searchText, $options: 'i' } }
        ]
      }
      
      if (!includeArchived) {
        projectQuery.archived = { $ne: true }
      }
      
      const projects = await Project.find(projectQuery)
        .limit(limit)
        .skip(offset)
        .lean()
      
      for (const project of projects) {
        const score = calculateScore(searchText, project.name, 'project')
        if (score > 0) {
          results.push({
            id: (project._id as any).toString(),
            title: project.name,
            description: project.description,
            type: 'project',
            url: `/projects/${(project._id as any).toString()}`,
            score,
            highlights: generateHighlights(searchText, project.name),
            metadata: {
              status: project.status,
              createdAt: project.createdAt.toISOString(),
              updatedAt: project.updatedAt.toISOString()
            }
          })
        }
      }
    }
    
    // Preload user and project names for display
    const [allUsers, allProjects] = await Promise.all([
      User.find({}, 'firstName lastName email').lean(),
      Project.find({}, 'name').lean()
    ])
    const userNameMap = new Map<string, string>()
    allUsers.forEach((u: any) => {
      const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || ''
      userNameMap.set((u._id as any).toString(), name || (u._id as any).toString())
    })
    const projectNameMap = new Map<string, string>()
    allProjects.forEach((p: any) => {
      projectNameMap.set((p._id as any).toString(), p.name || (p._id as any).toString())
    })
    const getUserName = (id?: any) => {
      if (!id) return undefined
      const key = id.toString()
      return userNameMap.get(key) || key
    }
    const getProjectName = (id?: any) => {
      if (!id) return undefined
      const key = id.toString()
      return projectNameMap.get(key) || key
    }

    // Search Tasks
    if (!filters.type || filters.type.includes('task')) {
      const taskQuery: any = {
        $or: [
          { title: { $regex: searchText, $options: 'i' } },
          { description: { $regex: searchText, $options: 'i' } }
        ]
      }
      
      if (!includeArchived) {
        taskQuery.archived = { $ne: true }
      }
      
      if (filters.status) {
        taskQuery.status = { $in: filters.status }
      }
      
      if (filters.priority) {
        taskQuery.priority = { $in: filters.priority }
      }
      
      const tasks = await Task.find(taskQuery)
        .limit(limit)
        .skip(offset)
        .lean()
      
      for (const task of tasks) {
        const score = calculateScore(searchText, task.title, 'task')
        if (score > 0) {
          results.push({
            id: (task._id as any).toString(),
            title: task.title,
            description: task.description,
            type: 'task',
            url: `/tasks/${(task._id as any).toString()}`,
            score,
            highlights: generateHighlights(searchText, task.title),
            metadata: {
              status: task.status,
              priority: task.priority,
              assignee: getUserName((task as any).assignedTo),
              project: getProjectName((task as any).project),
              createdAt: task.createdAt.toISOString(),
              updatedAt: task.updatedAt.toISOString()
            }
          })
        }
      }
    }
    
    // Search Stories
    if (!filters.type || filters.type.includes('story')) {
      const storyQuery: any = {
        $or: [
          { title: { $regex: searchText, $options: 'i' } },
          { description: { $regex: searchText, $options: 'i' } }
        ]
      }
      
      if (!includeArchived) {
        storyQuery.archived = { $ne: true }
      }
      
      const stories = await Story.find(storyQuery)
        .limit(limit)
        .skip(offset)
        .lean()
      
      for (const story of stories) {
        const score = calculateScore(searchText, story.title, 'story')
        if (score > 0) {
          results.push({
            id: (story._id as any).toString(),
            title: story.title,
            description: story.description,
            type: 'story',
            url: `/stories/${(story._id as any).toString()}`,
            score,
            highlights: generateHighlights(searchText, story.title),
            metadata: {
              status: story.status,
              priority: story.priority,
              project: getProjectName(story.projectId),
              createdAt: story.createdAt.toISOString(),
              updatedAt: story.updatedAt.toISOString()
            }
          })
        }
      }
    }
    
    // Search Epics
    if (!filters.type || filters.type.includes('epic')) {
      const epicQuery: any = {
        $or: [
          { title: { $regex: searchText, $options: 'i' } },
          { description: { $regex: searchText, $options: 'i' } }
        ]
      }
      
      if (!includeArchived) {
        epicQuery.archived = { $ne: true }
      }
      
      const epics = await Epic.find(epicQuery)
        .limit(limit)
        .skip(offset)
        .lean()
      
      for (const epic of epics) {
        const score = calculateScore(searchText, epic.title, 'epic')
        if (score > 0) {
          results.push({
            id: (epic._id as any).toString(),
            title: epic.title,
            description: epic.description,
            type: 'epic',
            url: `/epics/${(epic._id as any).toString()}`,
            score,
            highlights: generateHighlights(searchText, epic.title),
            metadata: {
              status: epic.status,
              priority: epic.priority,
              project: getProjectName((epic as any).project),
              createdAt: epic.createdAt.toISOString(),
              updatedAt: epic.updatedAt.toISOString()
            }
          })
        }
      }
    }

    // Search Sprints
    if (!filters.type || filters.type.includes('sprint')) {
      const sprintQuery: any = {
        $or: [
          { name: { $regex: searchText, $options: 'i' } },
          { description: { $regex: searchText, $options: 'i' } }
        ]
      }

      if (!includeArchived) {
        sprintQuery.archived = { $ne: true }
      }

      const sprints = await Sprint.find(sprintQuery)
        .limit(limit)
        .skip(offset)
        .lean()

      for (const sprint of sprints) {
        const score = calculateScore(searchText, sprint.name, 'sprint')
        if (score > 0) {
          results.push({
            id: (sprint._id as any).toString(),
            title: sprint.name,
            description: sprint.description,
            type: 'sprint',
            url: `/sprints/${(sprint._id as any).toString()}`,
            score,
            highlights: generateHighlights(searchText, sprint.name),
            metadata: {
              status: sprint.status,
              createdAt: sprint.createdAt.toISOString(),
              updatedAt: sprint.updatedAt.toISOString()
            }
          })
        }
      }
    }
    
    // Search Users
    if (!filters.type || filters.type.includes('user')) {
      const userQuery = {
        $or: [
          { firstName: { $regex: searchText, $options: 'i' } },
          { lastName: { $regex: searchText, $options: 'i' } },
          { email: { $regex: searchText, $options: 'i' } },
          { role: { $regex: searchText, $options: 'i' } }
        ]
      }
      
      const users = await User.find(userQuery)
        .limit(limit)
        .skip(offset)
        .lean()
      
      for (const user of users) {
        const fullName = `${user.firstName} ${user.lastName}`.trim()
        const score = calculateScore(searchText, fullName, 'user')
        if (score > 0) {
          results.push({
            id: (user._id as any).toString(),
            title: fullName,
            description: user.email,
            type: 'user',
            url: `/profile/${(user._id as any).toString()}`,
            score,
            highlights: generateHighlights(searchText, fullName),
            metadata: {
              createdAt: user.createdAt.toISOString(),
              updatedAt: user.updatedAt.toISOString()
            }
          })
        }
      }
    }

    // Search Documentation (if user has permission)
    if (!filters.type || filters.type.includes('documentation')) {
      if (hasDocSearchPermission && searchText.length >= 2) {
        try {
          const docResults = await DocsLoader.searchDocs(searchText, 'internal')

          for (const doc of docResults) {
            const score = calculateScore(searchText, doc.title, 'documentation')
            if (score > 0) {
              results.push({
                id: doc.slug,
                title: doc.title,
                description: doc.summary,
                type: 'documentation',
                url: `/docs/internal/${doc.slug}`,
                score,
                highlights: generateHighlights(searchText, doc.title),
                metadata: {
                  createdAt: doc.updated,
                  updatedAt: doc.updated,
                  category: doc.category,
                  audience: doc.audiences.join(', ')
                }
              })
            }
          }
        } catch (error) {
          console.error('Documentation search error:', error)
          // Continue without documentation results if there's an error
        }
      }
    }

    // Sort results
    results.sort((a, b) => {
      if (sortBy === 'score') {
        return sortOrder === 'desc' ? b.score - a.score : a.score - b.score
      } else if (sortBy === 'title') {
        return sortOrder === 'desc' 
          ? b.title.localeCompare(a.title)
          : a.title.localeCompare(b.title)
      } else if (sortBy === 'createdAt') {
        return sortOrder === 'desc'
          ? new Date(b.metadata.createdAt).getTime() - new Date(a.metadata.createdAt).getTime()
          : new Date(a.metadata.createdAt).getTime() - new Date(b.metadata.createdAt).getTime()
      }
      return 0
    })
    
    // Calculate aggregations
    const aggregations = {
      types: {} as Record<string, number>,
      statuses: {} as Record<string, number>,
      priorities: {} as Record<string, number>,
      projects: {} as Record<string, number>,
      categories: {} as Record<string, number>,
      audiences: {} as Record<string, number>
    }

    for (const result of results) {
      aggregations.types[result.type] = (aggregations.types[result.type] || 0) + 1
      if (result.metadata.status) {
        aggregations.statuses[result.metadata.status] = (aggregations.statuses[result.metadata.status] || 0) + 1
      }
      if (result.metadata.priority) {
        aggregations.priorities[result.metadata.priority] = (aggregations.priorities[result.metadata.priority] || 0) + 1
      }
      if (result.metadata.project) {
        aggregations.projects[result.metadata.project] = (aggregations.projects[result.metadata.project] || 0) + 1
      }
      if (result.metadata.category) {
        aggregations.categories[result.metadata.category] = (aggregations.categories[result.metadata.category] || 0) + 1
      }
      if (result.metadata.audience) {
        aggregations.audiences[result.metadata.audience] = (aggregations.audiences[result.metadata.audience] || 0) + 1
      }
    }
    
    // Generate suggestions based on common search patterns
    const suggestions = [
      `type:${query}`,
      `status:active ${query}`,
      `priority:high ${query}`,
      `project:${query}`
    ].filter(suggestion => suggestion !== query)
    
    const response: SearchResponse = {
      results: results.slice(0, limit),
      total: results.length,
      aggregations,
      suggestions,
      took: Date.now() - startTime
    }
    
    return NextResponse.json(response)
    
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    )
  }
}