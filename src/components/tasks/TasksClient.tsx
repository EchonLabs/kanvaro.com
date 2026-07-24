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
import { useAuthContext } from '@/contexts/AuthContext'
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
    RotateCcw,
    Upload,
    ListTodo,
    CheckSquare
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
import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { format } from 'date-fns'
import { DateRange } from 'react-day-picker'
import { DEFAULT_TASK_STATUS_KEYS, type TaskStatusKey } from '@/constants/taskStatuses'
import { validateAndCorrectDateRange } from '@/lib/dateRangeValidation'

import CreateTaskModal from './CreateTaskModal'
// Removed bulk upload import
// import BulkUploadModal from './BulkUploadModal'
import {
    StatusBadge, PriorityBadge, TypeBadge,
    PageHeader, SectionLabel, TasksEmptyState,
    PaginationBar, ViewSwitcher, MetaChip, FilterChip,
    InlineLoader, FullPageLoader,
    cardShell, cardHover, TASK_STATUS_CONFIG, PRIORITY_CONFIG
} from './TasksShared'
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

// Module-level store: survives client-side navigation, resets on full page reload
const _myTasksFilters = {
    searchQuery: '',
    statusFilter: 'all',
    priorityFilter: 'all',
    typeFilter: 'all',
    projectFilter: 'all',
    assignedToFilter: 'all',
    createdByFilter: 'all',
    dateRangeFilter: undefined as DateRange | undefined,
}

export default function TasksClient({
    initialTasks,
    initialPagination,
    initialFilters = {}
}: TasksClientProps) {
    const { user, isAuthenticated, isLoading: authLoading } = useAuthContext()

    const router = useRouter()
    const searchParams = useSearchParams()
    const { hasPermission, permissions } = usePermissions()

    const { formatDate } = useDateTime()
    const canViewAllTasks = hasPermission(Permission.PROJECT_VIEW_ALL) || hasPermission(Permission.TASK_VIEW_ALL)
    const canViewAssignedProjects = hasPermission(Permission.TASK_VIEW_ASSIGNED_PROJECTS)
    const canFilterUsers = canViewAllTasks || canViewAssignedProjects
    const canCreateTask = hasPermission(Permission.TASK_CREATE)
    
    // Detect if user has QA Engineer custom role
    const isQAEngineer = user?.customRole?.name === 'QA Engineer' || 
                         permissions?.customRole?.name === 'QA Engineer'

    const [tasks, setTasks] = useState<Task[]>(initialTasks)
    const [pagination, setPagination] = useState(initialPagination)
    const [currentPage, setCurrentPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)
    const [totalCount, setTotalCount] = useState(() =>
        typeof initialPagination?.total === 'number' ? initialPagination.total : initialTasks?.length || 0
    )
    const [loading, setLoading] = useState(false)
    const [searchQuery, setSearchQuery] = useState(initialFilters.search || _myTasksFilters.searchQuery)
    const [statusFilter, setStatusFilter] = useState(initialFilters.status || _myTasksFilters.statusFilter)
    const [priorityFilter, setPriorityFilter] = useState(initialFilters.priority || _myTasksFilters.priorityFilter)
    const [typeFilter, setTypeFilter] = useState(initialFilters.type || _myTasksFilters.typeFilter)
    const [projectFilter, setProjectFilter] = useState(initialFilters.project || _myTasksFilters.projectFilter)
    const [assignedToFilter, setAssignedToFilter] = useState(initialFilters.assignedTo || _myTasksFilters.assignedToFilter)
    const [createdByFilter, setCreatedByFilter] = useState(initialFilters.createdBy || _myTasksFilters.createdByFilter)
    const [dateRangeFilter, setDateRangeFilter] = useState<DateRange | undefined>(
        initialFilters.createdAtFrom || initialFilters.createdAtTo
            ? {
                from: initialFilters.createdAtFrom ? new Date(initialFilters.createdAtFrom) : undefined,
                to: initialFilters.createdAtTo ? new Date(initialFilters.createdAtTo) : undefined,
            }
            : _myTasksFilters.dateRangeFilter
    )
    const [projectOptions, setProjectOptions] = useState<ProjectSummary[]>([])
    const [assignedToOptions, setAssignedToOptions] = useState<UserSummary[]>([])
    const [createdByOptions, setCreatedByOptions] = useState<UserSummary[]>([])
    const [projectFilterQuery, setProjectFilterQuery] = useState('')
    const [assignedToFilterQuery, setAssignedToFilterQuery] = useState('')
    const [createdByFilterQuery, setCreatedByFilterQuery] = useState('')
    const [selectedProjectDetails, setSelectedProjectDetails] = useState<any>(null)
    const [viewMode, setViewMode] = useState<'list' | 'grid' | 'kanban'>('list')
    const [showCreateTaskModal, setShowCreateTaskModal] = useState(false)
    const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
    const [selectedTask, setSelectedTask] = useState<Task | null>(null)
    const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null)
    const { statusMap: projectsWithStatuses } = useProjectKanbanStatuses()
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
        fetchTasks(true, '')
    }

    // Sync filter state back to module-level store so it survives navigation
    useEffect(() => {
        _myTasksFilters.searchQuery = searchQuery
        _myTasksFilters.statusFilter = statusFilter
        _myTasksFilters.priorityFilter = priorityFilter
        _myTasksFilters.typeFilter = typeFilter
        _myTasksFilters.projectFilter = projectFilter
        _myTasksFilters.assignedToFilter = assignedToFilter
        _myTasksFilters.createdByFilter = createdByFilter
        _myTasksFilters.dateRangeFilter = dateRangeFilter
    }, [searchQuery, statusFilter, priorityFilter, typeFilter, projectFilter, assignedToFilter, createdByFilter, dateRangeFilter])

    // Handle date range changes with validation and auto-correction
    const handleDateRangeChange = useCallback((range: DateRange | undefined) => {
        if (!range) {
            setDateRangeFilter(undefined)
            return
        }

        // Validate and auto-correct the date range
        const correctedRange = validateAndCorrectDateRange(range.from, range.to)
        setDateRangeFilter(correctedRange as DateRange | undefined)
    }, [])

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
            const currentUserId = user ? ((user as any)._id || (user as any).id) : null
            return creatorId && currentUserId && creatorId.toString() === currentUserId.toString()
        },
        [user]
    )

    const canEditTask = useCallback(
        (task: Task) => hasPermission(Permission.TASK_EDIT_ALL) || isCreator(task),
        [hasPermission, isCreator]
    )

    const canDeleteTask = useCallback(
        (task: Task) => hasPermission(Permission.TASK_DELETE),
        [hasPermission]
    )

    // Fetch current user for creator checks
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

        // For QA users, only include current user in the options
        if (isQAEngineer && user) {
            const currentUserSummary: UserSummary = {
                _id: user.id || '',
                firstName: user.firstName || '',
                lastName: user.lastName || '',
                email: user.email || ''
            }
            assignedToMap.set(currentUserSummary._id, currentUserSummary)
            createdByMap.set(currentUserSummary._id, currentUserSummary)
        } else {
            // For non-QA users, extract from tasks as normal
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
        }

        setProjectOptions((prev) => {
            const combined = new Map<string, ProjectSummary>()
            prev.forEach((project) => combined.set(project._id, project))
            projectMap.forEach((project, key) => combined.set(key, project))
            return Array.from(combined.values()).sort((a, b) => a.name.localeCompare(b.name))
        })

        // Only show user filters if user can filter users
        if (canFilterUsers) {
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
    }, [tasks, canFilterUsers, isQAEngineer, user])

    // Load projects from API for filter dropdown
    useEffect(() => {
        const loadProjects = async () => {
            try {
                const response = await fetch('/api/projects?all=true')
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

    // Load users for filter dropdown (only if user can filter users)
    useEffect(() => {
        if (!canFilterUsers) return

        const loadUsers = async () => {
            try {
                const response = await fetch('/api/members?all=true')
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
    }, [canFilterUsers])

    // Debounce search query
    const debouncedSearch = useDebounce(searchQuery, 300)

    const filteredProjectOptions = useMemo(() => {
        const query = projectFilterQuery.trim().toLowerCase()
        if (!query) return projectOptions
        return projectOptions.filter((project) => project.name.toLowerCase().includes(query))
    }, [projectOptions, projectFilterQuery])

    const filteredAssignedToOptions = useMemo(() => {
        // For QA users, only show current user
        if (isQAEngineer && user) {
            let options = assignedToOptions.filter(opt => opt._id === user.id)
            
            const query = assignedToFilterQuery.trim().toLowerCase()
            if (!query) return options
            return options.filter((member) =>
                `${member.firstName} ${member.lastName}`.toLowerCase().includes(query) ||
                member.email.toLowerCase().includes(query)
            )
        }

        // For non-QA users, apply normal filtering including project members
        let options = assignedToOptions

        // Filter by project members if a specific project is selected
        if (selectedProjectDetails && selectedProjectDetails.teamMembers) {
            const projectMemberIds = new Set<string>();
            selectedProjectDetails.teamMembers.forEach((member: any) => {
                const id = member.memberId || member.user?._id || member.user || member._id || member;
                if (id) projectMemberIds.add(id.toString());
            });
            if (selectedProjectDetails.createdBy) {
                const creatorId = selectedProjectDetails.createdBy._id || selectedProjectDetails.createdBy;
                if (creatorId) projectMemberIds.add(creatorId.toString());
            }

            options = options.filter(opt => projectMemberIds.has(opt._id.toString()));
        }

        const query = assignedToFilterQuery.trim().toLowerCase()
        if (!query) return options
        return options.filter((member) =>
            `${member.firstName} ${member.lastName}`.toLowerCase().includes(query) ||
            member.email.toLowerCase().includes(query)
        )
    }, [assignedToOptions, assignedToFilterQuery, selectedProjectDetails, isQAEngineer, user])

    const filteredCreatedByOptions = useMemo(() => {
        // For QA users, only show current user
        if (isQAEngineer && user) {
            let options = createdByOptions.filter(opt => opt._id === user.id)
            
            const query = createdByFilterQuery.trim().toLowerCase()
            if (!query) return options
            return options.filter((member) =>
                `${member.firstName} ${member.lastName}`.toLowerCase().includes(query) ||
                member.email.toLowerCase().includes(query)
            )
        }

        // For non-QA users, apply normal filtering including project members
        let options = createdByOptions

        // Filter by project members if a specific project is selected
        if (selectedProjectDetails && selectedProjectDetails.teamMembers) {
            const projectMemberIds = new Set<string>();
            selectedProjectDetails.teamMembers.forEach((member: any) => {
                const id = member.memberId || member.user?._id || member.user || member._id || member;
                if (id) projectMemberIds.add(id.toString());
            });
            if (selectedProjectDetails.createdBy) {
                const creatorId = selectedProjectDetails.createdBy._id || selectedProjectDetails.createdBy;
                if (creatorId) projectMemberIds.add(creatorId.toString());
            }

            options = options.filter(opt => projectMemberIds.has(opt._id.toString()));
        }

        const query = createdByFilterQuery.trim().toLowerCase()
        if (!query) return options
        return options.filter((member) =>
            `${member.firstName} ${member.lastName}`.toLowerCase().includes(query) ||
            member.email.toLowerCase().includes(query)
        )
    }, [createdByOptions, createdByFilterQuery, selectedProjectDetails, isQAEngineer, user])

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

    // Virtualization refs
    const parentRef = useRef<HTMLDivElement>(null)
    const projectFilterInputRef = useRef<HTMLInputElement | null>(null)
    const assignedToFilterInputRef = useRef<HTMLInputElement | null>(null)
    const createdByFilterInputRef = useRef<HTMLInputElement | null>(null)
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
        if (canFilterUsers) {
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
        canFilterUsers
    ])

    // Fetch tasks with current filters
    const fetchTasks = useCallback(async (reset = false, searchOverride?: string) => {
        try {
            setLoading(true)
            const params = new URLSearchParams()

            const effectiveSearch = searchOverride !== undefined
                ? searchOverride.trim()
                : (debouncedSearch || searchQuery.trim())

            if (effectiveSearch) params.set('search', effectiveSearch)

            if (statusFilter !== 'all') params.set('status', statusFilter)
            if (priorityFilter !== 'all') params.set('priority', priorityFilter)
            if (typeFilter !== 'all') params.set('type', typeFilter)
            if (projectFilter !== 'all') params.set('project', projectFilter)

            // Only allow assignedTo and createdBy filters if user can filter users
            if (canFilterUsers) {
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
        canFilterUsers,
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
        <div className="space-y-6 overflow-x-hidden animate-in fade-in-0 duration-300">

            {/* ── Page Header ─────────────────────────────────────────────────── */}
            <PageHeader
                title="My Tasks"
                subtitle="Manage and track your assigned tasks"
                icon={CheckSquare}
                actions={
                    canCreateTask ? (
                        <Button
                            onClick={() => setShowCreateTaskModal(true)}
                            className="rounded-full bg-[var(--apple-system-blue)] text-white px-4 py-2 text-[15px] font-semibold hover:opacity-90 apple-transition"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            New Task
                        </Button>
                    ) : undefined
                }
            />

            {/* ── Filter Toolbar ───────────────────────────────────────────────── */}
            <div className="rounded-[var(--apple-radius-lg)] bg-[var(--apple-quaternary-fill)] border border-[var(--apple-separator)] p-3 sm:p-4 space-y-2 sm:space-y-3">

            {/* Row 1: Search (50%) + Status (25%) + Priority (25%) — Desktop */}
            <div className="hidden sm:flex items-center gap-2">
                <div className="relative w-1/2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--apple-tertiary-label)]" />
                    <input
                        placeholder="Search tasks..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-9 h-10 rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[15px] placeholder:text-[var(--apple-tertiary-label)] focus:outline-none focus:border-[var(--apple-system-blue)] focus:ring-2 focus:ring-[var(--apple-system-blue)]/20 apple-transition text-[var(--apple-label)]"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => { setSearchQuery(''); fetchTasks(true, '') }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--apple-tertiary-label)] hover:text-[var(--apple-label)] apple-transition"
                            aria-label="Clear search"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-10 w-1/4 rounded-full border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[13px] font-medium text-[var(--apple-secondary-label)]">
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
                    <SelectTrigger className="h-10 w-1/4 rounded-full border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[13px] font-medium text-[var(--apple-secondary-label)]">
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
            </div>

            {/* Row 1: Mobile — Search full width + status/priority side-by-side */}
            <div className="sm:hidden flex flex-col gap-2">
                <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--apple-tertiary-label)]" />
                    <input
                        placeholder="Search tasks..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-9 h-10 rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[15px] placeholder:text-[var(--apple-tertiary-label)] focus:outline-none focus:border-[var(--apple-system-blue)] focus:ring-2 focus:ring-[var(--apple-system-blue)]/20 apple-transition text-[var(--apple-label)]"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => { setSearchQuery(''); fetchTasks(true, '') }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--apple-tertiary-label)] hover:text-[var(--apple-label)] apple-transition"
                            aria-label="Clear search"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
                <div className="flex gap-2">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="h-10 flex-1 rounded-full border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[13px] font-medium text-[var(--apple-secondary-label)]">
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
                        <SelectTrigger className="h-10 flex-1 rounded-full border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[13px] font-medium text-[var(--apple-secondary-label)]">
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
                </div>
            </div>

            {/* Row 2: Project + Type + Assignee + Creator + Date range — Desktop: 20% each, Mobile: 2-col grid */}
            <div className="hidden sm:grid sm:grid-cols-5 gap-2">
                {/* Project filter with search */}
                <Select value={projectFilter} onValueChange={setProjectFilter} onOpenChange={(open) => {
                    if (open) focusSearchInput(projectFilterInputRef.current)
                }}>
                    <SelectTrigger className="h-10 w-full rounded-full border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[13px] font-medium text-[var(--apple-secondary-label)]">
                        <SelectValue placeholder="All Projects" />
                    </SelectTrigger>
                    <SelectContent className="z-[10050] p-0">
                        <div className="p-2">
                            <div className="relative mb-2">
                                <Input
                                    ref={projectFilterInputRef}
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

                {/* Type filter */}
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="h-10 w-full rounded-full border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[13px] font-medium text-[var(--apple-secondary-label)]">
                        <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="bug">Bug</SelectItem>
                        <SelectItem value="feature">Feature</SelectItem>
                        <SelectItem value="improvement">Improvement</SelectItem>
                        <SelectItem value="task">Task</SelectItem>
                    </SelectContent>
                </Select>

                {/* Assigned To / Created By — only for users with permission */}
                {canFilterUsers ? (
                    <>
                        <Select value={assignedToFilter} onValueChange={setAssignedToFilter} onOpenChange={(open) => {
                            if (open) focusSearchInput(assignedToFilterInputRef.current)
                        }}>
                            <SelectTrigger className="h-10 w-full rounded-full border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[13px] font-medium text-[var(--apple-secondary-label)]">
                                <SelectValue placeholder="All Assignees" />
                            </SelectTrigger>
                            <SelectContent className="z-[10050] p-0">
                                <div className="p-2">
                                    <div className="relative mb-2">
                                        <Input
                                            ref={assignedToFilterInputRef}
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

                        <Select value={createdByFilter} onValueChange={setCreatedByFilter} onOpenChange={(open) => {
                            if (open) focusSearchInput(createdByFilterInputRef.current)
                        }}>
                            <SelectTrigger className="h-10 w-full rounded-full border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[13px] font-medium text-[var(--apple-secondary-label)]">
                                <SelectValue placeholder="All Creators" />
                            </SelectTrigger>
                            <SelectContent className="z-[10050] p-0">
                                <div className="p-2">
                                    <div className="relative mb-2">
                                        <Input
                                            ref={createdByFilterInputRef}
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

                        {/* Date range picker */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <button
                                    type="button"
                                    className={cn(
                                        'inline-flex items-center gap-1.5 h-10 px-3 w-full rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[13px] font-medium apple-transition',
                                        dateRangeFilter?.from
                                            ? 'text-[var(--apple-label)]'
                                            : 'text-[var(--apple-secondary-label)]'
                                    )}
                                >
                                    <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                                    <span className="truncate">
                                        {dateRangeFilter?.from ? (
                                            dateRangeFilter.to
                                                ? `${format(dateRangeFilter.from, 'LLL dd')} – ${format(dateRangeFilter.to, 'LLL dd')}`
                                                : `${format(dateRangeFilter.from, 'LLL dd')} – …`
                                        ) : (
                                            'Date Range'
                                        )}
                                    </span>
                                    {(dateRangeFilter?.from || dateRangeFilter?.to) && (
                                        <span
                                            role="button"
                                            aria-label="Clear date range"
                                            onClick={(e) => { e.stopPropagation(); setDateRangeFilter(undefined) }}
                                            className="ml-auto text-[var(--apple-tertiary-label)] hover:text-[var(--apple-label)]"
                                        >
                                            <X className="h-3 w-3" />
                                        </span>
                                    )}
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <DateRangeCalendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={dateRangeFilter?.from}
                                    selected={dateRangeFilter}
                                    onSelect={handleDateRangeChange}
                                    numberOfMonths={2}
                                />
                            </PopoverContent>
                        </Popover>
                    </>
                ) : (
                    <>
                        {/* No user filters: empty slots + date range */}
                        <div />
                        <div />
                        <Popover>
                            <PopoverTrigger asChild>
                                <button
                                    type="button"
                                    className={cn(
                                        'inline-flex items-center gap-1.5 h-9 px-3 w-full rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[13px] font-medium apple-transition',
                                        dateRangeFilter?.from
                                            ? 'text-[var(--apple-label)]'
                                            : 'text-[var(--apple-secondary-label)]'
                                    )}
                                >
                                    <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                                    <span className="truncate">
                                        {dateRangeFilter?.from ? (
                                            dateRangeFilter.to
                                                ? `${format(dateRangeFilter.from, 'LLL dd')} – ${format(dateRangeFilter.to, 'LLL dd')}`
                                                : `${format(dateRangeFilter.from, 'LLL dd')} – …`
                                        ) : (
                                            'Date Range'
                                        )}
                                    </span>
                                    {(dateRangeFilter?.from || dateRangeFilter?.to) && (
                                        <span
                                            role="button"
                                            aria-label="Clear date range"
                                            onClick={(e) => { e.stopPropagation(); setDateRangeFilter(undefined) }}
                                            className="ml-auto text-[var(--apple-tertiary-label)] hover:text-[var(--apple-label)]"
                                        >
                                            <X className="h-3 w-3" />
                                        </span>
                                    )}
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <DateRangeCalendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={dateRangeFilter?.from}
                                    selected={dateRangeFilter}
                                    onSelect={handleDateRangeChange}
                                    numberOfMonths={2}
                                />
                            </PopoverContent>
                        </Popover>
                    </>
                )}
            </div>

            {/* Row 2: Mobile — scrollable horizontal row of secondary filters */}
            <div className="sm:hidden grid grid-cols-2 gap-2">
                <Select value={projectFilter} onValueChange={setProjectFilter} onOpenChange={(open) => {
                    if (open) focusSearchInput(projectFilterInputRef.current)
                }}>
                    <SelectTrigger className="h-9 w-full rounded-full border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[13px] font-medium text-[var(--apple-secondary-label)]">
                        <SelectValue placeholder="All Projects" />
                    </SelectTrigger>
                    <SelectContent className="z-[10050] p-0">
                        <div className="p-2">
                            <div className="relative mb-2">
                                <Input
                                    ref={projectFilterInputRef}
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

                <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="h-9 w-full rounded-full border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[13px] font-medium text-[var(--apple-secondary-label)]">
                        <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="bug">Bug</SelectItem>
                        <SelectItem value="feature">Feature</SelectItem>
                        <SelectItem value="improvement">Improvement</SelectItem>
                        <SelectItem value="task">Task</SelectItem>
                    </SelectContent>
                </Select>

                {canFilterUsers && (
                    <>
                        <Select value={assignedToFilter} onValueChange={setAssignedToFilter} onOpenChange={(open) => {
                            if (open) focusSearchInput(assignedToFilterInputRef.current)
                        }}>
                            <SelectTrigger className="h-9 w-full rounded-full border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[13px] font-medium text-[var(--apple-secondary-label)]">
                                <SelectValue placeholder="All Assignees" />
                            </SelectTrigger>
                            <SelectContent className="z-[10050] p-0">
                                <div className="p-2">
                                    <div className="relative mb-2">
                                        <Input
                                            ref={assignedToFilterInputRef}
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

                        <Select value={createdByFilter} onValueChange={setCreatedByFilter} onOpenChange={(open) => {
                            if (open) focusSearchInput(createdByFilterInputRef.current)
                        }}>
                            <SelectTrigger className="h-9 w-full rounded-full border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[13px] font-medium text-[var(--apple-secondary-label)]">
                                <SelectValue placeholder="All Creators" />
                            </SelectTrigger>
                            <SelectContent className="z-[10050] p-0">
                                <div className="p-2">
                                    <div className="relative mb-2">
                                        <Input
                                            ref={createdByFilterInputRef}
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

                {/* Date range — spans full width on mobile */}
                <Popover>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            className={cn(
                                'inline-flex items-center gap-1.5 h-9 px-3 w-full col-span-2 rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[13px] font-medium apple-transition',
                                dateRangeFilter?.from
                                    ? 'text-[var(--apple-label)]'
                                    : 'text-[var(--apple-secondary-label)]'
                            )}
                        >
                            <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate">
                                {dateRangeFilter?.from ? (
                                    dateRangeFilter.to
                                        ? `${format(dateRangeFilter.from, 'LLL dd')} – ${format(dateRangeFilter.to, 'LLL dd')}`
                                        : `${format(dateRangeFilter.from, 'LLL dd')} – …`
                                ) : (
                                    'Date Range'
                                )}
                            </span>
                            {(dateRangeFilter?.from || dateRangeFilter?.to) && (
                                <span
                                    role="button"
                                    aria-label="Clear date range"
                                    onClick={(e) => { e.stopPropagation(); setDateRangeFilter(undefined) }}
                                    className="ml-auto text-[var(--apple-tertiary-label)] hover:text-[var(--apple-label)]"
                                >
                                    <X className="h-3 w-3" />
                                </span>
                            )}
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        <DateRangeCalendar
                            initialFocus
                            mode="range"
                            defaultMonth={dateRangeFilter?.from}
                            selected={dateRangeFilter}
                            onSelect={handleDateRangeChange}
                            numberOfMonths={1}
                        />
                    </PopoverContent>
                </Popover>
            </div>

            {/* Row 3: Active filter chips + Clear all on the right */}
            {hasActiveFilters && (
                <div className="flex flex-wrap items-center gap-1.5">
                    <SectionLabel className="mr-1">Active:</SectionLabel>
                    <FilterChip
                        label={`Search: "${searchQuery}"`}
                        active={searchQuery !== ''}
                        onClear={() => { setSearchQuery(''); fetchTasks(true, '') }}
                    />
                    <FilterChip
                        label={`Status: ${formatToTitleCase(statusFilter.replace('_', ' '))}`}
                        active={statusFilter !== 'all'}
                        onClear={() => setStatusFilter('all')}
                    />
                    <FilterChip
                        label={`Priority: ${formatToTitleCase(priorityFilter)}`}
                        active={priorityFilter !== 'all'}
                        onClear={() => setPriorityFilter('all')}
                    />
                    <FilterChip
                        label={`Type: ${formatToTitleCase(typeFilter)}`}
                        active={typeFilter !== 'all'}
                        onClear={() => setTypeFilter('all')}
                    />
                    <FilterChip
                        label={`Project: ${projectOptions.find(p => p._id === projectFilter)?.name ?? projectFilter}`}
                        active={projectFilter !== 'all'}
                        onClear={() => { setProjectFilter('all'); setProjectFilterQuery('') }}
                    />
                    {canFilterUsers && (
                        <>
                            <FilterChip
                                label={`Assigned: ${assignedToOptions.find(u => u._id === assignedToFilter)
                                    ? `${assignedToOptions.find(u => u._id === assignedToFilter)!.firstName} ${assignedToOptions.find(u => u._id === assignedToFilter)!.lastName}`
                                    : assignedToFilter}`}
                                active={assignedToFilter !== 'all'}
                                onClear={() => { setAssignedToFilter('all'); setAssignedToFilterQuery('') }}
                            />
                            <FilterChip
                                label={`Created by: ${createdByOptions.find(u => u._id === createdByFilter)
                                    ? `${createdByOptions.find(u => u._id === createdByFilter)!.firstName} ${createdByOptions.find(u => u._id === createdByFilter)!.lastName}`
                                    : createdByFilter}`}
                                active={createdByFilter !== 'all'}
                                onClear={() => { setCreatedByFilter('all'); setCreatedByFilterQuery('') }}
                            />
                        </>
                    )}
                    <FilterChip
                        label={`Date: ${dateRangeFilter?.from ? format(dateRangeFilter.from, 'MMM d') : ''}${dateRangeFilter?.to ? ` – ${format(dateRangeFilter.to, 'MMM d')}` : ''}`}
                        active={dateRangeFilter !== undefined}
                        onClear={() => setDateRangeFilter(undefined)}
                    />
                    <button
                        type="button"
                        onClick={resetFilters}
                        className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)] hover:bg-[var(--apple-tertiary-fill)] apple-transition"
                    >
                        <RotateCcw className="h-3 w-3" />
                        Clear filters
                    </button>
                </div>
            )}

            </div>

            {/* ── View Controls bar ─────────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] text-[var(--apple-secondary-label)] font-apple-mono">
                    {totalCount} task{totalCount !== 1 ? 's' : ''}
                </p>
                <ViewSwitcher
                    value={viewMode}
                    onChange={(v) => {
                        setViewMode(v)
                        if (v === 'list' || v === 'grid') {
                            setTasks([])
                            setPagination({})
                            fetchTasks(true)
                        }
                    }}
                    options={['list', 'grid', 'kanban']}
                />
            </div>

            {/* ── List View ─────────────────────────────────────────────────────── */}
            {(viewMode === 'list') && (
                <div className="space-y-2">
                    {shouldShowInitialLoader ? (
                        <FullPageLoader label="Loading tasks..." />
                    ) : (
                        <>
                            {shouldShowInlineLoader && <InlineLoader label="Refreshing tasks..." />}
                            {tasks.length > 0 ? (
                                <>
                                    <div className="space-y-2">
                                        {tasks.map((task) => {
                                            const statusCfg = TASK_STATUS_CONFIG[task.status] ?? TASK_STATUS_CONFIG['backlog']
                                            return (
                                                <div
                                                    key={task._id}
                                                    className={cn(
                                                        'card-fade-in group flex flex-col sm:flex-row sm:items-start gap-3 px-3 sm:px-4 py-3 sm:py-3.5 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card',
                                                        'hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.32)]',
                                                        'hover:-translate-y-px apple-transition cursor-pointer'
                                                    )}
                                                    onClick={(e) => {
                                                        const target = e.target as HTMLElement
                                                        if (
                                                            target.closest('button') ||
                                                            target.closest('[role="combobox"]') ||
                                                            target.closest('[role="menuitem"]') ||
                                                            target.closest('.dropdown-menu') ||
                                                            target.closest('[data-radix-popper-content-wrapper]')
                                                        ) return
                                                        router.push(`/tasks/${task._id}`)
                                                    }}
                                                >
                                                    {/* Left: status dot circle */}
                                                    <div
                                                        className={cn(
                                                            'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5 hidden sm:flex',
                                                            statusCfg.bg
                                                        )}
                                                    >
                                                        <span className={cn('h-2.5 w-2.5 rounded-full flex-shrink-0', statusCfg.dot, 'status-pulse')} />
                                                    </div>

                                                    {/* Middle: title + meta */}
                                                    <div className="flex-1 min-w-0 space-y-1.5">
                                                        {/* Title row */}
                                                        <div className="flex items-center gap-2">
                                                            {/* Mobile-only: inline status dot */}
                                                            <div
                                                                className={cn(
                                                                    'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center sm:hidden',
                                                                    statusCfg.bg
                                                                )}
                                                            >
                                                                <span className={cn('h-2 w-2 rounded-full flex-shrink-0', statusCfg.dot, 'status-pulse')} />
                                                            </div>
                                                            <TooltipProvider delayDuration={150}>
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <span className="text-[14px] sm:text-[15px] font-semibold text-[var(--apple-label)] truncate">
                                                                            {task.title}
                                                                        </span>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent side="top" align="start" className="max-w-xs break-words">
                                                                        {task.title}
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            </TooltipProvider>
                                                            {task.displayId && (
                                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[11px] font-apple-mono text-[var(--apple-tertiary-label)] flex-shrink-0">
                                                                    {task.displayId}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Badges row — visible on mobile below title */}
                                                        <div className="flex flex-wrap items-center gap-1.5 sm:hidden">
                                                            <StatusBadge status={task.status} />
                                                            <PriorityBadge priority={task.priority} />
                                                            <TypeBadge type={task.type} />
                                                        </div>

                                                        {/* Meta chips row */}
                                                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                                            {task.project?.name && (
                                                                <MetaChip
                                                                    icon={<Target className="h-3 w-3" />}
                                                                    label={task.project.name}
                                                                    title={task.project.name}
                                                                />
                                                            )}
                                                            {task.dueDate && (
                                                                <MetaChip
                                                                    icon={<Calendar className="h-3 w-3" />}
                                                                    label={`Due ${formatDate(task.dueDate)}`}
                                                                />
                                                            )}
                                                            {task.storyPoints != null && (
                                                                <MetaChip
                                                                    icon={<BarChart3 className="h-3 w-3" />}
                                                                    label={`${task.storyPoints} pts`}
                                                                />
                                                            )}
                                                            {task.estimatedHours != null && (
                                                                <MetaChip
                                                                    icon={<Clock className="h-3 w-3" />}
                                                                    label={`${task.estimatedHours}h`}
                                                                />
                                                            )}
                                                            {task.assignedTo && Array.isArray(task.assignedTo) && task.assignedTo.length > 0 && (
                                                                <div className="flex items-center flex-shrink-0">
                                                                    {(task.assignedTo as any[]).map((assignee: any, idx: number, arr: any[]) => {
                                                                        const userData = assignee.user || assignee
                                                                        const displayName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'Unknown User'
                                                                        return (
                                                                            <div key={userData._id || idx} title={displayName} style={{ marginLeft: idx === 0 ? 0 : -6, zIndex: arr.length - idx }}>
                                                                                <GravatarAvatar
                                                                                    user={{
                                                                                        avatar: userData.avatar,
                                                                                        firstName: userData.firstName,
                                                                                        lastName: userData.lastName,
                                                                                        email: userData.email
                                                                                    }}
                                                                                    size={22}
                                                                                    className="border-2 border-background"
                                                                                />
                                                                            </div>
                                                                        )
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Right: badges + inline status select + actions — desktop only */}
                                                    <div className="hidden sm:flex flex-shrink-0 items-center gap-2 flex-wrap justify-end">
                                                        <StatusBadge status={task.status} />
                                                        <PriorityBadge priority={task.priority} />
                                                        <TypeBadge type={task.type} />

                                                        {/* Inline status change */}
                                                        <Select
                                                            value={task.status}
                                                            onValueChange={(value) =>
                                                                handleInlineStatusChange(task, value as Task['status'])
                                                            }
                                                            disabled={statusUpdatingId === task._id || !task.sprint}
                                                        >
                                                            <SelectTrigger
                                                                className="h-7 w-[130px] text-[11px] border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] rounded-[var(--apple-radius-sm)]"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
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

                                                        {/* Actions dropdown */}
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 apple-transition rounded-[var(--apple-radius-sm)]"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
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
                                                                    }}
                                                                >
                                                                    <Edit className="h-4 w-4 mr-2" />
                                                                    Edit Task
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        if (!canDeleteTask(task)) return
                                                                        handleDeleteClick(task)
                                                                    }}
                                                                    disabled={!canDeleteTask(task)}
                                                                    className="text-destructive focus:text-destructive"
                                                                >
                                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                                    Delete Task
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>

                                                    {/* Mobile actions row */}
                                                    <div className="flex sm:hidden items-center justify-between pt-2 border-t border-[var(--apple-separator)]">
                                                        <Select
                                                            value={task.status}
                                                            onValueChange={(value) =>
                                                                handleInlineStatusChange(task, value as Task['status'])
                                                            }
                                                            disabled={statusUpdatingId === task._id || !task.sprint}
                                                        >
                                                            <SelectTrigger
                                                                className="h-7 w-[120px] text-[11px] border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] rounded-[var(--apple-radius-sm)]"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
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
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-7 w-7 p-0 rounded-[var(--apple-radius-sm)]"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
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
                                                                    }}
                                                                >
                                                                    <Edit className="h-4 w-4 mr-2" />
                                                                    Edit Task
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        if (!canDeleteTask(task)) return
                                                                        handleDeleteClick(task)
                                                                    }}
                                                                    disabled={!canDeleteTask(task)}
                                                                    className="text-destructive focus:text-destructive"
                                                                >
                                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                                    Delete Task
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>

                                    {/* Pagination — outside scroll container, in page flow */}
                                    <PaginationBar
                                        currentPage={currentPage}
                                        totalPages={totalPages}
                                        totalCount={totalCount}
                                        pageSize={pageSize}
                                        onPageChange={handlePageChange}
                                        onPageSizeChange={handlePageSizeChange}
                                        loading={loading}
                                        className="mt-4"
                                    />
                                </>
                            ) : (
                                !loading && (
                                    <TasksEmptyState
                                        icon={<ListTodo className="h-10 w-10" />}
                                        title="No tasks found"
                                        description="Try adjusting your filters or create a new task."
                                        action={
                                            canCreateTask ? (
                                                <Button onClick={() => setShowCreateTaskModal(true)}>New Task</Button>
                                            ) : undefined
                                        }
                                    />
                                )
                            )}
                        </>
                    )}
                </div>
            )}

            {/* ── Grid View ─────────────────────────────────────────────────────── */}
            {viewMode === 'grid' && (
                <div className="space-y-4">
                    {shouldShowInitialLoader ? (
                        <FullPageLoader label="Loading tasks..." />
                    ) : (
                        <>
                            {shouldShowInlineLoader && <InlineLoader label="Refreshing tasks..." />}
                            {tasks.length > 0 ? (
                                <>
                                    <div className="grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 animate-in fade-in-0 duration-300">
                                        {tasks.map((task) => {
                                            const statusCfg = TASK_STATUS_CONFIG[task.status] ?? TASK_STATUS_CONFIG['backlog']
                                            return (
                                                <div
                                                    key={task._id}
                                                    className={cn('card-fade-in', cardShell, cardHover, 'p-4 space-y-3')}
                                                    onClick={(e) => {
                                                        const target = e.target as HTMLElement
                                                        if (
                                                            target.closest('button') ||
                                                            target.closest('[role="combobox"]') ||
                                                            target.closest('[role="menuitem"]') ||
                                                            target.closest('[data-radix-popper-content-wrapper]')
                                                        ) return
                                                        router.push(`/tasks/${task._id}`)
                                                    }}
                                                >
                                                    {/* Card header: title + priority badge + actions */}
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex-1 min-w-0 space-y-1">
                                                            <h3 className="text-[14px] font-semibold text-[var(--apple-label)] line-clamp-2 leading-snug">
                                                                {task.title}
                                                            </h3>
                                                            {task.displayId && (
                                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[11px] font-apple-mono text-[var(--apple-tertiary-label)]">
                                                                    {task.displayId}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1 flex-shrink-0">
                                                            <PriorityBadge priority={task.priority} />
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-7 w-7 p-0 rounded-[var(--apple-radius-sm)]"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
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
                                                                        }}
                                                                    >
                                                                        <Edit className="h-4 w-4 mr-2" />
                                                                        Edit Task
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem
                                                                        onClick={(e) => {
                                                                            e.stopPropagation()
                                                                            if (!canDeleteTask(task)) return
                                                                            handleDeleteClick(task)
                                                                        }}
                                                                        disabled={!canDeleteTask(task)}
                                                                        className="text-destructive focus:text-destructive"
                                                                    >
                                                                        <Trash2 className="h-4 w-4 mr-2" />
                                                                        Delete Task
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </div>
                                                    </div>

                                                    {/* Status badge */}
                                                    <div className="flex items-center gap-2">
                                                        <StatusBadge status={task.status} />
                                                        <TypeBadge type={task.type} />
                                                    </div>

                                                    {/* Meta row */}
                                                    <div className="flex flex-wrap items-center gap-3">
                                                        {task.project?.name && (
                                                            <MetaChip
                                                                icon={<Target className="h-3 w-3" />}
                                                                label={task.project.name}
                                                                title={task.project.name}
                                                            />
                                                        )}
                                                        {task.dueDate && (
                                                            <MetaChip
                                                                icon={<Calendar className="h-3 w-3" />}
                                                                label={`Due ${formatDate(task.dueDate)}`}
                                                            />
                                                        )}
                                                        {task.storyPoints != null && (
                                                            <MetaChip
                                                                icon={<BarChart3 className="h-3 w-3" />}
                                                                label={`${task.storyPoints} pts`}
                                                            />
                                                        )}
                                                    </div>

                                                    {/* Footer: assignee avatars */}
                                                    {task.assignedTo && Array.isArray(task.assignedTo) && task.assignedTo.length > 0 && (
                                                        <div className="flex items-center pt-1">
                                                            <div className="flex items-center">
                                                                {(task.assignedTo as any[]).slice(0, 4).map((assignee: any, idx: number, arr: any[]) => {
                                                                    const userData = assignee.user || assignee
                                                                    const displayName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'Unknown User'
                                                                    return (
                                                                        <div key={userData._id || idx} title={displayName} style={{ marginLeft: idx === 0 ? 0 : -6, zIndex: arr.length - idx }}>
                                                                            <GravatarAvatar
                                                                                user={{
                                                                                    avatar: userData.avatar,
                                                                                    firstName: userData.firstName,
                                                                                    lastName: userData.lastName,
                                                                                    email: userData.email
                                                                                }}
                                                                                size={22}
                                                                                className="border-2 border-background"
                                                                            />
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                            {(task.assignedTo as any[]).length > 4 && (
                                                                <span className="ml-1.5 text-[11px] text-[var(--apple-tertiary-label)]">
                                                                    +{(task.assignedTo as any[]).length - 4}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <PaginationBar
                                        currentPage={currentPage}
                                        totalPages={totalPages}
                                        totalCount={totalCount}
                                        pageSize={pageSize}
                                        onPageChange={handlePageChange}
                                        onPageSizeChange={handlePageSizeChange}
                                        loading={loading}
                                    />
                                </>
                            ) : (
                                !loading && (
                                    <TasksEmptyState
                                        icon={<ListTodo className="h-10 w-10" />}
                                        title="No tasks found"
                                        description="Try adjusting your filters or create a new task."
                                        action={
                                            canCreateTask ? (
                                                <Button onClick={() => setShowCreateTaskModal(true)}>New Task</Button>
                                            ) : undefined
                                        }
                                    />
                                )
                            )}
                        </>
                    )}
                </div>
            )}

            {/* ── Kanban View ───────────────────────────────────────────────────── */}
            {viewMode === 'kanban' && (
                <div className="space-y-4">
                    {shouldShowInitialLoader ? (
                        <FullPageLoader label="Loading tasks..." />
                    ) : (
                        <>
                            {shouldShowInlineLoader && <InlineLoader label="Refreshing board..." />}
                            <KanbanBoard
                                projectId={projectFilter}
                                filters={kanbanFilters}
                                onProjectChange={setProjectFilter}
                                onCreateTask={() => setShowCreateTaskModal(true)}
                                onEditTask={handleKanbanEditTask}
                                onDeleteTask={handleKanbanDeleteTask}
                            />
                            {tasks.length === 0 && !loading && (
                                <TasksEmptyState
                                    icon={<ListTodo className="h-10 w-10" />}
                                    title="No tasks found"
                                    description="Try adjusting your filters or create a new task."
                                    action={
                                        canCreateTask ? (
                                            <Button onClick={() => setShowCreateTaskModal(true)}>New Task</Button>
                                        ) : undefined
                                    }
                                />
                            )}
                        </>
                    )}
                </div>
            )}

            {/* ── Modals ────────────────────────────────────────────────────────── */}
            {showCreateTaskModal && (
                <CreateTaskModal
                    isOpen={showCreateTaskModal}
                    onClose={() => setShowCreateTaskModal(false)}
                    projectId={initialFilters.project || ''}
                    onTaskCreated={handleTaskCreated}
                />
            )}

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
