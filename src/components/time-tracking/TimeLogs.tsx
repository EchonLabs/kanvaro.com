'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { Clock, Edit, Trash2, Check, X, Filter, Download, Plus, AlertTriangle, FolderOpen, Target, Loader2, Upload, FileText, User, UserPlus, Search, MoreHorizontal, DollarSign, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/Badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/Checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { useOrganization } from '@/hooks/useOrganization'
import { applyRoundingRules, focusSearchInput, truncateText } from '@/lib/utils'
import { useFeaturePermissions, usePermissions } from '@/lib/permissions/permission-context'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { Permission } from '@/lib/permissions/permission-definitions'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useToast } from '@/components/ui/Toast'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { detectClientTimezone } from '@/lib/timezone'
import { HRManualTimeLogModal } from '@/components/time-tracking/HRManualTimeLogModal'
import { validateAndCorrectDateRangeStrings } from '@/lib/dateRangeValidation'
import { useAuthContext } from '@/contexts/AuthContext'

// Task filter truncation and dropdown width constants
const TRUNCATION_LENGTH = 26
const TASK_FILTER_DROPDOWN_WIDTH = 'w-full'

interface TimeLogsProps {
  userId: string
  organizationId: string
  projectId?: string
  taskId?: string
  onTimeEntryUpdate?: () => void
  refreshKey?: number
  liveActiveTimer?: ActiveTimerPayload | null
  showSelectionAndApproval?: boolean // Default true - controls checkbox selection and approval flow
  showManualLogButtons?: boolean // Default false - controls Bulk Upload and Add Time Log buttons
  timezone?: string
}

interface TimeEntry {
  _id: string
  user: {
    _id: string
    firstName: string
    lastName: string
  }
  description: string
  startTime: string
  endTime?: string | null
  duration: number
  isBillable: boolean
  hourlyRate?: number
  status: string
  category?: string
  tags: string[]
  notes?: string
  isReject?: boolean
  isApproved: boolean
  approvedBy?: { firstName: string; lastName: string }
  project?: { _id: string; name: string; settings?: any } | null
  task?: { _id: string; title: string } | null
  __isActive?: boolean
}

interface ActiveTimerPayload {
  _id: string
  user?: {
    _id: string
    firstName: string
    lastName: string
  }
  description: string
  startTime: string
  currentDuration?: number
  isPaused?: boolean
  project?: { _id: string; name: string }
  task?: { _id: string; title: string }
  isBillable?: boolean
  hourlyRate?: number
  tags?: string[]
}

export function TimeLogs({
  userId,
  organizationId,
  projectId,
  taskId,
  onTimeEntryUpdate,
  refreshKey = 0,
  liveActiveTimer,
  showSelectionAndApproval = true,
  showManualLogButtons = false
}: TimeLogsProps) {
  const { formatDateTimeSafe, preferences } = useDateTime()
  const { showToast } = useToast()
  const pathname = usePathname()
  const { user } = useAuthContext()
  const { organization } = useOrganization()
  const { hasPermission } = usePermissions()

  // Permission flags used throughout the component
  const canViewEmployeeFilter = hasPermission(Permission.TIME_TRACKING_EMPLOYEE_FILTER_READ)
  const canApproveTimeLogs = hasPermission(Permission.TIME_TRACKING_APPROVE)
  const canApproveTime = hasPermission(Permission.TIME_TRACKING_APPROVE)
  const canUpdateTime = hasPermission(Permission.TIME_TRACKING_UPDATE)
  const canDeleteTime = hasPermission(Permission.TIME_TRACKING_DELETE)
  const canEditTimeEntry = (entry: any) => {
    if (hasPermission(Permission.TIME_TRACKING_VIEW_ALL)) return true
    const userId = user ? ((user as any)._id || (user as any).id) : null
    const entryUserId = entry?.user?._id || entry?.user?.id || entry?.userId
    return userId && entryUserId && userId.toString() === entryUserId.toString()
  }
  // Whether the current user has any edit/delete capability on time logs at all,
  // used to decide whether to render the actions (three-dot) menu.
  const canManageAnyTimeEntry = canUpdateTime || canDeleteTime


  // Debug timezone and DateTimeProvider
  useEffect(() => {
  }, [preferences])
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [viewTotals, setViewTotals] = useState<{ totalDuration: number; totalCost: number }>({ totalDuration: 0, totalCost: 0 })
  const [resolvedUserId, setResolvedUserId] = useState<string>(userId || '')
  const [resolvedOrgId, setResolvedOrgId] = useState<string>(organizationId || '')
  const [authResolving, setAuthResolving] = useState<boolean>(!userId || !organizationId)
  const [selectedEntries, setSelectedEntries] = useState<string[]>([])
  const [selectAll, setSelectAll] = useState(false)
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null)
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    status: '',
    isBillable: '',
    isApproved: '',
    projectId: '',
    taskId: '',
    employeeId: ''
  })
  const [filterProjects, setFilterProjects] = useState<any[]>([])
  const [filterTasks, setFilterTasks] = useState<any[]>([])
  const [filterEmployees, setFilterEmployees] = useState<any[]>([])
  const [filterProjectsLoading, setFilterProjectsLoading] = useState(false)
  const [filterTasksLoading, setFilterTasksLoading] = useState(false)
  const [filterEmployeesLoading, setFilterEmployeesLoading] = useState(false)
  const [projectSearch, setProjectSearch] = useState('')
  const [taskSearch, setTaskSearch] = useState('')
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [statusSearch, setStatusSearch] = useState('')
  const [modalProjectSearch, setModalProjectSearch] = useState('')
  const [modalTaskSearch, setModalTaskSearch] = useState('')

  const projectFilterSearchInputRef = useRef<HTMLInputElement | null>(null)
  const taskFilterSearchInputRef = useRef<HTMLInputElement | null>(null)
  const employeeFilterSearchInputRef = useRef<HTMLInputElement | null>(null)
  const statusFilterSearchInputRef = useRef<HTMLInputElement | null>(null)
  const modalProjectSearchInputRef = useRef<HTMLInputElement | null>(null)
  const modalTaskSearchInputRef = useRef<HTMLInputElement | null>(null)
  const modalEmployeeSearchInputRef = useRef<HTMLInputElement | null>(null)


  // Filtered lists based on search queries
  const filteredProjects = useMemo(() => {
    if (!projectSearch.trim()) return filterProjects
    const searchLower = projectSearch.toLowerCase()
    return filterProjects.filter(project =>
      project.name?.toLowerCase().includes(searchLower)
    )
  }, [filterProjects, projectSearch])

  const filteredTasks = useMemo(() => {
    // Apply smart truncation with capital letter detection
    return filterTasks.map(task => {
      const { truncated, isTruncated } = truncateText(task.title, TRUNCATION_LENGTH)
      return {
        ...task,
        truncated,
        isTruncated
      }
    })
  }, [filterTasks])

  const filteredEmployees = useMemo(() => {
    if (!employeeSearch.trim()) return filterEmployees
    const searchLower = employeeSearch.toLowerCase()
    return filterEmployees.filter(employee => {
      const fullName = `${employee.firstName || ''} ${employee.lastName || ''}`.toLowerCase()
      const email = employee.email?.toLowerCase() || ''
      return fullName.includes(searchLower) || email.includes(searchLower)
    })
  }, [filterEmployees, employeeSearch])

  const statusOptions = [
    { value: 'all', label: 'All statuses' },
    { value: 'completed', label: 'Completed' },
    { value: 'running', label: 'Running' },
    { value: 'paused', label: 'Paused' },
    { value: 'cancelled', label: 'Cancelled' }
  ]

  const filteredStatusOptions = useMemo(() => {
    if (!statusSearch.trim()) return statusOptions
    const searchLower = statusSearch.toLowerCase()
    return statusOptions.filter(option =>
      option.label.toLowerCase().includes(searchLower)
    )
  }, [statusSearch])

  // Handle status filter change - convert 'all' to empty string
  const handleStatusFilterChange = (value: string) => {
    handleFilterChange('status', value === 'all' ? '' : value)
  }

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0
  })
  const [activeTimerEntry, setActiveTimerEntry] = useState<ActiveTimerPayload | null>(null)
  const activeDurationBaseRef = useRef<number>(0)
  const activeTickStartRef = useRef<number | null>(null)
  const activeIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const [activeTimerDisplayDuration, setActiveTimerDisplayDuration] = useState<number>(0)
  const [timeTrackingSettings, setTimeTrackingSettings] = useState<any>(null)
  const [organizationSettings, setOrganizationSettings] = useState<any>(null)
  const [projectSettings, setProjectSettings] = useState<any>(null)
  const [showAddTimeLogModal, setShowAddTimeLogModal] = useState(false)
  const [projects, setProjects] = useState<any[]>([])
  const [selectedProjectForLog, setSelectedProjectForLog] = useState('')
  const [tasks, setTasks] = useState<any[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [selectedTaskForLog, setSelectedTaskForLog] = useState('')
  const [selectedEmployeeForLog, setSelectedEmployeeForLog] = useState('')
  const [modalEmployeeSearch, setModalEmployeeSearch] = useState('')

  const filteredModalProjects = useMemo(() => {
    if (!modalProjectSearch.trim()) return projects
    const searchLower = modalProjectSearch.toLowerCase()
    return projects.filter(project =>
      project.name?.toLowerCase().includes(searchLower)
    )
  }, [projects, modalProjectSearch])

  const filteredModalTasks = useMemo(() => {
    if (!modalTaskSearch.trim()) return tasks
    const searchLower = modalTaskSearch.toLowerCase()
    return tasks.filter(task =>
      task.title?.toLowerCase().includes(searchLower) ||
      task.displayId?.toLowerCase().includes(searchLower)
    )
  }, [tasks, modalTaskSearch])

  const selectedTaskForLogObject = useMemo(() =>
    tasks.find(t => t._id === selectedTaskForLog),
    [tasks, selectedTaskForLog]
  )

  const filteredModalEmployees = useMemo(() => {
    if (!modalEmployeeSearch.trim()) return filterEmployees
    const searchLower = modalEmployeeSearch.toLowerCase()
    return filterEmployees.filter(emp => {
      const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.toLowerCase()
      const email = emp.email?.toLowerCase() || ''
      return fullName.includes(searchLower) || email.includes(searchLower)
    })
  }, [filterEmployees, modalEmployeeSearch])
  const [manualLogData, setManualLogData] = useState({
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    description: ''
  })
  const [submittingManualLog, setSubmittingManualLog] = useState(false)
  const [startDateError, setStartDateError] = useState('')
  const [startTimeError, setStartTimeError] = useState('')
  const [endDateError, setEndDateError] = useState('')
  const [endTimeError, setEndTimeError] = useState('')
  const [showHRManualLogModal, setShowHRManualLogModal] = useState(false)
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false)
  const [bulkUploadFile, setBulkUploadFile] = useState<File | null>(null)
  const [bulkUploadProgress, setBulkUploadProgress] = useState<{ total: number; processed: number; successful: number; failed: number } | null>(null)
  const [bulkUploadErrors, setBulkUploadErrors] = useState<Array<{ row: number; error: string }>>([])
  const [uploadingBulk, setUploadingBulk] = useState(false)
  const [rowUploadStatus, setRowUploadStatus] = useState<Map<number, { status: 'pending' | 'success' | 'error'; error?: string }>>(new Map())
  const [showBulkUploadProgressAlert, setShowBulkUploadProgressAlert] = useState(true)
  const [bulkUploadSuccess, setBulkUploadSuccess] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<TimeEntry | null>(null)
  const [isDeletingEntry, setIsDeletingEntry] = useState(false)
  const [editInitial, setEditInitial] = useState<{
    projectId: string
    taskId: string
    startDate: string
    startTime: string
    endDate: string
    endTime: string
    description: string
  } | null>(null)

  // Resolve auth if props are missing

  // Fetch projects for filter
  useEffect(() => {
    const fetchFilterProjects = async () => {
      if (!resolvedOrgId) return
      setFilterProjectsLoading(true)
      try {
        const response = await fetch('/api/projects?limit=1000')
        const data = await response.json()
        if (data.success && Array.isArray(data.data)) {
          // Filter projects that allow time tracking
          const filtered = data.data.filter((project: any) => {
            const allow = project?.settings?.allowTimeTracking
            if (!allow) return false

            // Admins/managers with employee filter permission can see all projects
            if (canViewEmployeeFilter) return true

            // Check if user created the project (createdBy may be populated object or string)
            const createdByMatch =
              project?.createdBy === resolvedUserId ||
              project?.createdBy?._id === resolvedUserId ||
              project?.createdBy?.id === resolvedUserId

            // Check if user is in teamMembers array
            // Each entry is { memberId: { _id, firstName, ... } | string, hourlyRate }
            const teamMembers = Array.isArray(project?.teamMembers) ? project.teamMembers : []
            const teamMatch = teamMembers.some((member: any) => {
              const mid = member?.memberId
              if (!mid) return false
              if (typeof mid === 'string') return mid === resolvedUserId
              return mid?._id === resolvedUserId || mid?.id === resolvedUserId
            })

            // Check if user is the project client (client may be populated object or string)
            const clientMatch =
              project?.client === resolvedUserId ||
              project?.client?._id === resolvedUserId ||
              project?.client?.id === resolvedUserId

            return createdByMatch || teamMatch || clientMatch
          })
          setFilterProjects(filtered)
        }
      } catch (error) {
        console.error('Failed to fetch projects for filter:', error)
      } finally {
        setFilterProjectsLoading(false)
      }
    }
    fetchFilterProjects()
  }, [resolvedOrgId, resolvedUserId, canViewEmployeeFilter])

  // Memoized fetch tasks for filter to support pagination and search
  const fetchFilterTasks = useCallback(async (search: string = '') => {
    if (!resolvedOrgId || !filters.projectId) {
      setFilterTasks([])
      setFilterTasksLoading(false)
      return
    }

    setFilterTasksLoading(true)
    try {
      const params = new URLSearchParams({
        project: filters.projectId,
        limit: search ? '1000' : '10',
        search: search
      })
      const response = await fetch(`/api/tasks?${params}`)
      const data = await response.json()
      if (data.success && Array.isArray(data.data)) {
        setFilterTasks(data.data)
      } else {
        setFilterTasks([])
      }
    } catch (error) {
      console.error('Failed to fetch tasks for filter:', error)
      setFilterTasks([])
    } finally {
      setFilterTasksLoading(false)
    }
  }, [resolvedOrgId, filters.projectId])

  // Fetch tasks for filter when project is selected
  useEffect(() => {
    if (filters.projectId) {
      fetchFilterTasks('')
    } else {
      setFilterTasks([])
    }
  }, [filters.projectId, fetchFilterTasks])

  // Debounced task search for filter
  useEffect(() => {
    const timer = setTimeout(() => {
      if (filters.projectId && taskSearch) {
        fetchFilterTasks(taskSearch)
      } else if (filters.projectId && !taskSearch) {
        // If search is cleared, reload the top 10 tasks
        fetchFilterTasks('')
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [taskSearch, filters.projectId, fetchFilterTasks])

  // Fetch employees for filter (only if user has permission)
  useEffect(() => {
    const fetchFilterEmployees = async () => {
      if (!canViewEmployeeFilter || !resolvedOrgId) {
        setFilterEmployees([])
        return
      }
      setFilterEmployeesLoading(true)
      try {
        const response = await fetch('/api/members?limit=10000&page=1')
        const data = await response.json()
        if (data.success && Array.isArray(data.data?.members)) {
          setFilterEmployees(data.data.members)
        } else {
          setFilterEmployees([])
        }
      } catch (error) {
        console.error('Failed to fetch employees for filter:', error)
        setFilterEmployees([])
      } finally {
        setFilterEmployeesLoading(false)
      }
    }
    fetchFilterEmployees()
  }, [canViewEmployeeFilter, resolvedOrgId])

  // Fetch organization settings for application-level allowManualTimeSubmission
  // Load settings immediately to ensure buttons show based on actual settings
  useEffect(() => {
    if (organization?.settings?.timeTracking) {
      setOrganizationSettings(organization.settings.timeTracking)
    } else if (organization) {
      // If organization exists but no timeTracking settings, use defaults (allowManualTimeSubmission defaults to true)
      setOrganizationSettings({ allowManualTimeSubmission: true })
    }
  }, [organization])

  // Fetch time tracking settings (project-specific if projectId provided, otherwise organization-level)
  useEffect(() => {
    const fetchTimeTrackingSettings = async () => {
      if (!resolvedOrgId) return

      try {
        const params = new URLSearchParams()
        if (projectId) {
          params.append('projectId', projectId)
        }
        const response = await fetch(`/api/time-tracking/settings?${params}`)
        if (response.ok) {
          const data = await response.json()
          if (data.settings) {
            console.log('Fetched time tracking settings:', data.settings)
            if (data.settings.disableTimeLogEditing) {
              if (data.settings.timeLogEditMode === 'dayOfMonth') {
                const disble_from_month = data.settings.timeLogEditDayOfMonth
                const disable_from_created_date = null
              } else {
                const disable_from_created_date = data.settings.timeLogEditDays
                const disble_from_month = null
              }
            }
            setTimeTrackingSettings(data.settings)
          }
        }
      } catch (error) {
        console.error('Error fetching time tracking settings:', error)
      }
    }

    fetchTimeTrackingSettings()
  }, [resolvedOrgId, projectId])

  // Fetch project settings if projectId is provided
  useEffect(() => {
    const fetchProjectSettings = async () => {
      if (!projectId || !resolvedOrgId) {
        setProjectSettings(null)
        return
      }

      try {
        const response = await fetch(`/api/projects/${projectId}`)
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.project?.settings) {
            setProjectSettings(data.project.settings)
          }
        }
      } catch (error) {
        console.error('Error fetching project settings:', error)
      }
    }

    fetchProjectSettings()
  }, [projectId, resolvedOrgId])

  // Check if manual time submission is enabled at both levels
  const canAddManualTimeLog = useMemo(() => {
    // Application level (organization settings) - default to true (database default)
    const orgLevelEnabled = organizationSettings?.allowManualTimeSubmission ?? true

    // Project level - check project.settings.allowManualTimeSubmission if projectId is provided
    let projectLevelEnabled = true // Default to true if no project
    if (projectId) {
      // If project has its own settings, use that; otherwise use timeTrackingSettings
      projectLevelEnabled = projectSettings?.allowManualTimeSubmission ?? timeTrackingSettings?.allowManualTimeSubmission ?? true
    } else {
      // No project context, use timeTrackingSettings (organization-level)
      projectLevelEnabled = timeTrackingSettings?.allowManualTimeSubmission ?? true
    }

    return orgLevelEnabled && projectLevelEnabled
  }, [organizationSettings, timeTrackingSettings, projectSettings, projectId])

  // Fetch projects for manual time log modal
  useEffect(() => {
    const fetchProjects = async () => {
      if (!resolvedUserId || !resolvedOrgId) return
      // Admin/HR adding new entries use employee-scoped fetching instead
      if (canViewEmployeeFilter && !isEditing) return
      try {
        const response = await fetch('/api/projects')
        const data = await response.json()
        if (data.success && Array.isArray(data.data)) {
          // Filter projects by strict requirements (matching timer page):
          // 1. project.settings.allowTimeTracking === true (explicitly enabled)
          // 2. project.teamMembers contains logged user as memberId
          const eligibleProjects = data.data.filter((project: any) => {
            // Check project-level time tracking setting - must be explicitly true
            const projectAllowsTimeTracking = project?.settings?.allowTimeTracking === true
            if (!projectAllowsTimeTracking) return false

            // Check if user is in teamMembers array as memberId
            const teamMembers = Array.isArray(project?.teamMembers) ? project.teamMembers : []
            const isUserTeamMember = teamMembers.some((member: any) => {
              if (typeof member === 'object' && member !== null) {
                return member.memberId === resolvedUserId || member.memberId?._id === resolvedUserId || member.memberId?.id === resolvedUserId
              }
              return false
            })

            return isUserTeamMember
          })

          let final = eligibleProjects
          if (isEditing && selectedEntry?.project?._id) {
            const exists = eligibleProjects.some((p: any) => p?._id === selectedEntry.project!._id)
            if (!exists) {
              final = [...eligibleProjects, { _id: selectedEntry.project._id, name: selectedEntry.project.name }]
            }
          }
          setProjects(final)
        }
      } catch (err) {
        console.error('Failed to fetch projects:', err)
      }
    }
    if (showAddTimeLogModal || isEditing) {
      fetchProjects()
    }
  }, [showAddTimeLogModal, isEditing, resolvedUserId, resolvedOrgId, selectedEntry])

  // Fetch employee-scoped projects when admin/HR selects a team member in add mode
  useEffect(() => {
    if (!canViewEmployeeFilter || !showAddTimeLogModal || isEditing) return
    const fetchEmployeeScopedProjects = async () => {
      setProjects([])
      setSelectedProjectForLog('')
      setSelectedTaskForLog('')
      setTasks([])
      setModalProjectSearch('')
      setModalTaskSearch('')
      if (!selectedEmployeeForLog || !resolvedOrgId) return
      try {
        const res = await fetch(`/api/time-tracking/hr/employee-projects?employeeId=${selectedEmployeeForLog}&organizationId=${resolvedOrgId}`)
        const data = await res.json()
        if (data.success && Array.isArray(data.projects)) {
          setProjects(data.projects)
        } else {
          setProjects([])
        }
      } catch {
        setProjects([])
        showToast({ type: 'error', title: 'Failed to load employee projects' })
      }
    }
    fetchEmployeeScopedProjects()
  }, [selectedEmployeeForLog, canViewEmployeeFilter, showAddTimeLogModal, isEditing, resolvedOrgId])

  // Fetch tasks when project is selected
  useEffect(() => {
    if (selectedProjectForLog) {
      if (canViewEmployeeFilter && selectedEmployeeForLog && !isEditing) {
        loadEmployeeScopedTasks(selectedEmployeeForLog, selectedProjectForLog)
      } else {
        loadTasksForProject(selectedProjectForLog)
      }
    } else {
      setTasks([])
      setSelectedTaskForLog('')
    }
  }, [selectedProjectForLog, resolvedUserId, isEditing, selectedEntry, canViewEmployeeFilter, selectedEmployeeForLog])

  // Clear form when opening add time log modal
  useEffect(() => {
    if (showAddTimeLogModal && !isEditing) {
      setManualLogData({
        startDate: '',
        startTime: '',
        endDate: '',
        endTime: '',
        description: ''
      })
      setSelectedEmployeeForLog('')
      setModalEmployeeSearch('')
      setSelectedProjectForLog('')
      setSelectedTaskForLog('')
      setTasks([])
      setProjects([])
      setModalProjectSearch('')
      setModalTaskSearch('')
      setError('')
      clearFieldErrors()
    }
  }, [showAddTimeLogModal, isEditing])

  // Helper function to combine date and time into datetime-local format
  const combineDateTime = (date: string, time: string): string => {
    if (!date || !time) return ''
    return `${date}T${time}`
  }

  const formatDateForInput = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const formatTimeForInput = (date: Date): string => {
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${hours}:${minutes}`
  }

  // Helper function to clear all field validation errors
  const clearFieldErrors = () => {
    setStartDateError('')
    setStartTimeError('')
    setEndDateError('')
    setEndTimeError('')
  }

  // Helper function to get billable status from selected task
  const getBillableFromTask = (taskId: string): boolean => {
    const selectedTask = tasks.find(task => task._id === taskId)
    return selectedTask?.isBillable ?? false
  }

  // Validate maxSessionHours and future time when dates/times change
  const validateSessionHours = useCallback(() => {
    // Clear all field-specific errors
    setStartDateError('')
    setStartTimeError('')
    setEndDateError('')
    setEndTimeError('')

    if (!manualLogData.startDate || !manualLogData.startTime || !manualLogData.endDate || !manualLogData.endTime) {
      return
    }

    const startDateTime = combineDateTime(manualLogData.startDate, manualLogData.startTime)
    const endDateTime = combineDateTime(manualLogData.endDate, manualLogData.endTime)

    if (!startDateTime || !endDateTime) {
      return
    }

    const start = new Date(startDateTime)
    const end = new Date(endDateTime)

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return
    }

    if (end <= start) {
      setEndTimeError('End time must be after start time')
      return
    }

    const now = new Date()

    // Check for future time logging
    if (!timeTrackingSettings?.allowFutureTime) {
      if (start > now) {
        setStartDateError('Future time not allowed. Please select a time that is today or in the past.')
        return
      }
      if (end > now) {
        setEndDateError('Future time not allowed. Please select a time that is today or in the past.')
        return
      }
    }

    // Check past time limit when past time is allowed
    if (timeTrackingSettings?.allowPastTime === true && timeTrackingSettings?.pastTimeLimitDays) {
      const daysDiff = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      if (daysDiff > timeTrackingSettings.pastTimeLimitDays) {
        setStartDateError(`Past time logging not allowed beyond ${timeTrackingSettings.pastTimeLimitDays} days. Please select a more recent date.`)
        return
      }
    }

    // Check maxSessionHours when overtime is NOT allowed
    if (timeTrackingSettings?.allowOvertime === false && timeTrackingSettings?.maxSessionHours) {
      const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60)
      const durationHours = durationMinutes / 60
      const maxHours = timeTrackingSettings.maxSessionHours

      if (durationHours > maxHours) {
        setEndTimeError(`Overtime not allowed. Session duration (${durationHours.toFixed(2)}h) exceeds maximum allowed (${maxHours}h). Please reduce the time or contact your administrator to enable overtime.`)
        return
      }
    }

    // Validate billable time settings
    if (selectedTaskForLog) {
      const selectedTask = tasks.find(task => task._id === selectedTaskForLog)
      if (selectedTask?.isBillable && timeTrackingSettings && !timeTrackingSettings.allowBillableTime) {
        setEndTimeError('Billable time logging is not allowed for this organization. Please select a non-billable task or contact your administrator.')
        return
      }
    }

    // Check maxSessionHours only when overtime is allowed
    if (timeTrackingSettings?.allowOvertime === true && timeTrackingSettings?.maxSessionHours) {
      const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60)
      const durationHours = durationMinutes / 60
      const maxHours = timeTrackingSettings.maxSessionHours

      if (durationHours > maxHours) {
        setEndTimeError(`Session duration (${durationHours.toFixed(2)}h) exceeds maximum allowed (${maxHours}h).`)
        return
      }
    }
  }, [manualLogData.startDate, manualLogData.startTime, manualLogData.endDate, manualLogData.endTime, timeTrackingSettings, selectedTaskForLog, tasks])

  useEffect(() => {
    validateSessionHours()
  }, [validateSessionHours])

  // Calculate duration for display
  const calculatedDuration = useMemo(() => {
    if (!manualLogData.startDate || !manualLogData.startTime || !manualLogData.endDate || !manualLogData.endTime) {
      return null
    }

    const startDateTime = combineDateTime(manualLogData.startDate, manualLogData.startTime)
    const endDateTime = combineDateTime(manualLogData.endDate, manualLogData.endTime)

    if (!startDateTime || !endDateTime) {
      return null
    }

    const start = new Date(startDateTime)
    const end = new Date(endDateTime)

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      return null
    }

    const durationMinutes = Math.floor((end.getTime() - start.getTime()) / (1000 * 60))
    const hours = Math.floor(durationMinutes / 60)
    const minutes = durationMinutes % 60

    return { hours, minutes, totalMinutes: durationMinutes }
  }, [manualLogData.startDate, manualLogData.startTime, manualLogData.endDate, manualLogData.endTime])

  const handleSubmitManualLog = async () => {
    if (canViewEmployeeFilter && !selectedEmployeeForLog) {
      setError('Please select a team member to log time for')
      return
    }

    if (!selectedProjectForLog || !resolvedUserId) {
      setError('Project selection required')
      return
    }

    if (!selectedTaskForLog) {
      setError('Task selection required')
      return
    }

    if (!manualLogData.description.trim()) {
      setError('Memo is required')
      return
    }

    if (!manualLogData.startDate || !manualLogData.startTime || !manualLogData.endDate || !manualLogData.endTime) {
      setError('All date and time fields are required')
      return
    }

    const startDateTime = combineDateTime(manualLogData.startDate, manualLogData.startTime)
    const endDateTime = combineDateTime(manualLogData.endDate, manualLogData.endTime)

    const start = new Date(startDateTime)
    const end = new Date(endDateTime)

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setError('Invalid date/time values')
      return
    }

    if (end <= start) {
      setError('End time must be after start time')
      return
    }

    if (startDateError || startTimeError || endDateError || endTimeError) {
      return
    }

    setSubmittingManualLog(true)
    setError('')

    try {
      const response = await fetch('/api/time-tracking/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: canViewEmployeeFilter ? selectedEmployeeForLog : resolvedUserId,
          organizationId: resolvedOrgId,
          projectId: selectedProjectForLog,
          taskId: selectedTaskForLog,
          description: manualLogData.description || undefined,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          isBillable: getBillableFromTask(selectedTaskForLog) && timeTrackingSettings?.allowBillableTime
        })
      })

      const data = await response.json()

      if (response.ok) {
        setShowAddTimeLogModal(false)
        setManualLogData({
          startDate: '',
          startTime: '',
          endDate: '',
          endTime: '',
          description: ''
        })
        setSelectedEmployeeForLog('')
        setModalEmployeeSearch('')
        setSelectedProjectForLog('')
        setSelectedTaskForLog('')
        setModalProjectSearch('')
        setModalTaskSearch('')
        setTasks([])
        setProjects([])
        loadTimeEntries()
        onTimeEntryUpdate?.()
      } else {
        setError(data.error || 'Failed to create time entry')
      }
    } catch (error) {
      setError('Failed to create time entry')
    } finally {
      setSubmittingManualLog(false)
    }
  }

  const handleUpdateTimeLog = async () => {
    if (!selectedEntry) {
      setError('No entry selected to update')
      return
    }

    if (!selectedProjectForLog || !resolvedUserId) {
      setError('Project selection required')
      return
    }

    if (!selectedTaskForLog) {
      setError('Task selection required')
      return
    }

    if (!manualLogData.description.trim()) {
      setError('Memo is required')
      return
    }

    if (!manualLogData.startDate || !manualLogData.startTime || !manualLogData.endDate || !manualLogData.endTime) {
      setError('All date and time fields are required')
      return
    }

    const startDateTime = combineDateTime(manualLogData.startDate, manualLogData.startTime)
    const endDateTime = combineDateTime(manualLogData.endDate, manualLogData.endTime)

    const start = new Date(startDateTime)
    const end = new Date(endDateTime)

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setError('Invalid date/time values')
      return
    }

    if (end <= start) {
      setError('End time must be after start time')
      return
    }

    if (startDateError || startTimeError || endDateError || endTimeError) {
      return
    }

    setSubmittingManualLog(true)
    setError('')

    try {
      const response = await fetch(`/api/time-tracking/entries/${selectedEntry._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: resolvedUserId,
          organizationId: resolvedOrgId,
          projectId: selectedProjectForLog,
          taskId: selectedTaskForLog,
          description: manualLogData.description || undefined,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          isBillable: getBillableFromTask(selectedTaskForLog) && timeTrackingSettings?.allowBillableTime
        })
      })

      const data = await response.json().catch(() => ({}))

      if (response.ok) {
        setIsEditing(false)
        setManualLogData({
          startDate: '',
          startTime: '',
          endDate: '',
          endTime: '',
          description: ''
        })
        setSelectedProjectForLog('')
        setSelectedTaskForLog('')
        setModalProjectSearch('')
        setTasks([])
        setEditInitial(null)
        loadTimeEntries()
        onTimeEntryUpdate?.()
      } else {
        setError((data as any).error || 'Failed to update time entry')
      }
    } catch (error) {
      setError('Failed to update time entry')
    } finally {
      setSubmittingManualLog(false)
    }
  }

  // Load time entries
  const formatDuration = (minutes: number) => {
    // Apply rounding rules if enabled
    let displayMinutes = minutes
    const roundingRules = timeTrackingSettings?.roundingRules
    if (roundingRules?.enabled) {
      displayMinutes = applyRoundingRules(minutes, {
        enabled: roundingRules.enabled,
        increment: roundingRules.increment || 15,
        roundUp: roundingRules.roundUp ?? true
      })
    }

    const hours = Math.floor(displayMinutes / 60)
    const mins = Math.floor(displayMinutes % 60)
    const secs = Math.floor((displayMinutes % 1) * 60)
    return `${hours}h ${mins}m${secs > 0 ? ` ${secs}s` : ''}`
  }

  const passesDateFilters = useCallback(
    (dateString: string) => {
      const entryDate = new Date(dateString)
      if (Number.isNaN(entryDate.getTime())) return true

      if (filters.startDate) {
        const start = new Date(filters.startDate)
        start.setHours(0, 0, 0, 0)
        if (entryDate < start) return false
      }

      if (filters.endDate) {
        const end = new Date(filters.endDate)
        end.setHours(23, 59, 59, 999)
        if (entryDate > end) return false
      }

      return true
    },
    [filters.startDate, filters.endDate]
  )

  const passesStatusFilter = useCallback(
    (status: string) => {
      const normalized = status.toLowerCase()
      if (!filters.status || filters.status === 'all') return true
      return filters.status === normalized
    },
    [filters.status]
  )

  const mapActiveTimerPayload = useCallback((timer: ActiveTimerPayload): ActiveTimerPayload => {
    return {
      _id: timer._id,
      user: timer.user,
      description: timer.description,
      startTime: timer.startTime,
      currentDuration: timer.currentDuration ?? 0,
      isPaused: timer.isPaused ?? false,
      project: timer.project,
      task: timer.task,
      isBillable: timer.isBillable ?? true,
      hourlyRate: timer.hourlyRate,
      tags: timer.tags ?? []
    }
  }, [])

  const loadActiveTimer = useCallback(async () => {
    if (!resolvedUserId || !resolvedOrgId) return
    try {
      const params = new URLSearchParams({
        userId: resolvedUserId,
        organizationId: resolvedOrgId
      })
      const response = await fetch(`/api/time-tracking/timer?${params}`)
      const data = await response.json()

      if (response.ok && data.activeTimer) {
        setActiveTimerEntry(mapActiveTimerPayload(data.activeTimer))
      } else {
        setActiveTimerEntry(null)
      }
    } catch (error) {
      console.error('Failed to load active timer', error)
    }
  }, [resolvedUserId, resolvedOrgId, mapActiveTimerPayload])

  useEffect(() => {
    if (liveActiveTimer === undefined) return
    if (liveActiveTimer === null) {
      setActiveTimerEntry(null)
      setActiveTimerDisplayDuration(0)
      return
    }
    setActiveTimerEntry(mapActiveTimerPayload(liveActiveTimer))
  }, [liveActiveTimer, mapActiveTimerPayload])

  useEffect(() => {
    if (activeIntervalRef.current) {
      clearInterval(activeIntervalRef.current)
      activeIntervalRef.current = null
    }

    if (!activeTimerEntry) {
      setActiveTimerDisplayDuration(0)
      activeDurationBaseRef.current = 0
      activeTickStartRef.current = null
      return
    }

    activeDurationBaseRef.current = activeTimerEntry.currentDuration ?? 0
    setActiveTimerDisplayDuration(activeDurationBaseRef.current)

    if (activeTimerEntry.isPaused) {
      activeTickStartRef.current = null
      return
    }

    activeTickStartRef.current = Date.now()
    activeIntervalRef.current = setInterval(() => {
      if (activeTickStartRef.current === null) return
      const elapsed = (Date.now() - activeTickStartRef.current) / 60000
      setActiveTimerDisplayDuration(Math.max(0, activeDurationBaseRef.current + elapsed))
    }, 1000)

    return () => {
      if (activeIntervalRef.current) {
        clearInterval(activeIntervalRef.current)
        activeIntervalRef.current = null
      }
    }
  }, [activeTimerEntry])

  const loadTimeEntries = useCallback(async () => {
    if (!resolvedUserId || !resolvedOrgId) return
    setIsLoading(true)
    setError('')

    try {
      const params = new URLSearchParams({
        organizationId: resolvedOrgId,
        page: pagination.page.toString(),
        limit: pagination.limit.toString()
      })

      // Use filter projectId/taskId if provided, otherwise use props
      const effectiveProjectId = filters.projectId || (projectId && projectId !== 'undefined' && projectId !== 'null' ? projectId : null)
      const effectiveTaskId = filters.taskId || taskId || null

      if (effectiveProjectId) params.append('projectId', effectiveProjectId)
      if (effectiveTaskId) params.append('taskId', effectiveTaskId)

      // Employee scoping:
      // - If user has employee filter permission and an employee is selected, request that user's logs
      // - If user has permission but no employee selected, omit userId so the server scopes to assigned users
      // - If user lacks permission, restrict to self
      if (canViewEmployeeFilter) {
        if (filters.employeeId) {
          params.append('userId', filters.employeeId)
        }
      } else {
        params.append('userId', resolvedUserId)
      }
      if (filters.startDate) params.append('startDate', filters.startDate)
      if (filters.endDate) params.append('endDate', filters.endDate)
      if (filters.status && filters.status !== 'all') params.append('status', filters.status)
      if (filters.isBillable && filters.isBillable !== 'all') params.append('isBillable', filters.isBillable)
      if (filters.isApproved && filters.isApproved !== 'all') {
        params.append('isApproved', filters.isApproved)
      }

      const response = await fetch(`/api/time-tracking/entries?${params}`, { cache: 'no-store' })
      const data = await response.json()

      if (response.ok) {
        // Handle both data.data and data.timeEntries for backward compatibility
        const entries = data.data || data.timeEntries || []
        setTimeEntries(Array.isArray(entries) ? entries : [])
        setPagination(data.pagination)

        const totals = data.totals || {}
        setViewTotals({
          totalDuration: typeof totals.totalDuration === 'number' ? totals.totalDuration : 0,
          totalCost: typeof totals.totalCost === 'number' ? totals.totalCost : 0
        })
      } else {
        setError(data.error || 'Failed to load time entries')
      }
    } catch (error) {
      setError('Failed to load time entries')
    } finally {
      setIsLoading(false)
    }
  }, [resolvedUserId, resolvedOrgId, projectId, taskId, pagination.page, pagination.limit, filters, canViewEmployeeFilter])

  useEffect(() => {
    if (!authResolving) {
      loadTimeEntries()
      loadActiveTimer()
    }
  }, [authResolving, loadTimeEntries, loadActiveTimer, refreshKey])


  const handleApproveEntries = async (action: 'approve' | 'reject', entryId?: string) => {
    const entryIds = entryId ? [entryId] : selectedEntries
    if (entryIds.length === 0) return

    try {
      const response = await fetch('/api/time-tracking/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeEntryIds: entryIds,
          approvedBy: resolvedUserId,
          action
        })
      })

      if (response.ok) {
        if (!entryId) {
          setSelectedEntries([])
        }
        loadTimeEntries()
        onTimeEntryUpdate?.()
      } else {
        const data = await response.json()
        setError(data.error || `Failed to ${action} time entries`)
      }
    } catch (error) {
      setError(`Failed to ${action} time entries`)
    }
  }

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => {
      const newFilters = { ...prev, [key]: value }

      // If project filter changes, clear task filter if task doesn't belong to new project
      if (key === 'projectId') {
        setTaskSearch('') // Clear search query when project changes
        if (value && prev.taskId) {
          // Check if current task belongs to new project
          const taskBelongsToProject = filterTasks.some(t => t._id === prev.taskId && t.project === value)
          if (!taskBelongsToProject) {
            newFilters.taskId = ''
          }
        } else if (!value) {
          // If project is cleared, clear task filter too
          newFilters.taskId = ''
        }
      }

      // Validate and auto-correct date range when start or end date changes
      if (key === 'startDate' || key === 'endDate') {
        const corrected = validateAndCorrectDateRangeStrings(
          key === 'startDate' ? newFilters.startDate : prev.startDate,
          key === 'endDate' ? newFilters.endDate : prev.endDate
        )
        newFilters.startDate = corrected.startDate
        newFilters.endDate = corrected.endDate
      }

      return newFilters
    })
    setPagination(prev => ({ ...prev, page: 1 }))
  }

  const handlePageChange = (page: number) => {
    setPagination(prev => ({ ...prev, page }))
  }

  const activeTimerDisplay = useMemo(() => {
    if (!activeTimerEntry) return null

    const matchesProject = !projectId || activeTimerEntry.project?._id === projectId
    const matchesTask = !taskId || activeTimerEntry.task?._id === taskId
    const matchesEmployee = !filters.employeeId ||
      activeTimerEntry.user?._id === filters.employeeId ||
      (activeTimerEntry.user as any)?.id === filters.employeeId ||
      (!activeTimerEntry.user && resolvedUserId === filters.employeeId);

    const status = activeTimerEntry.isPaused ? 'paused' : 'running'

    if (!matchesProject || !matchesTask || !matchesEmployee) return null
    if (!passesStatusFilter(status)) return null
    if (!passesDateFilters(activeTimerEntry.startTime)) return null

    return {
      _id: activeTimerEntry._id,
      user: activeTimerEntry.user ?? {
        _id: resolvedUserId || '',
        firstName: '',
        lastName: ''
      },
      description: activeTimerEntry.description,
      startTime: activeTimerEntry.startTime,
      endTime: null,
      duration: activeTimerDisplayDuration,
      isBillable: activeTimerEntry.isBillable ?? true,
      hourlyRate: activeTimerEntry.hourlyRate,
      status,
      category: undefined,
      tags: activeTimerEntry.tags || [],
      notes: undefined,
      isApproved: false,
      project: activeTimerEntry.project ?? null,
      task: activeTimerEntry.task ?? null,
      __isActive: true
    } as TimeEntry
  }, [activeTimerEntry, activeTimerDisplayDuration, projectId, taskId, filters.employeeId, resolvedUserId, passesStatusFilter, passesDateFilters])

  const displayedEntries = useMemo(() => {
    // Ensure timeEntries is always an array to prevent undefined errors
    const safeEntries = Array.isArray(timeEntries) ? timeEntries : []
    const entries = safeEntries.filter(entry => passesDateFilters(entry.startTime))
    if (activeTimerDisplay) {
      return [activeTimerDisplay, ...entries]
    }
    return entries
  }, [timeEntries, activeTimerDisplay, passesDateFilters])

  const selectableEntries = useMemo(
    () => displayedEntries.filter(entry => !entry.__isActive),
    [displayedEntries]
  )

  const selectableIds = useMemo(
    () => selectableEntries.map(entry => entry._id),
    [selectableEntries]
  )

  const handleSelectEntry = useCallback(
    (entryId: string, selected: boolean) => {
      if (!selectableIds.includes(entryId)) return
      if (selected) {
        setSelectedEntries(prev => Array.from(new Set([...prev, entryId])))
      } else {
        setSelectedEntries(prev => prev.filter(id => id !== entryId))
      }
    },
    [selectableIds]
  )

  const allSelected = useMemo(
    () => selectableIds.length > 0 && selectableIds.every(id => selectedEntries.includes(id)),
    [selectableIds, selectedEntries]
  )

  useEffect(() => {
    setSelectedEntries(prev => prev.filter(id => selectableIds.includes(id)))
  }, [selectableIds])

  const handleSelectAll = useCallback(
    (selected: boolean) => {
      if (selected) {
        setSelectedEntries(selectableIds)
      } else {
        setSelectedEntries([])
      }
    },
    [selectableIds]
  )

  const toggleEntrySelection = (entryId: string) => {
    setSelectedEntries(prev =>
      prev.includes(entryId)
        ? prev.filter(id => id !== entryId)
        : [...prev, entryId]
    )
  }

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedEntries([])
    } else {
      setSelectedEntries(timeEntries.map(entry => entry._id))
    }
    setSelectAll(!selectAll)
  }

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, entry: TimeEntry) => {
    setAnchorEl(event.currentTarget)
    setSelectedEntry(entry)
  }

  const handleMenuClose = () => {
    setAnchorEl(null)
  }

  const loadEmployeeScopedTasks = async (employeeId: string, projectId: string) => {
    if (!employeeId || !projectId) {
      setTasks([])
      return
    }
    setTasksLoading(true)
    try {
      const res = await fetch(
        `/api/time-tracking/hr/employee-tasks?employeeId=${employeeId}&projectId=${projectId}&organizationId=${resolvedOrgId}`
      )
      const data = await res.json()
      if (data.success && Array.isArray(data.tasks)) {
        setTasks(data.tasks)
      } else {
        setTasks([])
      }
    } catch {
      setTasks([])
      showToast({ type: 'error', title: 'Failed to load employee tasks' })
    } finally {
      setTasksLoading(false)
    }
  }

  const loadTasksForProject = async (
    projectId: string,
    ensureTask?: { _id: string; title: string } | null
  ) => {
    if (!projectId) {
      setTasks([])
      setTasksLoading(false)
      return
    }

    setTasksLoading(true)
    try {
      // Fetch tasks for the selected project using the new endpoint
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

      const url = `/api/projects/${projectId}/tasks`

      const res = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal
      })

      clearTimeout(timeoutId)
      const data = await res.json()
      let list: any[] = []
      if (data?.success && Array.isArray(data.data)) list = data.data
      else if (Array.isArray(data)) list = data
      else if (Array.isArray(data?.tasks)) list = data.tasks

      if (ensureTask && ensureTask._id && !list.some(t => t?._id === ensureTask._id)) {
        list = [...list, ensureTask]
      }
      setTasks(list)
    } catch (error) {
      setTasks([])
      if (!tasksLoading) {
        showToast({ type: 'error', title: 'Could not load tasks. Some features may be limited.' })
      }
    } finally {
      setTasksLoading(false)
    }
  }

  const handleEdit = (entry: TimeEntry) => {
    setSelectedEntry(entry)
    setSelectedProjectForLog(entry.project?._id || '')
    setSelectedTaskForLog(entry.task?._id || '')
    if (entry.task) {
      setTasks([entry.task])
    } else {
      setTasks([])
    }

    // Format dates and times for the form using the user's local timezone
    const start = new Date(entry.startTime)
    const end = entry.endTime ? new Date(entry.endTime) : new Date()

    const startDateLocal = formatDateForInput(start)
    const startTimeLocal = formatTimeForInput(start)
    const endDateLocal = formatDateForInput(end)
    const endTimeLocal = formatTimeForInput(end)

    setManualLogData({
      startDate: startDateLocal,
      startTime: startTimeLocal,
      endDate: endDateLocal,
      endTime: endTimeLocal,
      description: entry.description || ''
    })
    setEditInitial({
      projectId: entry.project?._id || '',
      taskId: entry.task?._id || '',
      startDate: startDateLocal,
      startTime: startTimeLocal,
      endDate: endDateLocal,
      endTime: endTimeLocal,
      description: entry.description || ''
    })

    // Load tasks if project is set
    if (entry.project?._id) {
      loadTasksForProject(entry.project._id, entry.task || null)
    }
    // Defer opening until after dropdown closes
    setTimeout(() => setIsEditing(true), 0)
  }

  const hasEditChanges = useMemo(() => {
    if (!isEditing || !editInitial) return false
    return (
      editInitial.projectId !== selectedProjectForLog ||
      editInitial.taskId !== selectedTaskForLog ||
      editInitial.startDate !== manualLogData.startDate ||
      editInitial.startTime !== manualLogData.startTime ||
      editInitial.endDate !== manualLogData.endDate ||
      editInitial.endTime !== manualLogData.endTime ||
      editInitial.description !== manualLogData.description
    )
  }, [isEditing, editInitial, selectedProjectForLog, selectedTaskForLog, manualLogData])

  const handleDeleteClick = (entry: TimeEntry) => {
    setEntryToDelete(entry)
    setShowDeleteDialog(true)
  }

  const handleConfirmDelete = async () => {
    if (!entryToDelete) return

    setIsDeletingEntry(true)
    try {
      const response = await fetch(`/api/time-tracking/entries/${entryToDelete._id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        loadTimeEntries()
        onTimeEntryUpdate?.()
        showToast({ type: 'success', title: 'Time entry deleted successfully' })
      } else {
        const data = await response.json().catch(() => ({}))
        showToast({ type: 'error', title: (data as any).error || 'Failed to delete time entry' })
      }
    } catch (error) {
      console.error('Error deleting time entry:', error)
      showToast({ type: 'error', title: 'Failed to delete time entry' })
    } finally {
      setIsDeletingEntry(false)
      setShowDeleteDialog(false)
      setEntryToDelete(null)
    }
  }

  // CSV Template Download
  const downloadCSVTemplate = () => {
    const escapeCSV = (value: string): string => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`
      }
      return value
    }

    const headers = ['Task No', 'Start Date', 'Start Time', 'End Date', 'End Time', 'Memo']
    const exampleRows = [
      ['20.7', '2024-01-15', '09:00', '2024-01-15', '17:00', 'Worked on feature'], // ISO format
      ['20.8', '01/15/2024', '9:00 AM', '01/15/2024', '5:00 PM', 'Worked on feature'], // US format with AM/PM
      ['20.9', '15/01/2024', '14:00', '15/01/2024', '18:30', 'Worked on feature'], // European format 24h
      ['20.10', '15-01-2024', '9 AM', '15-01-2024', '5 PM', 'Worked on feature'] // Dash format with AM/PM

    ]


    const csvContent = [
      headers.map(escapeCSV).join(','),
      ...exampleRows.map(row => row.map(escapeCSV).join(','))
    ].join('\n')

    // Add BOM for Excel compatibility
    const bom = '\uFEFF'
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', 'time-log-template.csv')
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Parse CSV file (handles quoted fields)
  const parseCSV = (csvText: string): Array<Record<string, string>> => {
    const lines = csvText.split('\n').filter(line => line.trim())
    if (lines.length < 2) {
      throw new Error('CSV file must have at least a header row and one data row')
    }

    // Simple CSV parser that handles quoted fields
    const parseCSVLine = (line: string): string[] => {
      const result: string[] = []
      let current = ''
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        const nextChar = line[i + 1]

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            // Escaped quote
            current += '"'
            i++
          } else {
            // Toggle quote state
            inQuotes = !inQuotes
          }
        } else if (char === ',' && !inQuotes) {
          // End of field
          result.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }

      // Add last field
      result.push(current.trim())
      return result
    }

    const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim())
    const requiredHeaders = ['Task No', 'Start Date', 'Start Time', 'End Date', 'End Time', 'Memo']

    // Validate CSV format - check if all required headers are present
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h))
    if (missingHeaders.length > 0) {
      throw new Error(`CSV format error: Missing required columns: ${missingHeaders.join(', ')}. Please download the template for the correct format.`)
    }

    // Validate that we have data rows
    if (lines.length === 1) {
      throw new Error('CSV format error: File contains only headers. Please add at least one data row.')
    }

    const rows: Array<Record<string, string>> = []
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]).map(v => v.replace(/^"|"$/g, '').trim())

      // Skip completely empty rows
      if (values.every(v => !v || v === '')) {
        continue
      }

      // Validate that row has correct number of columns
      if (values.length !== headers.length) {
        throw new Error(`CSV format error: Row ${i + 1} has ${values.length} columns but expected ${headers.length}. Please check for missing commas or extra commas.`)
      }

      const row: Record<string, string> = {}
      headers.forEach((header, index) => {
        row[header] = values[index] || ''
      })
      rows.push(row)
    }

    if (rows.length === 0) {
      throw new Error('CSV format error: No valid data rows found. Please add at least one row with data.')
    }

    return rows
  }

  // Validate CSV row
  const validateCSVRow = (row: Record<string, string>, rowIndex: number, taskMap: Map<string, { projectId: string; taskId: string; assignedTo: any[] }>, canBulkUploadAll: boolean): { valid: boolean; error?: string; data?: any } => {
    const taskNo = row['Task No']?.trim()
    const startDate = row['Start Date']?.trim()
    const startTime = row['Start Time']?.trim()
    const endDate = row['End Date']?.trim()
    const endTime = row['End Time']?.trim()
    const description = row['Memo']?.trim() || ''

    const errors: string[] = []

    // Validate Task No (required)
    if (!taskNo) {
      errors.push('Task No is required')
    } else {
      // Validate Task No format (should be like "20.7")
      const taskNoRegex = /^\d+\.\d+$/
      if (!taskNoRegex.test(taskNo)) {
        errors.push('Task No must be in format "ProjectNumber.TaskNumber" (e.g., "20.7")')
      } else {
        // Validate Task exists
        const taskData = taskMap.get(taskNo)
        if (!taskData) {
          errors.push(`Task "${taskNo}" not found`)
        } else if (!canBulkUploadAll) {
          // If user doesn't have bulk upload all permission, check if task is assigned to them

          const isAssigned = taskData.assignedTo.some((assigned: any) => {
            // Handle different assignedTo formats
            let userId: string
            if (typeof assigned === 'string') {
              userId = assigned
            } else if (assigned?.user) {
              // Handle { user: 'id', _id: '...' } format
              userId = typeof assigned.user === 'string' ? assigned.user : assigned.user?._id?.toString() || assigned.user?.toString()
            } else if (assigned?._id) {
              userId = assigned._id?.toString()
            } else {
              userId = assigned?.toString()
            }
            return userId === resolvedUserId || userId?.toString() === resolvedUserId?.toString()
          })
          if (!isAssigned) {
            errors.push(`Task "${taskNo}" is not assigned to you`)
          }
        }
      }
    }

    // Validate Start Date (required)
    if (!startDate) {
      errors.push('Start Date is required')
    } else {
      // Validate Start Date format (flexible parsing)
      const parseFlexibleDate = (dateStr: string): boolean => {
        if (!dateStr) return false

        // Try YYYY-MM-DD format first
        const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
        if (isoMatch) {
          const [, year, month, day] = isoMatch
          const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
          return !isNaN(date.getTime())
        }

        // Try MM/DD/YYYY format
        const usMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
        if (usMatch) {
          const [, month, day, year] = usMatch
          const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
          return !isNaN(date.getTime())
        }

        // Try DD/MM/YYYY format
        const euMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
        if (euMatch) {
          const [, day, month, year] = euMatch
          const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
          return !isNaN(date.getTime())
        }

        // Try DD-MM-YYYY format
        const dashMatch = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
        if (dashMatch) {
          const [, day, month, year] = dashMatch
          const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
          return !isNaN(date.getTime())
        }

        return false
      }

      if (!parseFlexibleDate(startDate)) {
        errors.push('Start Date format must be YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, or DD-MM-YYYY (e.g., 2024-01-15, 01/15/2024, 15/01/2024, 15-01-2024)')
      }
    }

    // Validate Start Time (required)
    if (!startTime) {
      errors.push('Start Time is required or invalid format. Use HH:MM, H:MM AM/PM, H AM/PM, or just H (24-hour)')
    } else {
      // Flexible time parsing
      const parseFlexibleTime = (input: string): string | null => {
        if (!input) return null;
        // Remove spaces, lowercase
        let val = input.trim().toLowerCase();
        // Replace common AM/PM formats
        val = val.replace(/\s*am$/i, ' am').replace(/\s*pm$/i, ' pm');
        // Try to match HH:mm(:ss)? (with optional AM/PM)
        const timeMatch = val.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?$/);
        if (timeMatch) {
          let hour = parseInt(timeMatch[1], 10);
          let minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
          let second = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
          const ampm = timeMatch[4];
          if (ampm) {
            if (ampm === 'pm' && hour < 12) hour += 12;
            if (ampm === 'am' && hour === 12) hour = 0;
          }
          // Clamp values
          hour = Math.max(0, Math.min(23, hour));
          minute = Math.max(0, Math.min(59, minute));
          // Format as HH:mm
          return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        }
        // Try to match just hour with AM/PM
        const hourMatch = val.match(/^(\d{1,2})\s*(am|pm)$/);
        if (hourMatch) {
          let hour = parseInt(hourMatch[1], 10);
          const ampm = hourMatch[2];
          if (ampm === 'pm' && hour < 12) hour += 12;
          if (ampm === 'am' && hour === 12) hour = 0;
          hour = Math.max(0, Math.min(23, hour));
          return `${hour.toString().padStart(2, '0')}:00`;
        }
        // Try to match just hour (24h)
        const hourOnlyMatch = val.match(/^(\d{1,2})$/);
        if (hourOnlyMatch) {
          let hour = parseInt(hourOnlyMatch[1], 10);
          hour = Math.max(0, Math.min(23, hour));
          return `${hour.toString().padStart(2, '0')}:00`;
        }
        return null;
      };

      const startTimeRaw = row['Start Time']?.trim();
      const endTimeRaw = row['End Time']?.trim();
      const startTime = parseFlexibleTime(startTimeRaw);
      const endTime = parseFlexibleTime(endTimeRaw);

      if (!startTime) {
        errors.push('Start Time is required or invalid format');
      }
    }

    // Validate End Time (required)
    if (!endTime) {
      errors.push('End Time is required or invalid format. Use HH:MM, H:MM AM/PM, H AM/PM, or just H (24-hour)')
    } else {
      // Flexible time parsing
      const parseFlexibleTime = (input: string): string | null => {
        if (!input) return null;
        // Remove spaces, lowercase
        let val = input.trim().toLowerCase();
        // Replace common AM/PM formats
        val = val.replace(/\s*am$/i, ' am').replace(/\s*pm$/i, ' pm');
        // Try to match HH:mm(:ss)? (with optional AM/PM)
        const timeMatch = val.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?$/);
        if (timeMatch) {
          let hour = parseInt(timeMatch[1], 10);
          let minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
          let second = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
          const ampm = timeMatch[4];
          if (ampm) {
            if (ampm === 'pm' && hour < 12) hour += 12;
            if (ampm === 'am' && hour === 12) hour = 0;
          }
          // Clamp values
          hour = Math.max(0, Math.min(23, hour));
          minute = Math.max(0, Math.min(59, minute));
          // Format as HH:mm
          return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        }
        // Try to match just hour with AM/PM
        const hourMatch = val.match(/^(\d{1,2})\s*(am|pm)$/);
        if (hourMatch) {
          let hour = parseInt(hourMatch[1], 10);
          const ampm = hourMatch[2];
          if (ampm === 'pm' && hour < 12) hour += 12;
          if (ampm === 'am' && hour === 12) hour = 0;
          hour = Math.max(0, Math.min(23, hour));
          return `${hour.toString().padStart(2, '0')}:00`;
        }
        // Try to match just hour (24h)
        const hourOnlyMatch = val.match(/^(\d{1,2})$/);
        if (hourOnlyMatch) {
          let hour = parseInt(hourOnlyMatch[1], 10);
          hour = Math.max(0, Math.min(23, hour));
          return `${hour.toString().padStart(2, '0')}:00`;
        }
        return null;
      };

      const startTimeRaw = row['Start Time']?.trim();
      const endTimeRaw = row['End Time']?.trim();
      const startTime = parseFlexibleTime(startTimeRaw);
      const endTime = parseFlexibleTime(endTimeRaw);

      if (!endTime) {
        errors.push('End Time is required or invalid format');
      }
    }

    // Validate End Date (required)
    if (!endDate) {
      errors.push('End Date is required')
    } else {
      // Validate End Date format (flexible parsing)
      const parseFlexibleDate = (dateStr: string): boolean => {
        if (!dateStr) return false

        // Try YYYY-MM-DD format first
        const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
        if (isoMatch) {
          const [, year, month, day] = isoMatch
          const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
          return !isNaN(date.getTime())
        }

        // Try MM/DD/YYYY format
        const usMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
        if (usMatch) {
          const [, month, day, year] = usMatch
          const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
          return !isNaN(date.getTime())
        }

        // Try DD/MM/YYYY format
        const euMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
        if (euMatch) {
          const [, day, month, year] = euMatch
          const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
          return !isNaN(date.getTime())
        }

        // Try DD-MM-YYYY format
        const dashMatch = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
        if (dashMatch) {
          const [, day, month, year] = dashMatch
          const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
          return !isNaN(date.getTime())
        }

        return false
      }

      if (!parseFlexibleDate(endDate)) {
        errors.push('End Date format must be YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, or DD-MM-YYYY (e.g., 2024-01-15, 01/15/2024, 15/01/2024, 15-01-2024)')
      }
    }

    // Validate date values if formats are correct
    if (startDate && startTime && endDate && endTime &&
      /^\d{4}-\d{2}-\d{2}$/.test(startDate) &&
      /^\d{2}:\d{2}$/.test(startTime) &&
      /^\d{4}-\d{2}-\d{2}$/.test(endDate) &&
      /^\d{2}:\d{2}$/.test(endTime)) {

      const startDateTime = `${startDate}T${startTime}`
      const endDateTime = `${endDate}T${endTime}`
      const start = new Date(startDateTime)
      const end = new Date(endDateTime)

      if (isNaN(start.getTime())) {
        errors.push('Invalid Start Date/Time values')
      }

      if (isNaN(end.getTime())) {
        errors.push('Invalid End Date/Time values')
      }

      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end <= start) {
        errors.push('End Date/Time must be after Start Date/Time')
      }

      // Check if description is required
      if (!description) {
        errors.push('Memo is required')
      }

      // Check future time
      if (!isNaN(start.getTime()) && !timeTrackingSettings?.allowFutureTime && start > new Date()) {
        errors.push('Future time logging not allowed')
      }

      // Check past time limit when past time is allowed
      if (!isNaN(start.getTime()) && timeTrackingSettings?.allowPastTime === true && timeTrackingSettings?.pastTimeLimitDays) {
        const daysDiff = Math.ceil((new Date().getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
        if (daysDiff > timeTrackingSettings.pastTimeLimitDays) {
          errors.push(`Past time logging not allowed beyond ${timeTrackingSettings.pastTimeLimitDays} days`)
        }
      }

      // Check max session hours
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60)
        const durationHours = durationMinutes / 60
        if (timeTrackingSettings?.allowOvertime === true && timeTrackingSettings?.maxSessionHours && durationHours > timeTrackingSettings.maxSessionHours) {
          errors.push(`Session duration exceeds maximum allowed (${timeTrackingSettings.maxSessionHours}h)`)
        }
      }

      // If all validations pass, return data
      if (errors.length === 0 && taskNo) {
        const taskData = taskMap.get(taskNo)
        if (taskData) {
          const billable = true
          return {
            valid: true,
            data: {
              projectId: taskData.projectId,
              taskId: taskData.taskId,
              description,
              startTime: startDateTime,
              endTime: endDateTime,
              isBillable: billable && timeTrackingSettings?.allowBillableTime
            }
          }
        }
      }
    }

    // Return all errors
    if (errors.length > 0) {
      return { valid: false, error: `Row ${rowIndex + 2}: ${errors.join('; ')}` }
    }

    return { valid: false, error: `Row ${rowIndex + 2}: Unknown error` }
  }

  // Handle bulk upload
  const handleBulkUpload = async () => {
    if (!bulkUploadFile) return

    setUploadingBulk(true)
    setBulkUploadErrors([])
    setBulkUploadProgress(null)
    setError('')
    setBulkUploadSuccess(null)

    try {
      // Create form data for file upload
      const formData = new FormData()
      formData.append('file', bulkUploadFile)

      // Initialize progress tracking
      setBulkUploadProgress({ total: 1, processed: 0, successful: 0, failed: 0 })

      // Upload file to bulk upload endpoint
      const response = await fetch('/api/time-tracking/bulk-upload', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (response.ok && result.success) {
        const { results, errors } = result

        // Set detailed errors if available
        if (errors && Array.isArray(errors)) {
          setBulkUploadErrors(errors)
        }

        // Update progress with final results
        setBulkUploadProgress({
          total: results.processed,
          processed: results.processed,
          successful: results.successful,
          failed: results.failed
        })

        // Handle success and errors with toast notifications
        if (results.successful > 0) {
          // Show success toast
          showToast({ type: 'success', title: `Successfully uploaded ${results.successful} time ${results.successful === 1 ? 'entry' : 'entries'}.` })

          // Refresh the time entries table
          setTimeout(async () => {
            if (!resolvedUserId || !resolvedOrgId) return
            setIsLoading(true)
            setError('')

            try {
              const params = new URLSearchParams({
                userId: resolvedUserId,
                organizationId: resolvedOrgId,
                page: '1',
                limit: pagination.limit.toString()
              })

              const effectiveProjectId = filters.projectId || (projectId && projectId !== 'undefined' && projectId !== 'null' ? projectId : null)
              const effectiveTaskId = filters.taskId || taskId || null

              if (effectiveProjectId) params.append('projectId', effectiveProjectId)
              if (effectiveTaskId) params.append('taskId', effectiveTaskId)

              if (canViewEmployeeFilter) {
                if (filters.employeeId) {
                  params.append('userId', filters.employeeId)
                }
              } else {
                params.append('userId', resolvedUserId)
              }

              if (filters.startDate) params.append('startDate', filters.startDate)
              if (filters.endDate) params.append('endDate', filters.endDate)
              if (filters.status && filters.status !== 'all') params.append('status', filters.status)
              if (filters.isBillable && filters.isBillable !== 'all') params.append('isBillable', filters.isBillable)
              if (filters.isApproved && filters.isApproved !== 'all') {
                params.append('isApproved', filters.isApproved)
              }

              const response = await fetch(`/api/time-tracking/entries?${params}`)
              const data = await response.json()

              if (response.ok) {
                const entries = data.data || data.timeEntries || []
                setTimeEntries(Array.isArray(entries) ? entries : [])
                setPagination(data.pagination)
              } else {
                setError(data.error || 'Failed to load time entries')
              }
            } catch (error) {
              setError('Failed to load time entries')
            } finally {
              setIsLoading(false)
            }
          }, 100)

          onTimeEntryUpdate?.()

          // Auto-close modal after successful upload
          setTimeout(() => {
            setShowBulkUploadModal(false)
            setBulkUploadFile(null)
            setBulkUploadProgress(null)
            setBulkUploadSuccess(null)
            setShowBulkUploadProgressAlert(false)
            setRowUploadStatus(new Map())
          }, 2000)
        }

        if (results.failed > 0) {
          // Show error toast for failed entries
          showToast({ type: 'error', title: `Failed to upload ${results.failed} time ${results.failed === 1 ? 'entry' : 'entries'}. Check the errors below.` })
        }
      } else {
        showToast({ type: 'error', title: result.error || 'Bulk upload failed' })
      }
    } catch (error) {
      console.error('Bulk upload error:', error)
      showToast({ type: 'error', title: 'Failed to upload file. Please try again.' })
    } finally {
      setUploadingBulk(false)
    }
  }

  // Ensure bulk upload state resets every time modal is opened
  useEffect(() => {
    if (showBulkUploadModal) {
      setBulkUploadFile(null)
      setBulkUploadErrors([])
      setBulkUploadProgress(null)
      setError('')
      setBulkUploadSuccess(null)
      setShowBulkUploadProgressAlert(false)
      setRowUploadStatus(new Map())
    }
  }, [showBulkUploadModal])

  return (
    <>
      <div className="space-y-4">

      {/* ── Add Manual Time Log attractive section ─────────────────── */}
      {showManualLogButtons && canAddManualTimeLog && canViewEmployeeFilter && user?.role === 'human_resource' && (timeTrackingSettings?.allowPastTime ?? true) && (
        <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
          <div className="px-5 py-4 flex items-center gap-4">
            <Plus className="h-6 w-6 flex-shrink-0 text-[var(--apple-system-green)]" strokeWidth={1.5} />
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-[var(--apple-label)]">Manual Time Entry</p>
              <p className="text-[13px] text-[var(--apple-secondary-label)]">Log time for past work or specific intervals</p>
            </div>
            <button
              onClick={() => setShowHRManualLogModal(true)}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[var(--apple-radius-md)] text-[14px] font-semibold text-white apple-transition flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#34C759 0%,#30D158 100%)', boxShadow: '0 2px 8px rgba(52,199,89,0.25)' }}
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Add Log
            </button>
          </div>
        </div>
      )}

      {/* ── Filters ───────────────────────────────────────────────── */}
      <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--apple-separator)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-[var(--apple-secondary-label)]" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--apple-secondary-label)]">Filters</p>
          </div>
          <button
            onClick={() => {
              setFilters({ startDate: '', endDate: '', status: '', isBillable: '', isApproved: '', projectId: '', taskId: '', employeeId: '' })
              setProjectSearch(''); setTaskSearch(''); setEmployeeSearch(''); setStatusSearch('')
              setPagination(prev => ({ ...prev, page: 1 }))
            }}
            className="inline-flex items-center gap-1 h-6 px-2 rounded-[var(--apple-radius-sm)] text-[12px] text-[var(--apple-secondary-label)] apple-transition hover:bg-[var(--apple-quaternary-fill)] hover:text-[var(--apple-label)]"
          >
            <RotateCcw className="h-3 w-3" />
            Clear
          </button>
        </div>
        <div className="p-4 space-y-3 w-full overflow-x-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
            <div className="space-y-1 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--apple-secondary-label)]">Project</p>
              <Select
                  value={filters.projectId || 'all'}
                  onValueChange={(value) => {
                    handleFilterChange('projectId', value === 'all' ? '' : value)
                    if (value === 'all') {
                      handleFilterChange('taskId', '')
                    }
                  }}
                  onOpenChange={(open) => {
                    if (open) focusSearchInput(projectFilterSearchInputRef.current)
                  }}
                >
                  <SelectTrigger className="w-full h-9 text-[13px] border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] rounded-[var(--apple-radius-md)]" id="filter-project">
                    <SelectValue placeholder="All projects" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    <div className="p-2 border-b">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          ref={projectFilterSearchInputRef}
                          placeholder="Search projects..."
                          value={projectSearch}
                          onChange={(e) => setProjectSearch(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="h-8 pl-7 pr-7 text-xs"
                        />
                        {projectSearch && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setProjectSearch('')
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="Clear search"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <SelectItem value="all" onMouseDown={(e) => e.preventDefault()}>
                      All projects
                    </SelectItem>
                    {filterProjectsLoading ? (
                      <SelectItem value="loading" disabled>
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Loading...
                        </div>
                      </SelectItem>
                    ) : filteredProjects.length === 0 ? (
                      <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                        No projects found
                      </div>
                    ) : (
                      filteredProjects.map((project) => (
                        <SelectItem key={project._id} value={project._id} onMouseDown={(e) => e.preventDefault()}>
                          <div className="flex items-center gap-2">
                            <FolderOpen className="h-3 w-3" />
                            <span className="truncate">{project.name}</span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--apple-secondary-label)]">Task</p>
                <Select
                  value={filters.taskId || 'all'}
                  onValueChange={(value) => handleFilterChange('taskId', value === 'all' ? '' : value)}
                  disabled={filterTasksLoading}
                  onOpenChange={(open) => {
                    if (open) focusSearchInput(taskFilterSearchInputRef.current)
                  }}
                >
                  <SelectTrigger className="w-full h-9 text-[13px] border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] rounded-[var(--apple-radius-md)]" id="filter-task">
                    <SelectValue placeholder={
                      filterTasksLoading
                        ? 'Loading...'
                        : 'All tasks'
                    } />
                  </SelectTrigger>
                  <SelectContent className={`max-h-[200px] w-full overflow-hidden ${TASK_FILTER_DROPDOWN_WIDTH}`}>
                    <div className="p-2 border-b overflow-y-auto max-h-[200px]">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          ref={taskFilterSearchInputRef}
                          placeholder="Search tasks..."
                          value={taskSearch}
                          onChange={(e) => setTaskSearch(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="h-8 pl-7 pr-7 text-xs"
                          disabled={!filters.projectId}
                        />
                        {taskSearch && !(!filters.projectId) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setTaskSearch('')
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="Clear search"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <SelectItem value="all">All tasks</SelectItem>
                    {filterTasksLoading ? (
                      <SelectItem value="loading" disabled>
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Loading...
                        </div>
                      </SelectItem>
                    ) : filteredTasks.length === 0 ? (
                      <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                        {!filters.projectId ? 'Select a project first' : 'No tasks found'}
                      </div>
                    ) : (
                      filteredTasks.map((task) => {
                        const { truncated: truncatedTitle, isTruncated } = truncateText(task.title, TRUNCATION_LENGTH)
                        return (
                          <SelectItem key={task._id} value={task._id} onMouseDown={(e) => e.preventDefault()}>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-2 min-w-0">
                                    {task.displayId && (
                                      <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded flex-shrink-0">
                                        {task.displayId}
                                      </span>
                                    )}
                                    <Target className="h-3 w-3 flex-shrink-0" />
                                    <span className="truncate">{truncatedTitle}</span>
                                  </div>
                                </TooltipTrigger>
                                {isTruncated && (
                                  <TooltipContent side="left" align="center" className="max-w-sm break-words">
                                    <p className="whitespace-normal">{task.title}</p>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            </TooltipProvider>
                          </SelectItem>
                        )
                      })
                    )}
                  </SelectContent>
                </Select>
              </div>

              {canViewEmployeeFilter && (
                <div className="space-y-1 min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--apple-secondary-label)]">Employee</p>
                  <Select
                    value={filters.employeeId || 'all'}
                    onValueChange={(value) => handleFilterChange('employeeId', value === 'all' ? '' : value)}
                    disabled={filterEmployeesLoading}
                    onOpenChange={(open) => {
                      if (open) focusSearchInput(employeeFilterSearchInputRef.current)
                    }}
                  >
                    <SelectTrigger className="w-full h-9 text-[13px] border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] rounded-[var(--apple-radius-md)]" id="filter-employee">
                      <SelectValue placeholder={
                        filterEmployeesLoading ? 'Loading...' : 'All employees'
                      } />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      <div className="p-2 border-b">
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            ref={employeeFilterSearchInputRef}
                            placeholder="Search employees..."
                            value={employeeSearch}
                            onChange={(e) => setEmployeeSearch(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                            className="h-8 pl-7 pr-7 text-xs"
                          />
                          {employeeSearch && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEmployeeSearch('')
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground hover:text-foreground transition-colors"
                              aria-label="Clear search"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <SelectItem value="all">All employees</SelectItem>
                      {filterEmployeesLoading ? (
                        <SelectItem value="loading" disabled>
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Loading...
                          </div>
                        </SelectItem>
                      ) : filteredEmployees.length === 0 ? (
                        <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                          No employees found
                        </div>
                      ) : (
                        filteredEmployees.map((employee) => (
                          <SelectItem key={employee._id} value={employee._id} onMouseDown={(e) => e.preventDefault()}>
                            <div className="flex items-center gap-2">
                              <User className="h-3 w-3" />
                              <span className="truncate">
                                {employee.firstName} {employee.lastName}
                              </span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1 min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--apple-secondary-label)]">Start Date</p>
                <Input
                  id="startDate"
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => handleFilterChange('startDate', e.target.value)}
                  className="w-full h-9 text-[13px] border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] rounded-[var(--apple-radius-md)]"
                />
              </div>
              <div className="space-y-1 min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--apple-secondary-label)]">End Date</p>
                <Input
                  id="endDate"
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => handleFilterChange('endDate', e.target.value)}
                  className="w-full h-9 text-[13px] border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] rounded-[var(--apple-radius-md)]"
                />
              </div>
              <div className="space-y-1 min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--apple-secondary-label)]">Status</p>
                <Select
                  value={filters.status || 'all'}
                  onValueChange={handleStatusFilterChange}
                  onOpenChange={(open) => {
                    if (open) focusSearchInput(statusFilterSearchInputRef.current)
                  }}
                >
                  <SelectTrigger className="w-full h-9 text-[13px] border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] rounded-[var(--apple-radius-md)]">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    <div className="p-2 border-b">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          ref={statusFilterSearchInputRef}
                          placeholder="Search status..."
                          value={statusSearch}
                          onChange={(e) => setStatusSearch(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="h-8 pl-7 pr-7 text-xs"
                        />
                        {statusSearch && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setStatusSearch('')
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="Clear search"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="max-h-[200px] overflow-y-auto">
                      {filteredStatusOptions.length === 0 ? (
                        <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                          No status found
                        </div>
                      ) : (
                        filteredStatusOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value} onMouseDown={(e) => e.preventDefault()}>
                            {option.label}
                          </SelectItem>
                        ))
                      )}
                    </div>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--apple-secondary-label)]">Billable</p>
                <Select value={filters.isBillable} onValueChange={(value) => handleFilterChange('isBillable', value)}>
                  <SelectTrigger className="w-full h-9 text-[13px] border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] rounded-[var(--apple-radius-md)]">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="true">Billable</SelectItem>
                    <SelectItem value="false">Non-billable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {showSelectionAndApproval && (
                <div className="space-y-1 min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--apple-secondary-label)]">Approved</p>
                  <Select value={filters.isApproved} onValueChange={(value) => handleFilterChange('isApproved', value)}>
                    <SelectTrigger className="w-full h-9 text-[13px] border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] rounded-[var(--apple-radius-md)]">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="true">Approved</SelectItem>
                      <SelectItem value="false">Pending</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

          </div>
        </div>
      {/* ── Bulk Actions ─────────────────────────────────────────────── */}
      {showSelectionAndApproval && selectedEntries.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 px-4 py-3 rounded-[var(--apple-radius-lg)] border border-[var(--apple-system-blue)]/20 bg-[var(--apple-system-blue)]/5 w-full">
          <span className="text-[13px] text-[var(--apple-secondary-label)] flex-1 min-w-0">
            {selectedEntries.length} {selectedEntries.length === 1 ? 'entry' : 'entries'} selected
          </span>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => handleApproveEntries('approve')}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[var(--apple-radius-md)] text-[13px] font-medium bg-[var(--apple-system-blue)] text-white apple-transition flex-1 sm:flex-none justify-center"
            >
              <Check className="h-3.5 w-3.5" />
              Approve
            </button>
            <button
              onClick={() => handleApproveEntries('reject')}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[var(--apple-radius-md)] text-[13px] font-medium bg-red-500 text-white apple-transition flex-1 sm:flex-none justify-center"
            >
              <X className="h-3.5 w-3.5" />
              Reject
            </button>
          </div>
        </div>
      )}

      {/* ── Total Time Card + Entries ─────────────────────────────── */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-[var(--apple-system-blue)] border-t-transparent animate-spin" />
          <p className="text-[13px] text-[var(--apple-secondary-label)]">Loading time entries…</p>
        </div>
      ) : displayedEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="h-12 w-12 rounded-full bg-[var(--apple-quaternary-fill)] flex items-center justify-center">
            <Clock className="h-6 w-6 text-[var(--apple-tertiary-label)]" />
          </div>
          <p className="text-[14px] text-[var(--apple-secondary-label)]">No time entries found</p>
        </div>
      ) : (
        <>
          {/* Total Time Apple Card */}
          <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
            <div className="px-5 py-4 flex items-center gap-4">
              <Clock className="h-6 w-6 flex-shrink-0 text-[var(--apple-system-blue)]" strokeWidth={1.5} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--apple-secondary-label)]">Total Time Logged</p>
                <p className="text-[22px] font-bold font-apple-mono tabular-nums text-[var(--apple-label)] leading-tight">
                  {(() => {
                    const totalMinutes = (viewTotals.totalDuration || 0) + (activeTimerDisplay ? (activeTimerDisplay.duration || 0) : 0)
                    const hours = Math.floor(totalMinutes / 60)
                    const minutes = Math.floor(totalMinutes % 60)
                    return `${hours}h ${minutes}m`
                  })()}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--apple-secondary-label)]">Entries</p>
                <p className="text-[22px] font-bold font-apple-mono tabular-nums text-[var(--apple-label)] leading-tight">{displayedEntries.length}</p>
              </div>
            </div>
          </div>

          {/* Desktop header select-all (only when checkbox col is shown) */}
          {showSelectionAndApproval && canApproveTimeLogs && (
            <div className="hidden md:flex items-center gap-3 px-4">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(checked) => handleSelectAll(!!checked)}
              />
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--apple-secondary-label)]">Select all</p>
            </div>
          )}

          {/* Entries */}
          <div className="space-y-2 w-full">
            {displayedEntries.map((entry) => (
              <div
                key={entry._id}
                className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none overflow-hidden apple-transition"
              >
                {/* ── Mobile / Tablet card (hidden on md+) ────────────── */}
                <div className="md:hidden px-4 py-3 space-y-2.5">
                  {/* Row 1: Task name + Project name */}
                  <div className="grid grid-cols-[1fr_auto] gap-x-2 items-start">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-[var(--apple-label)] truncate">
                        {entry.task?.title || <span className="italic text-[var(--apple-tertiary-label)]">No task</span>}
                      </p>
                      <p className="text-[13px] text-[var(--apple-secondary-label)] truncate mt-0.5">
                        {entry.project?.name || <span className="italic text-[var(--apple-tertiary-label)]">No project</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {showSelectionAndApproval && canApproveTimeLogs && !entry.__isActive && (
                        <Checkbox
                          checked={selectedEntries.includes(entry._id)}
                          onCheckedChange={(checked) => handleSelectEntry(entry._id, checked as boolean)}
                        />
                      )}
                      {canManageAnyTimeEntry && (
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger asChild>
                            <button
                              className="h-7 w-7 rounded-[var(--apple-radius-sm)] flex items-center justify-center text-[var(--apple-secondary-label)] hover:bg-[var(--apple-quaternary-fill)] apple-transition disabled:opacity-30"
                              disabled={!(!entry.__isActive && (canUpdateTime || canDeleteTime) && canEditTimeEntry(entry))}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content className="min-w-[120px] bg-popover rounded-[var(--apple-radius-md)] p-1 shadow-lg border border-[var(--apple-separator)] z-50">
                              {!entry.__isActive && canUpdateTime && canEditTimeEntry(entry) && (
                                <DropdownMenu.Item
                                  className="flex items-center px-2 py-1.5 text-[13px] rounded-[var(--apple-radius-sm)] hover:bg-accent cursor-pointer outline-none text-foreground"
                                  onSelect={() => handleEdit(entry)}
                                >
                                  <Edit className="mr-2 h-3.5 w-3.5" />Edit
                                </DropdownMenu.Item>
                              )}
                              {!entry.__isActive && canDeleteTime && canEditTimeEntry(entry) && (
                                <DropdownMenu.Item
                                  className="flex items-center px-2 py-1.5 text-[13px] rounded-[var(--apple-radius-sm)] text-destructive hover:bg-destructive/10 cursor-pointer outline-none"
                                  onSelect={() => handleDeleteClick(entry)}
                                >
                                  <Trash2 className="mr-2 h-3.5 w-3.5" />Delete
                                </DropdownMenu.Item>
                              )}
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                      )}
                    </div>
                  </div>
                  <div className="text-[13px] text-[var(--apple-secondary-label)]">
                    {[entry.user?.firstName, entry.user?.lastName].filter(Boolean).join(' ') || 'Unknown'}
                  </div>

                  {/* Row 2: Start · End · Duration */}
                  <div className="grid grid-cols-3 gap-2 border-t border-[var(--apple-separator)] pt-2.5">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--apple-tertiary-label)]">Start</p>
                      <p className="text-[13px] font-apple-mono tabular-nums text-[var(--apple-label)] mt-0.5">{formatDateTimeSafe(entry.startTime)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--apple-tertiary-label)]">End</p>
                      <p className="text-[13px] font-apple-mono tabular-nums text-[var(--apple-label)] mt-0.5">{entry.endTime ? formatDateTimeSafe(entry.endTime) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--apple-tertiary-label)]">Duration</p>
                      <p className="text-[13px] font-bold font-apple-mono tabular-nums text-[var(--apple-label)] mt-0.5">{formatDuration(entry.duration)}</p>
                    </div>
                  </div>

                  {/* Row 3: Status · Billable · Approved/Pending */}
                  <div className="flex items-center gap-2 flex-wrap border-t border-[var(--apple-separator)] pt-2.5">
                    {/* Completed / Running */}
                    <span className={`inline-flex items-center h-5 px-2 rounded-full text-[12px] font-semibold border ${
                      entry.status === 'completed'
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                        : entry.status === 'running'
                          ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                          : 'bg-[var(--apple-quaternary-fill)] text-[var(--apple-secondary-label)] border-[var(--apple-separator)]'
                    }`}>
                      {entry.status === 'running' && <span className="mr-1 h-1.5 w-1.5 rounded-full bg-current animate-pulse inline-block" />}
                      {entry.status ? entry.status.charAt(0).toUpperCase() + entry.status.slice(1) : '—'}
                    </span>
                    {/* Billable */}
                    <span className={`inline-flex items-center h-5 px-2 rounded-full text-[12px] font-semibold border ${
                      entry.isBillable
                        ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                        : 'bg-[var(--apple-quaternary-fill)] text-[var(--apple-tertiary-label)] border-[var(--apple-separator)]'
                    }`}>
                      {entry.isBillable ? 'Billable' : 'Non-billable'}
                    </span>
                    {/* Approved / Pending */}
                    {(() => {
                      const isRejected = !entry.__isActive && entry.isReject
                      const isApproved = !entry.__isActive && entry.isApproved
                      return (
                        <span className={`inline-flex items-center h-5 px-2 rounded-full text-[12px] font-semibold border ${
                          isRejected
                            ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
                            : isApproved
                              ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                              : 'bg-[var(--apple-quaternary-fill)] text-[var(--apple-secondary-label)] border-[var(--apple-separator)]'
                        }`}>
                          {isRejected ? 'Rejected' : isApproved ? 'Approved' : 'Pending'}
                        </span>
                      )
                    })()}
                    {/* Quick approval actions */}
                    {showSelectionAndApproval && canApproveTime && !entry.__isActive && (
                      <div className="ml-auto flex items-center gap-1">
                        {!entry.isApproved ? (
                          <button
                            onClick={() => handleApproveEntries('approve', entry._id)}
                            className="h-5 w-5 rounded flex items-center justify-center bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 apple-transition"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleApproveEntries('reject', entry._id)}
                            className="h-5 w-5 rounded flex items-center justify-center bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 apple-transition"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Desktop row (md+) ─────────────────────────────────── */}
                <div className={`hidden md:grid items-center gap-x-4 px-4 py-2.5 ${
                  showSelectionAndApproval && canApproveTimeLogs
                    ? 'grid-cols-[28px_1.5fr_1fr_1fr_1fr_1fr_1.5fr_48px]'
                    : 'grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1.5fr_48px]'
                }`}>
                  {showSelectionAndApproval && canApproveTimeLogs && (
                    <Checkbox
                      id={`select-${entry._id}`}
                      checked={selectedEntries.includes(entry._id)}
                      onCheckedChange={() => toggleEntrySelection(entry._id)}
                      className="h-4 w-4"
                    />
                  )}
                  {/* Col 1: Task name + Project name */}
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-[var(--apple-label)] truncate">
                      {entry.task?.title || <span className="italic text-[var(--apple-tertiary-label)]">No task</span>}
                    </p>
                    <p className="text-[12px] text-[var(--apple-secondary-label)] truncate mt-0.5">
                      {entry.project?.name || <span className="italic text-[var(--apple-tertiary-label)]">No project</span>}
                    </p>
                  </div>
                  {/* Col 2: Member */}
                  <div className="text-[13px] text-[var(--apple-secondary-label)] truncate">
                    {[entry.user?.firstName, entry.user?.lastName].filter(Boolean).join(' ') || 'Unknown'}
                  </div>
                  {/* Col 3: Start */}
                  <div className="text-[13px] font-apple-mono tabular-nums text-[var(--apple-label)] leading-tight">
                    {formatDateTimeSafe(entry.startTime)}
                  </div>
                  {/* Col 4: End */}
                  <div className="text-[13px] font-apple-mono tabular-nums text-[var(--apple-label)] leading-tight">
                    {entry.endTime ? formatDateTimeSafe(entry.endTime) : '—'}
                  </div>
                  {/* Col 5: Duration */}
                  <div className="text-[13px] font-bold font-apple-mono tabular-nums text-[var(--apple-label)]">
                    {formatDuration(entry.duration)}
                  </div>
                  {/* Col 6: Status badges in one row */}
                  <div className="flex flex-row flex-wrap items-center gap-1">
                    <span className={`inline-flex items-center h-5 px-2 rounded-full text-[12px] font-semibold border whitespace-nowrap ${
                      entry.status === 'completed'
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                        : entry.status === 'running'
                          ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                          : 'bg-[var(--apple-quaternary-fill)] text-[var(--apple-secondary-label)] border-[var(--apple-separator)]'
                    }`}>
                      {entry.status === 'running' && <span className="mr-1 h-1.5 w-1.5 rounded-full bg-current animate-pulse inline-block" />}
                      {entry.status ? entry.status.charAt(0).toUpperCase() + entry.status.slice(1) : '—'}
                    </span>
                    <span className={`inline-flex items-center h-5 px-2 rounded-full text-[12px] font-semibold border whitespace-nowrap ${
                      entry.isBillable
                        ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                        : 'bg-[var(--apple-quaternary-fill)] text-[var(--apple-tertiary-label)] border-[var(--apple-separator)]'
                    }`}>
                      {entry.isBillable ? 'Billable' : 'Non-billable'}
                    </span>
                    {(() => {
                      const isRejected = !entry.__isActive && entry.isReject
                      const isApproved = !entry.__isActive && entry.isApproved
                      return (
                        <span className={`inline-flex items-center h-5 px-2 rounded-full text-[12px] font-semibold border whitespace-nowrap ${
                          isRejected
                            ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
                            : isApproved
                              ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                              : 'bg-[var(--apple-quaternary-fill)] text-[var(--apple-secondary-label)] border-[var(--apple-separator)]'
                        }`}>
                          {isRejected ? 'Rejected' : isApproved ? 'Approved' : 'Pending'}
                        </span>
                      )
                    })()}
                  </div>
                  {/* Col 7: Actions menu */}
                  <div className="flex items-center justify-end">
                    {canManageAnyTimeEntry && (
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button
                            className="h-7 w-7 rounded-[var(--apple-radius-sm)] flex items-center justify-center text-[var(--apple-secondary-label)] hover:bg-[var(--apple-quaternary-fill)] apple-transition disabled:opacity-30"
                            disabled={!(!entry.__isActive && (canUpdateTime || canDeleteTime) && canEditTimeEntry(entry))}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content className="min-w-[120px] bg-popover rounded-[var(--apple-radius-md)] p-1 shadow-lg border border-[var(--apple-separator)] z-50">
                            {!entry.__isActive && canUpdateTime && canEditTimeEntry(entry) && (
                              <DropdownMenu.Item
                                className="flex items-center px-2 py-1.5 text-[13px] rounded-[var(--apple-radius-sm)] hover:bg-accent cursor-pointer outline-none text-foreground"
                                onSelect={() => handleEdit(entry)}
                              >
                                <Edit className="mr-2 h-3.5 w-3.5" />Edit
                              </DropdownMenu.Item>
                            )}
                            {!entry.__isActive && canDeleteTime && canEditTimeEntry(entry) && (
                              <DropdownMenu.Item
                                className="flex items-center px-2 py-1.5 text-[13px] rounded-[var(--apple-radius-sm)] text-destructive hover:bg-destructive/10 cursor-pointer outline-none"
                                onSelect={() => handleDeleteClick(entry)}
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" />Delete
                              </DropdownMenu.Item>
                            )}
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Pagination ────────────────────────────────────────────── */}
      {pagination.total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <p className="text-[12px] text-[var(--apple-secondary-label)]">Per page</p>
              <Select
                value={pagination.limit.toString()}
                onValueChange={(value) => {
                  const newLimit = parseInt(value)
                  setPagination(prev => ({ ...prev, limit: newLimit, page: 1 }))
                }}
              >
                <SelectTrigger className="w-16 h-8 ">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-[12px] text-[var(--apple-secondary-label)]">
              {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="inline-flex items-center gap-1 h-7 px-3 rounded-[var(--apple-radius-md)] text-[12px] font-medium border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[var(--apple-label)] apple-transition disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--apple-tertiary-fill)]"
            >
              Previous
            </button>
            <p className="text-[12px] text-[var(--apple-secondary-label)] px-1">
              {pagination.page} / {pagination.pages}
            </p>
            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.pages}
              className="inline-flex items-center gap-1 h-7 px-3 rounded-[var(--apple-radius-md)] text-[12px] font-medium border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[var(--apple-label)] apple-transition disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--apple-tertiary-fill)]"
            >
              Next
            </button>
          </div>
        </div>
      )}

      </div>

      {/* Add Manual Time Log Modal */}
      <Dialog open={showAddTimeLogModal} onOpenChange={setShowAddTimeLogModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Time Log</DialogTitle>
            <DialogDescription>
              Log time manually by selecting start and end times
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Team Member selector — Admin/HR only */}
            {canViewEmployeeFilter && (
              <div className="space-y-2">
                <Label>Team Member *</Label>
                <Select
                  value={selectedEmployeeForLog}
                  onValueChange={(value) => {
                    setSelectedEmployeeForLog(value)
                    setError('')
                  }}
                  onOpenChange={(open) => {
                    if (open) focusSearchInput(modalEmployeeSearchInputRef.current)
                    if (!open) setModalEmployeeSearch('')
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={filterEmployeesLoading ? 'Loading members...' : 'Select a team member'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[250px]">
                    <div className="sticky top-0 z-10 p-2 border-b bg-popover">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          ref={modalEmployeeSearchInputRef}
                          placeholder="Search members..."
                          value={modalEmployeeSearch}
                          onChange={(e) => setModalEmployeeSearch(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="h-8 pl-7 pr-7 text-xs"
                        />
                        {modalEmployeeSearch && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setModalEmployeeSearch('') }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="Clear search"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="max-h-[200px] overflow-y-auto">
                      {filterEmployeesLoading ? (
                        <div className="flex items-center justify-center p-4">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          <span className="text-sm text-muted-foreground">Loading members...</span>
                        </div>
                      ) : filteredModalEmployees.length === 0 ? (
                        <div className="px-2 py-4 text-center text-xs text-muted-foreground">No members found</div>
                      ) : (
                        filteredModalEmployees.map((emp) => (
                          <SelectItem key={emp._id || emp.id} value={emp._id || emp.id} onMouseDown={(e) => e.preventDefault()}>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <span className="font-medium truncate">
                                  {emp.firstName} {emp.lastName}
                                </span>
                                <span className="text-xs text-muted-foreground ml-2">{emp.email}</span>
                              </div>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </div>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="modal-project">Project *</Label>
                <Select
                  value={selectedProjectForLog}
                  onValueChange={(value) => {
                    setSelectedProjectForLog(value)
                    setSelectedTaskForLog('')
                    setTasks([])
                  }}
                  onOpenChange={(open) => {
                    if (open) focusSearchInput(modalProjectSearchInputRef.current)
                  }}
                  disabled={canViewEmployeeFilter && !selectedEmployeeForLog}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={
                      canViewEmployeeFilter && !selectedEmployeeForLog
                        ? 'Select a team member first'
                        : 'Select a project'
                    } />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    <div className="p-2 border-b">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          ref={modalProjectSearchInputRef}
                          placeholder="Search projects..."
                          value={modalProjectSearch}
                          onChange={(e) => setModalProjectSearch(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="h-8 pl-7 pr-7 text-xs"
                        />
                        {modalProjectSearch && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setModalProjectSearch('')
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="Clear search"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="max-h-[200px] overflow-y-auto">
                      {filteredModalProjects.length === 0 ? (
                        <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                          No projects found
                        </div>
                      ) : (
                        filteredModalProjects.map((project) => (
                          <SelectItem key={project._id} value={project._id} onMouseDown={(e) => e.preventDefault()}>
                            <div className="flex items-center gap-2">
                              <FolderOpen className="h-4 w-4 flex-shrink-0" />
                              <span className="truncate">{project.name}</span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </div>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="modal-task">Task *</Label>
                <Select
                  value={selectedTaskForLog}
                  onValueChange={setSelectedTaskForLog}
                  disabled={!selectedProjectForLog || tasks.length === 0}
                  onOpenChange={(open) => {
                    if (open) focusSearchInput(modalTaskSearchInputRef.current)
                  }}
                >
                  <SelectTrigger className="w-full">
                    {selectedTaskForLogObject ? (
                      <div className="flex items-center gap-2 truncate">
                        {selectedTaskForLogObject.displayId && (
                          <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded flex-shrink-0">
                            {selectedTaskForLogObject.displayId}
                          </span>
                        )}
                        <Tooltip delayDuration={200}>
                          <TooltipTrigger asChild>
                            <span className="truncate">{selectedTaskForLogObject.title}</span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-sm">
                            <p className="font-medium">{selectedTaskForLogObject.title}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    ) : (
                      <SelectValue placeholder={
                        tasksLoading
                          ? 'Loading tasks...'
                          : selectedProjectForLog
                            ? (tasks.length > 0 ? 'Select a task' : 'No tasks available')
                            : 'Select a project first'
                      } />
                    )}
                  </SelectTrigger>
                  {tasksLoading && (
                    <Loader2 className="absolute right-8 top-1/2 h-4 w-4 animate-spin -translate-y-1/2" />
                  )}
                  <SelectContent className="max-h-[200px]">
                    {tasksLoading ? (
                      <div className="flex items-center justify-center p-4">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span className="text-sm text-muted-foreground">Loading tasks...</span>
                      </div>
                    ) : (
                      tasks.map((task) => {
                        const isBillableDisabled = !!(task.isBillable && timeTrackingSettings && !timeTrackingSettings.allowBillableTime)
                        return (
                          <SelectItem
                            key={task._id}
                            value={task._id}
                            disabled={isBillableDisabled}
                          >
                            <div className="flex items-center space-x-2 min-w-0 w-full">
                              <Target className="h-4 w-4 flex-shrink-0" />
                              <div className="flex-1 min-w-0 overflow-hidden">
                                <div className="font-medium truncate flex items-center gap-2 min-w-0">
                                  {task.displayId && (
                                    <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded flex-shrink-0">
                                      {task.displayId}
                                    </span>
                                  )}
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="truncate">{task.title}</span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{task.title}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                  {task.isBillable && (
                                    <DollarSign className="h-3 w-3 text-green-600 flex-shrink-0" />
                                  )}
                                </div>
                                <div className="text-xs sm:text-sm text-muted-foreground truncate">
                                  {task.status} • {task.priority}
                                  {isBillableDisabled && ' • Billable time not allowed'}
                                </div>
                              </div>
                            </div>
                          </SelectItem>
                        )
                      })
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="start-date">Start Date *</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={manualLogData.startDate}
                  onChange={(e) => {
                    setManualLogData(prev => ({ ...prev, startDate: e.target.value }))
                    setError('')
                  }}
                  disabled={!selectedProjectForLog}
                  className={`w-full ${startDateError ? 'border-destructive' : ''}`}
                />
                {startDateError && (
                  <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
                    <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-destructive font-medium leading-relaxed">{startDateError}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="start-time">Start Time *</Label>
                <Input
                  id="start-time"
                  type="time"
                  value={manualLogData.startTime}
                  onChange={(e) => {
                    setManualLogData(prev => ({ ...prev, startTime: e.target.value }))
                    setError('')
                  }}
                  disabled={!selectedProjectForLog}
                  className={`w-full ${startTimeError ? 'border-destructive' : ''}`}
                />
                {startTimeError && (
                  <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
                    <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-destructive font-medium leading-relaxed">{startTimeError}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="end-date">End Date *</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={manualLogData.endDate}
                  onChange={(e) => {
                    setManualLogData(prev => ({ ...prev, endDate: e.target.value }))
                    setError('')
                  }}
                  disabled={!selectedProjectForLog}
                  className={`w-full ${endDateError ? 'border-destructive' : ''}`}
                />
                {endDateError && (
                  <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
                    <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-destructive font-medium leading-relaxed">{endDateError}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="end-time">End Time *</Label>
                <Input
                  id="end-time"
                  type="time"
                  value={manualLogData.endTime}
                  onChange={(e) => {
                    setManualLogData(prev => ({ ...prev, endTime: e.target.value }))
                    setError('')
                  }}
                  disabled={!selectedProjectForLog}
                  className={`w-full ${endTimeError ? 'border-destructive' : ''}`}
                />
                {endTimeError && (
                  <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
                    <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-destructive font-medium leading-relaxed">{endTimeError}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Duration Display */}
            {calculatedDuration && (
              <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50 border border-border">
                <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    Duration: {calculatedDuration.hours}h {calculatedDuration.minutes}m
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Total: {Math.round(calculatedDuration.totalMinutes / 60 * 10) / 10}h
                    {timeTrackingSettings?.maxSessionHours && !(startDateError || startTimeError || endDateError || endTimeError) && (
                      <span className="ml-1">
                        (Max: {timeTrackingSettings.maxSessionHours}h)
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="modal-description">
                Memo *
              </Label>
              <Textarea
                id="modal-description"
                value={manualLogData.description}
                onChange={(e) => setManualLogData(prev => ({ ...prev, description: e.target.value }))}
                placeholder={
                  'What did you work on? (required)'
                }
                rows={3}
                required={true}
                disabled={!selectedProjectForLog}
                className="w-full"
              />
            </div>

          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddTimeLogModal(false)
                setManualLogData({
                  startDate: '',
                  startTime: '',
                  endDate: '',
                  endTime: '',
                  description: ''
                })
                setSelectedEmployeeForLog('')
                setModalEmployeeSearch('')
                setSelectedProjectForLog('')
                setSelectedTaskForLog('')
                setTasks([])
                setProjects([])
                setModalProjectSearch('')
                setModalTaskSearch('')
                setError('')
                clearFieldErrors()
              }}
              disabled={submittingManualLog}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitManualLog}
              disabled={
                submittingManualLog ||
                (canViewEmployeeFilter && !selectedEmployeeForLog) ||
                !selectedProjectForLog ||
                !selectedTaskForLog ||
                !manualLogData.startDate ||
                !manualLogData.startTime ||
                !manualLogData.endDate ||
                !manualLogData.endTime ||
                !!(startDateError || startTimeError || endDateError || endTimeError) ||
                !manualLogData.description.trim()
              }
            >
              {submittingManualLog ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Logging...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Log Time
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Time Log</DialogTitle>
            <DialogDescription>
              Update the time log details
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-project">Project *</Label>
                <Select
                  value={selectedProjectForLog}
                  onValueChange={(value) => {
                    setSelectedProjectForLog(value)
                    setSelectedTaskForLog('')
                    setTasks([])
                    setModalTaskSearch('')
                    loadTasksForProject(value)
                  }}
                  disabled={true}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    <div className="p-2 border-b">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Search projects..."
                          value={modalProjectSearch}
                          onChange={(e) => setModalProjectSearch(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="h-8 pl-7 pr-7 text-xs"
                          disabled={true}
                        />
                        {modalProjectSearch && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setModalProjectSearch('')
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="Clear search"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="max-h-[200px] overflow-y-auto">
                      {filteredModalProjects.length === 0 ? (
                        <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                          No projects found
                        </div>
                      ) : (
                        filteredModalProjects.map((project) => (
                          <SelectItem key={project._id} value={project._id} onMouseDown={(e) => e.preventDefault()}>
                            <div className="flex items-center gap-2">
                              <FolderOpen className="h-4 w-4 flex-shrink-0" />
                              <span className="truncate">{project.name}</span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </div>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-task">Task *</Label>
                <Select
                  value={selectedTaskForLog}
                  onValueChange={setSelectedTaskForLog}
                  disabled={!selectedProjectForLog || tasks.length === 0}
                  onOpenChange={(open) => {
                    if (open) focusSearchInput(modalTaskSearchInputRef.current)
                  }}
                >
                  <SelectTrigger className="w-full">
                    {selectedTaskForLogObject ? (
                      <div className="flex items-center gap-2 truncate">
                        {selectedTaskForLogObject.displayId && (
                          <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded flex-shrink-0">
                            {selectedTaskForLogObject.displayId}
                          </span>
                        )}
                        <Tooltip delayDuration={200}>
                          <TooltipTrigger asChild>
                            <span className="truncate">{selectedTaskForLogObject.title}</span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-sm">
                            <p className="font-medium">{selectedTaskForLogObject.title}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    ) : (
                      <SelectValue placeholder={
                        tasksLoading
                          ? 'Loading tasks...'
                          : selectedProjectForLog
                            ? (tasks.length > 0 ? 'Select a task' : 'No tasks available')
                            : 'Select a project first'
                      } />
                    )}
                  </SelectTrigger>
                  {tasksLoading && (
                    <Loader2 className="absolute right-8 top-1/2 h-4 w-4 animate-spin -translate-y-1/2" />
                  )}
                  <SelectContent className="max-h-[250px] w-[var(--radix-select-trigger-width)]">
                    <div className="sticky top-0 z-10 p-2 border-b bg-popover">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          ref={modalTaskSearchInputRef}
                          placeholder="Search tasks..."
                          value={modalTaskSearch}
                          onChange={(e) => setModalTaskSearch(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="h-8 pl-7 pr-7 text-xs"
                        />
                        {modalTaskSearch && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setModalTaskSearch('')
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="Clear search"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="max-h-[200px] overflow-y-auto">
                      {tasksLoading ? (
                        <div className="flex items-center justify-center p-4">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          <span className="text-sm text-muted-foreground">Loading tasks...</span>
                        </div>
                      ) : filteredModalTasks.length === 0 ? (
                        <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                          No tasks found
                        </div>
                      ) : (
                        filteredModalTasks.map((task) => (
                          <SelectItem key={task._id} value={task._id} onMouseDown={(e) => e.preventDefault()}>
                            <div className="flex items-center space-x-2 min-w-0" style={{ maxWidth: '300px' }}>
                              <Target className="h-4 w-4 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="font-bold truncate flex items-center gap-2 min-w-0">
                                  {task.displayId && (
                                    <span className="font-bold text-primary flex-shrink-0">{task.displayId}</span>
                                  )}
                                  <span className="text-xs font-normal text-muted-foreground flex-shrink-0">
                                    {task.status} • {task.priority}
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground min-w-0">
                                  <Tooltip delayDuration={200}>
                                    <TooltipTrigger asChild>
                                      <span className="truncate block overflow-hidden">{task.title}</span>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="bottom"
                                      className="max-w-sm whitespace-normal break-words"
                                    >
                                      <p className="font-medium whitespace-normal break-words">{task.title}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                              </div>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </div>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-start-date">Start Date *</Label>
                <Input
                  id="edit-start-date"
                  type="date"
                  value={manualLogData.startDate}
                  onChange={(e) => {
                    setManualLogData(prev => ({ ...prev, startDate: e.target.value }))
                    setError('')
                  }}
                  className={`w-full ${startDateError ? 'border-destructive' : ''}`}
                />
                {startDateError && (
                  <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
                    <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-destructive font-medium leading-relaxed">{startDateError}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-start-time">Start Time *</Label>
                <Input
                  id="edit-start-time"
                  type="time"
                  value={manualLogData.startTime}
                  onChange={(e) => {
                    setManualLogData(prev => ({ ...prev, startTime: e.target.value }))
                    setError('')
                  }}
                  className={`w-full ${startTimeError ? 'border-destructive' : ''}`}
                />
                {startTimeError && (
                  <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
                    <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-destructive font-medium leading-relaxed">{startTimeError}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-end-date">End Date *</Label>
                <Input
                  id="edit-end-date"
                  type="date"
                  value={manualLogData.endDate}
                  onChange={(e) => {
                    setManualLogData(prev => ({ ...prev, endDate: e.target.value }))
                    setError('')
                  }}
                  className={`w-full ${endDateError ? 'border-destructive' : ''}`}
                />
                {endDateError && (
                  <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
                    <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-destructive font-medium leading-relaxed">{endDateError}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-end-time">End Time *</Label>
                <Input
                  id="edit-end-time"
                  type="time"
                  value={manualLogData.endTime}
                  onChange={(e) => {
                    setManualLogData(prev => ({ ...prev, endTime: e.target.value }))
                    setError('')
                  }}
                  className={`w-full ${endTimeError ? 'border-destructive' : ''}`}
                />
                {endTimeError && (
                  <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
                    <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-destructive font-medium leading-relaxed">{endTimeError}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Duration Display */}
            {calculatedDuration && (
              <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50 border border-border">
                <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    Duration: {calculatedDuration.hours}h {calculatedDuration.minutes}m
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Total: {Math.round(calculatedDuration.totalMinutes / 60 * 10) / 10}h
                    {timeTrackingSettings?.maxSessionHours && !(startDateError || startTimeError || endDateError || endTimeError) && (
                      <span className="ml-1">
                        (Max: {timeTrackingSettings.maxSessionHours}h)
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="edit-description">
                Memo *
              </Label>
              <Textarea
                id="edit-description"
                value={manualLogData.description}
                onChange={(e) => setManualLogData(prev => ({ ...prev, description: e.target.value }))}
                placeholder={'What did you work on? (required)'}
                rows={3}
                required={true}
                className="w-full"
              />
            </div>

          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditing(false)
                setManualLogData({
                  startDate: '',
                  startTime: '',
                  endDate: '',
                  endTime: '',
                  description: ''
                })
                setSelectedProjectForLog('')
                setSelectedTaskForLog('')
                setTasks([])
                setModalProjectSearch('')
                setError('')
                clearFieldErrors()
                setEditInitial(null)
              }}
              disabled={submittingManualLog}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateTimeLog}
              disabled={
                submittingManualLog ||
                !selectedProjectForLog ||
                !selectedTaskForLog ||
                !manualLogData.startDate ||
                !manualLogData.startTime ||
                !manualLogData.endDate ||
                !manualLogData.endTime ||
                !!(startDateError || startTimeError || endDateError || endTimeError) ||
                !hasEditChanges ||
                (!manualLogData.description.trim())
              }
            >
              {submittingManualLog ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Time Log'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <ConfirmationModal
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Time Entry"
        description="Are you sure you want to delete this time entry? This action cannot be undone."
        confirmText="Delete"
        variant="destructive"
        isLoading={isDeletingEntry}
      />

      {/* HR Manual Time Log Modal */}
      <HRManualTimeLogModal
        open={showHRManualLogModal}
        onOpenChange={setShowHRManualLogModal}
        organizationId={resolvedOrgId}
        onSuccess={() => {
          loadTimeEntries()
          onTimeEntryUpdate?.()
        }}
      />

      {/* Bulk Upload Modal */}
      <Dialog open={showBulkUploadModal} onOpenChange={setShowBulkUploadModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Bulk Upload Time Logs</DialogTitle>
            <DialogDescription>
              Upload multiple time entries using a CSV file. Download the template to see the required format.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {/* Enhanced progress display during bulk upload */}
            {uploadingBulk && (
              <div className="w-full max-w-2xl bg-card border rounded-lg shadow-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Loader2 className="h-6 w-6 animate-spin text-primary flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-semibold">Processing Time Entries</h3>
                    <p className="text-sm text-muted-foreground">
                      {bulkUploadProgress ? `${bulkUploadProgress.processed} of ${bulkUploadProgress.total} rows processed` : 'Reading CSV file...'}
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                {bulkUploadProgress && (
                  <div className="mb-4">
                    <div className="w-full bg-muted rounded-full h-2.5 mb-2">
                      <div
                        className="bg-primary h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${(bulkUploadProgress.processed / bulkUploadProgress.total) * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Check className="h-3 w-3 text-green-600" />
                        {bulkUploadProgress.successful} successful
                      </span>
                      <span className="flex items-center gap-1">
                        <X className="h-3 w-3 text-destructive" />
                        {bulkUploadProgress.failed} failed
                      </span>
                    </div>
                  </div>
                )}

                {/* Row-by-row status */}
                {rowUploadStatus.size > 0 && (
                  <div className="flex-1 overflow-y-auto space-y-1 border rounded-md p-3 bg-muted/30 min-h-[200px] max-h-[400px]">
                    {Array.from(rowUploadStatus.entries())
                      .sort(([a], [b]) => a - b)
                      .map(([rowNum, status]) => (
                        <div
                          key={rowNum}
                          className={`flex items-center gap-2 p-2 rounded text-sm transition-all ${status.status === 'success'
                            ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400'
                            : status.status === 'error'
                              ? 'bg-destructive/10 text-destructive'
                              : 'bg-muted/50 text-muted-foreground'
                            }`}
                        >
                          {status.status === 'pending' && (
                            <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                          )}
                          {status.status === 'success' && (
                            <Check className="h-4 w-4 flex-shrink-0" />
                          )}
                          {status.status === 'error' && (
                            <X className="h-4 w-4 flex-shrink-0" />
                          )}
                          <span className="font-medium min-w-[60px]">Row {rowNum}:</span>
                          <span className="flex-1 truncate">
                            {status.status === 'pending' && 'Uploading...'}
                            {status.status === 'success' && 'Successfully uploaded'}
                            {status.status === 'error' && (status.error || 'Failed to upload')}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* Display bulk upload result after completion */}
            {!uploadingBulk && bulkUploadProgress && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Upload Result</h4>
                <p className="text-sm text-muted-foreground">
                  {bulkUploadProgress.successful} successful, {bulkUploadProgress.failed} failed
                </p>
              </div>
            )}

            {/* Display bulk upload errors */}
            {bulkUploadErrors.length > 0 && !uploadingBulk && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-destructive">Upload Errors</h4>
                <div className="max-h-40 overflow-y-auto space-y-1 border border-destructive/20 rounded-md p-3 bg-destructive/5">
                  {bulkUploadErrors.map((error, index) => (
                    <div key={index} className="flex items-start gap-2 text-sm">
                      <X className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                      <span className="text-destructive">
                        <strong>Row {error.row}:</strong> {error.error}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>CSV File</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={downloadCSVTemplate}
                  disabled={uploadingBulk}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
              </div>

              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      setBulkUploadFile(file)
                      setError('')
                      setBulkUploadErrors([])
                      setBulkUploadSuccess(null)
                      setRowUploadStatus(new Map())
                    }
                  }}
                  disabled={uploadingBulk}
                  className="hidden"
                  id="bulk-upload-file"
                />
                <label
                  htmlFor="bulk-upload-file"
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <div className="text-sm">
                    {bulkUploadFile ? (
                      <span className="font-medium">{bulkUploadFile.name}</span>
                    ) : (
                      <>
                        <span className="font-medium">Click to upload</span> or drag and drop
                      </>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">CSV file only</div>
                </label>
              </div>

              {bulkUploadFile && (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                  <FileText className="h-4 w-4" />
                  <span className="text-sm flex-1">{bulkUploadFile.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setBulkUploadFile(null)
                      setBulkUploadErrors([])
                      setError('')
                      setRowUploadStatus(new Map())
                    }}
                    disabled={uploadingBulk}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  <div className="font-semibold mb-1">CSV Format Requirements:</div>
                  <ul className="list-disc list-inside space-y-1">
                    <li><strong>Required columns:</strong> Task No, Start Date, Start Time, End Date, End Time</li>
                    <li><strong>Required columns:</strong> Memo</li>
                    <li><strong>Task No format:</strong> ProjectNumber.TaskNumber (e.g., 20.7)</li>
                    <li><strong>Date formats accepted:</strong> YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, DD-MM-YYYY</li>
                    <li><strong>Time formats accepted:</strong> HH:MM, H:MM AM/PM, H AM/PM, or just H (24-hour)</li>
                    <li><strong>Examples:</strong> 9:00, 9:00 AM, 2:30 PM, 14:00, 9 AM</li>
                    <li>End Date/Time must be after Start Date/Time</li>
                    <li>Task ID must exist and be accessible to you</li>
                  </ul>
                </AlertDescription>
              </Alert>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowBulkUploadModal(false)
                setBulkUploadFile(null)
                setBulkUploadErrors([])
                setBulkUploadProgress(null)
                setError('')
                setBulkUploadSuccess(null)
                setShowBulkUploadProgressAlert(true)
                setRowUploadStatus(new Map())
              }}
              disabled={uploadingBulk}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkUpload}
              disabled={!bulkUploadFile || uploadingBulk}
            >
              {uploadingBulk ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

