'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useMemo } from 'react'
import { Clock, Edit, Trash2, Check, X, Filter, Download, Plus, AlertTriangle, FolderOpen, Target, Loader2, Upload, FileText, User, Search, MoreHorizontal } from 'lucide-react'
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
import { Permission } from '@/lib/permissions/permission-definitions'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { toast } from 'sonner'

interface TimeLogsProps {
  userId: string
  organizationId: string
  projectId?: string
  taskId?: string
  onTimeEntryUpdate?: () => void
  refreshKey?: number
  liveActiveTimer?: ActiveTimerPayload | null
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
  isApproved: boolean
  approvedBy?: { firstName: string; lastName: string }
  project?: { _id: string; name: string } | null
  task?: { _id: string; title: string } | null
  __isActive?: boolean
}

interface ActiveTimerPayload {
  _id: string
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
  liveActiveTimer
}: TimeLogsProps) {
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
  const [manualLogData, setManualLogData] = useState({
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    description: '',
    isBillable: false
  })
  const [submittingManualLog, setSubmittingManualLog] = useState(false)
  const [sessionHoursError, setSessionHoursError] = useState('')
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false)
  const [bulkUploadFile, setBulkUploadFile] = useState<File | null>(null)
  const [bulkUploadProgress, setBulkUploadProgress] = useState<{ total: number; processed: number; successful: number; failed: number } | null>(null)
  const [bulkUploadErrors, setBulkUploadErrors] = useState<Array<{ row: number; error: string }>>([])
  const [uploadingBulk, setUploadingBulk] = useState(false)
  const [showErrorAlert, setShowErrorAlert] = useState(true)
  const [showBulkUploadErrorAlert, setShowBulkUploadErrorAlert] = useState(true)
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
    isBillable: boolean
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

  // Check if user can view employee filter using permission
  const canViewEmployeeFilter = useMemo(() => {
    return hasPermission(Permission.TIME_TRACKING_EMPLOYEE_FILTER_READ)
  }, [hasPermission])

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

  // Fetch tasks for filter when project is selected
  useEffect(() => {
    const fetchFilterTasks = async () => {
      if (!filters.projectId || !resolvedOrgId) {
        setFilterTasks([])
        return
      }
      setFilterTasksLoading(true)
      try {
        const response = await fetch(`/api/tasks?project=${filters.projectId}&limit=500`)
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
        const response = await fetch('/api/members')
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
  useEffect(() => {
    if (organization?.settings?.timeTracking) {
      setOrganizationSettings(organization.settings.timeTracking)
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
    // Application level (organization settings)
    const orgLevelEnabled = organizationSettings?.allowManualTimeSubmission ?? false
    
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
            return createdByMatch || teamMatch || membersMatch
          })
          let final = filtered
          if (isEditing && selectedEntry?.project?._id) {
            const exists = filtered.some((p: any) => p?._id === selectedEntry.project!._id)
            if (!exists) {
              final = [...filtered, { _id: selectedEntry.project._id, name: selectedEntry.project.name }]
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
    const fetchTasks = async () => {
      if (!selectedProjectForLog || !resolvedUserId) {
        setTasks([])
        setTasksLoading(false)
        return
      }

      setTasksLoading(true)
      try {
        const url = isEditing
          ? `/api/tasks?project=${selectedProjectForLog}&limit=500`
          : `/api/tasks?project=${selectedProjectForLog}&assignedTo=${resolvedUserId}&limit=200`
        const response = await fetch(url)
        const data = await response.json()
        let list: any[] = []
        if (data.success && Array.isArray(data.data)) list = data.data
        else if (Array.isArray(data)) list = data
        else if (Array.isArray(data.tasks)) list = data.tasks
        if (!isEditing) {
          list = list.filter((t: any) => {
            const at = t?.assignedTo
            if (!at) return false
            if (typeof at === 'string') return at === resolvedUserId
            return at?._id === resolvedUserId || at?.id === resolvedUserId
          })
        }
        if (isEditing && selectedEntry?.task && !list.some((t: any) => t?._id === selectedEntry.task!._id)) {
          list = [...list, selectedEntry.task]
        }
        setTasks(list)
      } catch (err) {
        console.error('Failed to fetch tasks:', err)
        setTasks([])
      } finally {
        setTasksLoading(false)
      }
    }

    if (selectedProjectForLog) {
      fetchTasks()
    } else {
      setTasks([])
      setSelectedTaskForLog('')
    }
  }, [selectedProjectForLog, resolvedUserId, isEditing, selectedEntry])

  // Helper function to combine date and time into datetime-local format
  const combineDateTime = (date: string, time: string): string => {
    if (!date || !time) return ''
    return `${date}T${time}`
  }

  // Validate maxSessionHours and future time when dates/times change
  const validateSessionHours = useCallback(() => {
    setSessionHoursError('')

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
      setSessionHoursError('End time must be after start time')
      return
    }

    const now = new Date()

    // Check for future time logging
    if (!timeTrackingSettings?.allowFutureTime) {
      if (start > now) {
        setSessionHoursError('Future time not allowed. Please select a time that is today or in the past.')
        return
      }
      if (end > now) {
        setSessionHoursError('Future time not allowed. Please select a time that is today or in the past.')
        return
      }
    }

    // Check maxSessionHours only when overtime is disabled
    if (timeTrackingSettings?.allowOvertime === false && timeTrackingSettings?.maxSessionHours) {
      const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60)
      const durationHours = durationMinutes / 60
      const maxHours = timeTrackingSettings.maxSessionHours

      if (durationHours > maxHours) {
        setSessionHoursError(`Session duration (${durationHours.toFixed(2)}h) exceeds maximum allowed (${maxHours}h). Overtime is not allowed.`)
        return
      }
    }
  }, [manualLogData.startDate, manualLogData.startTime, manualLogData.endDate, manualLogData.endTime, timeTrackingSettings])

  useEffect(() => {
    validateSessionHours()
  }, [validateSessionHours])

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

    if (sessionHoursError) {
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
          startTime: startDateTime,
          endTime: endDateTime,
          isBillable: manualLogData.isBillable && timeTrackingSettings?.allowBillableTime
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
          description: '',
          isBillable: false
        })
        setSelectedProjectForLog('')
        setSelectedTaskForLog('')
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

    if (sessionHoursError) {
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
          startTime: startDateTime,
          endTime: endDateTime,
          isBillable: manualLogData.isBillable && timeTrackingSettings?.allowBillableTime
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
          description: '',
          isBillable: false
        })
        setSelectedProjectForLog('')
        setSelectedTaskForLog('')
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
    const roundingRules = organization?.settings?.timeTracking?.roundingRules
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
      if (filters.isApproved && filters.isApproved !== 'all') params.append('isApproved', filters.isApproved)

      const response = await fetch(`/api/time-tracking/entries?${params}`)
      const data = await response.json()

      if (response.ok) {
        setTimeEntries(data.timeEntries)
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDateParts = (dateString: string) => {
    const d = new Date(dateString)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const date = `${yyyy}-${mm}-${dd}`
    const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    return { date, time }
  }

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
    const entries = timeEntries.filter(entry => passesDateFilters(entry.startTime))
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
      const url = isEditing
        ? `/api/tasks?project=${projectId}&limit=500`
        : `/api/tasks?project=${projectId}&assignedTo=${resolvedUserId}&limit=200`
      const res = await fetch(url)
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
    
    // Format dates and times for the form
    const start = new Date(entry.startTime)
    const end = entry.endTime ? new Date(entry.endTime) : new Date()
    
    setManualLogData({
      startDate: start.toISOString().split('T')[0],
      startTime: start.toTimeString().substring(0, 5),
      endDate: end.toISOString().split('T')[0],
      endTime: end.toTimeString().substring(0, 5),
      description: entry.description || '',
      isBillable: entry.isBillable || false
    })
    setEditInitial({
      projectId: entry.project?._id || '',
      taskId: entry.task?._id || '',
      startDate: start.toISOString().split('T')[0],
      startTime: start.toTimeString().substring(0, 5),
      endDate: end.toISOString().split('T')[0],
      endTime: end.toTimeString().substring(0, 5),
      description: entry.description || '',
      isBillable: entry.isBillable || false
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
      editInitial.description !== manualLogData.description ||
      editInitial.isBillable !== manualLogData.isBillable
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

    const headers = ['Project Name', 'Task Title', 'Start Date (YYYY-MM-DD)', 'Start Time (HH:MM)', 'End Date (YYYY-MM-DD)', 'End Time (HH:MM)', 'Description', 'Is Billable (true/false)']
    const exampleRow = ['My Project', 'Task 1', '2024-01-15', '09:00', '2024-01-15', '17:00', 'Worked on feature', '']
    
    const csvContent = [
      headers.map(escapeCSV).join(','),
      exampleRow.map(escapeCSV).join(',')
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
    const requiredHeaders = ['Project Name', 'Task Title', 'Start Date (YYYY-MM-DD)', 'Start Time (HH:MM)', 'End Date (YYYY-MM-DD)', 'End Time (HH:MM)']
    
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
  const validateCSVRow = (row: Record<string, string>, rowIndex: number, projectMap: Map<string, string>, taskMap: Map<string, string>): { valid: boolean; error?: string; data?: any } => {
    const projectName = row['Project Name']?.trim()
    const taskTitle = row['Task Title']?.trim()
    const startDate = row['Start Date (YYYY-MM-DD)']?.trim()
    const startTime = row['Start Time (HH:MM)']?.trim()
    const endDate = row['End Date (YYYY-MM-DD)']?.trim()
    const endTime = row['End Time (HH:MM)']?.trim()
    const description = row['Description']?.trim() || ''
    const isBillable = row['Is Billable (true/false)']?.trim().toLowerCase()

    // Validate Project Name (required)
    if (!projectName) {
      return { valid: false, error: `Row ${rowIndex + 1}: Project Name is required` }
    }

    // Validate Task Title (required)
    if (!taskTitle) {
      return { valid: false, error: `Row ${rowIndex + 1}: Task Title is required` }
    }

    // Validate Project exists
    const projectId = projectMap.get(projectName)
    if (!projectId) {
      return { valid: false, error: `Row ${rowIndex + 1}: Project "${projectName}" not found` }
    }

    // Validate Task exists
    const taskId = taskMap.get(`${projectId}:${taskTitle}`)
    if (!taskId) {
      return { valid: false, error: `Row ${rowIndex + 1}: Task "${taskTitle}" not found in project "${projectName}"` }
    }

    // Validate Start Date (required)
    if (!startDate) {
      return { valid: false, error: `Row ${rowIndex + 1}: Start Date is required` }
    }

    // Validate Start Time (required)
    if (!startTime) {
      return { valid: false, error: `Row ${rowIndex + 1}: Start Time is required` }
    }

    // Validate End Date (required)
    if (!endDate) {
      return { valid: false, error: `Row ${rowIndex + 1}: End Date is required` }
    }

    // Validate End Time (required)
    if (!endTime) {
      return { valid: false, error: `Row ${rowIndex + 1}: End Time is required` }
    }

    // Validate Start Date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(startDate)) {
      return { valid: false, error: `Row ${rowIndex + 1}: Start Date format must be YYYY-MM-DD (e.g., 2024-01-15)` }
    }

    // Validate End Date format (YYYY-MM-DD)
    if (!dateRegex.test(endDate)) {
      return { valid: false, error: `Row ${rowIndex + 1}: End Date format must be YYYY-MM-DD (e.g., 2024-01-15)` }
    }

    // Validate Start Time format (HH:MM)
    const timeRegex = /^\d{2}:\d{2}$/
    if (!timeRegex.test(startTime)) {
      return { valid: false, error: `Row ${rowIndex + 1}: Start Time format must be HH:MM (e.g., 09:00)` }
    }

    // Validate End Time format (HH:MM)
    if (!timeRegex.test(endTime)) {
      return { valid: false, error: `Row ${rowIndex + 1}: End Time format must be HH:MM (e.g., 17:00)` }
    }

    // Validate time values (hours 00-23, minutes 00-59)
    const [startHour, startMin] = startTime.split(':').map(Number)
    if (startHour < 0 || startHour > 23 || startMin < 0 || startMin > 59) {
      return { valid: false, error: `Row ${rowIndex + 1}: Start Time must be between 00:00 and 23:59` }
    }

    const [endHour, endMin] = endTime.split(':').map(Number)
    if (endHour < 0 || endHour > 23 || endMin < 0 || endMin > 59) {
      return { valid: false, error: `Row ${rowIndex + 1}: End Time must be between 00:00 and 23:59` }
    }

    // Validate date values
    const startDateTime = `${startDate}T${startTime}`
    const endDateTime = `${endDate}T${endTime}`
    const start = new Date(startDateTime)
    const end = new Date(endDateTime)

    if (isNaN(start.getTime())) {
      return { valid: false, error: `Row ${rowIndex + 1}: Invalid Start Date/Time values` }
    }

    if (isNaN(end.getTime())) {
      return { valid: false, error: `Row ${rowIndex + 1}: Invalid End Date/Time values` }
    }

    if (end <= start) {
      return { valid: false, error: `Row ${rowIndex + 1}: End Date/Time must be after Start Date/Time` }
    }

    // Check if description is required
    if (timeTrackingSettings?.requireDescription === true && !description) {
      return { valid: false, error: `Row ${rowIndex + 1}: Description is required` }
    }

    // Validate Is Billable (optional - only validate if provided)
    let billable = true // Default to true if not provided
    if (isBillable && isBillable !== '') {
      const normalizedBillable = isBillable.toLowerCase().trim()
      if (normalizedBillable !== 'true' && normalizedBillable !== 'false') {
        return { valid: false, error: `Row ${rowIndex + 1}: Is Billable must be "true" or "false" (case-insensitive)` }
      }
      billable = normalizedBillable === 'true'
    }

    // Check future time
    if (!timeTrackingSettings?.allowFutureTime && start > new Date()) {
      return { valid: false, error: `Row ${rowIndex + 1}: Future time logging not allowed` }
    }

    // Check past time limit
    const daysDiff = Math.ceil((new Date().getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    if (!timeTrackingSettings?.allowPastTime && daysDiff > (timeTrackingSettings?.pastTimeLimitDays || 30)) {
      return { valid: false, error: `Row ${rowIndex + 1}: Past time logging not allowed beyond limit` }
    }

    // Check max session hours
    const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60)
    const durationHours = durationMinutes / 60
    if (timeTrackingSettings?.allowOvertime === false && timeTrackingSettings?.maxSessionHours && durationHours > timeTrackingSettings.maxSessionHours) {
      return { valid: false, error: `Row ${rowIndex + 1}: Session duration exceeds maximum allowed (${timeTrackingSettings.maxSessionHours}h)` }
    }

    return {
      valid: true,
      data: {
        projectId,
        taskId,
        description,
        startTime: startDateTime,
        endTime: endDateTime,
        isBillable: billable && timeTrackingSettings?.allowBillableTime
      }
    }
  }

  // Handle bulk upload
  const handleBulkUpload = async () => {
    if (!bulkUploadFile) return

    setUploadingBulk(true)
    setBulkUploadErrors([])
    setBulkUploadProgress(null)
    setError('')
    setBulkUploadSuccess(null)
    setShowErrorAlert(true)
    setShowBulkUploadErrorAlert(true)
    setShowBulkUploadProgressAlert(true)

    try {
      // Read CSV file
      const csvText = await bulkUploadFile.text()
      const rows = parseCSV(csvText)

      // Build project and task maps
      const projectMap = new Map<string, string>()
      const taskMap = new Map<string, string>()

      // Fetch all projects
      const projectsResponse = await fetch('/api/projects')
      const projectsData = await projectsResponse.json()
      if (projectsData.success && Array.isArray(projectsData.data)) {
        projectsData.data.forEach((project: any) => {
          projectMap.set(project.name, project._id)
        })
      }

      // Fetch tasks for each unique project (fetch all tasks, not just assigned ones)
      const uniqueProjects = Array.from(new Set(rows.map(row => row['Project Name']?.trim()).filter(Boolean)))
      for (const projectName of uniqueProjects) {
        const projectId = projectMap.get(projectName)
        if (projectId) {
          try {
            const tasksResponse = await fetch(`/api/tasks?project=${projectId}&limit=500`)
            const tasksData = await tasksResponse.json()
            if (tasksData.success && Array.isArray(tasksData.data)) {
              tasksData.data.forEach((task: any) => {
                // Use projectId:taskTitle as key to handle duplicate task titles across projects
                taskMap.set(`${projectId}:${task.title}`, task._id)
              })
            }
          } catch (err) {
            console.error(`Failed to fetch tasks for project ${projectName}:`, err)
          }
        }
      }

      // Validate all rows
      const validatedRows: Array<{ rowIndex: number; data: any }> = []
      const errors: Array<{ row: number; error: string }> = []

      rows.forEach((row, index) => {
        const validation = validateCSVRow(row, index, projectMap, taskMap)
        if (validation.valid && validation.data) {
          validatedRows.push({ rowIndex: index, data: validation.data })
        } else {
          errors.push({ row: index + 2, error: validation.error || 'Unknown error' })
        }
      })

      if (errors.length > 0) {
        setBulkUploadErrors(errors)
        setShowBulkUploadErrorAlert(true)
        setUploadingBulk(false)
        return
      }

      if (validatedRows.length === 0) {
        setError('No valid rows to upload')
        setShowErrorAlert(true)
        setUploadingBulk(false)
        return
      }

      // Upload in batches
      const batchSize = 10
      let successful = 0
      let failed = 0
      const uploadErrors: Array<{ row: number; error: string }> = []

      setBulkUploadProgress({ total: validatedRows.length, processed: 0, successful: 0, failed: 0 })

      for (let i = 0; i < validatedRows.length; i += batchSize) {
        const batch = validatedRows.slice(i, i + batchSize)
        const batchPromises = batch.map(async ({ rowIndex, data }) => {
          try {
            const response = await fetch('/api/time-tracking/entries', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: resolvedUserId,
                organizationId: resolvedOrgId,
                ...data
              })
            })

            const result = await response.json()

            if (response.ok) {
              successful++
            } else {
              failed++
              uploadErrors.push({ row: rowIndex + 2, error: result.error || 'Failed to create time entry' })
            }
          } catch (err) {
            failed++
            uploadErrors.push({ row: rowIndex + 2, error: err instanceof Error ? err.message : 'Unknown error' })
          }
        })

        await Promise.all(batchPromises)
        setBulkUploadProgress({
          total: validatedRows.length,
          processed: Math.min(i + batchSize, validatedRows.length),
          successful,
          failed
        })
      }

      if (uploadErrors.length > 0) {
        setBulkUploadErrors(uploadErrors)
        setShowBulkUploadErrorAlert(true)
      }

      if (successful > 0) {
        // Reset pagination to page 1 to show newly uploaded entries at the top
        setPagination(prev => ({ ...prev, page: 1 }))
        // Refresh the time entries table to show newly uploaded data
        // Using setTimeout to ensure pagination state is updated first
        setTimeout(async () => {
          if (!resolvedUserId || !resolvedOrgId) return
          setIsLoading(true)
          setError('')

          try {
            const params = new URLSearchParams({
              userId: resolvedUserId,
              organizationId: resolvedOrgId,
              page: '1', // Always load page 1 after bulk upload
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
            if (filters.isApproved && filters.isApproved !== 'all') params.append('isApproved', filters.isApproved)

            const response = await fetch(`/api/time-tracking/entries?${params}`)
            const data = await response.json()

            if (response.ok) {
              setTimeEntries(data.timeEntries)
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
        if (failed === 0) {
          setBulkUploadSuccess(`Successfully uploaded ${successful} time ${successful === 1 ? 'entry' : 'entries'}. The table will refresh to show the new entries.`)
          setTimeout(() => {
            setShowBulkUploadModal(false)
            setBulkUploadFile(null)
            setBulkUploadProgress(null)
            setBulkUploadSuccess(null)
            setShowBulkUploadErrorAlert(true)
            setShowBulkUploadProgressAlert(true)
          }, 3000)
        } else {
          setBulkUploadSuccess(`Successfully uploaded ${successful} time ${successful === 1 ? 'entry' : 'entries'}, ${failed} failed. The table will refresh to show the new entries.`)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process CSV file')
      setShowErrorAlert(true)
    } finally {
      setUploadingBulk(false)
    }
  }

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {/* <Clock className="h-5 w-5" />
            Time Logs */}
          </CardTitle>
          {canAddManualTimeLog && (
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setShowBulkUploadModal(true)}
                size="sm"
                variant="outline"
              >
                <Upload className="h-4 w-4 mr-2" />
                Bulk Upload
              </Button>
              <Button
                onClick={() => setShowAddTimeLogModal(true)}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Time Log
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {authResolving && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-muted-foreground mt-2">Loading your time entries...</p>
          </div>
        )}
        {error && showErrorAlert && (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between">
              <span>{error}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setShowErrorAlert(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Filters */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Filters</Label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label htmlFor="filter-project" className="text-xs sm:text-sm">Project</Label>
              <Select 
                value={filters.projectId || 'all'} 
                onValueChange={(value) => {
                  handleFilterChange('projectId', value === 'all' ? '' : value)
                  if (value === 'all') {
                    handleFilterChange('taskId', '')
                  }
                }}
              >
                <SelectTrigger className="w-full" id="filter-project">
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent>
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search projects..."
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        className="h-8 pl-7 text-xs"
                      />
                    </div>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto">
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
                  </div>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-task" className="text-xs sm:text-sm">Task</Label>
              <Select 
                value={filters.taskId || 'all'} 
                onValueChange={(value) => handleFilterChange('taskId', value === 'all' ? '' : value)}
                disabled={!filters.projectId || filterTasksLoading}
              >
                <SelectTrigger className="w-full" id="filter-task">
                  <SelectValue placeholder={
                    !filters.projectId 
                      ? 'Select project first' 
                      : filterTasksLoading 
                        ? 'Loading...' 
                        : 'All tasks'
                  } />
                </SelectTrigger>
                <SelectContent>
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search tasks..."
                        value={taskSearch}
                        onChange={(e) => setTaskSearch(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        className="h-8 pl-7 text-xs"
                        disabled={!filters.projectId}
                      />
                    </div>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto">
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
                  </div>
                </SelectContent>
              </Select>
            </div>

            {canViewEmployeeFilter && (
              <div className="space-y-2">
                <Label htmlFor="filter-employee" className="text-xs sm:text-sm">Employee</Label>
                <Select 
                  value={filters.employeeId || 'all'} 
                  onValueChange={(value) => handleFilterChange('employeeId', value === 'all' ? '' : value)}
                  disabled={filterEmployeesLoading}
                >
                  <SelectTrigger className="w-full" id="filter-employee">
                    <SelectValue placeholder={
                      filterEmployeesLoading ? 'Loading...' : 'All employees'
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="p-2 border-b">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Search employees..."
                          value={employeeSearch}
                          onChange={(e) => setEmployeeSearch(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="h-8 pl-7 text-xs"
                        />
                      </div>
                    </div>
                    <div className="max-h-[200px] overflow-y-auto">
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
                    </div>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="startDate" className="text-xs sm:text-sm">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate" className="text-xs sm:text-sm">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status" className="text-xs sm:text-sm">Status</Label>
              <Select value={filters.status || 'all'} onValueChange={handleStatusFilterChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search status..."
                        value={statusSearch}
                        onChange={(e) => setStatusSearch(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        className="h-8 pl-7 text-xs"
                      />
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
            <div className="space-y-2">
              <Label htmlFor="isBillable" className="text-xs sm:text-sm">Billable</Label>
              <Select value={filters.isBillable} onValueChange={(value) => handleFilterChange('isBillable', value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="true">Billable</SelectItem>
                  <SelectItem value="false">Non-billable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="isApproved" className="text-xs sm:text-sm">Approved</Label>
              <Select value={filters.isApproved} onValueChange={(value) => handleFilterChange('isApproved', value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="true">Approved</SelectItem>
                  <SelectItem value="false">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Clear Filters Button */}
          {(filters.projectId || filters.taskId || filters.employeeId || filters.startDate || filters.endDate || filters.status !== '' || filters.isBillable !== '' || filters.isApproved !== '') && (
            <div className="flex justify-end">
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
              >
                <X className="h-4 w-4 mr-2" />
                Clear Filters
              </Button>
            </div>
          )}
        </div>

        {/* Bulk Actions */}
        {selectedEntries.length > 0 && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 p-3 bg-muted rounded-lg">
            <span className="text-xs sm:text-sm text-muted-foreground flex-1">
              {selectedEntries.length} entries selected
            </span>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                size="sm"
                onClick={() => handleApproveEntries('approve')}
                className="h-8 flex-1 sm:flex-initial"
              >
                <Check className="h-4 w-4 mr-1" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleApproveEntries('reject')}
                className="h-8 flex-1 sm:flex-initial"
              >
                <X className="h-4 w-4 mr-1" />
                Reject
              </Button>
            </div>
          </div>
        )}

        {/* Time Entries Table */}
        <div className="space-y-2">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-muted-foreground mt-2">Loading time entries...</p>
            </div>
          ) : displayedEntries.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm sm:text-base text-muted-foreground">No time entries found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Table Header - Hidden on mobile */}
              <div className={`hidden md:grid gap-2 p-3 bg-muted rounded-lg text-xs sm:text-sm font-medium ${canApproveTime ? 'grid-cols-[40px_1.2fr_1fr_120px_100px_100px_80px_80px_80px_90px_90px]' : 'grid-cols-[40px_1.2fr_1fr_120px_100px_100px_80px_80px_80px_90px]'}`}>
                <div>
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) => handleSelectAll(!!checked)}
                  />
                </div>
                <div>Description</div>
                <div>Project (Task)</div>
                <div>Employee</div>
                <div>Start Time</div>
                <div>End Time</div>
                <div>Duration</div>
                <div>Status</div>
                <div>Billable</div>
                <div>Approval</div>
                {canApproveTime && <div>Actions</div>}
              </div>

              {/* Table Rows */}
              {displayedEntries.map((entry) => (
                <div key={entry._id} className="border rounded-lg overflow-hidden">
                  {/* Mobile Card View */}
                  <div className="md:hidden p-3 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {!entry.__isActive && (
                          <Checkbox
                            checked={selectedEntries.includes(entry._id)}
                            onCheckedChange={(checked) => handleSelectEntry(entry._id, checked as boolean)}
                            className="flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate" title={entry.description}>{entry.description}</div>
                          <div className="text-xs text-muted-foreground truncate mt-1">
                            {entry?.project?.name ? (
                              <>
                                <span className="text-foreground">{entry.project.name}</span>
                                {entry?.task?.title ? (
                                  <span className="text-muted-foreground"> • {entry.task.title}</span>
                                ) : entry.task ? (
                                  <span className="text-muted-foreground italic"> • Task deleted</span>
                                ) : null}
                              </>
                            ) : (
                              <span className="text-muted-foreground italic">Project deleted or unavailable</span>
                            )}
                          </div>
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
                        {(() => { const p = formatDateParts(entry.startTime); return (
                          <div className="mt-1">
                            <div>{p.date}</div>
                            <div className="text-muted-foreground">{p.time}</div>
                          </div>
                        ) })()}
                      </div>
                      <div>
                        <div className="text-muted-foreground">End Time</div>
                        {entry.endTime ? (() => { const p = formatDateParts(entry.endTime as string); return (
                          <div className="mt-1">
                            <div>{p.date}</div>
                            <div className="text-muted-foreground">{p.time}</div>
                          </div>
                        ) })() : <div className="mt-1">-</div>}
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
                    <div>
                      <div className="text-muted-foreground">Approval</div>
                      <div className="mt-1">
                        <Badge 
                          variant={entry.isApproved ? 'default' : 'secondary'} 
                          className="text-xs"
                        >
                          {entry.isApproved ? 'Approved' : 'Pending'}
                        </Badge>
                      </div>
                    </div>
                    {canApproveTime && !entry.__isActive && (
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
                  </div>

                  {/* Desktop Table View */}
                  <div className={`hidden md:grid gap-2 p-3 ${canApproveTime ? 'grid-cols-[40px_1.2fr_1fr_120px_100px_100px_80px_80px_80px_90px_90px]' : 'grid-cols-[40px_1.2fr_1fr_120px_100px_100px_80px_80px_80px_90px]'}`}>
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
                    <div className="truncate">
                      <div className="font-medium text-xs sm:text-sm truncate" title={entry.description}>{entry.description}</div>
                    </div>
                    <div className="text-xs sm:text-sm truncate">
                      {entry?.project?.name ? (
                        <>
                          <span title={entry.project.name} className="text-foreground">{entry.project.name}</span>
                          {entry?.task?.title ? (
                            <span className="text-muted-foreground"> ({entry.task.title})</span>
                          ) : entry.task ? (
                            <span className="text-muted-foreground italic"> (Task deleted)</span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-muted-foreground italic" title="Project deleted or unavailable">
                          Project deleted
                        </span>
                      )}
                    </div>
                    <div className="text-xs sm:text-sm">
                      {([entry.user?.firstName, entry.user?.lastName].filter(Boolean).join(' ') || 'Unknown')}
                    </div>
                    <div className="text-xs sm:text-sm leading-tight">
                      {(() => { const p = formatDateParts(entry.startTime); return (
                        <>
                          <div>{p.date}</div>
                          <div className="text-muted-foreground">{p.time}</div>
                        </>
                      )})()}
                    </div>
                    <div className="text-xs sm:text-sm leading-tight">
                      {entry.endTime ? (() => { const p = formatDateParts(entry.endTime as string); return (<>
                        <div>{p.date}</div>
                        <div className="text-muted-foreground">{p.time}</div>
                      </>) })() : '-'}
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
                      <Badge 
                        variant={entry.isApproved ? 'default' : 'secondary'} 
                        className="text-xs"
                      >
                        {entry.isApproved ? 'Approved' : 'Pending'}
                      </Badge>
                      {entry.approvedBy && (
                        <div className="text-xs text-muted-foreground mt-1">
                          by {entry.approvedBy.firstName} {entry.approvedBy.lastName}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center ">
                      
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 p-0"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content className="min-w-[120px] bg-white rounded-md p-1 shadow-lg border border-gray-200 z-50">
                            <DropdownMenu.Item 
                              className="flex items-center px-2 py-1.5 text-sm rounded hover:bg-gray-100 cursor-pointer outline-none"
                              onSelect={() => handleEdit(entry)}
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              <span>Edit</span>
                            </DropdownMenu.Item>
                            <DropdownMenu.Item 
                              className="flex items-center px-2 py-1.5 text-sm rounded text-red-600 hover:bg-red-50 cursor-pointer outline-none"
                              onSelect={() => handleDeleteClick(entry)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              <span>Delete</span>
                            </DropdownMenu.Item>
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
        {pagination.pages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs sm:text-sm text-muted-foreground text-center sm:text-left">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} entries
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
                className="flex-1 sm:flex-initial"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.pages}
                className="flex-1 sm:flex-initial"
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project._id} value={project._id}>
                      <div className="flex items-center space-x-2">
                        <FolderOpen className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{project.name}</span>
                      </div>
                    </SelectItem>
                  ))}
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
                <SelectContent>
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
                          <div className="flex items-center space-x-2">
                            <Target className="h-4 w-4 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{task.title}</div>
                              {isBillableDisabled && (
                                <div className="text-xs text-muted-foreground">
                                  Billable time not allowed
                                </div>
                              )}
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
                className="w-full"
              />
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
                className="w-full"
              />
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
                className="w-full"
              />
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
                className={`w-full ${sessionHoursError ? 'border-destructive' : ''}`}
              />
              {sessionHoursError && (
                <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
                  <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive font-medium leading-relaxed">{sessionHoursError}</p>
                </div>
              )}
            </div>
          </div>

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

          {timeTrackingSettings?.allowBillableTime && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="modal-billable"
                checked={manualLogData.isBillable}
                onCheckedChange={(checked) => setManualLogData(prev => ({ ...prev, isBillable: checked as boolean }))}
              />
              <Label htmlFor="modal-billable" className="text-sm font-normal cursor-pointer">
                Mark as billable
              </Label>
            </div>
          )}
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
                description: '',
                isBillable: false
              })
              setSelectedProjectForLog('')
              setSelectedTaskForLog('')
              setTasks([])
              setError('')
              setSessionHoursError('')
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
              !!sessionHoursError ||
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project._id} value={project._id}>
                      <div className="flex items-center space-x-2">
                        <FolderOpen className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{project.name}</span>
                      </div>
                    </SelectItem>
                  ))}
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
                <SelectContent>
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
                          <span className="truncate">{task.title}</span>
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
                className="w-full"
              />
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
                className="w-full"
              />
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
                className="w-full"
              />
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
                className={`w-full ${sessionHoursError ? 'border-destructive' : ''}`}
              />
              {sessionHoursError && (
                <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
                  <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive font-medium leading-relaxed">{sessionHoursError}</p>
                </div>
              )}
            </div>
          </div>

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

          {timeTrackingSettings?.allowBillableTime && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit-billable"
                checked={manualLogData.isBillable}
                onCheckedChange={(checked) => setManualLogData(prev => ({ ...prev, isBillable: checked as boolean }))}
              />
              <Label htmlFor="edit-billable" className="text-sm font-normal cursor-pointer">
                Mark as billable
              </Label>
            </div>
          )}
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
                description: '',
                isBillable: false
              })
              setSelectedProjectForLog('')
              setSelectedTaskForLog('')
              setTasks([])
              setError('')
              setSessionHoursError('')
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
              !!sessionHoursError ||
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Upload Time Logs</DialogTitle>
          <DialogDescription>
            Upload multiple time entries using a CSV file. Download the template to see the required format.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {error && showErrorAlert && (
            <Alert variant="destructive">
              <AlertDescription className="flex items-center justify-between">
                <span>{error}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setShowErrorAlert(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {bulkUploadSuccess && (
            <Alert>
              <AlertDescription className="flex items-center justify-between">
                <span>{bulkUploadSuccess}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setBulkUploadSuccess(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {bulkUploadErrors.length > 0 && showBulkUploadErrorAlert && (
            <Alert variant="destructive">
              <AlertDescription>
                <div className="flex items-start justify-between mb-2">
                  <div className="font-semibold">Errors found:</div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setShowBulkUploadErrorAlert(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {bulkUploadErrors.map((err, idx) => (
                    <div key={idx} className="text-sm">
                      Row {err.row}: {err.error}
                    </div>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {bulkUploadProgress && showBulkUploadProgressAlert && (
            <Alert>
              <AlertDescription>
                <div className="flex items-start justify-between mb-2">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center justify-between">
                      <span>Progress: {bulkUploadProgress.processed} / {bulkUploadProgress.total}</span>
                      <span>{Math.round((bulkUploadProgress.processed / bulkUploadProgress.total) * 100)}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${(bulkUploadProgress.processed / bulkUploadProgress.total) * 100}%` }}
                      />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Successful: {bulkUploadProgress.successful} | Failed: {bulkUploadProgress.failed}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 ml-2"
                    onClick={() => setShowBulkUploadProgressAlert(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
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
                    setShowErrorAlert(true)
                    setShowBulkUploadErrorAlert(true)
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
                  <li>Required columns: Project Name, Task Title, Start Date (YYYY-MM-DD), Start Time (HH:MM), End Date (YYYY-MM-DD), End Time (HH:MM)</li>
                  <li>Optional columns: Description, Is Billable (true/false - leave empty or use "true"/"false")</li>
                  <li>Date format: YYYY-MM-DD (e.g., 2024-01-15)</li>
                  <li>Time format: HH:MM (e.g., 09:00, must be between 00:00 and 23:59)</li>
                  <li>Projects and tasks must exist in the system</li>
                  <li>End Date/Time must be after Start Date/Time</li>
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
              setShowErrorAlert(true)
              setShowBulkUploadErrorAlert(true)
              setShowBulkUploadProgressAlert(true)
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
