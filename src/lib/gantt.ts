import { Task } from '@/models/Task'
import { Sprint } from '@/models/Sprint'
import { Project } from '@/models/Project'

export interface GanttTask {
  id: string
  title: string
  start: Date
  end: Date
  progress: number
  dependencies: string[]
  type: 'task' | 'sprint' | 'milestone'
  status: string
  priority: string
  assignee?: string
  project?: string
  sprint?: string
}

export interface GanttData {
  tasks: GanttTask[]
  startDate: Date
  endDate: Date
  totalDuration: number
}

export async function generateGanttData(
  projectId?: string,
  sprintId?: string,
  assigneeId?: string,
  startDate?: Date,
  endDate?: Date
): Promise<GanttData> {
  const query: any = {}
  
  if (projectId) query.project = projectId
  if (sprintId) query.sprint = sprintId
  if (assigneeId) query.assignedTo = assigneeId
  if (startDate || endDate) {
    query.startDate = {}
    if (startDate) query.startDate.$gte = startDate
    if (endDate) query.startDate.$lte = endDate
  }

  // Get tasks
  const tasks = await Task.find(query)
    .populate('assignedTo', 'name')
    .populate('project', 'name')
    .populate('sprint', 'name')
    .sort({ startDate: 1 })

  // Get sprints if project is specified
  let sprints: any[] = []
  if (projectId) {
    const sprintQuery: any = { project: projectId }
    if (startDate || endDate) {
      sprintQuery.startDate = {}
      if (startDate) sprintQuery.startDate.$gte = startDate
      if (endDate) sprintQuery.startDate.$lte = endDate
    }
    sprints = await Sprint.find(sprintQuery).sort({ startDate: 1 })
  }

  const ganttTasks: GanttTask[] = []

  // Process tasks
  for (const task of tasks) {
    if (task.startDate && task.dueDate) {
      const progress = task.status === 'done' ? 100 : 
                     task.status === 'in_progress' ? 50 : 0

      ganttTasks.push({
        id: task._id.toString(),
        title: task.title,
        start: task.startDate,
        end: task.dueDate,
        progress,
        dependencies: Array.isArray(task.dependencies)
          ? task.dependencies.map((dep: any) => (dep?._id || dep).toString())
          : [],
        type: 'task',
        status: task.status,
        priority: task.priority,
        assignee: task.assignedTo?.name,
        project: task.project?.name,
        sprint: task.sprint?.name
      })
    }
  }

  // Process sprints
  for (const sprint of sprints) {
    ganttTasks.push({
      id: `sprint-${sprint._id}`,
      title: sprint.name,
      start: sprint.startDate,
      end: sprint.endDate,
      progress: sprint.status === 'completed' ? 100 : 
               sprint.status === 'active' ? 50 : 0,
      dependencies: [],
      type: 'sprint',
      status: sprint.status,
      priority: 'medium'
    })
  }

  // Overall date range (includes current date with padding)
  const allDates = [...ganttTasks.flatMap(t => [t.start, t.end]), new Date()]
  const minDate = new Date(Math.min(...allDates.map(d => new Date(d).getTime())))
  const maxDate = new Date(Math.max(...allDates.map(d => new Date(d).getTime())))
  minDate.setDate(minDate.getDate() - 3)
  maxDate.setDate(maxDate.getDate() + 7)
  
  const totalDuration = maxDate.getTime() - minDate.getTime()

  return {
    tasks: ganttTasks,
    startDate: minDate,
    endDate: maxDate,
    totalDuration
  }
}

export function calculateCriticalPath(tasks: GanttTask[]): string[] {
  // Simple critical path calculation based on dependencies
  const taskMap = new Map(tasks.map(task => [task.id, task]))
  const criticalPath: string[] = []
  const visited = new Set<string>()

  function findLongestPath(taskId: string): number {
    if (visited.has(taskId)) return 0
    visited.add(taskId)

    const task = taskMap.get(taskId)
    if (!task) return 0

    const duration = task.end.getTime() - task.start.getTime()
    let maxDependencyDuration = 0

    for (const depId of task.dependencies) {
      const depDuration = findLongestPath(depId)
      maxDependencyDuration = Math.max(maxDependencyDuration, depDuration)
    }

    return duration + maxDependencyDuration
  }

  // Find the task with the longest path
  let maxDuration = 0
  let criticalTaskId = ''

  for (const task of tasks) {
    visited.clear()
    const duration = findLongestPath(task.id)
    if (duration > maxDuration) {
      maxDuration = duration
      criticalTaskId = task.id
    }
  }

  // Build critical path
  if (criticalTaskId) {
    const buildPath = (taskId: string) => {
      const task = taskMap.get(taskId)
      if (!task) return

      criticalPath.push(taskId)
      
      // Find the dependency with the longest path
      let maxDepDuration = 0
      let criticalDepId = ''
      
      for (const depId of task.dependencies) {
        visited.clear()
        const depDuration = findLongestPath(depId)
        if (depDuration > maxDepDuration) {
          maxDepDuration = depDuration
          criticalDepId = depId
        }
      }
      
      if (criticalDepId) {
        buildPath(criticalDepId)
      }
    }
    
    buildPath(criticalTaskId)
  }

  return criticalPath
}

export function getTaskDependencies(taskId: string, tasks: GanttTask[]): GanttTask[] {
  const task = tasks.find(t => t.id === taskId)
  if (!task) return []

  const dependencies: GanttTask[] = []
  const visited = new Set<string>()

  const findDependencies = (id: string) => {
    if (visited.has(id)) return
    visited.add(id)

    const currentTask = tasks.find(t => t.id === id)
    if (!currentTask) return

    for (const depId of currentTask.dependencies) {
      const depTask = tasks.find(t => t.id === depId)
      if (depTask && !dependencies.some(d => d.id === depId)) {
        dependencies.push(depTask)
        findDependencies(depId)
      }
    }
  }

  findDependencies(taskId)
  return dependencies
}
