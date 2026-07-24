'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { formatToTitleCase } from '@/lib/utils'
import { useNotify } from '@/lib/notify'
import { cn } from '@/lib/utils'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePermissions } from '@/lib/permissions/permission-context'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { Permission } from '@/lib/permissions/permission-definitions'
import { useAuthContext } from '@/contexts/AuthContext'
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  Pause,
  XCircle,
  Play,
  Loader2,
  User,
  Target,
  Zap,
  BarChart3,
  List,
  Kanban,
  Users,
  TrendingUp,
  Calendar as CalendarIcon,
  Eye,
  Settings,
  Edit,
  Trash2,
  ChevronDown,
  ChevronRight,
  X,
  RotateCcw
} from 'lucide-react'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import {
  StatusBadge, PriorityBadge, GradientProgress,
  PageHeader, SectionLabel, TasksEmptyState, CardGridSkeleton,
  PaginationBar, MetaChip, InlineLoader, FullPageLoader,
  ViewSwitcher, cardShell, cardHover, TASK_STATUS_CONFIG
} from '@/components/tasks/TasksShared'

interface Sprint {
  _id: string
  name: string
  description: string
  status: 'planning' | 'active' | 'completed' | 'cancelled'
  project: {
    _id: string
    name: string
  }
  startDate: string
  endDate: string
  goal: string
  capacity: number
  velocity: number
  teamMembers: Array<{
    _id?: string
    firstName: string
    lastName: string
    email: string
  }>
  createdBy: {
    firstName: string
    lastName: string
    email: string
  }
  tasks?: string[]
  stories?: string[]
  attachments?: Array<{
    name: string
    url: string
    size: number
    type: string
    uploadedBy: string
    uploadedAt: string
  }>
  actualStartDate?: string
  actualEndDate?: string
  progress: {
    completionPercentage: number
    tasksCompleted: number
    totalTasks: number
    storyPointsCompleted: number
    totalStoryPoints: number
    storyPointsCompletionPercentage?: number
  }
  createdAt: string
  updatedAt: string
}


export default function SprintsPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuthContext()

  const router = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router
  const searchParams = useSearchParams()
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [loading, setLoading] = useState(true)
  const [isFetching, setIsFetching] = useState(false)
  const isFirstFetch = useRef(false)
  const [error, setError] = useState('')
const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [projectFilterQuery, setProjectFilterQuery] = useState('')
  const [projectOptions, setProjectOptions] = useState<Array<{ _id: string; name: string }>>([])
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const { formatDate } = useDateTime()

  // Force grid view on mobile — list view is desktop-only
  useEffect(() => {
    const syncViewMode = () => { if (window.innerWidth < 640) setViewMode('grid') }
    syncViewMode()
    window.addEventListener('resize', syncViewMode)
    return () => window.removeEventListener('resize', syncViewMode)
  }, [])

  // Check if any filters are active
  const hasActiveFilters = searchQuery !== '' ||
    statusFilter !== 'all' ||
    projectFilter !== 'all'

  // Reset all filters
  const resetFilters = () => {
    setSearchQuery('')
    setStatusFilter('all')
    setProjectFilter('all')
    setProjectFilterQuery('')
  }
  const [success, setSuccess] = useState('')
  const [updatingSprintId, setUpdatingSprintId] = useState<string | null>(null)
  const [completeModalOpen, setCompleteModalOpen] = useState(false)
  const [completingSprintId, setCompletingSprintId] = useState<string | null>(null)
  const [completionMode, setCompletionMode] = useState<'existing' | 'new'>('existing')
  const [availableSprints, setAvailableSprints] = useState<Sprint[]>([])
  const [availableSprintsLoading, setAvailableSprintsLoading] = useState(false)
  const [selectedTargetSprintId, setSelectedTargetSprintId] = useState('')
  const { success: notifySuccess, error: notifyError } = useNotify()
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null)
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [completeError, setCompleteError] = useState('')
  const [incompleteTasks, setIncompleteTasks] = useState<Array<{
    _id: string
    title: string
    status: string
    subtasks?: Array<{
      _id?: string
      title: string
      description?: string
      status: string
      isCompleted: boolean
    }>
  }>>([])
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const [newSprintForm, setNewSprintForm] = useState({
    name: '',
    startDate: '',
    endDate: '',
    capacity: ''
  })
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [totalCount, setTotalCount] = useState(0)
  const initialLoadDone = useRef(false)

  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { hasPermission } = usePermissions()

  const canCreateSprint = hasPermission(Permission.SPRINT_CREATE)
  const canViewSprint = hasPermission(Permission.SPRINT_VIEW) || hasPermission(Permission.SPRINT_READ)
  const canEditSprint = hasPermission(Permission.SPRINT_EDIT) && hasPermission(Permission.SPRINT_CREATE)
  const canDeleteSprint = hasPermission(Permission.SPRINT_DELETE)
  const canStartSprint = hasPermission(Permission.SPRINT_START)
  const canCompleteSprint = hasPermission(Permission.SPRINT_COMPLETE)

  // Helper function to focus filter search inputs
  const focusSearchInput = (el: HTMLInputElement | null) => {
    if (!el || el.disabled) return

    const doFocus = () => {
      el.focus({ preventScroll: true })
      try {
        el.select?.()
      } catch {
        // ignore
      }
    }

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(doFocus)
    } else {
      setTimeout(doFocus, 0)
    }
  }

  // Filter search input ref
  const projectSearchInputRef = useRef<HTMLInputElement | null>(null)

  const showSuccess = useCallback((message: string) => {
    setSuccess(message)
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current)
    }
    successTimeoutRef.current = setTimeout(() => {
      setSuccess('')
      successTimeoutRef.current = null
    }, 3000)
  }, [])

  const fetchSprints = useCallback(async (page = currentPage) => {
    try {
      if (!isFirstFetch.current) {
        setLoading(true)
      } else {
        setIsFetching(true)
      }
      const params = new URLSearchParams()
      params.set('page', page.toString())
      params.set('limit', pageSize.toString())
      if (searchQuery.trim()) params.set('search', searchQuery.trim())
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (projectFilter !== 'all') params.set('project', projectFilter)

      const response = await fetch(`/api/sprints?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        setSprints(data.data)
        setTotalCount(data.pagination?.total || data.data.length)
      } else {
        setError(data.error || 'Failed to fetch sprints')
      }
    } catch (err) {
      setError('Failed to fetch sprints')
    } finally {
      if (!isFirstFetch.current) {
        setLoading(false)
        isFirstFetch.current = true
      } else {
        setIsFetching(false)
      }
    }
  }, [currentPage, pageSize, searchQuery, statusFilter, projectFilter])


  // Auth initialization - trigger data loading
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      setLoading(false)
      fetchSprints()
    } else if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated])

  // Initial data load when authenticated
  useEffect(() => {
    if (!initialLoadDone.current && !authLoading && isAuthenticated) {
      initialLoadDone.current = true
      fetchSprints(currentPage)
    } else if (!authLoading && !isAuthenticated) {
      routerRef.current.push('/login')
    }
  }, [authLoading, isAuthenticated])

  useEffect(() => {
    const successParam = searchParams?.get('success')
    if (successParam === 'sprint-created') {
      notifySuccess({ title: 'Sprint created successfully' })
      routerRef.current.replace('/sprints', { scroll: false })
    }
  }, [searchParams])

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current)
      }
    }
  }, [])

  // Fetch when pagination changes (after initial load)
  useEffect(() => {
    if (initialLoadDone.current) {
      fetchSprints(currentPage)
    }
  }, [currentPage, pageSize]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch from page 1 whenever search/filters change
  useEffect(() => {
    if (!initialLoadDone.current) return
    setCurrentPage(1)
    fetchSprints(1)
  }, [searchQuery, statusFilter, projectFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteClick = (sprintId: string) => {
    if (!canDeleteSprint) {
      setError('You do not have permission to delete sprints.')
      return
    }
    setSelectedSprintId(sprintId)
    setShowDeleteConfirmModal(true)
  }

  const handleDeleteConfirm = async () => {
    if (!selectedSprintId) return

    try {
      setDeleting(true)

      const res = await fetch(`/api/sprints/${selectedSprintId}`, {
        method: 'DELETE'
      })
      const data = await res.json()

      if (res.ok && data.success) {
        setSprints(prev => prev.filter(s => s._id !== selectedSprintId))
        notifySuccess({ title: 'Sprint deleted successfully' })
        setShowDeleteConfirmModal(false)
        setSelectedSprintId(null)
      } else {
        setError(data.error || 'Failed to delete sprint')
        notifyError({ title: data.error || 'Failed to delete sprint' })
        setShowDeleteConfirmModal(false)
      }
    } catch (e) {
      setError('Failed to delete sprint')
      notifyError({ title: 'Failed to delete sprint' })
      setShowDeleteConfirmModal(false)
    } finally {
      setDeleting(false)
    }
  }

  const formatDateInputValue = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const formatTaskStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      backlog: 'Backlog',
      todo: 'To Do',
      in_progress: 'In Progress',
      review: 'In Review',
      testing: 'Testing',
      done: 'Done',
      completed: 'Completed',
      cancelled: 'Cancelled'
    }
    return statusMap[status] || formatToTitleCase(status)
  }

  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTasks(prev => {
      const newSet = new Set(prev)
      if (newSet.has(taskId)) {
        newSet.delete(taskId)
      } else {
        newSet.add(taskId)
      }
      return newSet
    })
  }

  const getIncompleteSubtasks = (task: typeof incompleteTasks[0]) => {
    if (!task.subtasks || !Array.isArray(task.subtasks)) return []
    return task.subtasks.filter((subtask: any) => {
      const status = subtask.status || 'backlog'
      return status !== 'done' && status !== 'completed' && !subtask.isCompleted
    })
  }

  const TASK_STATUS_BADGE_MAP: Record<string, string> = {
    backlog: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
    todo: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    in_progress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    review: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    testing: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    blocked: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    done: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
  }

  const loadAvailableSprints = useCallback(async (excludeSprintId: string, projectId?: string) => {
    try {
      setAvailableSprintsLoading(true)
      const params = new URLSearchParams({ limit: '200' })
      if (projectId) {
        params.set('project', projectId)
      }
      const response = await fetch(`/api/sprints?${params.toString()}`)
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load sprints')
      }

      const sprintList: Sprint[] = Array.isArray(data.data) ? data.data : []
      const filtered = sprintList.filter(
        sprintOption =>
          sprintOption._id !== excludeSprintId && ['planning', 'active'].includes(sprintOption.status)
      )

      setAvailableSprints(filtered)
      return filtered
    } catch (err) {
      console.error('Failed to load sprints list:', err)
      setAvailableSprints([])
      setCompleteError(err instanceof Error ? err.message : 'Failed to load sprints')
      return []
    } finally {
      setAvailableSprintsLoading(false)
    }
  }, [])

  const checkSprintForIncompleteTasks = async (sprintId: string): Promise<Array<{
    _id: string
    title: string
    status: string
    subtasks?: Array<{
      _id?: string
      title: string
      description?: string
      status: string
      isCompleted: boolean
    }>
  }>> => {
    try {
      const response = await fetch(`/api/sprints/${sprintId}`)
      const data = await response.json()

      if (!response.ok || !data.success) {
        return []
      }

      const tasks = data.data?.tasks || []
      return tasks
        .filter((task: any) => !['done', 'completed'].includes(task.status))
        .map((task: any) => ({
          _id: task._id,
          title: task.title,
          status: task.status,
          subtasks: Array.isArray(task.subtasks) ? task.subtasks : []
        }))
    } catch (err) {
      console.error('Failed to check sprint tasks:', err)
      return []
    }
  }

  const handleSprintLifecycleAction = async (sprintId: string, action: 'start' | 'complete', hasTasks = true) => {
    if (action === 'start' && !canStartSprint) {
      setError('You do not have permission to start sprints.')
      return
    }
    if (action === 'complete' && !canCompleteSprint) {
      setError('You do not have permission to complete sprints.')
      return
    }
    if (!hasTasks) {
      setError('Add tasks to this sprint before performing this action.')
      return
    }
    if (action === 'complete') {
      const incomplete = await checkSprintForIncompleteTasks(sprintId)

      if (incomplete.length > 0) {
        setIncompleteTasks(incomplete)
        // Initialize all tasks as selected by default
        setSelectedTaskIds(new Set(incomplete.map(task => task._id)))
        setCompletingSprintId(sprintId)
        setCompleteModalOpen(true)
        const sprint = sprints.find(s => s._id === sprintId)
        const available = await loadAvailableSprints(sprintId, sprint?.project?._id)

        if (sprint) {
          const baseStart = sprint.endDate ? new Date(sprint.endDate) : new Date()
          const startDate = formatDateInputValue(baseStart)
          const endDateObj = new Date(baseStart)
          endDateObj.setDate(endDateObj.getDate() + 14)
          const endDate = formatDateInputValue(endDateObj)

          // Determine next sprint number
          const currentSprintName = sprint.name
          const sprintNumberMatch = currentSprintName.match(/Sprint (\d+)/)
          let nextSprintNumber = 1

          if (sprintNumberMatch) {
            nextSprintNumber = parseInt(sprintNumberMatch[1]) + 1
          } else {
            // If current sprint doesn't follow "Sprint X" pattern, get total count
            try {
              const countResponse = await fetch('/api/sprints?countOnly=true')
              const countData = await countResponse.json()
              if (countData.success) {
                nextSprintNumber = countData.count + 1
              }
            } catch (err) {
              console.error('Failed to get sprint count:', err)
            }
          }

          const nextSprintName = `Sprint ${nextSprintNumber}`

          // Check if next sprint already exists
          const allSprintsResponse = await fetch('/api/sprints?limit=200')
          const allSprintsData = await allSprintsResponse.json()

          if (allSprintsData.success) {
            const allSprintsList = allSprintsData.data || []
            const nextSprint = allSprintsList.find((s: Sprint) => s.name === nextSprintName)

            if (nextSprint && ['planning', 'active'].includes(nextSprint.status)) {
              // Next sprint exists - auto-select it
              setSelectedTargetSprintId(nextSprint._id)
              setCompletionMode('existing')
            } else {
              // Next sprint doesn't exist - pre-fill create form
              setCompletionMode('new')
            }
          } else if (available.length === 0) {
            // No other available sprints - default to creating a new one
            setCompletionMode('new')
          }

          setNewSprintForm({
            name: nextSprintName,
            startDate,
            endDate,
            capacity: sprint.capacity ? String(sprint.capacity) : ''
          })
        }
        return
      }
    }

    try {
      setUpdatingSprintId(sprintId)
      setError('')

      const response = await fetch(`/api/sprints/${sprintId}/${action}`, {
        method: 'POST'
      })
      const data = await response.json()

      if (!response.ok || !data.success) {
        setError(data.error || `Failed to ${action} sprint`)
        return
      }

      setSprints(prev => prev.map(s => (s._id === sprintId ? data.data : s)))
      notifySuccess({ title: action === 'start' ? 'Sprint started successfully' : 'Sprint completed successfully' })
    } catch (err) {
      console.error(`${action} sprint error:`, err)
      setError(`Failed to ${action} sprint`)
    } finally {
      setUpdatingSprintId(null)
    }
  }

  const finalizeCompleteSprint = async (targetSprintId?: string, newSprintData?: Sprint) => {
    if (!completingSprintId) return

    const options: RequestInit = { method: 'POST' }
    if (targetSprintId || selectedTaskIds.size > 0) {
      options.headers = { 'Content-Type': 'application/json' }
      options.body = JSON.stringify({
        targetSprintId,
        selectedTaskIds: Array.from(selectedTaskIds)
      })
    }

    const res = await fetch(`/api/sprints/${completingSprintId}/complete`, options)
    const data = await res.json().catch(() => ({}))

    if (!res.ok || !data.success) {
      // If there are incomplete subtasks, format the error message
      if (data.incompleteSubtasks && Array.isArray(data.incompleteSubtasks)) {
        const taskList = data.incompleteSubtasks
          .map((item: any) => `"${item.taskTitle}" (${item.incompleteSubtasks.length} incomplete)`)
          .join(', ')
        throw new Error(`Cannot complete sprint. Tasks with incomplete sub-tasks: ${taskList}`)
      }
      throw new Error(data.error || 'Failed to complete sprint')
    }

    setSprints(prev => {
      let updated = prev.map(s => (s._id === completingSprintId ? data.data : s))

      // If a new sprint was created, add it to the list
      if (newSprintData) {
        // Check if it's not already in the list
        const exists = updated.some(s => s._id === newSprintData._id)
        if (!exists) {
          updated = [newSprintData, ...updated]
        }
      }

      return updated
    })
    notifySuccess({ title: 'Sprint completed successfully' })
    setCompleteModalOpen(false)
    setCompletingSprintId(null)
    setIncompleteTasks([])
    setSelectedTaskIds(new Set())
    setSelectedTargetSprintId('')
    setCompleteError('')
  }

  const handleCompleteModalConfirm = async () => {
    if (!completingSprintId) return

    if (!incompleteTasks.length) {
      try {
        setUpdatingSprintId(completingSprintId)
        await finalizeCompleteSprint()
      } catch (err) {
        setCompleteError(err instanceof Error ? err.message : 'Failed to complete sprint')
      } finally {
        setUpdatingSprintId(null)
      }
      return
    }

    // If no tasks are selected, move all to backlog
    if (selectedTaskIds.size === 0) {
      try {
        setUpdatingSprintId(completingSprintId)
        await finalizeCompleteSprint() // No targetSprintId means move all to backlog
      } catch (err) {
        setCompleteError(err instanceof Error ? err.message : 'Failed to complete sprint')
      } finally {
        setUpdatingSprintId(null)
      }
      return
    }

    if (completionMode === 'existing') {
      if (!selectedTargetSprintId) {
        setCompleteError('Select a sprint to move the remaining tasks into.')
        return
      }
      try {
        setUpdatingSprintId(completingSprintId)
        await finalizeCompleteSprint(selectedTargetSprintId)
      } catch (err) {
        setCompleteError(err instanceof Error ? err.message : 'Failed to move tasks to the selected sprint')
      } finally {
        setUpdatingSprintId(null)
      }
      return
    }

    if (!newSprintForm.name || !newSprintForm.startDate || !newSprintForm.endDate) {
      setCompleteError('Provide a name and date range for the new sprint.')
      return
    }

    const sprint = sprints.find(s => s._id === completingSprintId)
    if (!sprint?.project?._id) {
      setCompleteError('Sprint project information is missing.')
      return
    }

    try {
      setUpdatingSprintId(completingSprintId)

      let teamMemberIds: string[] = []
      if (sprint.teamMembers && sprint.teamMembers.length > 0) {
        const fullSprintResponse = await fetch(`/api/sprints/${completingSprintId}`)
        const fullSprintData = await fullSprintResponse.json()
        if (fullSprintResponse.ok && fullSprintData.success) {
          teamMemberIds = (fullSprintData.data?.teamMembers || [])
            .map((m: any) => m._id || m)
            .filter(Boolean)
        } else {
          teamMemberIds = sprint.teamMembers
            .map((m: any) => m._id || m)
            .filter(Boolean)
        }
      }

      const createResponse = await fetch('/api/sprints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSprintForm.name,
          description: `Auto-created from completion of ${sprint.name}`,
          project: sprint.project._id,
          startDate: newSprintForm.startDate,
          endDate: newSprintForm.endDate,
          goal: sprint.goal,
          capacity: Number(newSprintForm.capacity) || sprint.capacity,
          teamMembers: teamMemberIds
        })
      })

      const createdSprint = await createResponse.json()
      if (!createResponse.ok || !createdSprint.success) {
        throw new Error(createdSprint.error || 'Failed to create sprint')
      }

      const newSprintId = createdSprint.data?._id
      if (!newSprintId) {
        throw new Error('New sprint ID missing in response')
      }

      // Fetch full sprint details to get all populated fields
      const fullSprintResponse = await fetch(`/api/sprints/${newSprintId}`)
      const fullSprintData = await fullSprintResponse.json()

      let newSprint: Sprint | undefined
      if (fullSprintResponse.ok && fullSprintData.success) {
        newSprint = fullSprintData.data
      } else {
        // Fallback to the created sprint data if fetch fails
        newSprint = createdSprint.data
      }

      await finalizeCompleteSprint(newSprintId, newSprint)
    } catch (err) {
      setCompleteError(err instanceof Error ? err.message : 'Failed to create sprint')
    } finally {
      setUpdatingSprintId(null)
    }
  }

  const isCompleteConfirmDisabled = () => {
    if (updatingSprintId === completingSprintId) return true
    if (!incompleteTasks.length) return false

    // If no tasks are selected, allow completion (will move all to backlog)
    if (selectedTaskIds.size === 0) return false

    // If tasks are selected, require destination selection
    if (completionMode === 'existing') {
      return !selectedTargetSprintId
    }
    return !newSprintForm.name || !newSprintForm.startDate || !newSprintForm.endDate
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planning': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900'
      case 'active': return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900'
      case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900'
      case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'planning':
        return (<Calendar className="h-4 w-4" />)
      case 'active':
        return (<Play className="h-4 w-4" />)
      case 'completed':
        return (<CheckCircle className="h-4 w-4" />)
      case 'cancelled':
        return (<XCircle className="h-4 w-4" />)
      default:
        return (<Calendar className="h-4 w-4" />)
    }
  }

  // Load projects from API for filter dropdown
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const response = await fetch('/api/projects?limit=1000&page=1')
        if (response.ok) {
          const data = await response.json()
          if (data.success && Array.isArray(data.data)) {
            const projects = data.data.map((p: any) => ({ _id: p._id, name: p.name }))
            setProjectOptions(prev => {
              const combined = new Map<string, { _id: string; name: string }>()
              prev.forEach(p => combined.set(p._id, p))
              projects.forEach((p: { _id: string; name: string }) => combined.set(p._id, p))
              return Array.from(combined.values()).sort((a, b) => a.name.localeCompare(b.name))
            })
          }
        }
      } catch (err) {
        console.error('Failed to load projects:', err)
      }
    }
    loadProjects()
  }, [])

  // Filter project options based on search query
  const filteredProjectOptions = useMemo(() => {
    const query = projectFilterQuery.trim().toLowerCase()
    if (!query) return projectOptions
    return projectOptions.filter((project) => project.name.toLowerCase().includes(query))
  }, [projectOptions, projectFilterQuery])

  // Server handles all filtering — sprints returned are already filtered
  const filteredSprints = sprints

  // Convenience aliases wiring lifecycle actions to simpler handlers for the card UI
  const handleStartSprint = (sprintId: string) => {
    const sprint = sprints.find(s => s._id === sprintId)
    const totalTasks = sprint?.progress?.totalTasks ?? (Array.isArray(sprint?.tasks) ? sprint!.tasks!.length : 0)
    handleSprintLifecycleAction(sprintId, 'start', totalTasks > 0)
  }

  const handleCompleteSprintClick = (sprintId: string) => {
    const sprint = sprints.find(s => s._id === sprintId)
    const totalTasks = sprint?.progress?.totalTasks ?? (Array.isArray(sprint?.tasks) ? sprint!.tasks!.length : 0)
    handleSprintLifecycleAction(sprintId, 'complete', totalTasks > 0)
  }

  if (loading) {
    return (
      <MainLayout>
        <FullPageLoader label="Loading sprints..." />
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6 overflow-x-hidden animate-in fade-in-0 duration-300">

        {/* Page Header */}
        <PageHeader
          title="Sprints"
          subtitle="Manage your agile sprints and iterations"
          icon={Zap}
          actions={
            canCreateSprint ? (
              <Button
                onClick={() => router.push('/sprints/create')}
                className="w-full sm:w-auto rounded-full bg-[var(--apple-system-blue)] text-white hover:opacity-90 apple-transition"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Sprint
              </Button>
            ) : undefined
          }
        />

        {/* Filter Toolbar */}
        <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] p-4 space-y-3">
          {/* Row 1: Search + Status + Project */}
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--apple-tertiary-label)]" />
              <Input
                placeholder="Search sprints..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10 rounded-full border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[15px] focus:border-[var(--apple-system-blue)] focus:ring-2 focus:ring-[var(--apple-system-blue)]/20 apple-transition"
              />
            </div>
            {/* Status */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-full sm:w-40 rounded-full border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[13px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="planning">Planning</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            {/* Project */}
            <Select value={projectFilter} onValueChange={setProjectFilter} onOpenChange={(open) => {
              if (open) focusSearchInput(projectSearchInputRef.current)
            }}>
              <SelectTrigger className="h-9 w-full sm:w-44 rounded-full border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[13px]">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent className="z-[10050] p-0">
                <div className="p-2">
                  <div className="relative mb-2">
                    <Input
                      ref={projectSearchInputRef}
                      value={projectFilterQuery}
                      onChange={(e) => setProjectFilterQuery(e.target.value)}
                      placeholder="Search projects"
                      className="pr-10"
                      onKeyDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                    {projectFilterQuery && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setProjectFilterQuery('')
                          setProjectFilter('all')
                        }}
                        className="absolute inset-y-0 right-0 flex items-center px-2 text-[var(--apple-tertiary-label)] hover:text-[var(--apple-label)]"
                        aria-label="Clear project filter"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    <SelectItem value="all">All Projects</SelectItem>
                    {filteredProjectOptions.length === 0 ? (
                      <div className="px-2 py-1 text-xs text-[var(--apple-secondary-label)]">No matching projects</div>
                    ) : (
                      filteredProjectOptions.map((project) => (
                        <SelectItem key={project._id} value={project._id}>
                          {project.name}
                        </SelectItem>
                      ))
                    )}
                  </div>
                </div>
              </SelectContent>
            </Select>
          </div>

          {/* Row 2: count + reset */}
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-[var(--apple-secondary-label)] flex items-center gap-2">
              {isFetching && (
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--apple-system-blue)] border-t-transparent" />
              )}
              <span className="font-apple-mono">{totalCount}</span>
              {' '}sprint{totalCount !== 1 ? 's' : ''} found
            </p>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-7 text-[12px] text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)] rounded-full"
                aria-label="Reset all filters"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset Filters
              </Button>
            )}
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex items-center justify-end">
          <ViewSwitcher
            value={viewMode as any}
            onChange={(v) => setViewMode(v as any)}
            options={['grid', 'list']}
          />
        </div>

        {/* Sprint Cards — Grid View */}
        {viewMode === 'grid' && (
          filteredSprints.length === 0 ? (
            <TasksEmptyState
              icon={<Zap className="h-10 w-10" />}
              title="No sprints found"
              description="Create your first sprint to start planning iterations."
            />
          ) : (
            <div className="grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {filteredSprints.map((sprint) => {
                const totalTasks = sprint?.progress?.totalTasks ?? (Array.isArray(sprint?.tasks) ? sprint.tasks!.length : 0)
                const hasTasks = totalTasks > 0

                return (
                  <div
                    key={sprint._id}
                    className={cn(
                      "card-fade-in group rounded-[var(--apple-radius-xl)] border border-[var(--apple-separator)] bg-card overflow-hidden",
                      "shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none",
                      "hover:shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_8px_32px_rgba(0,0,0,0.40)]",
                      "hover:-translate-y-0.5 apple-transition cursor-pointer"
                    )}
                    onClick={() => canViewSprint && router.push(`/sprints/${sprint._id}`)}
                  >
                    {/* Top accent bar */}
                    <div className="h-1 w-full" style={{ background: 'var(--apple-card-gradient)' }} />

                    <div className="p-5 space-y-4">
                      {/* Header: title + status badge + dropdown */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-[17px] font-semibold text-[var(--apple-label)] truncate">{sprint.name}</h3>
                          <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">{sprint.project?.name || '—'}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <StatusBadge status={sprint.status} />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => e.stopPropagation()}
                                className="h-7 w-7 p-0 rounded-[var(--apple-radius-sm)] hover:bg-[var(--apple-tertiary-fill)]"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem
                                disabled={!canViewSprint}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (!canViewSprint) return
                                  router.push(`/sprints/${sprint._id}`)
                                }}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                View Sprint
                              </DropdownMenuItem>
                              {canEditSprint && (
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    router.push(`/sprints/${sprint._id}/edit`)
                                  }}
                                >
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit Sprint
                                </DropdownMenuItem>
                              )}
                              {canDeleteSprint && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleDeleteClick(sprint._id)
                                    }}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Sprint
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      {/* Progress section */}
                      <div className="space-y-2">
                        <GradientProgress
                          pct={sprint.progress?.completionPercentage ?? 0}
                          colorIndex={0}
                          label="Progress"
                          showPct={true}
                        />
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[var(--apple-tertiary-label)]">
                            {sprint.progress?.tasksCompleted ?? 0} / {sprint.progress?.totalTasks ?? 0} tasks
                          </span>
                          <span className="text-[11px] text-[var(--apple-tertiary-label)] font-apple-mono">
                            {sprint.progress?.storyPointsCompleted ?? 0} / {sprint.progress?.totalStoryPoints ?? 0} pts
                          </span>
                        </div>
                      </div>

                      {/* Meta chips */}
                      <div className="grid grid-cols-2 gap-2">
                        <MetaChip
                          icon={<Calendar className="h-3.5 w-3.5" />}
                          label={`${formatDate(sprint.startDate)} → ${formatDate(sprint.endDate)}`}
                          className={!sprint.teamMembers?.length ? 'col-span-2' : ''}
                        />
                        {sprint.teamMembers?.length > 0 && (
                          <MetaChip icon={<Users className="h-3.5 w-3.5" />} label={`${sprint.teamMembers.length} members`} />
                        )}
                        {sprint.capacity > 0 && (
                          <MetaChip icon={<Users className="h-3.5 w-3.5" />} label={`${sprint.capacity} pts capacity`} />
                        )}
                        {sprint.velocity > 0 && (
                          <MetaChip icon={<TrendingUp className="h-3.5 w-3.5" />} label={`${sprint.velocity} velocity`} />
                        )}
                      </div>

                      {/* Sprint goal */}
                      {sprint.goal && (
                        <p className="text-[12px] text-[var(--apple-secondary-label)] line-clamp-2 italic border-l-2 border-[var(--apple-system-blue)] pl-2">
                          {sprint.goal}
                        </p>
                      )}

                      {/* Action row */}
                      <div className="flex items-center gap-2">
                        {sprint.status === 'planning' && canStartSprint && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[12px] rounded-full border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                            disabled={updatingSprintId === sprint._id || !hasTasks}
                            title={!hasTasks ? 'Add tasks to this sprint before starting it.' : undefined}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleStartSprint(sprint._id)
                            }}
                          >
                            <Play className="h-3 w-3 mr-1" />
                            {updatingSprintId === sprint._id ? 'Starting...' : 'Start'}
                          </Button>
                        )}
                        {sprint.status === 'active' && canCompleteSprint && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[12px] rounded-full"
                            disabled={updatingSprintId === sprint._id || !hasTasks}
                            title={!hasTasks ? 'Add tasks to this sprint before completing it.' : undefined}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCompleteSprintClick(sprint._id)
                            }}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {updatingSprintId === sprint._id ? 'Completing...' : 'Complete'}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[12px] ml-auto rounded-[var(--apple-radius-sm)] text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]"
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/sprints/${sprint._id}`)
                          }}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          View
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* Sprint Rows — List View */}
        {viewMode === 'list' && (
          filteredSprints.length === 0 ? (
            <TasksEmptyState
              icon={<Zap className="h-10 w-10" />}
              title="No sprints found"
              description="Create your first sprint to start planning iterations."
            />
          ) : (
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none">
              {filteredSprints.map((sprint) => {
                const totalTasks = sprint?.progress?.totalTasks ?? (Array.isArray(sprint?.tasks) ? sprint.tasks!.length : 0)
                const hasTasks = totalTasks > 0

                return (
                  <div
                    key={sprint._id}
                    className={cn(
                      'group px-5 py-4',
                      'border-b border-[var(--apple-separator)] last:border-0',
                      'cursor-pointer apple-transition hover:bg-[var(--apple-quaternary-fill)]',
                      // Mobile/tablet: stack vertically
                      'flex flex-col gap-3',
                      // Desktop: single-row grid
                      'lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(160px,2fr)_100px_120px_auto] lg:gap-x-6 lg:items-center lg:gap-y-0',
                    )}
                    onClick={() => canViewSprint && router.push(`/sprints/${sprint._id}`)}
                  >
                    {/* 1 — Identity: name + project | date + members (single row on desktop) */}
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[15px] font-semibold text-[var(--apple-label)] group-hover:text-[var(--apple-system-blue)] apple-transition truncate leading-snug">
                            {sprint.name}
                          </p>
                          <p className="text-[12px] text-[var(--apple-secondary-label)] truncate mt-0.5">
                            {sprint.project?.name}
                          </p>
                        </div>
                        {/* Mobile/tablet: status badge inline top-right */}
                        <div className="flex-shrink-0 lg:hidden">
                          <StatusBadge status={sprint.status} size="sm" />
                        </div>
                        {/* Desktop: date + members on the right of the identity cell */}
                        <div className="hidden lg:flex items-center gap-4 flex-shrink-0 text-[12px] text-[var(--apple-secondary-label)]">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3 w-3 text-[var(--apple-tertiary-label)]" />
                            <span className="whitespace-nowrap">{formatDate(sprint.startDate)} → {formatDate(sprint.endDate)}</span>
                          </div>
                          {(sprint.teamMembers?.length ?? 0) > 0 && (
                            <div className="flex items-center gap-1.5">
                              <Users className="h-3 w-3 text-[var(--apple-tertiary-label)]" />
                              <span className="whitespace-nowrap">{sprint.teamMembers.length} members</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Mobile/tablet: date + members below name, space-between */}
                      <div className="flex items-center justify-between mt-1.5 lg:hidden text-[12px] text-[var(--apple-secondary-label)]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Calendar className="h-3 w-3 text-[var(--apple-tertiary-label)] flex-shrink-0" />
                          <span className="truncate">{formatDate(sprint.startDate)} → {formatDate(sprint.endDate)}</span>
                        </div>
                        {(sprint.teamMembers?.length ?? 0) > 0 && (
                          <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
                            <Users className="h-3 w-3 text-[var(--apple-tertiary-label)]" />
                            <span>{sprint.teamMembers.length} members</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 2 — Progress: bar + task/point stats */}
                    <div className="min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-medium text-[var(--apple-tertiary-label)] uppercase tracking-wide">Progress</span>
                        <span className="text-[11px] font-apple-mono text-[var(--apple-secondary-label)]">
                          {sprint.progress?.completionPercentage ?? 0}%
                        </span>
                      </div>
                      <GradientProgress pct={sprint.progress?.completionPercentage ?? 0} colorIndex={0} showPct={false} />
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[11px] text-[var(--apple-tertiary-label)]">
                          {sprint.progress?.tasksCompleted ?? 0}/{sprint.progress?.totalTasks ?? 0} tasks
                        </span>
                        {(sprint.progress?.totalStoryPoints ?? 0) > 0 && (
                          <span className="text-[11px] font-apple-mono text-[var(--apple-tertiary-label)]">
                            {sprint.progress?.storyPointsCompleted ?? 0}/{sprint.progress?.totalStoryPoints ?? 0} pts
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 3 — Status badge (desktop-only column; hidden on mobile/tablet where it shows inline above) */}
                    <div className="hidden lg:flex items-center justify-center">
                      <StatusBadge status={sprint.status} size="sm" />
                    </div>

                    {/* 4+5 — Action + Dropdown: flex row on mobile/tablet, two separate grid cells on desktop */}
                    <div className="flex items-center gap-2 lg:contents">
                      {/* Action button */}
                      <div className="flex items-center flex-1 lg:flex-none" onClick={(e) => e.stopPropagation()}>
                        {sprint.status === 'planning' && canStartSprint && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[12px] rounded-full whitespace-nowrap w-full border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                            disabled={updatingSprintId === sprint._id || !hasTasks}
                            title={!hasTasks ? 'Add tasks to this sprint before starting it.' : undefined}
                            onClick={() => handleStartSprint(sprint._id)}
                          >
                            <Play className="h-3 w-3 mr-1" />
                            {updatingSprintId === sprint._id ? 'Starting...' : 'Start'}
                          </Button>
                        )}
                        {sprint.status === 'active' && canCompleteSprint && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[12px] rounded-full whitespace-nowrap w-full"
                            disabled={updatingSprintId === sprint._id || !hasTasks}
                            title={!hasTasks ? 'Add tasks to this sprint before completing it.' : undefined}
                            onClick={() => handleCompleteSprintClick(sprint._id)}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {updatingSprintId === sprint._id ? 'Completing...' : 'Complete'}
                          </Button>
                        )}
                        {sprint.status === 'completed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[12px] rounded-full whitespace-nowrap w-full opacity-50 cursor-not-allowed"
                            disabled
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Completed
                          </Button>
                        )}
                      </div>

                      {/* Dropdown */}
                      <div onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 rounded-[var(--apple-radius-sm)] hover:bg-[var(--apple-tertiary-fill)]"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={!canViewSprint}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (!canViewSprint) return
                                router.push(`/sprints/${sprint._id}`)
                              }}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Sprint
                            </DropdownMenuItem>
                            {canEditSprint && (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(`/sprints/${sprint._id}/edit`)
                                }}
                              >
                                <Edit className="h-4 w-4 mr-2" />
                                Edit Sprint
                              </DropdownMenuItem>
                            )}
                            {canDeleteSprint && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDeleteClick(sprint._id)
                                  }}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Sprint
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* Pagination */}
        {totalCount > 0 && (
          <PaginationBar
            currentPage={currentPage}
            totalPages={Math.ceil(totalCount / pageSize) || 1}
            totalCount={totalCount}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setCurrentPage(1)
            }}
            loading={isFetching}
          />
        )}

        {/* Complete Sprint Modal */}
        <ResponsiveDialog
          open={completeModalOpen}
          onOpenChange={(open) => {
            if (!open) {
              setCompleteModalOpen(false)
              setCompleteError('')
              setSelectedTargetSprintId('')
              setCompletionMode('existing')
              setCompletingSprintId(null)
              setIncompleteTasks([])
              setExpandedTasks(new Set())
              return
            }
            setCompleteModalOpen(true)
          }}
          title="Complete Sprint"
          description={incompleteTasks.length > 0 ? `There are ${incompleteTasks.length} incomplete task${incompleteTasks.length === 1 ? '' : 's'}. Move them before completing the sprint.` : 'All tasks are completed. You can finish the sprint now.'}
          footer={
            <div className="flex flex-col sm:flex-row sm:justify-end gap-2 w-full">
              <Button
                variant="outline"
                onClick={() => {
                  setCompleteModalOpen(false)
                  setCompleteError('')
                  setSelectedTargetSprintId('')
                  setCompletionMode('existing')
                  setCompletingSprintId(null)
                  setIncompleteTasks([])
                  setSelectedTaskIds(new Set())
                  setExpandedTasks(new Set())
                }}
                disabled={updatingSprintId === completingSprintId}
              >
                Cancel
              </Button>
              {incompleteTasks.length > 0 && selectedTaskIds.size === 0 ? (
                <Button
                  onClick={handleCompleteModalConfirm}
                  disabled={updatingSprintId === completingSprintId}
                >
                  {updatingSprintId === completingSprintId ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Move Tasks to backlog and Complete Sprint
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={handleCompleteModalConfirm}
                  disabled={isCompleteConfirmDisabled()}
                >
                  {updatingSprintId === completingSprintId ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Complete Sprint
                    </>
                  )}
                </Button>
              )}
            </div>
          }
        >
          <div className="space-y-4">
            {completeError && (
              <Alert variant="destructive">
                <AlertDescription>{completeError}</AlertDescription>
              </Alert>
            )}

            {incompleteTasks.length > 0 ? (
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium text-foreground">
                      Incomplete Tasks
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (selectedTaskIds.size === incompleteTasks.length) {
                          setSelectedTaskIds(new Set())
                        } else {
                          setSelectedTaskIds(new Set(incompleteTasks.map(t => t._id)))
                        }
                      }}
                      className="h-7 text-xs"
                    >
                      {selectedTaskIds.size === incompleteTasks.length ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Select tasks to move to the next sprint. Unselected tasks will return to backlog.
                  </p>
                  <div className="mt-2 space-y-2 max-h-64 overflow-y-auto pr-1">
                    {incompleteTasks.map(task => {
                      const incompleteSubtasks = getIncompleteSubtasks(task)
                      const hasIncompleteSubtasks = incompleteSubtasks.length > 0
                      const isExpanded = expandedTasks.has(task._id)
                      const isSelected = selectedTaskIds.has(task._id)

                      return (
                        <div key={task._id} className={`rounded-md border px-3 py-2 space-y-2 transition-colors ${isSelected ? 'bg-muted/40 border-primary/30' : 'bg-muted/20 border-muted'}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const newSelected = new Set(selectedTaskIds)
                                  if (e.target.checked) {
                                    newSelected.add(task._id)
                                  } else {
                                    newSelected.delete(task._id)
                                  }
                                  setSelectedTaskIds(newSelected)
                                }}
                                className="rounded flex-shrink-0 cursor-pointer"
                              />
                              {hasIncompleteSubtasks && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleTaskExpansion(task._id)
                                  }}
                                  className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-all hover:scale-110 active:scale-95 p-0.5 rounded hover:bg-muted/50"
                                  aria-label={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
                                  title={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4 transition-transform" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 transition-transform" />
                                  )}
                                </button>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate" title={task.title}>
                                  {task.title}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Current status: {formatTaskStatusLabel(task.status)}
                                </p>
                                {hasIncompleteSubtasks && (
                                  <p className="text-xs font-medium text-orange-600 dark:text-orange-400 mt-1">
                                    {incompleteSubtasks.length} incomplete sub-task{incompleteSubtasks.length === 1 ? '' : 's'}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>

                          {isExpanded && hasIncompleteSubtasks && (
                            <div className="ml-6 space-y-2 border-l-2 border-primary/20 dark:border-primary/30 pl-3 pt-1 overflow-hidden transition-all duration-300 ease-in-out">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                Incomplete Sub-tasks
                              </p>
                              <div className="space-y-2">
                                {incompleteSubtasks.map((subtask: any, index: number) => (
                                  <div
                                    key={subtask._id || `subtask-${index}`}
                                    className="rounded-md border p-2.5 space-y-1.5 transition-all hover:shadow-sm bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex items-start gap-2 flex-1 min-w-0">
                                        <AlertTriangle className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs font-medium text-foreground" title={subtask.title}>
                                            {subtask.title}
                                          </p>
                                          {subtask.description && (
                                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                              {subtask.description}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                      <Badge
                                        className={`${TASK_STATUS_BADGE_MAP[subtask.status] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'} text-[10px] flex-shrink-0`}
                                      >
                                        {formatTaskStatusLabel(subtask.status)}
                                      </Badge>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {selectedTaskIds.size === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    All incomplete tasks will be moved to the backlog.
                  </p>
                ) : (
                  <>
                    {selectedTaskIds.size === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        All incomplete tasks will be moved to the backlog.
                      </p>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant={completionMode === 'existing' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => {
                              setCompletionMode('existing')
                              setSelectedTargetSprintId('')
                              setCompleteError('')
                            }}
                            disabled={availableSprintsLoading || availableSprints.length === 0}
                          >
                            Move to Next Sprint
                          </Button>
                          <Button
                            type="button"
                            variant={completionMode === 'new' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => {
                              setCompletionMode('new')
                              setCompleteError('')
                            }}
                          >
                            Create New Sprint
                          </Button>
                        </div>

                        {completionMode === 'existing' ? (
                          <div className="space-y-2">
                            <Label className="text-sm text-foreground">Select Sprint</Label>
                            <Select
                              value={selectedTargetSprintId}
                              onValueChange={(value) => setSelectedTargetSprintId(value)}
                              disabled={availableSprintsLoading || availableSprints.length === 0}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={availableSprintsLoading ? 'Loading...' : 'Choose sprint'} />
                              </SelectTrigger>
                              <SelectContent>
                                {availableSprintsLoading ? (
                                  <div className="px-2 py-1 text-sm text-muted-foreground">
                                    Loading sprints...
                                  </div>
                                ) : availableSprints.length === 0 ? (
                                  <div className="px-2 py-1 text-sm text-muted-foreground">
                                    No planning or active sprints available. Create a new sprint instead.
                                  </div>
                                ) : (
                                  availableSprints.map(option => (
                                    <SelectItem key={option._id} value={option._id}>
                                      <div className="flex flex-col">
                                        <span className="font-medium">{option.name}</span>
                                        {option.project?.name && (
                                          <span className="text-xs text-muted-foreground">
                                            Project: {option.project.name}
                                          </span>
                                        )}
                                      </div>
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <Label className="text-sm text-foreground">Sprint Name</Label>
                              <Input
                                value={newSprintForm.name}
                                onChange={(event) =>
                                  setNewSprintForm(prev => ({ ...prev, name: event.target.value }))
                                }
                                placeholder="Sprint name"
                              />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-sm text-foreground">Start Date</Label>
                                <Input
                                  type="date"
                                  value={newSprintForm.startDate}
                                  onChange={(event) =>
                                    setNewSprintForm(prev => ({ ...prev, startDate: event.target.value }))
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-sm text-foreground">End Date</Label>
                                <Input
                                  type="date"
                                  value={newSprintForm.endDate}
                                  onChange={(event) =>
                                    setNewSprintForm(prev => ({ ...prev, endDate: event.target.value }))
                                  }
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-sm text-foreground">Capacity (hours)</Label>
                              <Input
                                type="number"
                                min="0"
                                value={newSprintForm.capacity}
                                onChange={(event) =>
                                  setNewSprintForm(prev => ({ ...prev, capacity: event.target.value }))
                                }
                                placeholder="Team capacity"
                              />
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                All tasks in this sprint are completed. You can finish the sprint immediately.
              </p>
            )}
          </div>
        </ResponsiveDialog>

        {/* Delete Confirmation Modal */}
        <ConfirmationModal
          isOpen={showDeleteConfirmModal}
          onClose={() => {
            setShowDeleteConfirmModal(false)
            setSelectedSprintId(null)
          }}
          onConfirm={handleDeleteConfirm}
          title="Delete Sprint"
          description="Are you sure you want to delete this sprint? This action cannot be undone."
          confirmText={deleting ? 'Deleting...' : 'Delete'}
          cancelText="Cancel"
          variant="destructive"
        />
      </div>
    </MainLayout>
  )
}
