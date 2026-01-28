'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { Clock, Edit, Trash2, Check, X, Filter, Download, Plus, AlertTriangle, FolderOpen, Target, Loader2, Upload, FileText, User, Search, MoreHorizontal, DollarSign, RotateCcw } from 'lucide-react'
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
import { useOrganization } from '@/hooks/useOrganization'
import { applyRoundingRules } from '@/lib/utils'
import { useFeaturePermissions, usePermissions } from '@/lib/permissions/permission-context'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { Permission } from '@/lib/permissions/permission-definitions'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { toast } from 'sonner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { detectClientTimezone } from '@/lib/timezone'

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
  const pathname = usePathname()

  // Debug timezone and DateTimeProvider
  useEffect(() => {
  }, [preferences])
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
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
  const [currentUserRole, setCurrentUserRole] = useState<string>('')
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

  // Filtered lists based on search queries
  const filteredProjects = useMemo(() => {
    if (!projectSearch.trim()) return filterProjects
    const searchLower = projectSearch.toLowerCase()
    return filterProjects.filter(project =>
      project.name?.toLowerCase().includes(searchLower)
    )
  }, [filterProjects, projectSearch])

  const filteredTasks = useMemo(() => {
    if (!taskSearch.trim()) return filterTasks
    const searchLower = taskSearch.toLowerCase()
    return filterTasks.filter(task => 
      task.title?.toLowerCase().includes(searchLower)
    )
  }, [filterTasks, taskSearch])

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

  const filteredModalProjects = useMemo(() => {
    if (!modalProjectSearch.trim()) return projects
    const searchLower = modalProjectSearch.toLowerCase()
    return projects.filter(project =>
      project.name?.toLowerCase().includes(searchLower)
    )
  }, [projects, modalProjectSearch])
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
  useEffect(() => {
    const resolveAuth = async () => {
      if (resolvedUserId && resolvedOrgId) {
        setAuthResolving(false)
        return
      }
      try {
        const res = await fetch('/api/auth/me')
        if (res.ok) {
          const me = await res.json()
          setResolvedUserId(me.id)
          setResolvedOrgId(me.organization)
          setError('')
        } else {
          setError('Unable to resolve user. Please log in again.')
        }
      } catch (e) {
        setError('Failed to resolve user information')
      } finally {
        setAuthResolving(false)
      }
    }
    if (!resolvedUserId || !resolvedOrgId) {
      resolveAuth()
    }
  }, [resolvedUserId, resolvedOrgId])

  const { organization } = useOrganization()
  const { canApproveTime } = useFeaturePermissions()
  const { hasPermission } = usePermissions()

  // Permission checks for time tracking operations
  const canViewAllTime = hasPermission(Permission.TIME_TRACKING_VIEW_ALL)
  const canUpdateTime = hasPermission(Permission.TIME_TRACKING_UPDATE)
  const canDeleteTime = hasPermission(Permission.TIME_TRACKING_DELETE)
  const canApproveTimeLogs = hasPermission(Permission.TIME_TRACKING_APPROVE)

  // Check if user can view employee filter using permission
  const canViewEmployeeFilter = useMemo(() => {
    return hasPermission(Permission.TIME_TRACKING_EMPLOYEE_FILTER_READ)
  }, [hasPermission])

  // Function to check if a time entry can be edited/deleted based on time tracking settings
  const canEditTimeEntry = useCallback((entry: TimeEntry): boolean => {
    if (!timeTrackingSettings?.disableTimeLogEditing) {
      console.log('Time log editing not disabled, allowing edit for entry:', entry._id)
      return true
    }

    const entryDate = new Date(entry.startTime)
    const now = new Date()

    console.log('Checking edit permission for entry:', {
      entryId: entry._id,
      entryDate: entryDate.toISOString(),
      entryDay: entryDate.getDate(),
      entryMonth: entryDate.getMonth(),
      entryYear: entryDate.getFullYear(),
      now: now.toISOString(),
      nowDay: now.getDate(),
      nowMonth: now.getMonth(),
      nowYear: now.getFullYear(),
      mode: timeTrackingSettings.timeLogEditMode,
      dayOfMonth: timeTrackingSettings.timeLogEditDayOfMonth,
      days: timeTrackingSettings.timeLogEditDays
    })

    if (timeTrackingSettings.timeLogEditMode === 'days') {
      const diffTime = now.getTime() - entryDate.getTime()
      const diffDays = diffTime / (1000 * 3600 * 24)
      const canEdit = diffDays <= timeTrackingSettings.timeLogEditDays
      console.log('Days mode check:', { diffDays, maxDays: timeTrackingSettings.timeLogEditDays, canEdit })
      return canEdit
    } else if (timeTrackingSettings.timeLogEditMode === 'dayOfMonth') {
      // Allow editing if entry is from a previous month/year
      if (entryDate.getFullYear() < now.getFullYear() || 
          (entryDate.getFullYear() === now.getFullYear() && entryDate.getMonth() < now.getMonth())) {
        console.log('Entry from previous month, allowing edit')
        return true
      }
      // For current month, allow editing if entry day is on or after the threshold
      const canEdit = entryDate.getDate() >= timeTrackingSettings.timeLogEditDayOfMonth
      console.log('Day of month mode check:', { entryDay: entryDate.getDate(), threshold: timeTrackingSettings.timeLogEditDayOfMonth, canEdit })
      return canEdit
    }

    console.log('Unknown mode or no restriction, allowing edit')
    return true
  }, [timeTrackingSettings])

  // Fetch current user role
  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const response = await fetch('/api/auth/me')
        if (response.ok) {
          const userData = await response.json()
          setCurrentUserRole(userData.role || '')
        }
      } catch (error) {
        console.error('Failed to fetch user role:', error)
      }
    }
    fetchUserRole()
  }, [])

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
            const createdByMatch = project?.createdBy === resolvedUserId || project?.createdBy?.id === resolvedUserId
            const teamMembers = Array.isArray(project?.teamMembers) ? project.teamMembers : []
            const teamMatch = teamMembers.some((memberId: any) => {
              if (typeof memberId === 'string') return memberId === resolvedUserId
              return memberId?._id === resolvedUserId || memberId?.id === resolvedUserId
            })
            const members = Array.isArray(project?.members) ? project.members : []
            const membersMatch = members.some((m: any) => (typeof m === 'string' ? m === resolvedUserId : m?.id === resolvedUserId || m?._id === resolvedUserId))
            return createdByMatch || teamMatch || membersMatch || canViewEmployeeFilter
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

  // Fetch tasks for filter when project is selected or for all projects
  useEffect(() => {
    const fetchFilterTasks = async () => {
      if (!resolvedOrgId) {
        setFilterTasks([])
        return
      }

      // If no specific project is selected (All projects), we don't load tasks
      // Users can still search manually or the task filter will show "All tasks"
      if (!filters.projectId) {
        setFilterTasks([])
        setFilterTasksLoading(false)
        return
      }

      setFilterTasksLoading(true)
      try {
        const response = await fetch(`/api/tasks?project=${filters.projectId}&all=true`)
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
    }
    fetchFilterTasks()
  }, [filters.projectId, resolvedOrgId])

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
            if(data.settings.disableTimeLogEditing) {
              if(data.settings.timeLogEditMode === 'dayOfMonth') {
                const disble_from_month = data.settings.timeLogEditDayOfMonth
                const disable_from_created_date = null
              }else{
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

  // Fetch tasks when project is selected
  useEffect(() => {
    if (selectedProjectForLog) {
      loadTasksForProject(selectedProjectForLog)
    } else {
      setTasks([])
      setSelectedTaskForLog('')
    }
  }, [selectedProjectForLog, resolvedUserId, isEditing, selectedEntry])

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
      setSelectedProjectForLog('')
      setSelectedTaskForLog('')
      setTasks([])
      setModalProjectSearch('')
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
    if (!selectedProjectForLog || !resolvedUserId) {
      setError('Project selection required')
      return
    }

    if (!selectedTaskForLog) {
      setError('Task selection required')
      return
    }

    if (timeTrackingSettings?.requireDescription === true && !manualLogData.description.trim()) {
      setError('Description is required')
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
        setSelectedProjectForLog('')
        setSelectedTaskForLog('')
        setModalProjectSearch('')
        setTasks([])
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

    if (timeTrackingSettings?.requireDescription === true && !manualLogData.description.trim()) {
      setError('Description is required')
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

      const response = await fetch(`/api/time-tracking/entries?${params}`)
      const data = await response.json()

      if (response.ok) {
        // Handle both data.data and data.timeEntries for backward compatibility
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
  }, [resolvedUserId, resolvedOrgId, projectId, taskId, pagination.page, pagination.limit, filters, canViewEmployeeFilter])

  useEffect(() => {
    if (!authResolving) {
      loadTimeEntries()
      loadActiveTimer()
    }
  }, [authResolving, loadTimeEntries, loadActiveTimer, refreshKey])



  const handleDeleteEntry = async (entryId: string) => {
    if (!confirm('Are you sure you want to delete this time entry?')) return

    try {
      const response = await fetch(`/api/time-tracking/entries/${entryId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        loadTimeEntries()
        onTimeEntryUpdate?.()
      } else {
        const data = await response.json()
        setError(data.error || 'Failed to delete time entry')
      }
    } catch (error) {
      setError('Failed to delete time entry')
    }
  }

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
    const status = activeTimerEntry.isPaused ? 'paused' : 'running'

    if (!matchesProject || !matchesTask) return null
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
  }, [activeTimerEntry, activeTimerDisplayDuration, projectId, taskId, passesStatusFilter, passesDateFilters])

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
      // Fetch tasks for the selected project where user is assigned (matching timer page)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout (matching timer page)

      const url = `/api/tasks?project=${projectId}&assignedTo=${resolvedUserId}&all=true&minimal=true`

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
        toast.error('Could not load tasks. Some features may be limited.')
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
    
    try {
      // TODO: Implement delete API call
      // await deleteTimeEntry(entryToDelete._id)
      // Refresh entries after deletion
      loadTimeEntries()
      toast.success('Time entry deleted successfully')
    } catch (error) {
      console.error('Error deleting time entry:', error)
      toast.error('Failed to delete time entry')
    } finally {
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

    const headers = ['Task No', 'Start Date', 'Start Time', 'End Date', 'End Time']
    const exampleRows = [
      ['20.7', '2024-01-15', '09:00', '2024-01-15', '17:00'], // ISO format
      ['20.8', '01/15/2024', '9:00 AM', '01/15/2024', '5:00 PM'], // US format with AM/PM
      ['20.9', '15/01/2024', '14:00', '15/01/2024', '18:30'], // European format 24h
      ['20.10', '15-01-2024', '9 AM', '15-01-2024', '5 PM'] // Dash format with AM/PM
    ]
    
    if (timeTrackingSettings?.requireDescription) {
      headers.push('Description')
      exampleRows.forEach(row => row.push('Worked on feature'))
    }
    
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
    const requiredHeaders = ['Task No', 'Start Date', 'Start Time', 'End Date', 'End Time']
    if (timeTrackingSettings?.requireDescription) {
      requiredHeaders.push('Description')
    }
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
    const description = row['Description']?.trim() || ''

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
      if (timeTrackingSettings?.requireDescription && !description) {
        errors.push('Description is required')
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
          toast.success(`Successfully uploaded ${results.successful} time ${results.successful === 1 ? 'entry' : 'entries'}.`)
          
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
          toast.error(`Failed to upload ${results.failed} time ${results.failed === 1 ? 'entry' : 'entries'}. Check the errors below.`)
        }
      } else {
        toast.error(result.error || 'Bulk upload failed')
      }
    } catch (error) {
      console.error('Bulk upload error:', error)
      toast.error('Failed to upload file. Please try again.')
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
    <Card className="w-full overflow-x-hidden">
      <CardHeader className="pb-3 sm:pb-4 px-3 sm:px-4 lg:px-6 pt-4 sm:pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between w-full">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg min-w-0">
            {/* <Clock className="h-5 w-5" />
            Time Logs */}
          </CardTitle>
          {showManualLogButtons && pathname === '/time-tracking/timer' && canAddManualTimeLog && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {/* <Button
                onClick={() => setShowBulkUploadModal(true)}
                size="sm"
                variant="outline"
                className="h-8 sm:h-8 px-3 text-xs justify-start w-full sm:w-auto"
              >
                <Upload className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                <span className="whitespace-nowrap">Bulk Upload</span>
              </Button> */}
              <Button
                onClick={() => {
                  // Clear form data when opening add modal
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
                  setShowAddTimeLogModal(true)
                }}
                size="sm"
                className="h-8 sm:h-8 px-3 text-xs justify-start w-full sm:w-auto"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                <span className="whitespace-nowrap">Add Time Log</span>
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-3 sm:p-4 lg:p-6 pt-2 sm:pt-4 overflow-x-hidden">
        {authResolving && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-muted-foreground mt-2 text-sm">Loading your time entries...</p>
          </div>
        )}

        {/* Filters */}
        <div className="space-y-3 sm:space-y-4 w-full overflow-x-hidden">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <Label className="text-sm font-medium whitespace-nowrap">Filters</Label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4 w-full">
            <div className="space-y-1.5 sm:space-y-2 min-w-0">
              <Label htmlFor="filter-project" className="text-xs sm:text-sm font-medium">Project</Label>
              <Select 
                value={filters.projectId || 'all'} 
                onValueChange={(value) => {
                  handleFilterChange('projectId', value === 'all' ? '' : value)
                  if (value === 'all') {
                    handleFilterChange('taskId', '')
                  }
                }}
              >
                <SelectTrigger className="w-full h-9 sm:h-10 text-xs sm:text-sm" id="filter-project">
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                      <Input
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

            <div className="space-y-1.5 sm:space-y-2 min-w-0">
              <Label htmlFor="filter-task" className="text-xs sm:text-sm font-medium">Task</Label>
              <Select 
                value={filters.taskId || 'all'} 
                onValueChange={(value) => handleFilterChange('taskId', value === 'all' ? '' : value)}
                disabled={filterTasksLoading}
              >
                <SelectTrigger className="w-full h-9 sm:h-10 text-xs sm:text-sm" id="filter-task">
                  <SelectValue placeholder={
                    filterTasksLoading
                        ? 'Loading...' 
                        : 'All tasks'
                  } />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                      <Input
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
                      filteredTasks.map((task) => (
                        <SelectItem key={task._id} value={task._id} onMouseDown={(e) => e.preventDefault()}>
                          <div className="flex items-center gap-2">
                            <Target className="h-3 w-3" />
                            <span className="truncate">{task.title}</span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                </SelectContent>
              </Select>
            </div>

            {canViewEmployeeFilter && (
              <div className="space-y-1.5 sm:space-y-2 min-w-0">
                <Label htmlFor="filter-employee" className="text-xs sm:text-sm font-medium">Employee</Label>
                <Select 
                  value={filters.employeeId || 'all'} 
                  onValueChange={(value) => handleFilterChange('employeeId', value === 'all' ? '' : value)}
                  disabled={filterEmployeesLoading}
                >
                  <SelectTrigger className="w-full h-9 sm:h-10 text-xs sm:text-sm" id="filter-employee">
                    <SelectValue placeholder={
                      filterEmployeesLoading ? 'Loading...' : 'All employees'
                    } />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    <div className="p-2 border-b">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                        <Input
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

            <div className="space-y-1.5 sm:space-y-2 min-w-0">
              <Label htmlFor="startDate" className="text-xs sm:text-sm font-medium">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                className="w-full h-9 sm:h-10 text-xs sm:text-sm"
              />
            </div>
            <div className="space-y-1.5 sm:space-y-2 min-w-0">
              <Label htmlFor="endDate" className="text-xs sm:text-sm font-medium">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                className="w-full h-9 sm:h-10 text-xs sm:text-sm"
              />
            </div>
            <div className="space-y-1.5 sm:space-y-2 min-w-0">
              <Label htmlFor="status" className="text-xs sm:text-sm font-medium">Status</Label>
              <Select value={filters.status || 'all'} onValueChange={handleStatusFilterChange}>
                <SelectTrigger className="w-full h-9 sm:h-10 text-xs sm:text-sm">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                      <Input
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
            <div className="space-y-1.5 sm:space-y-2 min-w-0">
              <Label htmlFor="isBillable" className="text-xs sm:text-sm font-medium">Billable</Label>
              <Select value={filters.isBillable} onValueChange={(value) => handleFilterChange('isBillable', value)}>
                <SelectTrigger className="w-full h-9 sm:h-10 text-xs sm:text-sm">
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
              <div className="space-y-1.5 sm:space-y-2 min-w-0">
                <Label htmlFor="isApproved" className="text-xs sm:text-sm font-medium">Approved</Label>
                <Select value={filters.isApproved} onValueChange={(value) => handleFilterChange('isApproved', value)}>
                  <SelectTrigger className="w-full h-9 sm:h-10 text-xs sm:text-sm">
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

          {/* Clear Filters Button */}
            <div className="flex justify-center sm:justify-end items-center pt-2 w-full">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilters({
                    startDate: '',
                    endDate: '',
                    status: '',
                    isBillable: '',
                    isApproved: '',
                    projectId: '',
                    taskId: '',
                    employeeId: ''
                  })
                  // Clear search queries
                  setProjectSearch('')
                  setTaskSearch('')
                  setEmployeeSearch('')
                  setStatusSearch('')
                  setPagination(prev => ({ ...prev, page: 1 }))
                }}
                className="w-full sm:w-auto h-9 sm:h-10 text-xs sm:text-sm flex-shrink-0"
                title="Clear all filters"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
        </div>

        {/* Bulk Actions */}
        {showSelectionAndApproval && selectedEntries.length > 0 && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 sm:p-4 bg-muted rounded-lg w-full overflow-x-hidden">
            <span className="text-xs sm:text-sm text-muted-foreground flex-1 min-w-0 break-words">
              {selectedEntries.length} {selectedEntries.length === 1 ? 'entry' : 'entries'} selected
            </span>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                size="sm"
                onClick={() => handleApproveEntries('approve')}
                className="h-9 sm:h-10 flex-1 sm:flex-initial text-xs sm:text-sm min-w-[100px]"
              >
                <Check className="h-4 w-4 mr-1.5 sm:mr-2" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleApproveEntries('reject')}
                className="h-9 sm:h-10 flex-1 sm:flex-initial text-xs sm:text-sm min-w-[100px]"
              >
                <X className="h-4 w-4 mr-1.5 sm:mr-2" />
                Reject
              </Button>
            </div>
          </div>
        )}

        {/* Time Entries Table */}
        <div className="space-y-2 w-full overflow-x-hidden">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-muted-foreground mt-2 text-sm">Loading time entries...</p>
            </div>
          ) : displayedEntries.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm sm:text-base text-muted-foreground">No time entries found</p>
            </div>
          ) : (
            <div className="space-y-2 w-full overflow-x-hidden">
              {/* Total Time Widget */}
              <div className="mb-6 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Clock className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">Total Time Logged</h3>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-primary">
                      {(() => {
                        const totalMinutes = displayedEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0)
                        const hours = Math.floor(totalMinutes / 60)
                        const minutes = Math.floor(totalMinutes % 60)
                        return `${hours}h ${minutes}m`
                      })()}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {displayedEntries.length} {displayedEntries.length === 1 ? 'entry' : 'entries'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Table Header - Hidden on mobile */}
              <div className={`hidden md:grid gap-2 p-3 bg-muted rounded-lg text-xs sm:text-sm font-medium overflow-x-auto ${
                showSelectionAndApproval && canApproveTimeLogs 
                  ? 'grid-cols-[40px_minmax(150px,1.5fr)_minmax(120px,1fr)_minmax(100px,120px)_minmax(100px,120px)_minmax(100px,120px)_minmax(80px,100px)_minmax(80px,100px)_minmax(80px,100px)_minmax(90px,110px)_minmax(80px,100px)]' 
                  : 'grid-cols-[minmax(200px,2fr)_minmax(120px,1fr)_minmax(100px,120px)_minmax(100px,120px)_minmax(100px,120px)_minmax(80px,100px)_minmax(80px,100px)_minmax(80px,100px)_minmax(90px,110px)_minmax(80px,100px)]'
              }`}>
                {showSelectionAndApproval && canApproveTimeLogs && (
                  <div className="flex items-center justify-center">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(checked) => handleSelectAll(!!checked)}
                    />
                  </div>
                )}
                <div>Description</div>
                <div>Project (Task)</div>
                <div>Employee</div>
                <div>Start Time</div>
                <div>End Time</div>
                <div>Duration</div>
                <div>Status</div>
                <div>Billable</div>
                <div>Approval</div>
                <div>Actions</div>
              </div>

              {/* Table Rows */}
              {displayedEntries.map((entry) => (
                <div key={entry._id} className="border rounded-lg overflow-hidden">
                  {/* Mobile Card View */}
                  <div className="md:hidden p-3 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {showSelectionAndApproval && canApproveTimeLogs && !entry.__isActive && (
                          <Checkbox
                            checked={selectedEntries.includes(entry._id)}
                            onCheckedChange={(checked) => handleSelectEntry(entry._id, checked as boolean)}
                            className="flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate" title={entry.description}>{entry.description}</div>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="text-xs text-muted-foreground truncate mt-1 cursor-default">
                                  {entry?.project?.name ? (
                                    <>
                                      <span className="text-foreground">{entry.project.name}</span>
                                      {entry?.task?.title ? (
                                        <span className="text-muted-foreground"> ({entry.task.title})</span>
                                      ) : entry.task ? (
                                        <span className="text-muted-foreground italic"> (Task deleted)</span>
                                      ) : null}
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground italic">Project deleted or unavailable</span>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>
                                  {entry?.project?.name 
                                    ? `${entry.project.name}${entry?.task?.title ? `(${entry.task.title})` : entry.task ? '(Task deleted)' : ''}`
                                    : 'Project deleted or unavailable'
                                  }
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-muted-foreground">Employee</div>
                        <div className="mt-1 font-medium">
                          {([entry.user?.firstName, entry.user?.lastName].filter(Boolean).join(' ') || 'Unknown')}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Start Time</div>
                        <div className="mt-1">
                          <div>{formatDateTimeSafe(entry.startTime)}</div>
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">End Time</div>
                        {entry.endTime ? (
                          <div className="mt-1">
                            <div>{formatDateTimeSafe(entry.endTime)}</div>
                          </div>
                        ) : <div className="mt-1">-</div>}
                      </div>
                      <div>
                        <div className="text-muted-foreground">Duration</div>
                        <div className="mt-1">{formatDuration(entry.duration)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Status</div>
                        <div className="mt-1">
                          <Badge variant={entry.status === 'completed' ? 'default' : 'secondary'} className="text-xs">
                            {entry.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div>
                      <Badge variant={entry.isBillable ? 'default' : 'outline'} className="text-xs">
                        {entry.isBillable ? 'Billable' : 'Non-billable'}
                      </Badge>
                    </div>
                    {showSelectionAndApproval && (
                      <div>
                        <div className="text-muted-foreground">Approval</div>
                        <div className="mt-1">
                          {(() => {
                            // For running timers, don't show approval status
                            if (entry.__isActive) {
                              return <span className="text-muted-foreground">-</span>
                            }

                            // Use actual approval status from database
                            const isApproved = entry.isApproved;
                            const isRejected = entry.isReject;

                            let badgeVariant: 'default' | 'secondary' | 'destructive' = 'secondary';
                            let badgeText = 'Pending';

                            if (isRejected) {
                              badgeVariant = 'destructive';
                              badgeText = 'Rejected';
                            } else if (isApproved) {
                              badgeVariant = 'default';
                              badgeText = 'Approved';
                            }

                            return (
                          <Badge
                                variant={badgeVariant}
                            className="text-xs"
                          >
                                {badgeText}
                          </Badge>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                    {showSelectionAndApproval && canApproveTime && !entry.__isActive && (
                      <div>
                        <div className="text-muted-foreground">Actions</div>
                        <div className="mt-1 flex gap-1">
                          {!entry.isApproved ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs"
                              onClick={() => handleApproveEntries('approve', entry._id)}
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs"
                              onClick={() => handleApproveEntries('reject', entry._id)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                    {/* Mobile Edit and Delete Actions */}
                    <div className="flex gap-2 pt-2 border-t border-border">
                      {canUpdateTime && canEditTimeEntry(entry) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-8 text-xs"
                          onClick={() => handleEdit(entry)}
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                      )}
                      {canDeleteTime && canEditTimeEntry(entry) && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="flex-1 h-8 text-xs"
                          onClick={() => handleDeleteClick(entry)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Desktop Table View */}
                  <div className={`hidden md:grid gap-2 p-3 items-center overflow-x-auto ${
                    showSelectionAndApproval && canApproveTimeLogs 
                      ? 'grid-cols-[40px_minmax(150px,1.5fr)_minmax(120px,1fr)_minmax(100px,120px)_minmax(100px,120px)_minmax(100px,120px)_minmax(80px,100px)_minmax(80px,100px)_minmax(80px,100px)_minmax(90px,110px)_minmax(80px,100px)]' 
                      : 'grid-cols-[minmax(200px,2fr)_minmax(120px,1fr)_minmax(100px,120px)_minmax(100px,120px)_minmax(100px,120px)_minmax(80px,100px)_minmax(80px,100px)_minmax(80px,100px)_minmax(90px,110px)_minmax(80px,100px)]'
                  }`}>
                    {showSelectionAndApproval && canApproveTimeLogs && (
                      <div className="flex items-center justify-center">
                        <Checkbox
                          id={`select-${entry._id}`}
                          checked={selectedEntries.includes(entry._id)}
                          onCheckedChange={() => toggleEntrySelection(entry._id)}
                          className="h-4 w-4"
                        />
                        <label htmlFor={`select-${entry._id}`} className="sr-only">
                          Select entry
                        </label>
                      </div>
                    )}
                    <div className="truncate">
                      <div className="font-medium text-xs sm:text-sm truncate" title={entry.description}>{entry.description}</div>
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="text-xs sm:text-sm truncate cursor-default">
                            {entry?.project?.name ? (
                              <>
                                <span className="text-foreground">{entry.project.name}</span>
                                {entry?.task?.title ? (
                                  <span className="text-muted-foreground"> ({entry.task.title})</span>
                                ) : entry.task ? (
                                  <span className="text-muted-foreground italic"> (Task deleted)</span>
                                ) : null}
                              </>
                            ) : (
                              <span className="text-muted-foreground italic">
                                Project deleted
                              </span>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {entry?.project?.name 
                              ? `${entry.project.name}${entry?.task?.title ? `(${entry.task.title})` : entry.task ? '(Task deleted)' : ''}`
                              : 'Project deleted or unavailable'
                            }
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <div className="text-xs sm:text-sm">
                      {([entry.user?.firstName, entry.user?.lastName].filter(Boolean).join(' ') || 'Unknown')}
                    </div>
                    <div className="text-xs sm:text-sm leading-tight">
                      {(() => {
                        const formatted = formatDateTimeSafe(entry.startTime)
                        return formatted
                      })()}
                    </div>
                    <div className="text-xs sm:text-sm leading-tight">
                      {entry.endTime ? (() => {
                        const formatted = formatDateTimeSafe(entry.endTime)
                        return formatted
                      })() : '-'}
                    </div>
                    <div className="text-xs sm:text-sm">
                      {formatDuration(entry.duration)}
                    </div>
                    <div className="flex items-center">
                      <Badge
                        variant={
                          entry.status === 'completed'
                            ? 'default'
                            : entry.status === 'running'
                            ? 'default'
                            : 'secondary'
                        }
                        className="text-xs capitalize whitespace-nowrap"
                      >
                        {entry.status}
                      </Badge>
                    </div>
                    <div className="flex items-center">
                      <Badge variant={entry.isBillable ? 'default' : 'outline'} className="text-xs whitespace-nowrap">
                        {entry.isBillable ? 'Yes' : 'No'}
                      </Badge>
                    </div>
                    <div>
                      {(() => {
                        // For running timers, don't show approval status
                        if (entry.__isActive) {
                          return <span className="text-muted-foreground">-</span>
                        }

                        // Use actual approval status from database
                        const isApproved = entry.isApproved;
                        const isRejected = entry.isReject;

                        let badgeVariant: 'default' | 'secondary' | 'destructive' = 'secondary';
                        let badgeText = 'Pending';

                        if (isRejected) {
                          badgeVariant = 'destructive';
                          badgeText = 'Rejected';
                        } else if (isApproved) {
                          badgeVariant = 'default';
                          badgeText = 'Approved';
                        }

                        return (
                      <Badge
                            variant={badgeVariant}
                        className="text-xs whitespace-nowrap"
                      >
                            {badgeText}
                      </Badge>
                        );
                      })()}
                      {entry.approvedBy && (
                        <div className="text-xs text-muted-foreground mt-1 truncate" title={`by ${entry.approvedBy.firstName} ${entry.approvedBy.lastName}`}>
                          by {entry.approvedBy.firstName} {entry.approvedBy.lastName}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center">
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 p-0"
                            disabled={!canEditTimeEntry(entry)}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content className="min-w-[120px] bg-popover dark:bg-popover rounded-md p-1 shadow-lg border border-border dark:border-border z-50">
                            {canUpdateTime && canEditTimeEntry(entry) && (
                              <DropdownMenu.Item
                                className="flex items-center px-2 py-1.5 text-sm rounded hover:bg-accent dark:hover:bg-accent hover:text-accent-foreground dark:hover:text-accent-foreground cursor-pointer outline-none text-foreground dark:text-foreground"
                                onSelect={() => handleEdit(entry)}
                              >
                                <Edit className="mr-2 h-4 w-4" />
                                <span>Edit</span>
                              </DropdownMenu.Item>
                            )}
                            {canDeleteTime && canEditTimeEntry(entry) && (
                              <DropdownMenu.Item
                                className="flex items-center px-2 py-1.5 text-sm rounded text-destructive dark:text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/20 cursor-pointer outline-none"
                                onSelect={() => handleDeleteClick(entry)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                <span>Delete</span>
                              </DropdownMenu.Item>
                            )}
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {pagination.total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm text-muted-foreground">Items per page:</span>
                <Select
                  value={pagination.limit.toString()}
                  onValueChange={(value) => {
                    const newLimit = parseInt(value)
                    setPagination(prev => ({
                      ...prev,
                      limit: newLimit,
                      page: 1 // Reset to first page when changing limit
                    }))
                  }}
                >
                  <SelectTrigger className="w-16 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground">
                Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
              >
                Previous
              </Button>
              <span className="text-xs sm:text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.pages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>

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
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={
                    tasksLoading 
                      ? 'Loading tasks...' 
                      : selectedProjectForLog 
                        ? (tasks.length > 0 ? 'Select a task' : 'No tasks available') 
                        : 'Select a project first'
                  } />
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
                  Total: {(calculatedDuration.totalMinutes / 60).toFixed(2)} hours
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
              Description {timeTrackingSettings?.requireDescription ? '*' : ''}
            </Label>
            <Textarea
              id="modal-description"
              value={manualLogData.description}
              onChange={(e) => setManualLogData(prev => ({ ...prev, description: e.target.value }))}
              placeholder={
                timeTrackingSettings?.requireDescription 
                  ? 'What did you work on? (required)' 
                  : 'What did you work on? (optional)'
              }
              rows={3}
              required={timeTrackingSettings?.requireDescription === true}
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
              setSelectedProjectForLog('')
              setSelectedTaskForLog('')
              setTasks([])
              setModalProjectSearch('')
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
              !selectedProjectForLog || 
              !selectedTaskForLog ||
              !manualLogData.startDate ||
              !manualLogData.startTime ||
              !manualLogData.endDate ||
              !manualLogData.endTime ||
              !!(startDateError || startTimeError || endDateError || endTimeError) ||
              (timeTrackingSettings?.requireDescription === true && !manualLogData.description.trim())
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
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={
                    tasksLoading 
                      ? 'Loading tasks...' 
                      : selectedProjectForLog 
                        ? (tasks.length > 0 ? 'Select a task' : 'No tasks available') 
                        : 'Select a project first'
                  } />
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
                    tasks.map((task) => (
                      <SelectItem key={task._id} value={task._id}>
                        <div className="flex items-center space-x-2">
                          <Target className="h-4 w-4 flex-shrink-0" />
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="truncate">{task.title}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{task.title}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </SelectItem>
                    ))
                  )}
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
                  Total: {(calculatedDuration.totalMinutes / 60).toFixed(2)} hours
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
              Description {timeTrackingSettings?.requireDescription ? '*' : ''}
            </Label>
            <Textarea
              id="edit-description"
              value={manualLogData.description}
              onChange={(e) => setManualLogData(prev => ({ ...prev, description: e.target.value }))}
              placeholder={
                timeTrackingSettings?.requireDescription 
                  ? 'What did you work on? (required)' 
                  : 'What did you work on? (optional)'
              }
              rows={3}
              required={timeTrackingSettings?.requireDescription === true}
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
              (timeTrackingSettings?.requireDescription === true && !manualLogData.description.trim())
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

    
    <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Delete Time Entry</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this time entry? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => setShowDeleteDialog(false)}
          >
            Cancel
          </Button>
          <Button 
            variant="destructive"
            onClick={handleConfirmDelete}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

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
                        className={`flex items-center gap-2 p-2 rounded text-sm transition-all ${
                          status.status === 'success'
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
                  <li><strong>Optional columns:</strong> Description</li>
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

