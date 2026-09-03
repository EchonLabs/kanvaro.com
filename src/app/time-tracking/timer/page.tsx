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
import { useAuthContext } from '@/contexts/AuthContext'
import {
  ArrowLeft,
  Clock,
  Target,
  FolderOpen,
  Loader2,
  AlertTriangle,
  Info,
  Settings,
  Calendar,
  DollarSign
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn, focusSearchInput } from '@/lib/utils'

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
  taskNumber?: string | number
  displayId?: string
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
  const { user, isAuthenticated, isLoading: authLoading } = useAuthContext()

  const router = useRouter()
  const searchParams = useSearchParams()
  const { showToast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [selectedTask, setSelectedTask] = useState<string>('')
  const [selectedTaskLabel, setSelectedTaskLabel] = useState<string>('')
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
  const autoStopNotifiedRef = useRef(false)
  const [projectSearch, setProjectSearch] = useState('')
  const [taskSearch, setTaskSearch] = useState('')
  const [taskPage, setTaskPage] = useState(1)
  const [hasMoreTasks, setHasMoreTasks] = useState(false)
  const [loadingMoreTasks, setLoadingMoreTasks] = useState(false)
  const taskSearchTimerRef = useRef<NodeJS.Timeout | null>(null)
  const projectSearchInputRef = useRef<HTMLInputElement | null>(null)
  const taskSearchInputRef = useRef<HTMLInputElement | null>(null)
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null)
  const isLoadingMoreRef = useRef(false)
  const selectedTaskIdRef = useRef<string>('')
  const selectedTaskObjectRef = useRef<Task | null>(null)

  const combineDateTime = (date: string, time: string): string => {
    if (!date || !time) return ''
    return `${date}T${time}`
  }

  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(projectSearch.toLowerCase())
  ).sort((a, b) => a.name.localeCompare(b.name))

  const showInitialTasksLoading = tasksLoading && (!Array.isArray(tasks) || tasks.length === 0)

  // Auth initialization - trigger data loading
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      setIsLoading(false)
      fetchProjects()
      fetchActiveTimer()
    } else if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated])

  const resetTimerForm = useCallback(() => {
    setDescription('')
    setSelectedTask('')
    setSelectedTaskLabel('')
    setSelectedProject('')
    setTasks([])
    setTaskSearch('')
    setProjectSearch('')
    setTaskPage(1)
    setHasMoreTasks(false)
    setActiveTimerSnapshot(null)
    setPendingActiveProject(null)
    setPendingActiveTask(null)
    setPendingActiveDescription('')
    setInitializedFromActive(true)
    selectedTaskIdRef.current = ''
    selectedTaskObjectRef.current = null
  }, [])

  useEffect(() => {
    selectedTaskIdRef.current = selectedTask
    if (!selectedTask) {
      setSelectedTaskLabel('')
      selectedTaskObjectRef.current = null
    }
  }, [selectedTask])

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

  useEffect(() => {
    if (selectedTask) return
    if (!selectedProject) return

    if (pendingActiveTask) {
      setSelectedTask(pendingActiveTask)

      if (pendingActiveDescription) {
        setDescription(pendingActiveDescription)
      }

      setPendingActiveTask(null)
      setPendingActiveDescription('')
      setInitializedFromActive(true)
      return
    }

    if (!tasks || tasks.length === 0) return

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
  }, [
    tasks,
    searchParams,
    selectedTask,
    selectedProject,
    pendingActiveTask,
    pendingActiveDescription,
    activeTimerSnapshot
  ])

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
        const filtered = data.data.filter((project: any) => {
          const u = effectiveUser
          if (!u) return false

          const projectAllowsTimeTracking = project?.settings?.allowTimeTracking === true
          if (!projectAllowsTimeTracking) return false

          const isCreator =
            project?.createdBy === u.id ||
            project?.createdBy?._id === u.id ||
            project?.createdBy?.id === u.id

          const teamMembers = Array.isArray(project?.teamMembers) ? project.teamMembers : []
          const isUserTeamMember = teamMembers.some((member: any) => {
            if (typeof member === 'object' && member !== null) {
              const mid = member?.memberId
              if (!mid) return false
              if (typeof mid === 'string') return mid === u.id
              return mid?._id === u.id || mid?.id === u.id
            }
            return false
          })

          const isClient =
            project?.client === u.id ||
            project?.client?._id === u.id ||
            project?.client?.id === u.id

          return isCreator || isUserTeamMember || isClient
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

  const fetchTasks = useCallback(async (projectId: string, search?: string, page: number = 1) => {
    if (!projectId || !user) {
      setTasks([])
      setTasksLoading(false)
      return
    }

    if (page === 1) {
      if (!search) setTasksLoading(true)
    } else {
      setLoadingMoreTasks(true)
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const params = new URLSearchParams({
        project: projectId,
        assignedTo: user.id,
        limit: '200',
        page: String(page),
        minimal: 'true',
        excludeStatus: 'done,cancelled'
      })
      if (search && search.trim()) {
        params.set('search', search.trim())
      }

      const response = await fetch(`/api/tasks?${params.toString()}`, {
        cache: 'no-store',
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()

      if (data.success && Array.isArray(data.data)) {
        let validTasks = data.data.filter((task: any) => {
          const projectMatch = task?.project === projectId ||
            task?.project?._id === projectId ||
            task?.project?.id === projectId

          if (!projectMatch) return false

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

        const selectedId = selectedTaskIdRef.current
        const selectedObj = selectedTaskObjectRef.current
        if (
          page === 1 &&
          selectedId &&
          selectedObj &&
          selectedObj._id === selectedId &&
          !validTasks.some((t: any) => t?._id === selectedId)
        ) {
          const projectMatch =
            (selectedObj as any)?.project === projectId ||
            (selectedObj as any)?.project?._id === projectId ||
            (selectedObj as any)?.project?.id === projectId
          if (projectMatch) {
            validTasks = [selectedObj, ...validTasks]
          }
        }

        const totalPages = data.pagination?.totalPages || 1
        setHasMoreTasks(page < totalPages)
        setTaskPage(page)

        if (page === 1) {
          setTasks(validTasks)
        } else {
          setTasks(prev => [...prev, ...validTasks])
        }
      } else {
        if (page === 1 && !search) setTasks([])
        setHasMoreTasks(false)
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.error('Task fetch timeout')
      } else {
        console.error('Failed to fetch tasks:', err)
      }
      if (page === 1 && !search) setTasks([])
    } finally {
      if (page === 1) {
        if (!search) setTasksLoading(false)
      } else {
        setLoadingMoreTasks(false)
      }
    }
  }, [user?.id])

  const handleLoadMoreIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
    const entry = entries[0]
    if (entry?.isIntersecting && hasMoreTasks && !isLoadingMoreRef.current && !tasksLoading) {
      isLoadingMoreRef.current = true
      fetchTasks(selectedProject, taskSearch || undefined, taskPage + 1).finally(() => {
        isLoadingMoreRef.current = false
      })
    }
  }, [selectedProject, hasMoreTasks, tasksLoading, taskSearch, taskPage, fetchTasks])

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current
    if (!sentinel) return

    const observerOptions: IntersectionObserverInit = {
      root: null,
      threshold: 0.1,
      rootMargin: '0px'
    }

    const observer = new IntersectionObserver(handleLoadMoreIntersect, observerOptions)
    observer.observe(sentinel)

    return () => {
      observer.disconnect()
    }
  }, [handleLoadMoreIntersect])

  const loadMoreTasks = useCallback(() => {
    if (!selectedProject || loadingMoreTasks || !hasMoreTasks) return
    fetchTasks(selectedProject, taskSearch || undefined, taskPage + 1)
  }, [selectedProject, loadingMoreTasks, hasMoreTasks, taskPage, taskSearch, fetchTasks])

  useEffect(() => {
    if (!selectedProject) return

    const searchTerm = taskSearch.trim()

    if (taskSearchTimerRef.current) {
      clearTimeout(taskSearchTimerRef.current)
    }

    if (!searchTerm) {
      fetchTasks(selectedProject, undefined, 1)
      return
    }

    taskSearchTimerRef.current = setTimeout(() => {
      fetchTasks(selectedProject, searchTerm, 1)
    }, 300)
    return () => {
      if (taskSearchTimerRef.current) clearTimeout(taskSearchTimerRef.current)
    }
  }, [taskSearch, selectedProject, fetchTasks])

  const handleTaskChange = (taskId: string) => {
    const nextTaskId = taskId === 'none' ? '' : taskId
    setSelectedTask(nextTaskId)

    if (!nextTaskId) {
      setSelectedTaskLabel('')
      selectedTaskObjectRef.current = null
      return
    }

    const task = tasks.find(t => t._id === nextTaskId)
    if (task) {
      setSelectedTaskLabel(task.displayId ? `${task.displayId} • ${task.title}` : task.title)
      selectedTaskObjectRef.current = task
      setDescription(task.title)

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

  useEffect(() => {
    if (!selectedTask) return
    const found = Array.isArray(tasks) ? tasks.find(t => t._id === selectedTask) : undefined
    if (found) {
      if (found.title && found.title !== selectedTaskLabel) {
        setSelectedTaskLabel(found.title)
      }
      selectedTaskObjectRef.current = found
    }
  }, [tasks, selectedTask, selectedTaskLabel])

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
        if (data.activeTimer === null && data.hasTimeLogged !== undefined) {
          setActiveTimerSnapshot(null)
          setLiveActiveTimer(null)
          setPendingActiveProject(null)
          setPendingActiveTask(null)
          setPendingActiveDescription('')
          setInitializedFromActive(true)

          if (data.autoStopped && !autoStopNotifiedRef.current) {
            autoStopNotifiedRef.current = true
            showToast({
              type: 'warning',
              title: 'Timer Auto-Stopped',
              message: data.message || 'Timer automatically stopped. Maximum session limit reached.',
              duration: 5000
            })
          }

          setTimeLogsRefreshKey(prev => prev + 1)
          fetchDailyHoursLogged()
        } else if (data?.activeTimer) {
          setActiveTimerSnapshot(data.activeTimer)
          setLiveActiveTimer(data.activeTimer)

          const projectId = data.activeTimer.project?._id || null
          const taskId = data.activeTimer.task?._id || null
          const timerDescription = data.activeTimer.description || ''

          if (projectId) setPendingActiveProject(projectId)
          if (taskId) setPendingActiveTask(taskId)
          if (timerDescription) setPendingActiveDescription(timerDescription)
          setInitializedFromActive(false)
        } else {
          setActiveTimerSnapshot(null)
          setLiveActiveTimer(null)
          setPendingActiveProject(null)
          setPendingActiveTask(null)
          setPendingActiveDescription('')
          setInitializedFromActive(true)
        }
      } else {
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
    setSelectedTaskLabel('')
    setTasks([])
    setTaskSearch('')
    setTaskPage(1)
    setHasMoreTasks(false)
    setError('')
    selectedTaskIdRef.current = ''
    selectedTaskObjectRef.current = null
    if (projectId && user) {
      fetchTasks(projectId)
    }
  }, [fetchTasks, user])

  useEffect(() => {
    if (liveActiveTimer) {
      hadActiveTimerRef.current = true
      return
    }

    if (liveActiveTimer === null && (hadActiveTimerRef.current || initializedFromActive)) {
      resetTimerForm()
      hadActiveTimerRef.current = false
      fetchDailyHoursLogged()
    }
  }, [liveActiveTimer, resetTimerForm, fetchDailyHoursLogged, initializedFromActive])

  useEffect(() => {
    if (user && timeTrackingSettings) {
      fetchDailyHoursLogged()
    }
  }, [user, timeTrackingSettings])

  useEffect(() => {
    const fetchTimeTrackingSettings = async () => {
      if (!user?.organization) return

      try {
        const orgResponse = await fetch('/api/time-tracking/settings')
        if (orgResponse.ok) {
          const orgData = await orgResponse.json()
          if (orgData.settings) {
            setTimeTrackingSettings(orgData.settings)
          }
        }

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

  useEffect(() => {
    console.log('timeTrackingSettings updated:', timeTrackingSettings?.allowTimeTracking ? 'ENABLED' : 'DISABLED')
  }, [timeTrackingSettings])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 rounded-full border-2 border-[var(--apple-system-blue)] border-t-transparent animate-spin mx-auto" />
          <p className="text-[15px] text-[var(--apple-secondary-label)]">Loading timer…</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <MainLayout>
      <div className="space-y-6 view-transition-container">

        {/* ── Page Header ─────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Clock className="h-8 w-8 flex-shrink-0 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
            <div>
              <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight text-[var(--apple-label)]">
                Timer
              </h1>
              <p className="text-[15px] text-[var(--apple-secondary-label)] mt-0.5">
                Track time for your tasks and projects
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push('/time-tracking')}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[var(--apple-radius-md)] text-[14px] font-medium border border-[var(--apple-separator)] bg-card text-[var(--apple-label)] apple-transition hover:bg-[var(--apple-quaternary-fill)]"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
            Time Tracking
          </button>
        </div>

        {/* ── Error banner ─────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-start gap-3 rounded-[var(--apple-radius-md)] bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-4">
            <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
            <p className="text-[13px] text-red-600 dark:text-red-400 whitespace-pre-wrap break-words">{error}</p>
          </div>
        )}

        {/* ── Time tracking disabled banner ───────────────────────────── */}
        {timeTrackingSettings && !timeTrackingSettings.allowTimeTracking && (
          <div className="flex items-start gap-3 rounded-[var(--apple-radius-md)] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4">
            <Settings className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
            <div>
              <p className="text-[14px] font-semibold text-amber-700 dark:text-amber-300">Time Tracking Disabled</p>
              <p className="text-[13px] text-amber-600 dark:text-amber-400 mt-0.5">
                Enable it in{' '}
                <button
                  onClick={() => router.push('/settings?tab=time-tracking')}
                  className="underline font-medium"
                >
                  Application Settings
                </button>
                {' '}to start tracking time.
              </p>
            </div>
          </div>
        )}

        {/* ── Timer card ───────────────────────────────────────────────── */}
        <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">

            {/* Section header */}
            <div className="px-5 py-4 border-b border-[var(--apple-separator)] flex items-center gap-2.5">
              <FolderOpen className="h-4 w-4 flex-shrink-0 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
              <div>
                <p className="text-[15px] font-semibold text-[var(--apple-label)]">Select Work</p>
                <p className="text-[12px] text-[var(--apple-secondary-label)]">Choose a project and task to track</p>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* Project + Task */}
              <div className="grid gap-4 md:grid-cols-2">

                {/* Project */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--apple-tertiary-label)]">Project *</p>
                  <Select
                    value={selectedProject}
                    onValueChange={handleProjectChange}
                    onOpenChange={(open) => { if (open) focusSearchInput(projectSearchInputRef.current) }}
                    disabled={!timeTrackingSettings?.allowTimeTracking || liveActiveTimer !== null}
                  >
                    <SelectTrigger className="w-full h-9 rounded-[var(--apple-radius-md)] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)] text-[14px]">
                      <SelectValue placeholder="Select a project" />
                    </SelectTrigger>
                    <SelectContent className="rounded-[var(--apple-radius-md)] border-[var(--apple-separator)] w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)] max-h-[300px]">
                      <div className="p-2 sticky top-0 bg-[var(--apple-system-background)] dark:bg-[#2C2C2E] z-10">
                        <Input
                          ref={projectSearchInputRef}
                          placeholder="Search projects…"
                          value={projectSearch}
                          onChange={(e) => { e.stopPropagation(); setProjectSearch(e.target.value) }}
                          onKeyDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          className="h-8 rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] text-[13px]"
                        />
                      </div>
                      {Array.isArray(filteredProjects) && filteredProjects.length > 0 ? (
                        filteredProjects.map((project) => (
                          <SelectItem key={project._id} value={project._id}>
                            <div className="flex items-center gap-2 min-w-0">
                              <FolderOpen className="h-3.5 w-3.5 flex-shrink-0 text-[var(--apple-secondary-label)]" strokeWidth={1.5} />
                              <span className="truncate">{project.name}</span>
                            </div>
                          </SelectItem>
                        ))
                      ) : (
                        <div className="p-3 text-[13px] text-[var(--apple-secondary-label)] text-center">
                          No projects found
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Task */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--apple-tertiary-label)]">Task *</p>
                  <div className="relative">
                    <Select
                      value={selectedTask}
                      onValueChange={handleTaskChange}
                      onOpenChange={(open) => {
                        if (open) focusSearchInput(taskSearchInputRef.current)
                        if (!open) setTaskSearch('')
                      }}
                      disabled={
                        !timeTrackingSettings?.allowTimeTracking ||
                        !selectedProject ||
                        showInitialTasksLoading ||
                        liveActiveTimer !== null
                      }
                    >
                      <SelectTrigger className="w-full h-9 rounded-[var(--apple-radius-md)] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)] text-[14px]">
                        {liveActiveTimer?.task?.title ? (
                          <div className="flex items-center gap-2 truncate">
                            {liveActiveTimer.task.displayId && (
                              <span className="text-[11px] font-apple-mono bg-[var(--apple-quaternary-fill)] px-1.5 py-0.5 rounded flex-shrink-0">
                                {liveActiveTimer.task.displayId}
                              </span>
                            )}
                            <span className="truncate">{liveActiveTimer.task.title}</span>
                          </div>
                        ) : selectedTask && selectedTaskLabel ? (
                          <span className="truncate">{selectedTaskLabel}</span>
                        ) : (
                          <SelectValue
                            placeholder={
                              showInitialTasksLoading ? 'Loading tasks…' :
                              selectedProject ? (Array.isArray(tasks) && tasks.length > 0 ? 'Select a task' : 'No tasks available') :
                              'Select a project first'
                            }
                          />
                        )}
                      </SelectTrigger>
                      {showInitialTasksLoading && (
                        <Loader2 className="absolute right-8 top-1/2 h-4 w-4 animate-spin -translate-y-1/2 text-[var(--apple-secondary-label)]" />
                      )}
                      <SelectContent className="rounded-[var(--apple-radius-md)] border-[var(--apple-separator)] w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)] max-h-[300px]">
                        {!showInitialTasksLoading && (
                          <div className="p-2 sticky top-0 bg-[var(--apple-system-background)] dark:bg-[#2C2C2E] z-10">
                            <Input
                              ref={taskSearchInputRef}
                              placeholder="Search tasks…"
                              value={taskSearch}
                              onChange={(e) => { e.stopPropagation(); setTaskSearch(e.target.value) }}
                              onKeyDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                              className="h-8 rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] text-[13px]"
                            />
                          </div>
                        )}
                        {showInitialTasksLoading ? (
                          <div className="flex items-center justify-center p-4 gap-2">
                            <Loader2 className="h-4 w-4 animate-spin text-[var(--apple-system-blue)]" />
                            <span className="text-[13px] text-[var(--apple-secondary-label)]">Loading tasks…</span>
                          </div>
                        ) : Array.isArray(tasks) && tasks.length > 0 ? (
                          <div className="flex flex-col">
                            {tasks.filter((task) => {
                              if (!taskSearch || taskSearch.trim() === '' || /^\.+$/.test(taskSearch.trim())) return true
                              const searchLower = taskSearch.toLowerCase().trim()
                              const searchNormalized = searchLower.replace(/\.+$/, '')
                              if (task.title?.toLowerCase().includes(searchLower)) return true
                              if (task.displayId !== undefined && task.displayId !== null && task.displayId !== '') {
                                const displayIdStr = String(task.displayId).toLowerCase()
                                if (displayIdStr.includes(searchLower) || (searchNormalized && displayIdStr.includes(searchNormalized))) return true
                              }
                              if (task.taskNumber !== undefined && task.taskNumber !== null && task.taskNumber !== '') {
                                const taskNumStr = String(task.taskNumber).toLowerCase()
                                if (taskNumStr.includes(searchLower) || (searchNormalized !== searchLower && taskNumStr.includes(searchNormalized))) return true
                              }
                              return false
                            }).sort((a, b) => (a.title || '').localeCompare(b.title || '')).map((task) => {
                              const isBillableDisabled = !!(task.isBillable && timeTrackingSettings && !timeTrackingSettings.allowBillableTime)
                              return (
                                <SelectItem
                                  key={task._id}
                                  value={task._id}
                                  disabled={isBillableDisabled}
                                  className="w-full"
                                  title={`${task.displayId || task.taskNumber || 'N/A'} – ${task.title}`}
                                >
                                  <div className="flex items-center gap-2 w-full">
                                    <Target className="h-3.5 w-3.5 flex-shrink-0 text-[var(--apple-secondary-label)]" strokeWidth={1.5} />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-apple-mono bg-[var(--apple-quaternary-fill)] px-1.5 py-0.5 rounded flex-shrink-0">
                                          {task.displayId || task.taskNumber || 'N/A'}
                                        </span>
                                        <span className="truncate text-[13px]">{task.title}</span>
                                      </div>
                                      <div className="text-[11px] text-[var(--apple-tertiary-label)] mt-0.5">
                                        {task.status} · {task.priority}
                                        {isBillableDisabled && ' · Billable time not allowed'}
                                      </div>
                                    </div>
                                  </div>
                                </SelectItem>
                              )
                            })}
                            {hasMoreTasks && (
                              <div ref={loadMoreSentinelRef} className="p-3 text-center min-h-10 flex items-center justify-center">
                                <span className="flex items-center gap-2 text-[13px] text-[var(--apple-secondary-label)]">
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading more…
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="p-3 text-[13px] text-[var(--apple-secondary-label)] text-center">
                            No tasks found
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedProject && !tasksLoading && Array.isArray(tasks) && tasks.length === 0 && (
                    <p className="text-[12px] text-[var(--apple-secondary-label)]">
                      No tasks in this project. Create or assign a task first.
                    </p>
                  )}
                  {showInitialTasksLoading && (
                    <p className="text-[12px] text-[var(--apple-secondary-label)] flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading tasks…
                    </p>
                  )}
                </div>
              </div>

              {/* Memo */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--apple-tertiary-label)]">Memo *</p>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What are you working on? (required)"
                  rows={2}
                  required
                  disabled={!timeTrackingSettings?.allowTimeTracking || !selectedProject || !selectedTask || liveActiveTimer !== null}
                  className="w-full rounded-[var(--apple-radius-md)] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)] text-[14px] resize-none"
                />
              </div>

              {/* Timer component */}
              {user && timeTrackingSettings?.allowTimeTracking && (
                <div>
                  {(() => {
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
                        allowOvertime={timeTrackingSettings?.allowOvertime ?? false}
                        maxDailyHours={timeTrackingSettings?.maxDailyHours}
                        dailyHoursLogged={dailyHoursLogged}
                        onTimerUpdate={(timer) => {
                          if (!timer || (timer as any).status === 'stopped') {
                            setLiveActiveTimer(null)
                            resetTimerForm()
                          } else {
                            setActiveTimerSnapshot(timer)
                            setLiveActiveTimer(timer)
                            if (!hadActiveTimerRef.current) {
                              showToast({
                                type: 'success',
                                title: 'Timer Started',
                                message: 'Your timer has started successfully.',
                                duration: 5000
                              })
                            }
                            autoStopNotifiedRef.current = false
                          }
                          setTimeLogsRefreshKey((prev) => prev + 1)
                        }}
                        onAutoStop={(message) => {
                          showToast({ type: 'info', title: 'Timer Auto-Stopped', message, duration: 8000 })
                        }}
                      />
                    )
                  })()}
                </div>
              )}

              {/* Time tracking disabled info */}
              {!timeTrackingSettings?.allowTimeTracking && (
                <div className="flex items-center gap-2.5 rounded-[var(--apple-radius-md)] bg-[var(--apple-tertiary-fill)] p-3.5">
                  <Info className="h-4 w-4 text-[var(--apple-secondary-label)] flex-shrink-0" strokeWidth={1.5} />
                  <p className="text-[13px] text-[var(--apple-secondary-label)]">
                    Time tracking is disabled. Enable it in Application Settings to use the timer.
                  </p>
                </div>
              )}
            </div>
          </div>

        {/* ── Time Logs ────────────────────────────────────────────────── */}
        {user && (
          <TimeLogs
            userId={user.id}
            organizationId={user.organization}
            projectId={undefined}
            taskId={undefined}
            refreshKey={timeLogsRefreshKey}
            liveActiveTimer={liveActiveTimer}
            showSelectionAndApproval={false}
            showManualLogButtons={true}
          />
        )}

      </div>
    </MainLayout>
  )
}
