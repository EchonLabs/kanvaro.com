'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { Calendar as DateRangeCalendar } from '@/components/ui/calendar'
import { cn, formatToTitleCase } from '@/lib/utils'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import {
    Plus,
    Search,
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
    Eye,
    Settings,
    Edit,
    Trash2,
    X,
    RotateCcw
} from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useDebounce } from '@/hooks/useDebounce'
import { useProjectKanbanStatuses } from '@/hooks/useProjectKanbanStatuses'
import dynamic from 'next/dynamic'
import { extractUserId } from '@/lib/auth/user-utils'
import { useNotify } from '@/lib/notify'
import { Permission, PermissionGate } from '@/lib/permissions'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { format } from 'date-fns'
import { DateRange } from 'react-day-picker'
import { DEFAULT_TASK_STATUS_KEYS, type TaskStatusKey } from '@/constants/taskStatuses'

import CreateTaskModal from './CreateTaskModal'
type KanbanBoardComponentProps = {
    projectId: string
    filters?: {
        search?: string
        status?: string
        priority?: string
        type?: string
        assignedTo?: string
        createdBy?: string
        createdAtFrom?: string
        createdAtTo?: string
    }
    onProjectChange?: (projectId: string) => void
    onCreateTask: () => void
    onEditTask?: (task: any) => void
    onDeleteTask?: (taskId: string) => void
}

const KanbanBoard = dynamic<KanbanBoardComponentProps>(() => import('./KanbanBoard'), { ssr: false })

interface Task {
    _id: string
    title: string
    description: string
    status: TaskStatusKey
    priority: 'low' | 'medium' | 'high' | 'critical'
    type: 'bug' | 'feature' | 'improvement' | 'task' | 'subtask'
    displayId?: string
    project: {
        _id: string
        name: string
    }
    assignedTo?: {
        _id: string
        firstName: string
        lastName: string
        email: string
    }
    createdBy: {
        _id: string
        firstName: string
        lastName: string
        email: string
    }
    storyPoints?: number
    dueDate?: string
    estimatedHours?: number
    actualHours?: number
    labels: string[]
    sprint?: {
        _id: string
        name: string
    } | null
    createdAt: string
    updatedAt: string
}

interface ProjectSummary {
    _id: string
    name: string
}

interface UserSummary {
    _id: string
    firstName: string
    lastName: string
    email: string
}

interface TasksClientProps {
    initialTasks: Task[]
    initialPagination: any
    initialFilters?: {
        search?: string
        status?: string
        priority?: string
        type?: string
        project?: string
        assignedTo?: string
        createdBy?: string
        dueDateFrom?: string
        dueDateTo?: string
        createdAtFrom?: string
        createdAtTo?: string
    }
}

const TASKS_MODULE_STATUS_VALUES = ['backlog', 'todo', 'in_progress', 'review', 'testing', 'done', 'cancelled'] as const

export default function TasksClient({
    initialTasks,
    initialPagination,
    initialFilters = {}
}: TasksClientProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { hasPermission } = usePermissions()
    const { formatDate } = useDateTime()
    const canViewAllTasks = hasPermission(Permission.PROJECT_VIEW_ALL)

    const [tasks, setTasks] = useState<Task[]>(initialTasks)
    const [pagination, setPagination] = useState(initialPagination)
    const [currentPage, setCurrentPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)
    const [totalCount, setTotalCount] = useState(() =>
        typeof initialPagination?.total === 'number' ? initialPagination.total : initialTasks?.length || 0
    )
    const [loading, setLoading] = useState(false)
    const [searchQuery, setSearchQuery] = useState(initialFilters.search || '')
    const [statusFilter, setStatusFilter] = useState(initialFilters.status || 'all')
    const [priorityFilter, setPriorityFilter] = useState(initialFilters.priority || 'all')
    const [typeFilter, setTypeFilter] = useState(initialFilters.type || 'all')
    const [projectFilter, setProjectFilter] = useState(initialFilters.project || 'all')
    const [assignedToFilter, setAssignedToFilter] = useState(initialFilters.assignedTo || 'all')
    const [createdByFilter, setCreatedByFilter] = useState(initialFilters.createdBy || 'all')
    const [dateRangeFilter, setDateRangeFilter] = useState<DateRange | undefined>(
        initialFilters.createdAtFrom || initialFilters.createdAtTo
            ? {
                from: initialFilters.createdAtFrom ? new Date(initialFilters.createdAtFrom) : undefined,
                to: initialFilters.createdAtTo ? new Date(initialFilters.createdAtTo) : undefined,
            }
            : undefined
    )
    const [projectOptions, setProjectOptions] = useState<ProjectSummary[]>([])
    const [assignedToOptions, setAssignedToOptions] = useState<UserSummary[]>([])
    const [createdByOptions, setCreatedByOptions] = useState<UserSummary[]>([])
    const [projectFilterQuery, setProjectFilterQuery] = useState('')
    const [assignedToFilterQuery, setAssignedToFilterQuery] = useState('')
    const [createdByFilterQuery, setCreatedByFilterQuery] = useState('')
    const [selectedProjectDetails, setSelectedProjectDetails] = useState<any>(null)
    const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list')
    const [showCreateTaskModal, setShowCreateTaskModal] = useState(false)
    const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
    const [selectedTask, setSelectedTask] = useState<Task | null>(null)
    const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null)
    const { statusMap: projectsWithStatuses } = useProjectKanbanStatuses()
    const [currentUserId, setCurrentUserId] = useState<string>('')
    const { success: notifySuccess, error: notifyError } = useNotify()

    // Check if any filters are active
    const hasActiveFilters = searchQuery !== '' ||
                            statusFilter !== 'all' ||
                            priorityFilter !== 'all' ||
                            typeFilter !== 'all' ||
                            projectFilter !== 'all' ||
                            assignedToFilter !== 'all' ||
                            createdByFilter !== 'all' ||
                            dateRangeFilter !== undefined

    // Reset all filters
    const resetFilters = () => {
      setSearchQuery('')
      setStatusFilter('all')
      setPriorityFilter('all')
      setTypeFilter('all')
      setProjectFilter('all')
      setAssignedToFilter('all')
      setCreatedByFilter('all')
      setDateRangeFilter(undefined)
      setProjectFilterQuery('')
      setAssignedToFilterQuery('')
      setCreatedByFilterQuery('')
      // Trigger a fresh fetch with reset filters
      fetchTasks(true)
    }

    const startDateBoundary = useMemo(() => {
        if (!dateRangeFilter?.from) return null
        const boundary = new Date(dateRangeFilter.from)
        boundary.setHours(0, 0, 0, 0)
        return boundary
    }, [dateRangeFilter])

    const endDateBoundary = useMemo(() => {
        if (!dateRangeFilter?.to) return null
        const boundary = new Date(dateRangeFilter.to)
        boundary.setHours(23, 59, 59, 999)
        return boundary
    }, [dateRangeFilter])

    const isCreator = useCallback(
        (task: Task) => {
            const creatorId = (task as any)?.createdBy?._id || (task as any)?.createdBy?.id
            return creatorId && currentUserId && creatorId.toString() === currentUserId.toString()
        },
        [currentUserId]
    )

    const canEditTask = useCallback(
        (task: Task) => hasPermission(Permission.TASK_EDIT_ALL) || isCreator(task),
        [hasPermission, isCreator]
    )

    const canDeleteTask = useCallback(
        (task: Task) => hasPermission(Permission.TASK_DELETE_ALL) || isCreator(task),
        [hasPermission, isCreator]
    )

    // Fetch current user for creator checks
    useEffect(() => {
        const fetchMe = async () => {
            try {
                const res = await fetch('/api/auth/me')
                if (!res.ok) return
                const data = await res.json().catch(() => null)
                const uid = extractUserId(data)
                if (uid) setCurrentUserId(uid)
            } catch (e) {
                // ignore
            }
        }
        fetchMe()
    }, [])
    useEffect(() => {
        const q = searchParams.get('search') || ''
        const s = searchParams.get('status') || 'all'
        const p = searchParams.get('priority') || 'all'
        const proj = searchParams.get('project') || 'all'
        setSearchQuery(q)
        setStatusFilter(s)
        setPriorityFilter(p)
        setProjectFilter(proj)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Extract unique projects, assignedTo, and createdBy from tasks
    useEffect(() => {
        const projectMap = new Map<string, ProjectSummary>()
        const assignedToMap = new Map<string, UserSummary>()
        const createdByMap = new Map<string, UserSummary>()

        tasks.forEach((task) => {
            if (task.project?._id) {
                projectMap.set(task.project._id, {
                    _id: task.project._id,
                    name: task.project.name,
                })
            }
            if (task.assignedTo && Array.isArray(task.assignedTo)) {
                task.assignedTo.forEach((assignee) => {
                    const userId = assignee.user?._id || assignee.user || assignee._id || assignee;
                    const userData = assignee.user || assignee;
                    if (userId && userData) {
                        assignedToMap.set(userId.toString(), {
                            _id: userId.toString(),
                            firstName: userData.firstName || '',
                            lastName: userData.lastName || '',
                            email: userData.email || '',
                        })
                    }
                })
            }
            if (task.createdBy?._id) {
                createdByMap.set(task.createdBy._id, {
                    _id: task.createdBy._id,
                    firstName: task.createdBy.firstName,
                    lastName: task.createdBy.lastName,
                    email: task.createdBy.email,
                })
            }
        })

        setProjectOptions((prev) => {
            const combined = new Map<string, ProjectSummary>()
            prev.forEach((project) => combined.set(project._id, project))
            projectMap.forEach((project, key) => combined.set(key, project))
            return Array.from(combined.values()).sort((a, b) => a.name.localeCompare(b.name))
        })

        // Only show user filters if user can view all tasks
        if (canViewAllTasks) {
            setAssignedToOptions((prev) => {
                const combined = new Map<string, UserSummary>()
                prev.forEach((user) => combined.set(user._id, user))
                assignedToMap.forEach((user, key) => combined.set(key, user))
                return Array.from(combined.values()).sort((a, b) =>
                    `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
                )
            })
            setCreatedByOptions((prev) => {
                const combined = new Map<string, UserSummary>()
                prev.forEach((user) => combined.set(user._id, user))
                createdByMap.forEach((user, key) => combined.set(key, user))
                return Array.from(combined.values()).sort((a, b) =>
                    `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
                )
            })
        }
    }, [tasks, canViewAllTasks])

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
                            const combined = new Map<string, ProjectSummary>()
                            prev.forEach(p => combined.set(p._id, p))
                            projects.forEach((p: ProjectSummary) => combined.set(p._id, p))
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

    // Load users for filter dropdown (only if user can view all tasks)
    useEffect(() => {
        if (!canViewAllTasks) return

        const loadUsers = async () => {
            try {
                const response = await fetch('/api/members?limit=1000&page=1')
                if (response.ok) {
                    const data = await response.json()
                    if (data.success && data.data?.members && Array.isArray(data.data.members)) {
                        const users = data.data.members.map((u: any) => ({
                            _id: u._id,
                            firstName: u.firstName || '',
                            lastName: u.lastName || '',
                            email: u.email || '',
                        }))
                        setAssignedToOptions(prev => {
                            const combined = new Map<string, UserSummary>()
                            prev.forEach(u => combined.set(u._id, u))
                            users.forEach((u: UserSummary) => combined.set(u._id, u))
                            return Array.from(combined.values()).sort((a, b) =>
                                `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
                            )
                        })
                        setCreatedByOptions(prev => {
                            const combined = new Map<string, UserSummary>()
                            prev.forEach(u => combined.set(u._id, u))
                            users.forEach((u: UserSummary) => combined.set(u._id, u))
                            return Array.from(combined.values()).sort((a, b) =>
                                `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
                            )
                        })
                    }
                }
            } catch (err) {
                console.error('Failed to load users:', err)
            }
        }
        loadUsers()
    }, [canViewAllTasks])

    // Debounce search query
    const debouncedSearch = useDebounce(searchQuery, 300)

    const filteredProjectOptions = useMemo(() => {
        const query = projectFilterQuery.trim().toLowerCase()
        if (!query) return projectOptions
        return projectOptions.filter((project) => project.name.toLowerCase().includes(query))
    }, [projectOptions, projectFilterQuery])

    const filteredAssignedToOptions = useMemo(() => {
        const query = assignedToFilterQuery.trim().toLowerCase()
        if (!query) return assignedToOptions
        return assignedToOptions.filter((member) =>
            `${member.firstName} ${member.lastName}`.toLowerCase().includes(query) ||
            member.email.toLowerCase().includes(query)
        )
    }, [assignedToOptions, assignedToFilterQuery])

    const filteredCreatedByOptions = useMemo(() => {
        const query = createdByFilterQuery.trim().toLowerCase()
        if (!query) return createdByOptions
        return createdByOptions.filter((member) =>
            `${member.firstName} ${member.lastName}`.toLowerCase().includes(query) ||
            member.email.toLowerCase().includes(query)
        )
    }, [createdByOptions, createdByFilterQuery])

    // Fetch project details when project filter changes
    useEffect(() => {
        const fetchProjectDetails = async () => {
            if (projectFilter === 'all' || !projectFilter) {
                setSelectedProjectDetails(null)
                return
            }

            try {
                const response = await fetch(`/api/projects/${projectFilter}`)
                if (response.ok) {
                    const data = await response.json()
                    if (data.success) {
                        setSelectedProjectDetails(data.data)
                    }
                }
            } catch (error) {
                console.error('Failed to fetch project details:', error)
                setSelectedProjectDetails(null)
            }
        }

        fetchProjectDetails()
    }, [projectFilter])

    // Dynamic status options based on selected project
    const availableStatusOptions = useMemo(() => {
        if (selectedProjectDetails?.settings?.kanbanStatuses && selectedProjectDetails.settings.kanbanStatuses.length > 0) {
            return selectedProjectDetails.settings.kanbanStatuses
                .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
                .map((status: any) => status.key)
        } else {
            return TASKS_MODULE_STATUS_VALUES
        }
    }, [selectedProjectDetails])

    // Reset status filter if current value is not valid for the new context
    useEffect(() => {
        if (statusFilter !== 'all' && !availableStatusOptions.includes(statusFilter as any)) {
            setStatusFilter('all')
        }
    }, [availableStatusOptions, statusFilter])

    // Virtualization refs
    const parentRef = useRef<HTMLDivElement>(null)
    const rowVirtualizer = useVirtualizer({
        count: tasks.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 120,
        overscan: 8,
    })

    const kanbanFilters = useMemo(() => {
        const params: {
            search?: string
            status?: string
            priority?: string
            type?: string
            assignedTo?: string
            createdBy?: string
            createdAtFrom?: string
            createdAtTo?: string
        } = {}

        if (debouncedSearch) params.search = debouncedSearch
        if (statusFilter !== 'all') params.status = statusFilter
        if (priorityFilter !== 'all') params.priority = priorityFilter
        if (typeFilter !== 'all') params.type = typeFilter
        if (canViewAllTasks) {
            if (assignedToFilter !== 'all') params.assignedTo = assignedToFilter
            if (createdByFilter !== 'all') params.createdBy = createdByFilter
        }
        if (dateRangeFilter?.from) {
            params.createdAtFrom = dateRangeFilter.from.toISOString().split('T')[0]
        }
        if (dateRangeFilter?.to) {
            params.createdAtTo = dateRangeFilter.to.toISOString().split('T')[0]
        }

        return params
    }, [
        debouncedSearch,
        statusFilter,
        priorityFilter,
        typeFilter,
        assignedToFilter,
        createdByFilter,
        dateRangeFilter,
        canViewAllTasks
    ])

    // Fetch tasks with current filters
    const fetchTasks = useCallback(async (reset = false) => {
        try {
            setLoading(true)
            const params = new URLSearchParams()

            // Use debounced search only (searchQuery is for input, debouncedSearch for API)
            if (debouncedSearch) params.set('search', debouncedSearch)

            if (statusFilter !== 'all') params.set('status', statusFilter)
            if (priorityFilter !== 'all') params.set('priority', priorityFilter)
            if (typeFilter !== 'all') params.set('type', typeFilter)
            if (projectFilter !== 'all') params.set('project', projectFilter)

            // Only allow assignedTo and createdBy filters if user can view all tasks
            if (canViewAllTasks) {
                if (assignedToFilter !== 'all') params.set('assignedTo', assignedToFilter)
                if (createdByFilter !== 'all') params.set('createdBy', createdByFilter)
            }

            // Date range filters
            if (dateRangeFilter?.from) {
                params.set('createdAtFrom', dateRangeFilter.from.toISOString().split('T')[0])
            }
            if (dateRangeFilter?.to) {
                params.set('createdAtTo', dateRangeFilter.to.toISOString().split('T')[0])
            }

            // Use page-based pagination instead of cursor
            params.set('page', reset ? '1' : currentPage.toString())
            params.set('limit', pageSize.toString())

            const response = await fetch(`/api/tasks?${params?.toString()}`)

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    notifyError({ title: 'Authentication Required', message: 'Redirecting to login...' })
                    setTimeout(() => router.push('/login'), 1200)
                    return
                }
                const text = await response.text()
                notifyError({ title: 'Failed to Load Tasks', message: text || 'Failed to fetch tasks' })
                return
            }
            const data = await response.json()

            if (data.success) {
                setTasks(data.data)
                setTotalCount(data.pagination?.total || data.data.length)
                if (reset) {
                    setCurrentPage(1)
                }
            } else {
                notifyError({ title: 'Failed to Load Tasks', message: data.error || 'Failed to fetch tasks' })
            }
        } catch (err) {
            notifyError({ title: 'Failed to Load Tasks', message: 'Failed to fetch tasks' })
        } finally {
            setLoading(false)
        }
    }, [
        debouncedSearch,
        statusFilter,
        priorityFilter,
        typeFilter,
        projectFilter,
        assignedToFilter,
        createdByFilter,
        dateRangeFilter,
        currentPage,
        pageSize,
        canViewAllTasks,
        router
    ])

    // Track if filters have been initialized and previous filter values
    const filtersInitializedRef = useRef(false)
    const prevFiltersRef = useRef<{
        debouncedSearch: string
        statusFilter: string
        priorityFilter: string
        typeFilter: string
        projectFilter: string
        assignedToFilter: string
        createdByFilter: string
        dateRangeFilter: { from?: string; to?: string } | null
    } | null>(null)

    // Initial fetch on mount if no initial tasks were provided
    useEffect(() => {
        if (!initialTasks || initialTasks.length === 0) {
            filtersInitializedRef.current = true
            fetchTasks(true)
        } else {
            filtersInitializedRef.current = true
            // Initialize prev filters with current values to prevent immediate fetch
            prevFiltersRef.current = {
                debouncedSearch: debouncedSearch || '',
                statusFilter: statusFilter || 'all',
                priorityFilter: priorityFilter || 'all',
                typeFilter: typeFilter || 'all',
                projectFilter: projectFilter || 'all',
                assignedToFilter: assignedToFilter || 'all',
                createdByFilter: createdByFilter || 'all',
                dateRangeFilter: dateRangeFilter ? {
                    from: dateRangeFilter.from?.toISOString().split('T')[0],
                    to: dateRangeFilter.to?.toISOString().split('T')[0]
                } : null
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Reset and fetch when filters change (but not on initial mount)
    useEffect(() => {
        // Skip if filters haven't been initialized yet (during initial mount)
        if (!filtersInitializedRef.current) return

        const currentFilters = {
            debouncedSearch: debouncedSearch || '',
            statusFilter: statusFilter || 'all',
            priorityFilter: priorityFilter || 'all',
            typeFilter: typeFilter || 'all',
            projectFilter: projectFilter || 'all',
            assignedToFilter: assignedToFilter || 'all',
            createdByFilter: createdByFilter || 'all',
            dateRangeFilter: dateRangeFilter ? {
                from: dateRangeFilter.from?.toISOString().split('T')[0],
                to: dateRangeFilter.to?.toISOString().split('T')[0]
            } : null
        }

        // Initialize prev filters on first change check after mount
        if (prevFiltersRef.current === null) {
            prevFiltersRef.current = currentFilters
            return
        }

        // Check if filters have actually changed from previous values
        const filtersChanged =
            currentFilters.debouncedSearch !== prevFiltersRef.current.debouncedSearch ||
            currentFilters.statusFilter !== prevFiltersRef.current.statusFilter ||
            currentFilters.priorityFilter !== prevFiltersRef.current.priorityFilter ||
            currentFilters.typeFilter !== prevFiltersRef.current.typeFilter ||
            currentFilters.projectFilter !== prevFiltersRef.current.projectFilter ||
            currentFilters.assignedToFilter !== prevFiltersRef.current.assignedToFilter ||
            currentFilters.createdByFilter !== prevFiltersRef.current.createdByFilter ||
            currentFilters.dateRangeFilter?.from !== prevFiltersRef.current.dateRangeFilter?.from ||
            currentFilters.dateRangeFilter?.to !== prevFiltersRef.current.dateRangeFilter?.to

        if (filtersChanged) {
            prevFiltersRef.current = currentFilters
            fetchTasks(true)
        }
    }, [
        debouncedSearch,
        statusFilter,
        priorityFilter,
        typeFilter,
        projectFilter,
        assignedToFilter,
        createdByFilter,
        dateRangeFilter,
        fetchTasks
    ])

    // Fetch when pagination changes
    useEffect(() => {
        if (filtersInitializedRef.current) {
            fetchTasks(false)
        }
    }, [currentPage, pageSize, fetchTasks])

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'todo': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
            case 'in_progress': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800'
            case 'review': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 hover:bg-yellow-200 dark:hover:bg-yellow-800'
            case 'backlog': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
            case 'testing': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 hover:bg-purple-200 dark:hover:bg-purple-800'
            case 'done': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-800'
            case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-200 dark:hover:bg-red-800'
            default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
        }
    }

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'todo': return <Target className="h-4 w-4" />
            case 'in_progress': return <Play className="h-4 w-4" />
            case 'review': return <AlertTriangle className="h-4 w-4" />
            case 'backlog': return <Target className="h-4 w-4" />
            case 'testing': return <Zap className="h-4 w-4" />
            case 'done': return <CheckCircle className="h-4 w-4" />
            case 'cancelled': return <XCircle className="h-4 w-4" />
            default: return <Target className="h-4 w-4" />
        }
    }

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'low': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
            case 'medium': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800'
            case 'high': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 hover:bg-orange-200 dark:hover:bg-orange-800'
            case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-200 dark:hover:bg-red-800'
            default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
        }
    }

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'bug': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-200 dark:hover:bg-red-800'
            case 'feature': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-800'
            case 'improvement': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800'
            case 'task': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
            case 'subtask': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 hover:bg-purple-200 dark:hover:bg-purple-800'
            default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
        }
    }

    const getTruncatedTaskTitle = (title?: string) => {
        if (!title) return ''
        return title.length > 10 ? `${title.slice(0, 10)}…` : title
    }

    const ensureBacklogIncluded = (statuses: string[]): string[] => {
        if (statuses.includes('backlog')) return statuses
        return ['backlog', ...statuses]
    }

    // Get available statuses for a specific task (from its project)
    const getStatusesForTask = useCallback((task: Task): string[] => {
        const projectId = task.project?._id
        if (projectId && projectsWithStatuses.has(projectId)) {
            const statuses = projectsWithStatuses.get(projectId)!
            return ensureBacklogIncluded(statuses.map(s => s.key))
        }
        // Fall back to default statuses
        return Array.from(DEFAULT_TASK_STATUS_KEYS)
    }, [projectsWithStatuses])

    // Get all available statuses (for filter dropdowns)
    const getAllAvailableStatuses = useCallback((): string[] => {
        if (projectFilter !== 'all') {
            // If a specific project is selected, use its statuses
            if (projectsWithStatuses.has(projectFilter)) {
                const statuses = projectsWithStatuses.get(projectFilter)!
                return ensureBacklogIncluded(statuses.map(s => s.key))
            }
        } else {
            // If "all" is selected, collect unique statuses from all projects
            const statusSet = new Set<string>()
            projectsWithStatuses.forEach((statuses) => {
                statuses.forEach(s => statusSet.add(s.key))
            })
            if (statusSet.size > 0) {
                const list = Array.from(statusSet)
                return ensureBacklogIncluded(list)
            }
        }
        // Fall back to default statuses
        return Array.from(DEFAULT_TASK_STATUS_KEYS)
    }, [projectFilter, projectsWithStatuses])

    const handleTaskCreated = () => {
        fetchTasks(true)
        setShowCreateTaskModal(false)
    }

    const handlePageChange = (newPage: number) => {
        setCurrentPage(newPage)
    }

    const handlePageSizeChange = (newSize: number) => {
        setPageSize(newSize)
        setCurrentPage(1) // Reset to first page when changing page size
    }

    const totalPages = Math.ceil(totalCount / pageSize)


    const handleDeleteTask = async () => {
        if (!selectedTask) return

        try {
            const response = await fetch(`/api/tasks/${selectedTask._id}`, {
                method: 'DELETE'
            })
            const data = await response.json()

            if (data.success) {
                setTasks(tasks.filter(p => p._id !== selectedTask._id))
                setShowDeleteConfirmModal(false)
                setSelectedTask(null)
                notifySuccess({ title: 'Task deleted successfully' })
            } else {
                const message = data.error || 'Failed to delete task'
                notifyError({ title: 'Failed to Delete Task', message })
            }
        } catch (err) {
            notifyError({ title: 'Failed to Delete Task', message: 'Failed to delete task' })
        }
    }

    const handleDeleteClick = (task: Task) => {
        setSelectedTask(task)
        setShowDeleteConfirmModal(true)
    }

    // Kanban actions
    const handleKanbanEditTask = (task: any) => {
        router.push(`/tasks/${task._id}/edit`)
    }

    const handleKanbanDeleteTask = (taskId: string) => {
        const task = tasks.find(t => t._id === taskId)
        if (task) {
            handleDeleteClick(task)
        }
    }

    const handleInlineStatusChange = async (task: Task, nextStatus: Task['status']) => {
        if (nextStatus === task.status) return
        setStatusUpdatingId(task._id)
        try {
            const response = await fetch(`/api/tasks/${task._id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: nextStatus })
            })

            const data = await response.json().catch(() => ({}))
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to update status')
            }

            setTasks((prev) =>
                prev.map((item) => (item._id === task._id ? { ...item, status: nextStatus } : item))
            )
            notifySuccess({
                title: 'Status Updated',
                message: 'Task status updated successfully.'
            })
        } catch (error) {
            console.error('Failed to update task status:', error)
            notifyError({
                title: 'Failed to Update Status',
                message: error instanceof Error ? error.message : 'Failed to update status'
            })
        } finally {
            setStatusUpdatingId(null)
        }
    }
    const shouldShowInitialLoader = loading && tasks.length === 0
    const shouldShowInlineLoader = loading && tasks.length > 0

    return (
        <div className="space-y-8 sm:space-y-10 overflow-x-hidden">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground truncate">My Tasks</h1>
                    <p className="text-sm sm:text-base text-muted-foreground">Manage and track your assigned tasks</p>
                </div>
                <Button onClick={() => setShowCreateTaskModal(true)} className="w-full sm:w-auto flex-shrink-0">
                    <Plus className="h-4 w-4 mr-2" />
                    New Task
                </Button>
            </div>


            <Card className="overflow-x-hidden">
                <CardHeader>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>All Tasks</CardTitle>
                                <CardDescription>
                                    {totalCount} task{totalCount !== 1 ? 's' : ''} found
                                </CardDescription>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 sm:gap-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                <Input
                                    placeholder="Search tasks..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 w-full"
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSearchQuery('')
                                            fetchTasks(true)
                                        }}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-foreground"
                                        aria-label="Clear search"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
                                <Select value={projectFilter} onValueChange={setProjectFilter}>
                                    <SelectTrigger className="w-full sm:w-40">
                                        <SelectValue placeholder="Project" />
                                    </SelectTrigger>
                                    <SelectContent className="z-[10050] p-0">
                                        <div className="p-2">
                                            <div className="relative mb-2">
                                                <Input
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
                                                        className="absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground hover:text-foreground"
                                                        aria-label="Clear project filter"
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                            <div className="max-h-56 overflow-y-auto">
                                                <SelectItem value="all">All Projects</SelectItem>
                                                {filteredProjectOptions.length === 0 ? (
                                                    <div className="px-2 py-1 text-xs text-muted-foreground">No matching projects</div>
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
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger className="w-full sm:w-40">
                                        <SelectValue placeholder="Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Status</SelectItem>
                                        {availableStatusOptions.map((status: string) => (
                                            <SelectItem key={status} value={status}>
                                                {formatToTitleCase(status.replace('_', ' '))}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                                    <SelectTrigger className="w-full sm:w-40">
                                        <SelectValue placeholder="Priority" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Priority</SelectItem>
                                        <SelectItem value="low">Low</SelectItem>
                                        <SelectItem value="medium">Medium</SelectItem>
                                        <SelectItem value="high">High</SelectItem>
                                        <SelectItem value="critical">Critical</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Select value={typeFilter} onValueChange={setTypeFilter}>
                                    <SelectTrigger className="w-full sm:w-40">
                                        <SelectValue placeholder="Type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Types</SelectItem>
                                        <SelectItem value="bug">Bug</SelectItem>
                                        <SelectItem value="feature">Feature</SelectItem>
                                        <SelectItem value="improvement">Improvement</SelectItem>
                                        <SelectItem value="task">Task</SelectItem>
                                        <SelectItem value="subtask">Subtask</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                                {canViewAllTasks && (
                                    <>
                                        <Select value={assignedToFilter} onValueChange={setAssignedToFilter}>
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Assigned To" />
                                            </SelectTrigger>
                                            <SelectContent className="z-[10050] p-0">
                                                <div className="p-2">
                                                    <div className="relative mb-2">
                                                        <Input
                                                            value={assignedToFilterQuery}
                                                            onChange={(e) => setAssignedToFilterQuery(e.target.value)}
                                                            placeholder="Search assignees"
                                                            className="pr-10"
                                                            onKeyDown={(e) => e.stopPropagation()}
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                        />
                                                        {assignedToFilterQuery && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.preventDefault()
                                                                    e.stopPropagation()
                                                                    setAssignedToFilterQuery('')
                                                                    setAssignedToFilter('all')
                                                                }}
                                                                className="absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground hover:text-foreground"
                                                                aria-label="Clear assignee filter"
                                                            >
                                                                <X className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="max-h-56 overflow-y-auto">
                                                        <SelectItem value="all">All Assignees</SelectItem>
                                                        {filteredAssignedToOptions.length === 0 ? (
                                                            <div className="px-2 py-1 text-xs text-muted-foreground">No matching assignees</div>
                                                        ) : (
                                                            filteredAssignedToOptions.map((member) => (
                                                                <SelectItem key={member._id} value={member._id}>
                                                                    {member.firstName} {member.lastName}
                                                                </SelectItem>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            </SelectContent>
                                        </Select>
                                        <Select value={createdByFilter} onValueChange={setCreatedByFilter}>
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Created By" />
                                            </SelectTrigger>
                                            <SelectContent className="z-[10050] p-0">
                                                <div className="p-2">
                                                    <div className="relative mb-2">
                                                        <Input
                                                            value={createdByFilterQuery}
                                                            onChange={(e) => setCreatedByFilterQuery(e.target.value)}
                                                            placeholder="Search creators"
                                                            className="pr-10"
                                                            onKeyDown={(e) => e.stopPropagation()}
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                        />
                                                        {createdByFilterQuery && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.preventDefault()
                                                                    e.stopPropagation()
                                                                    setCreatedByFilterQuery('')
                                                                    setCreatedByFilter('all')
                                                                }}
                                                                className="absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground hover:text-foreground"
                                                                aria-label="Clear creator filter"
                                                            >
                                                                <X className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="max-h-56 overflow-y-auto">
                                                        <SelectItem value="all">All Creators</SelectItem>
                                                        {filteredCreatedByOptions.length === 0 ? (
                                                            <div className="px-2 py-1 text-xs text-muted-foreground">No matching creators</div>
                                                        ) : (
                                                            filteredCreatedByOptions.map((member) => (
                                                                <SelectItem key={member._id} value={member._id}>
                                                                    {member.firstName} {member.lastName}
                                                                </SelectItem>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            </SelectContent>
                                        </Select>
                                    </>
                                )}
                                <div className="flex flex-col gap-2">
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                className={cn(
                                                    'w-full justify-start text-left font-normal',
                                                    !dateRangeFilter?.from && !dateRangeFilter?.to && 'text-muted-foreground'
                                                )}
                                            >
                                                <Calendar className="mr-2 h-4 w-4" />
                                                {dateRangeFilter?.from ? (
                                                    dateRangeFilter.to ? (
                                                        `${format(dateRangeFilter.from, 'LLL dd, y')} - ${format(dateRangeFilter.to, 'LLL dd, y')}`
                                                    ) : (
                                                        `${format(dateRangeFilter.from, 'LLL dd, y')} - …`
                                                    )
                                                ) : (
                                                    'Select date range'
                                                )}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <DateRangeCalendar
                                                initialFocus
                                                mode="range"
                                                defaultMonth={dateRangeFilter?.from}
                                                selected={dateRangeFilter}
                                                onSelect={setDateRangeFilter}
                                                numberOfMonths={2}
                                            />
                                        </PopoverContent>
                                    </Popover>
                                    <div className="flex justify-end">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setDateRangeFilter(undefined)}
                                            disabled={!dateRangeFilter?.from && !dateRangeFilter?.to}
                                            className="h-8 text-xs"
                                        >
                                            Clear dates
                                        </Button>
                                    </div>
                                </div>
                                                            <div className="flex justify-end w-full md:col-span-2 xl:col-span-3">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={resetFilters}
                                        className="text-xs"
                                        aria-label="Reset all filters"
                                      >
                                        <RotateCcw className="h-4 w-4 mr-1" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Reset filters</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>

                    <Tabs
                        value={viewMode}
                        onValueChange={(value) => {
                            const v = value as 'list' | 'kanban'
                            setViewMode(v)
                            // When returning to list view, force a fresh fetch to avoid stale/empty data
                            if (v === 'list') {
                                setTasks([])
                                setPagination({})
                                fetchTasks(true)
                            }
                        }}
                    >
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="list">List View</TabsTrigger>
                            <TabsTrigger value="kanban">Kanban View</TabsTrigger>
                        </TabsList>


                        <TabsContent value="list" className="space-y-4">
                            {shouldShowInitialLoader ? (
                                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                                    <Loader2 className="h-6 w-6 animate-spin mb-3" />
                                    <p className="text-sm font-medium">Loading tasks...</p>
                                    <p className="text-xs text-muted-foreground/80">Please wait while we fetch your workspace.</p>
                                </div>
                            ) : (
                                <>
                                    {shouldShowInlineLoader && (
                                        <div className="flex items-center justify-center py-8 text-muted-foreground">
                                            <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                            <span className="text-sm">Refreshing tasks...</span>
                                        </div>
                                    )}
                                    <div
                                        ref={parentRef}
                                        className="h-[400px] sm:h-[500px] md:h-[600px] overflow-auto overflow-x-hidden"
                                    >
                                        <div
                                            style={{
                                                height: `${rowVirtualizer.getTotalSize()}px`,
                                                width: '100%',
                                                position: 'relative',
                                            }}
                                        >
                                            {tasks.length > 0 ? (
                                                rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                                    const task = tasks[virtualRow.index]
                                                    return (
                                                        <div
                                                            key={virtualRow.key}
                                                            style={{
                                                                position: 'absolute',
                                                                top: 0,
                                                                left: 0,
                                                                width: '100%',
                                                                height: `${virtualRow.size}px`,
                                                                transform: `translateY(${virtualRow.start}px)`,
                                                            }}
                                                        >
                                                            <Card 
                                                                className="hover:shadow-md transition-shadow m-2 cursor-pointer"
                                                                onClick={(e) => {
                                                                    // Don't navigate if clicking on select, dropdown, or buttons
                                                                    const target = e.target as HTMLElement
                                                                    if (
                                                                        target.closest('button') ||
                                                                        target.closest('[role="combobox"]') ||
                                                                        target.closest('[role="menuitem"]') ||
                                                                        target.closest('.dropdown-menu') ||
                                                                        target.closest('[data-radix-popper-content-wrapper]')
                                                                    ) {
                                                                        return
                                                                    }
                                                                    router.push(`/tasks/${task._id}`)
                                                                }}
                                                            >
                                                                <CardContent className="p-3 sm:p-4">
                                                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 min-w-0">
                                                                        <div className="flex-1 min-w-0 w-full">
                                                                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2 min-w-0">
                                                                                <div className="flex-1 min-w-0">
                                                                                    <TooltipProvider delayDuration={150}>
                                                                                        <Tooltip>
                                                                                            <TooltipTrigger asChild>
                                                                                                <h3
                                                                                                    className="font-medium text-sm sm:text-base text-foreground truncate"
                                                                                                >
                                                                                                    {task.title}
                                                                                                </h3>
                                                                                            </TooltipTrigger>
                                                                                            <TooltipContent side="top" align="start" className="max-w-xs break-words">
                                                                                                {task.title}
                                                                                            </TooltipContent>
                                                                                        </Tooltip>
                                                                                    </TooltipProvider>
                                                                                </div>
                                                                                <div className="flex flex-wrap items-center gap-1 sm:gap-2 flex-shrink-0">
                                                                                    {task.displayId && (
                                                                                        <Badge variant="outline" className="text-xs">{task.displayId}</Badge>
                                                                                    )}
                                                                                    <Select
                                                                                        value={task.status}
                                                                                        onValueChange={(value) =>
                                                                                            handleInlineStatusChange(task, value as Task['status'])
                                                                                        }
                                                                                        disabled={statusUpdatingId === task._id || !task.sprint}
                                                                                        //onClick={(e) => e.stopPropagation()}
                                                                                    >
                                                                                        <SelectTrigger className="h-7 w-full sm:w-[150px] text-xs">
                                                                                            <SelectValue placeholder="Status" />
                                                                                        </SelectTrigger>
                                                                                        <SelectContent className="z-[10050]">
                                                                                            {getStatusesForTask(task).map((status) => (
                                                                                                <SelectItem key={status} value={status} className="text-xs">
                                                                                                    <div className="flex items-center gap-2">
                                                                                                        {getStatusIcon(status)}
                                                                                                        <span>{formatToTitleCase(status)}</span>
                                                                                                    </div>
                                                                                                </SelectItem>
                                                                                            ))}
                                                                                        </SelectContent>
                                                                                    </Select>
                                                                                    <Badge className={`${getPriorityColor(task.priority)} text-xs`}>
                                                                                        {formatToTitleCase(task.priority)}
                                                                                    </Badge>
                                                                                    <Badge className={`${getTypeColor(task.type)} text-xs`}>
                                                                                        {formatToTitleCase(task.type)}
                                                                                    </Badge>
                                                                                </div>
                                                                            </div>
                                                                            <TooltipProvider>
                                                                              <Tooltip>
                                                                                <TooltipTrigger asChild>
                                                                                  <p className="text-xs sm:text-sm text-muted-foreground mb-2 line-clamp-2 cursor-default">
                                                                                    {task.description || 'No description'}
                                                                                  </p>
                                                                                </TooltipTrigger>
                                                                                {(task.description && task.description.length > 0) && (
                                                                                  <TooltipContent>
                                                                                    <p className="max-w-xs break-words">{task.description}</p>
                                                                                  </TooltipContent>
                                                                                )}
                                                                              </Tooltip>
                                                                            </TooltipProvider>
                                                                            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                                                                                <div className="flex items-center space-x-1 min-w-0">
                                                                                    <Target className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                                                                                    <span
                                                                                        className="truncate max-w-[100px] sm:max-w-[150px] md:max-w-none"
                                                                                        title={task?.project?.name && task.project.name.length > 10 ? task.project.name : undefined}
                                                                                    >
                                                                                        {task?.project?.name && task.project.name.length > 10 ? `${task.project.name.slice(0, 10)}…` : task?.project?.name}
                                                                                    </span>
                                                                                </div>
                                                                                {task?.dueDate && (
                                                                                    <div className="flex items-center space-x-1 flex-shrink-0">
                                                                                        <Calendar className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                                                                                        <span className="whitespace-nowrap">Due {formatDate(task?.dueDate)}</span>
                                                                                    </div>
                                                                                )}
                                                                                {task?.storyPoints && (
                                                                                    <div className="flex items-center space-x-1 flex-shrink-0">
                                                                                        <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                                                                                        <span>{task?.storyPoints} pts</span>
                                                                                    </div>
                                                                                )}
                                                                                {task?.estimatedHours && (
                                                                                    <div className="flex items-center space-x-1 flex-shrink-0">
                                                                                        <Clock className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                                                                                        <span>{task?.estimatedHours}h</span>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-2">
                                                                            {task?.assignedTo && Array.isArray(task.assignedTo) && task.assignedTo.length > 0 && (
                                                                                <div className="text-xs sm:text-sm text-muted-foreground truncate">
                                                                                    {(() => {
                                                                                        const firstAssignee = task.assignedTo[0];
                                                                                        const userData = firstAssignee.user || firstAssignee;
                                                                                        return `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'Unknown User';
                                                                                    })()}
                                                                                </div>
                                                                            )}
                                                                            <DropdownMenu>
                                                                                <DropdownMenuTrigger asChild>
                                                                                    <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                                                                                        <MoreHorizontal className="h-4 w-4" />
                                                                                    </Button>
                                                                                </DropdownMenuTrigger>
                                                                                <DropdownMenuContent align="end">
                                                                                    <DropdownMenuItem onClick={(e) => {
                                                                                        e.stopPropagation()
                                                                                        router.push(`/tasks/${task._id}`)
                                                                                    }}>
                                                                                        <Eye className="h-4 w-4 mr-2" />
                                                                                        View Task
                                                                                    </DropdownMenuItem>
                                                                                    <DropdownMenuItem
                                                                                        disabled={!canEditTask(task)}
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation()
                                                                                            if (!canEditTask(task)) return
                                                                                            router.push(`/tasks/${task._id}/edit`)
                                                                                        }}>
                                                                                        <Edit className="h-4 w-4 mr-2" />
                                                                                        Edit Task
                                                                                    </DropdownMenuItem>
                                                                                    <DropdownMenuSeparator />
                                                                                    <DropdownMenuItem
                                                                                        disabled={!canDeleteTask(task)}
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation()
                                                                                            if (!canDeleteTask(task)) return
                                                                                            handleDeleteClick(task)
                                                                                        }}
                                                                                        className="text-destructive focus:text-destructive"
                                                                                    >
                                                                                        <Trash2 className="h-4 w-4 mr-2" />
                                                                                        Delete Task
                                                                                    </DropdownMenuItem>
                                                                                </DropdownMenuContent>
                                                                            </DropdownMenu>
                                                                        </div>
                                                                    </div>
                                                                </CardContent>
                                                            </Card>
                                                        </div>
                                                    )
                                                })
                                            ) : (
                                                !loading && (
                                                    <div className="flex items-center justify-center h-40">
                                                        <div className="text-center text-muted-foreground">
                                                            No tasks found.
                                                        </div>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                        {/* Pagination Controls */}
                                        {tasks.length > 0 && (
                                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t">
                                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                    <span>Items per page:</span>
                                                    <Select value={pageSize.toString()} onValueChange={(value) => handlePageSizeChange(parseInt(value))}>
                                                        <SelectTrigger className="w-20 h-8">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="10">10</SelectItem>
                                                            <SelectItem value="20">20</SelectItem>
                                                            <SelectItem value="50">50</SelectItem>
                                                            <SelectItem value="100">100</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <span>
                                                        Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        onClick={() => handlePageChange(currentPage - 1)}
                                                        disabled={currentPage === 1 || loading}
                                                        variant="outline"
                                                        size="sm"
                                                    >
                                                        Previous
                                                    </Button>
                                                    <span className="text-sm text-muted-foreground px-2">
                                                        Page {currentPage} of {totalPages || 1}
                                                    </span>
                                                    <Button
                                                        onClick={() => handlePageChange(currentPage + 1)}
                                                        disabled={currentPage >= totalPages || loading}
                                                        variant="outline"
                                                        size="sm"
                                                    >
                                                        Next
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </TabsContent>

                        <TabsContent value="kanban" className="space-y-4">
                            {shouldShowInitialLoader ? (
                                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                                    <Loader2 className="h-6 w-6 animate-spin mb-3" />
                                    <p className="text-sm font-medium">Loading tasks...</p>
                                    <p className="text-xs text-muted-foreground/80">Please wait while we fetch your workspace.</p>
                                </div>
                            ) : (
                                <>
                                    {shouldShowInlineLoader && (
                                        <div className="flex items-center justify-center py-8 text-muted-foreground">
                                            <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                            <span className="text-sm">Refreshing board...</span>
                                        </div>
                                    )}
                                    <KanbanBoard
                                        projectId={projectFilter}
                                        filters={kanbanFilters}
                                        onProjectChange={setProjectFilter}
                                        onCreateTask={() => setShowCreateTaskModal(true)}
                                        onEditTask={handleKanbanEditTask}
                                        onDeleteTask={handleKanbanDeleteTask}
                                    />
                                    {tasks.length === 0 && !loading && (
                                        <div className="flex items-center justify-center h-40">
                                            <div className="text-center text-muted-foreground">
                                                No tasks found.
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            {showCreateTaskModal && (
                <CreateTaskModal
                    isOpen={showCreateTaskModal}
                    onClose={() => setShowCreateTaskModal(false)}
                    projectId={initialFilters.project || ''}
                    onTaskCreated={handleTaskCreated}
                />
            )}

            {/* Delete Confirmation Modal */}
            <ConfirmationModal
                isOpen={showDeleteConfirmModal}
                onClose={() => {
                    setShowDeleteConfirmModal(false)
                    setSelectedTask(null)
                }}
                onConfirm={handleDeleteTask}
                title="Delete Task"
                description={`Are you sure you want to delete "${getTruncatedTaskTitle(selectedTask?.title)}"? This action cannot be undone.`}
                confirmText="Delete"
                cancelText="Cancel"
                variant="destructive"
            />
        </div>
    )
}
