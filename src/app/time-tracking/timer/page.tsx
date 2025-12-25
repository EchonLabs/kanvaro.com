'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Timer } from '@/components/time-tracking/Timer'
import { TimeLogs } from '@/components/time-tracking/TimeLogs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/Badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  ArrowLeft, 
  Clock, 
  Target,
  FolderOpen,
  Loader2,
  AlertTriangle,
  Info,
  Settings,
  Plus,
  Calendar,
  DollarSign
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface Project {
  _id: string
  name: string
  settings?: {
    allowTimeTracking?: boolean
    allowManualTimeSubmission?: boolean
    allowExpenseTracking?: boolean
    requireApproval?: boolean
    kanbanStatuses?: any[]
    notifications?: any
  }
  isBillableByDefault?: boolean
}

interface Task {
  _id: string
  title: string
  description?: string
  status: string
  priority: string
  isBillable?: boolean
  assignedTo?: {
    _id: string
    firstName: string
    lastName: string
  }
  project: {
    _id: string
    name: string
  }
}

interface User {
  id: string
  firstName: string
  lastName: string
  email: string
  organization: string
  billingRate?: number
}

interface TimeTrackingSettings {
  allowTimeTracking: boolean
  allowManualTimeSubmission: boolean
  requireApproval: boolean
  allowBillableTime: boolean
  defaultHourlyRate?: number
  maxDailyHours: number
  maxWeeklyHours: number
  maxSessionHours: number
  allowOvertime: boolean
  requireDescription: boolean
  requireCategory: boolean
  allowFutureTime: boolean
  allowPastTime: boolean
  pastTimeLimitDays: number
  roundingRules: {
    enabled: boolean
    increment: number
    roundUp: boolean
  }
  notifications: {
    onTimerStart: boolean
    onTimerStop: boolean
    onOvertime: boolean
    onApprovalNeeded: boolean
    onTimeSubmitted: boolean
  }
}

export default function TimerPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { showToast } = useToast()
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [selectedTask, setSelectedTask] = useState<string>('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [timeLogsRefreshKey, setTimeLogsRefreshKey] = useState(0)
  const [liveActiveTimer, setLiveActiveTimer] = useState<any | null | undefined>(undefined)
  const [activeTimerSnapshot, setActiveTimerSnapshot] = useState<any | null>(null)
  const [pendingActiveProject, setPendingActiveProject] = useState<string | null>(null)
  const [pendingActiveTask, setPendingActiveTask] = useState<string | null>(null)
  const [pendingActiveDescription, setPendingActiveDescription] = useState<string>('')
  const [initializedFromActive, setInitializedFromActive] = useState(false)
  const hadActiveTimerRef = useRef(false)
  const [timeTrackingSettings, setTimeTrackingSettings] = useState<TimeTrackingSettings | null>(null)
  const [dailyHoursLogged, setDailyHoursLogged] = useState<number>(0)
  const [showManualLogForm, setShowManualLogForm] = useState(false)
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
  const [activeTab, setActiveTab] = useState<'timer' | 'manual'>('timer')
  const autoStopNotifiedRef = useRef(false)

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

    const now = new Date()

    // Check for future time logging
    if (!timeTrackingSettings?.allowFutureTime) {
      if (start > now) {
        const startDateStr = start.toLocaleDateString()
        const startTimeStr = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        setSessionHoursError(`⚠️ Future time not allowed: The start time (${startDateStr} at ${startTimeStr}) is in the future. Please select a time that is today or in the past.`)
        return
      }
      if (end > now) {
        const endDateStr = end.toLocaleDateString()
        const endTimeStr = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        setSessionHoursError(`⚠️ Future time not allowed: The end time (${endDateStr} at ${endTimeStr}) is in the future. Please select a time that is today or in the past.`)
        return
      }
    }

    // Check maxSessionHours only when overtime is disabled
    if (timeTrackingSettings?.allowOvertime === false && timeTrackingSettings?.maxSessionHours) {
      const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60)
      const durationHours = durationMinutes / 60
      const maxHours = timeTrackingSettings.maxSessionHours

      if (durationHours > maxHours) {
        setSessionHoursError(`⚠️ Maximum session duration exceeded: You've logged ${durationHours.toFixed(2)} hours, but the maximum allowed is ${maxHours} ${maxHours === 1 ? 'hour' : 'hours'}. Please break this into multiple sessions.`)
        return
      }
    }
  }, [
    manualLogData.startDate,
    manualLogData.startTime,
    manualLogData.endDate,
    manualLogData.endTime,
    timeTrackingSettings?.maxSessionHours,
    timeTrackingSettings?.allowFutureTime,
    timeTrackingSettings?.allowOvertime
  ])

  // Validate session hours when relevant fields change
  useEffect(() => {
    validateSessionHours()
  }, [validateSessionHours])

  const resetTimerForm = useCallback(() => {
    setDescription('')
    setSelectedTask('')
    setSelectedProject('')
    setTasks([])
    setActiveTimerSnapshot(null)
    setPendingActiveProject(null)
    setPendingActiveTask(null)
    setPendingActiveDescription('')
    setInitializedFromActive(true)
  }, [])


  const fetchDailyHoursLogged = useCallback(async () => {
    if (!user?.id || !user?.organization) return
    
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      
      const params = new URLSearchParams({
        userId: user.id,
        organizationId: user.organization,
        startDate: today.toISOString(),
        endDate: tomorrow.toISOString()
      })
      
      const response = await fetch(`/api/time-tracking/entries?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        if (data?.totals?.totalDuration) {
          const hours = data.totals.totalDuration / 60
          setDailyHoursLogged(hours)
        }
      }
    } catch (err) {
      console.error('Failed to fetch daily hours:', err)
    }
  }, [user?.id, user?.organization])
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me')
        
        if (response.ok) {
          const userData = await response.json()
       
          
          setUser(userData)
          setAuthError('')
          await fetchProjects(userData)
          await fetchActiveTimer(userData)
          await fetchDailyHoursLogged()
        } else if (response.status === 401) {
          const refreshResponse = await fetch('/api/auth/refresh', {
            method: 'POST'
          })
          
          if (refreshResponse.ok) {
            const refreshData = await refreshResponse.json()
         
            
            setUser(refreshData.user)
            setAuthError('')
            await fetchProjects(refreshData.user)
            await fetchActiveTimer(refreshData.user)
            await fetchDailyHoursLogged()
          } else {
            setAuthError('Session expired')
            setTimeout(() => {
              router.push('/login')
            }, 2000)
          }
        } else {
          router.push('/login')
        }
      } catch (error) {
        console.error('Auth check failed:', error)
        setAuthError('Authentication failed')
        setTimeout(() => {
          router.push('/login')
        }, 2000)
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [router])

  // Preselect project from query params when projects are loaded
  useEffect(() => {
    if (!projects || projects.length === 0) return
    if (pendingActiveProject && projects.some(p => p._id === pendingActiveProject)) {
      if (pendingActiveDescription) {
        setDescription(pendingActiveDescription)
      }
      if (selectedProject !== pendingActiveProject) {
        handleProjectChange(pendingActiveProject)
      }
      setPendingActiveProject(null)
      return
    }
    if (selectedProject) return
    let pid = searchParams?.get('project') || searchParams?.get('projectId') || ''
    const pnameRaw = searchParams?.get('projectName') || ''
    const pname = pnameRaw && pnameRaw !== 'undefined' && pnameRaw !== 'null' ? pnameRaw : ''
    if (pid === 'undefined' || pid === 'null') pid = ''
    let projectIdToSelect = pid || ''
    if (!projectIdToSelect && pname) {
      const match = projects.find(p => p.name.toLowerCase() === pname.toLowerCase())
      if (match) projectIdToSelect = match._id
    }
    if (projectIdToSelect) {
      handleProjectChange(projectIdToSelect)
    }
  }, [projects, searchParams, selectedProject, pendingActiveProject, pendingActiveDescription])

  // Preselect task from query params when tasks are loaded
  useEffect(() => {
    if (!tasks || tasks.length === 0) return
    if (pendingActiveTask && tasks.some(t => t._id === pendingActiveTask)) {
      handleTaskChange(pendingActiveTask)
      if (pendingActiveDescription) {
        setDescription(pendingActiveDescription)
      }
      setPendingActiveTask(null)
      setPendingActiveDescription('')
      setInitializedFromActive(true)
      return
    }
    if (selectedTask) return
    if (!selectedProject) return
    
    let tid = searchParams?.get('taskId') || ''
    const tnameRaw = searchParams?.get('taskName') || ''
    const tname = tnameRaw && tnameRaw !== 'undefined' && tnameRaw !== 'null' ? tnameRaw : ''
    if (tid === 'undefined' || tid === 'null') tid = ''
    
    let taskIdToSelect = tid || ''
    if (!taskIdToSelect && tname) {
      const match = tasks.find(t => t.title.toLowerCase() === tname.toLowerCase())
      if (match) taskIdToSelect = match._id
    }
    
    if (taskIdToSelect && tasks.some(t => t._id === taskIdToSelect)) {
      handleTaskChange(taskIdToSelect)
    }
  }, [tasks, searchParams, selectedTask, selectedProject, pendingActiveTask, pendingActiveDescription])

  useEffect(() => {
    if (!pendingActiveDescription) return
    if (pendingActiveProject || pendingActiveTask) return
    if (initializedFromActive) return
    setDescription((prev) => prev || pendingActiveDescription)
    setPendingActiveDescription('')
    setInitializedFromActive(true)
  }, [pendingActiveDescription, pendingActiveProject, pendingActiveTask, initializedFromActive])

  const fetchProjects = async (currentUser?: User | null) => {
    try {
      const response = await fetch('/api/projects')
      const data = await response.json()
      if (data.success && Array.isArray(data.data)) {
        const effectiveUser = currentUser ?? user
      // Filter projects by strict requirements:
      // 1. project.settings.allowTimeTracking === true (explicitly enabled)
      // 2. project.teamMembers contains logged user as memberId
      const filtered = data.data.filter((project: any) => {
        const u = effectiveUser
        if (!u) return false

        // Check project-level time tracking setting - must be explicitly true
        const projectAllowsTimeTracking = project?.settings?.allowTimeTracking === true
        if (!projectAllowsTimeTracking) return false

        // Check if user is in teamMembers array as memberId
        const teamMembers = Array.isArray(project?.teamMembers) ? project.teamMembers : []
        const isUserTeamMember = teamMembers.some((member: any) => {
          if (typeof member === 'object' && member !== null) {
            return member.memberId === u.id || member.memberId?._id === u.id || member.memberId?.id === u.id
            }
            return false
          })

        return isUserTeamMember
      })

      console.log('Time tracking - Filtered projects:', {
        userId: effectiveUser?.id,
        totalProjects: data.data.length,
        filteredProjects: filtered.length,
        projects: filtered.map((p: any) => ({
          _id: p._id,
          name: p.name,
          allowTimeTracking: p.settings?.allowTimeTracking,
          teamMembers: p.teamMembers?.map((tm: any) => tm.memberId)
        }))
      })

        setProjects(filtered)
      } else {
        setProjects([])
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err)
      setProjects([])
    }
  }

  const fetchTasks = useCallback(async (projectId: string) => {
    if (!projectId || !user) {
      setTasks([])
      setTasksLoading(false)
      return
    }

    setTasksLoading(true)
    
    try {
      // Fetch tasks for the selected project where user is assigned
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout (reduced since query is optimized)
      
      const response = await fetch(`/api/tasks?project=${projectId}&assignedTo=${user.id}&limit=50&minimal=true`, {
        cache: 'no-store',
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()

      if (data.success && Array.isArray(data.data)) {
        // Double-check filtering: ensure task.project matches selectedProject AND user is in assignedTo
        const validTasks = data.data.filter((task: any) => {
          // Check project match
          const projectMatch = task?.project === projectId ||
                              task?.project?._id === projectId ||
                              task?.project?.id === projectId

          if (!projectMatch) return false

          // Check user assignment - look for user in assignedTo array
          const assignedTo = Array.isArray(task?.assignedTo) ? task.assignedTo : []
          const userAssigned = assignedTo.some((assignment: any) => {
            if (typeof assignment === 'object' && assignment !== null) {
              return assignment.user === user.id ||
                     assignment.user?._id === user.id ||
                     assignment.user?.id === user.id ||
                     assignment._id === user.id ||
                     assignment.id === user.id
            }
            return false
          })

          return userAssigned
        })

        console.log('Filtered tasks for project:', {
          projectId,
          userId: user.id,
          totalTasks: data.data.length,
          validTasks: validTasks.length,
          tasks: validTasks.map((t: any) => ({ _id: t._id, title: t.title, assignedTo: t.assignedTo }))
        })

        setTasks(validTasks)
      } else {
        setTasks([])
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.error('Task fetch timeout')
      } else {
        console.error('Failed to fetch tasks:', err)
      }
      setTasks([])
    } finally {
      setTasksLoading(false)
    }
  }, [user?.id])

  const handleTaskChange = (taskId: string) => {
    setSelectedTask(taskId === 'none' ? '' : taskId)
    const task = tasks.find(t => t._id === taskId)
    if (task) {
      setDescription(task.title)
      
      // Check if task is billable and allowBillableTime is false
      if (task.isBillable && timeTrackingSettings && !timeTrackingSettings.allowBillableTime) {
        showToast({
          type: 'warning',
          title: 'Billable Time Not Allowed',
          message: 'This task is marked as billable, but billable time tracking is disabled in your organization settings. Please contact your administrator.',
          duration: 7000
        })
      }
    }
  }

  const handleSubmitManualLog = async () => {
    if (!selectedProject || !user) {
      setError('⚠️ Project selection required: Please select a project before logging time.')
      return
    }

    if (!selectedTask) {
      setError('⚠️ Task selection required: Please select a task before logging time.')
      return
    }

    // Only validate description if it's explicitly required
    if (timeTrackingSettings?.requireDescription === true && !manualLogData.description.trim()) {
      setError('⚠️ Description required: Please enter a description for this time entry. A description is required based on your organization settings.')
      return
    }

    // Check which fields are missing
    const missingFields: string[] = []
    if (!manualLogData.startDate) missingFields.push('Start Date')
    if (!manualLogData.startTime) missingFields.push('Start Time')
    if (!manualLogData.endDate) missingFields.push('End Date')
    if (!manualLogData.endTime) missingFields.push('End Time')

    if (missingFields.length > 0) {
      setError(`⚠️ Missing required fields: Please fill in the following fields: ${missingFields.join(', ')}.`)
      return
    }

    const startDateTime = combineDateTime(manualLogData.startDate, manualLogData.startTime)
    const endDateTime = combineDateTime(manualLogData.endDate, manualLogData.endTime)

    const start = new Date(startDateTime)
    const end = new Date(endDateTime)

    // Check for invalid dates
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setError('⚠️ Invalid date/time: The selected dates or times are invalid. Please check your entries and try again.')
      return
    }
    
    if (start >= end) {
      setError('⚠️ Invalid time range: The end date/time must be after the start date/time. Please adjust your entries.')
      return
    }

    // Validate future time logging
    const now = new Date()
    if (start > now && !timeTrackingSettings?.allowFutureTime) {
      const startDateStr = start.toLocaleDateString()
      const startTimeStr = start.toLocaleTimeString()
      setError(`⚠️ Future time not allowed: Your organization does not allow logging time for future dates/times. The selected start time (${startDateStr} ${startTimeStr}) is in the future. Please select a start date/time that is today or in the past.`)
      return
    }

    if (end > now && !timeTrackingSettings?.allowFutureTime) {
      const endDateStr = end.toLocaleDateString()
      const endTimeStr = end.toLocaleTimeString()
      setError(`⚠️ Future time not allowed: Your organization does not allow logging time for future dates/times. The selected end time (${endDateStr} ${endTimeStr}) is in the future. Please select an end date/time that is today or in the past.`)
      return
    }

    // Validate past time logging
    if (timeTrackingSettings?.allowPastTime !== undefined) {
      const daysDiff = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      const pastLimitDays = timeTrackingSettings.pastTimeLimitDays || 30
      
      if (!timeTrackingSettings.allowPastTime && daysDiff > 0) {
        setError(`⚠️ Past time not allowed: Your organization does not allow logging time for past dates. You can only log time for today or future dates.`)
        return
      }
      
      if (timeTrackingSettings.allowPastTime && daysDiff > pastLimitDays) {
        const startDateStr = start.toLocaleDateString()
        setError(`⚠️ Past time limit exceeded: You can only log time up to ${pastLimitDays} days in the past. The selected start date (${startDateStr}) is more than ${pastLimitDays} days ago. Please select a more recent date.`)
        return
      }
    }

    // Validate maxSessionHours
    const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60)
    const durationHours = durationMinutes / 60

    if (timeTrackingSettings?.allowOvertime === false && timeTrackingSettings?.maxSessionHours && durationHours > timeTrackingSettings.maxSessionHours) {
      const maxHours = timeTrackingSettings.maxSessionHours
      setError(`⚠️ Session duration exceeded: The logged time (${durationHours.toFixed(2)} hours) exceeds the maximum allowed session duration of ${maxHours} ${maxHours === 1 ? 'hour' : 'hours'}. Please break this into multiple sessions or contact your administrator if you need to log longer sessions.`)
      return
    }

    setSubmittingManualLog(true)
    setError('')
    setSessionHoursError('')

    try {
      const response = await fetch('/api/time-tracking/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          organizationId: user.organization,
          projectId: selectedProject,
          taskId: selectedTask || undefined,
          description: manualLogData.description || undefined,
          startTime: startDateTime,
          endTime: endDateTime,
          isBillable: manualLogData.isBillable && timeTrackingSettings?.allowBillableTime
        })
      })

      const data = await response.json()

      if (response.ok) {
        showToast({
          type: 'success',
          title: 'Time Logged Successfully',
          message: 'Your time entry has been created successfully.',
          duration: 5000
        })
        // Reset all input fields
        setManualLogData({
          startDate: '',
          startTime: '',
          endDate: '',
          endTime: '',
          description: '',
          isBillable: false
        })
        setSelectedProject('')
        setSelectedTask('')
        setTasks([])
        setError('')
        setSessionHoursError('')
        setTimeLogsRefreshKey(prev => prev + 1)
        await fetchDailyHoursLogged()
      } else {
        // Parse and improve error messages from API
        let errorMessage = data.error || 'An unexpected error occurred while logging time.'
        
        // Improve common error messages
        if (errorMessage.includes('Future time logging not allowed')) {
          errorMessage = '⚠️ Future time logging is not allowed. Please select a date/time that is today or in the past based on your organization settings.'
        } else if (errorMessage.includes('Past time logging not allowed')) {
          errorMessage = '⚠️ Past time logging is not allowed. You can only log time for recent dates based on your organization settings.'
        } else if (errorMessage.includes('Description is required')) {
          errorMessage = '⚠️ Description is required for time entries. Please enter a description before submitting.'
        } else if (errorMessage.includes('exceed')) {
          errorMessage = `⚠️ ${errorMessage} Please adjust your time entry accordingly.`
        } else if (errorMessage.includes('not allowed')) {
          errorMessage = `⚠️ ${errorMessage} Please check your organization settings or contact your administrator.`
        }

        setError(errorMessage)
        showToast({
          type: 'error',
          title: 'Time Logging Failed',
          message: errorMessage,
          duration: 7000
        })
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Network error or server unavailable'
      setError(`⚠️ Connection error: Unable to log time. ${errorMsg}. Please check your internet connection and try again.`)
      showToast({
        type: 'error',
        title: 'Connection Error',
        message: 'Unable to connect to the server. Please check your internet connection and try again.',
        duration: 7000
      })
    } finally {
      setSubmittingManualLog(false)
    }
  }

  const fetchActiveTimer = async (currentUser?: User | null) => {
    const effectiveUser = currentUser ?? user
    if (!effectiveUser) return

    try {
      const params = new URLSearchParams({
        userId: effectiveUser.id,
        organizationId: effectiveUser.organization
      })
      const response = await fetch(`/api/time-tracking/timer?${params.toString()}`)
      const data = await response.json()

      if (response.ok) {
        // Check if this is an auto-stop response (when max session limit is reached)
        if (data.activeTimer === null && data.hasTimeLogged !== undefined) {
          // Timer was auto-stopped due to max session limit
          setActiveTimerSnapshot(null)
          setLiveActiveTimer(null)
          setPendingActiveProject(null)
          setPendingActiveTask(null)
          setPendingActiveDescription('')
          setInitializedFromActive(true)

          // Show notification for auto-stop (only once per auto-stop event)
          if (timeTrackingSettings?.notifications?.onTimerStop && data.autoStopped && !autoStopNotifiedRef.current) {
            autoStopNotifiedRef.current = true
            showToast({
              type: 'warning',
              title: 'Timer Auto-Stopped',
              message: data.message || 'Timer automatically stopped. Maximum session limit reached.',
              duration: 5000
            })
          }

          // Refresh time logs to show the completed entry
          setTimeLogsRefreshKey(prev => prev + 1)
          fetchDailyHoursLogged()
        } else if (data?.activeTimer) {
          // Normal active timer
        setActiveTimerSnapshot(data.activeTimer)
        setLiveActiveTimer(data.activeTimer)

        const projectId = data.activeTimer.project?._id || null
        const taskId = data.activeTimer.task?._id || null
        const timerDescription = data.activeTimer.description || ''

        if (projectId) {
          setPendingActiveProject(projectId)
        }
        if (taskId) {
          setPendingActiveTask(taskId)
        }
        if (timerDescription) {
          setPendingActiveDescription(timerDescription)
        }
        setInitializedFromActive(false)
      } else {
          // No active timer
          setActiveTimerSnapshot(null)
          setLiveActiveTimer(null)
          setPendingActiveProject(null)
          setPendingActiveTask(null)
          setPendingActiveDescription('')
          setInitializedFromActive(true)
        }
      } else {
        console.error('Failed to fetch active timer:', data)
        setActiveTimerSnapshot(null)
        setLiveActiveTimer(null)
        setPendingActiveProject(null)
        setPendingActiveTask(null)
        setPendingActiveDescription('')
        setInitializedFromActive(true)
      }
    } catch (error) {
      console.error('Failed to fetch active timer:', error)
    }
  }

  const handleProjectChange = useCallback((projectId: string) => {
    setSelectedProject(projectId)
    setSelectedTask('')
    setTasks([])
    setError('')
    if (projectId && user) {
      fetchTasks(projectId)
    }
  }, [fetchTasks, user])


  // Debug Timer component rendering
  useEffect(() => {
  
    
    if (selectedProject && user) {
    }
  }, [selectedProject, user])

  useEffect(() => {
    if (liveActiveTimer) {
      hadActiveTimerRef.current = true
      return
    }

    if (liveActiveTimer === null && hadActiveTimerRef.current) {
      resetTimerForm()
      hadActiveTimerRef.current = false
      fetchDailyHoursLogged()
    }
  }, [liveActiveTimer, resetTimerForm, fetchDailyHoursLogged])

  // Fetch daily hours when settings change
  useEffect(() => {
    if (user && timeTrackingSettings) {
      fetchDailyHoursLogged()
    }
  }, [user, timeTrackingSettings])

  // Fetch time tracking settings from TimeTrackingSettings collection
  useEffect(() => {
    const fetchTimeTrackingSettings = async () => {
      if (!user?.organization) return

      try {
        // First fetch organization-level settings (without projectId) to determine if time tracking is allowed
        const orgResponse = await fetch('/api/time-tracking/settings')
        if (orgResponse.ok) {
          const orgData = await orgResponse.json()
          if (orgData.settings) {
            setTimeTrackingSettings(orgData.settings)
          }
        } else {
          console.error('Failed to fetch organization time tracking settings:', orgResponse.statusText)
        }

        // Then fetch project-specific settings if a project is selected
        if (selectedProject) {
          const projectResponse = await fetch(`/api/time-tracking/settings?projectId=${selectedProject}`)
          if (projectResponse.ok) {
            const projectData = await projectResponse.json()
            if (projectData.settings) {
              setTimeTrackingSettings(projectData.settings)
            }
          }
        }
      } catch (error) {
        console.error('Error fetching time tracking settings:', error)
      }
    }

    fetchTimeTrackingSettings()
  }, [user?.organization])

  // Fetch project-specific settings when project changes
  useEffect(() => {
    if (selectedProject && user?.organization) {
      const fetchProjectSettings = async () => {
        try {
          const response = await fetch(`/api/time-tracking/settings?projectId=${selectedProject}`)
          if (response.ok) {
            const data = await response.json()
            if (data.settings) {
              setTimeTrackingSettings(data.settings)
            }
          }
        } catch (error) {
          console.error('Error fetching project-specific time tracking settings:', error)
        }
      }
      fetchProjectSettings()
    }
  }, [selectedProject, user?.organization])

  // Log timeTrackingSettings whenever it changes
  useEffect(() => {
    console.log('timeTrackingSettings updated:', timeTrackingSettings?.allowTimeTracking ? 'ENABLED' : 'DISABLED')
  }, [timeTrackingSettings])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading timer...</p>
        </div>
      </div>
    )
  }

  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-destructive mb-4">{authError}</p>
          <p className="text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">No user data available</p>
        </div>
      </div>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Button 
            variant="ghost" 
            onClick={() => {
              // Use browser history to go back to the previous page
              // If the page was accessed from dashboard, it will go back to dashboard
              // Otherwise, it will go back to the previous page (likely time-tracking)
              if (typeof window !== 'undefined' && window.history.length > 1) {
                router.back()
              } else {
                // Fallback to time-tracking if no history available
                router.push('/time-tracking')
              }
            }} 
            className="flex-shrink-0 w-full sm:w-auto"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground flex items-center space-x-2">
              <Clock className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 text-blue-600 flex-shrink-0" />
              <span className="truncate">Time Tracker</span>
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">Start tracking time for your tasks</p>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="border-destructive bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <AlertDescription className="text-sm font-medium whitespace-pre-wrap break-words">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {/* Daily Hours Info */}
        {timeTrackingSettings && dailyHoursLogged > 0 && (
          <Alert variant={dailyHoursLogged >= timeTrackingSettings.maxDailyHours ? 'destructive' : 'default'}>
            <Info className="h-4 w-4" />
            <AlertDescription>
              You have logged <strong>{dailyHoursLogged.toFixed(1)} hours</strong> today.
              {dailyHoursLogged >= timeTrackingSettings.maxDailyHours && (
                <span className="ml-2">
                  You have exceeded your daily limit of {timeTrackingSettings.maxDailyHours} hours.
                </span>
              )}
              {!timeTrackingSettings.allowOvertime && dailyHoursLogged >= timeTrackingSettings.maxDailyHours && (
                <span className="ml-2 block mt-1">
                  Overtime is not allowed. Please contact your administrator.
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Time Tracking Disabled Message */}
        {timeTrackingSettings && !timeTrackingSettings.allowTimeTracking && (
          <Alert>
            <Settings className="h-4 w-4" />
            <AlertDescription>
              Time tracking is currently disabled. Please enable it in{' '}
              <Button
                variant="link"
                className="p-0 h-auto underline"
                onClick={() => router.push('/settings?tab=time-tracking')}
              >
                Application Settings
              </Button>
              {' '}to start tracking time.
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={(value: string) => setActiveTab(value as 'timer' | 'manual')} className="space-y-8">
          <TabsList className={`grid w-full ${timeTrackingSettings?.allowManualTimeSubmission ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <TabsTrigger value="timer" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Timer
            </TabsTrigger>
            {timeTrackingSettings?.allowManualTimeSubmission && (
              <TabsTrigger value="manual" className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Manual Log
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="timer" className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Clock className="h-5 w-5 flex-shrink-0" />
                  <span className="text-xl sm:text-2xl">Time Tracker</span>
                </CardTitle>
                <CardDescription className="text-sm sm:text-base">
                  Select a project and task, then start tracking your time
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="project">Project *</Label>
                    <Select 
                      value={selectedProject} 
                      onValueChange={handleProjectChange}
                      disabled={!timeTrackingSettings?.allowTimeTracking}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a project" />
                      </SelectTrigger>
                      <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)]">
                        {Array.isArray(projects) && projects.map((project) => (
                          <SelectItem key={project._id} value={project._id}>
                            <div className="flex items-center space-x-2 min-w-0">
                              <FolderOpen className="h-4 w-4 flex-shrink-0" />
                              <span className="truncate">{project.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="task">Task *</Label>
                    <Select
                      value={selectedTask}
                      onValueChange={handleTaskChange}
                      disabled={!timeTrackingSettings?.allowTimeTracking || !selectedProject || tasksLoading || (!tasksLoading && (!Array.isArray(tasks) || tasks.length === 0))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={
                          tasksLoading 
                            ? 'Loading tasks...' 
                            : selectedProject 
                              ? (Array.isArray(tasks) && tasks.length > 0 ? 'Select a task' : 'No tasks available') 
                              : 'Select a project first'
                        } />
                      </SelectTrigger>
                      {tasksLoading && (
                        <Loader2 className="absolute right-8 top-1/2 h-4 w-4 animate-spin -translate-y-1/2" />
                      )}
                      <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)]">
                        {tasksLoading ? (
                          <div className="flex items-center justify-center p-4">
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            <span className="text-sm text-muted-foreground">Loading tasks...</span>
                          </div>
                        ) : (
                          Array.isArray(tasks) && tasks.map((task) => {
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
                                      <span className="truncate">{task.title}</span>
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
                    {selectedProject && !tasksLoading && Array.isArray(tasks) && tasks.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No tasks available in this project. Please create or assign a task to start tracking.
                      </p>
                    )}
                    {tasksLoading && (
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Loading tasks...
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="description">
                    Description {timeTrackingSettings?.requireDescription ? '*' : ''}
                  </Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={
                      selectedProject 
                        ? (timeTrackingSettings?.requireDescription 
                            ? 'What are you working on? (required)' 
                            : 'What are you working on? (optional)')
                        : 'Select a project to enable time tracking'
                    }
                    rows={2}
                    required={timeTrackingSettings?.requireDescription === true}
                    disabled={!timeTrackingSettings?.allowTimeTracking || !selectedProject || !selectedTask}
                    className="w-full"
                  />
                  {timeTrackingSettings && (
                    <p className="text-xs text-muted-foreground">
                      {timeTrackingSettings.requireDescription 
                        ? 'Description is required to log time' 
                        : 'Description is optional - time can be logged without it'}
                    </p>
                  )}
                </div>

                {user && timeTrackingSettings?.allowTimeTracking && (
                  <div className="my-4">
                    {(() => {
                      // Determine billable status from selected task
                      const selectedTaskObj = Array.isArray(tasks) ? tasks.find(t => t._id === selectedTask) : null
                      const isBillable = selectedTaskObj?.isBillable ?? false
                      return (
                        <Timer
                          userId={user.id}
                          organizationId={user.organization}
                          projectId={selectedProject || undefined}
                          taskId={selectedTask || undefined}
                          description={description}
                          isBillable={isBillable}
                          requireDescription={timeTrackingSettings?.requireDescription === true}
                          allowOvertime={timeTrackingSettings?.allowOvertime ?? false}
                          onTimerUpdate={(timer) => {
                        if (!timer) {
                          resetTimerForm()
                          // Timer stopped - notifications will be shown by backend notification system only if time was logged
                        } else if (timer.hasTimeLogged && timer.timeEntry) {
                          // Timer stopped with time logged - reset form but don't show notification here
                          // Backend notification system will show the appropriate notifications
                          resetTimerForm()
                          setLiveActiveTimer(null)
                        } else {
                          // Timer is active/running
                          setActiveTimerSnapshot(timer)
                          setLiveActiveTimer(timer)
                          if (timeTrackingSettings?.notifications?.onTimerStart && !hadActiveTimerRef.current) {
                            showToast({
                              type: 'success',
                              title: 'Timer Started',
                              message: 'Your timer has started successfully.',
                              duration: 5000
                            })
                          }
                          // Reset auto-stop notification flag when timer starts
                          autoStopNotifiedRef.current = false
                        }
                        setTimeLogsRefreshKey((prev) => prev + 1)
                      }}
                      onAutoStop={(message) => {
                        showToast({
                          type: 'info',
                          title: 'Timer Auto-Stopped',
                          message,
                          duration: 8000
                        })
                      }}
                        />
                      )
                    })()}
                  </div>
                )}

                {!timeTrackingSettings?.allowTimeTracking && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Time tracking is disabled. Please enable it in Application Settings to use the timer.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

          </TabsContent>

          {/* {timeTrackingSettings?.allowManualTimeSubmission && (
            <TabsContent value="manual" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Calendar className="h-5 w-5 flex-shrink-0" />
                    <span className="text-xl sm:text-2xl">Manual Time Entry</span>
                  </CardTitle>
                  <CardDescription className="text-sm sm:text-base">
                    Log time manually by selecting start and end times
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="manual-project">Project *</Label>
                      <Select 
                        value={selectedProject} 
                        onValueChange={handleProjectChange}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a project" />
                        </SelectTrigger>
                        <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)]">
                          {Array.isArray(projects) && projects.map((project) => (
                            <SelectItem key={project._id} value={project._id}>
                              <div className="flex items-center space-x-2 min-w-0">
                                <FolderOpen className="h-4 w-4 flex-shrink-0" />
                                <span className="truncate">{project.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="manual-task">Task *</Label>
                      <Select
                        value={selectedTask}
                        onValueChange={handleTaskChange}
                        disabled={!selectedProject || tasksLoading || (!tasksLoading && (!Array.isArray(tasks) || tasks.length === 0))}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={
                            tasksLoading 
                              ? 'Loading tasks...' 
                              : selectedProject 
                                ? (Array.isArray(tasks) && tasks.length > 0 ? 'Select a task' : 'No tasks available') 
                                : 'Select a project first'
                          } />
                        </SelectTrigger>
                        {tasksLoading && (
                          <Loader2 className="absolute right-8 top-1/2 h-4 w-4 animate-spin -translate-y-1/2" />
                        )}
                        <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)]">
                          {tasksLoading ? (
                            <div className="flex items-center justify-center p-4">
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              <span className="text-sm text-muted-foreground">Loading tasks...</span>
                            </div>
                          ) : (
                            Array.isArray(tasks) && tasks.map((task) => {
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
                                        <span className="truncate">{task.title}</span>
                                        {task.isBillable && (
                                          <DollarSign className="h-3 w-3 text-green-600 flex-shrink-0" />
                                        )}
                                      </div>
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
                      {selectedProject && !tasksLoading && Array.isArray(tasks) && tasks.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          No tasks available in this project. Please create or assign a task to log time.
                        </p>
                      )}
                      {tasksLoading && (
                        <p className="text-xs text-muted-foreground flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Loading tasks...
                        </p>
                      )}
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
                        disabled={!selectedProject}
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
                        disabled={!selectedProject}
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
                        disabled={!selectedProject}
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
                        disabled={!selectedProject}
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
                    <Label htmlFor="manual-description">
                      Description {timeTrackingSettings?.requireDescription ? '*' : ''}
                    </Label>
                    <Textarea
                      id="manual-description"
                      value={manualLogData.description}
                      onChange={(e) => setManualLogData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder={
                        timeTrackingSettings?.requireDescription 
                          ? 'What did you work on? (required)' 
                          : 'What did you work on? (optional)'
                      }
                      rows={3}
                      required={timeTrackingSettings?.requireDescription === true}
                      disabled={!selectedProject}
                      className="w-full"
                    />
                    {timeTrackingSettings && (
                      <p className="text-xs text-muted-foreground">
                        {timeTrackingSettings.requireDescription 
                          ? 'Description is required to log time' 
                          : 'Description is optional - time can be logged without it'}
                      </p>
                    )}
                  </div>

                  {timeTrackingSettings?.allowBillableTime && (
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="manual-billable"
                        checked={manualLogData.isBillable}
                        onChange={(e) => setManualLogData(prev => ({ ...prev, isBillable: e.target.checked }))}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <Label htmlFor="manual-billable" className="text-sm font-normal cursor-pointer">
                        Mark as billable
                      </Label>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setManualLogData({
                          startDate: '',
                          startTime: '',
                          endDate: '',
                          endTime: '',
                          description: '',
                          isBillable: false
                        })
                        setError('')
                        setSessionHoursError('')
                      }}
                      disabled={submittingManualLog}
                    >
                      Clear
                    </Button>
                    <Button
                      onClick={handleSubmitManualLog}
                      disabled={
                        submittingManualLog || 
                        !selectedProject || 
                        !selectedTask ||
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
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )} */}
        </Tabs>

        {/* Time Logs - Displayed for both timer and manual log tabs */}
        {user && (
          <TimeLogs
            userId={user.id}
            organizationId={user.organization}
            projectId={selectedProject || undefined}
            taskId={selectedTask || undefined}
            refreshKey={timeLogsRefreshKey}
            liveActiveTimer={liveActiveTimer}
            showSelectionAndApproval={false}
            showManualLogButtons={activeTab === 'manual'}
          />
        )}
      </div>
    </MainLayout>
  )
}