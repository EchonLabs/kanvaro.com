'use client'

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { formatToTitleCase, cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { useAuthContext } from '@/contexts/AuthContext'
import {
  ArrowLeft,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  Play,
  Pause,
  XCircle,
  Target,
  Zap,
  BarChart3,
  User,
  Loader2,
  Edit,
  Trash2,
  Plus,
  Star,
  Bug,
  Wrench,
  Layers,
  Circle,
  Paperclip,
  MessageSquarePlus,
  ChevronDown,
  UserPlus,
  Check,
  BookOpen,
  X
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from '@/components/ui/DropdownMenu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { AttachmentList } from '@/components/ui/AttachmentList'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { Calendar as CalendarUI } from '@/components/ui/calendar'
import { format, startOfDay } from 'date-fns'
import { useNotify } from '@/lib/notify'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { extractUserId } from '@/lib/auth/user-utils'
import TaskActivityLog from '@/components/tasks/TaskActivityLog'
import { StartTimerModal } from '@/components/time-tracking/StartTimerModal'
import { CategoryBadge } from '@/components/tasks/TasksShared'

interface Task {
  _id: string
  title: string
  displayId: string
  description: string
  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'testing' | 'done' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  type: 'bug' | 'feature' | 'improvement' | 'task' | 'subtask'
  category?: string
  project: {
    _id: string
    name: string
  }
  assignedTo?: Array<{
    user?: {
      _id: string
      firstName: string
      lastName: string
      email: string
    }
    firstName?: string
    lastName?: string
    email?: string
    hourlyRate?: number
  }>
  createdBy: {
    firstName: string
    lastName: string
    email: string
  }
  assignedBy?: {
    firstName: string
    lastName: string
    email: string
  }
  story?: {
    _id: string
    title: string
    status?: string
    epic?: {
      _id: string
      title: string
      status?: string
    }
  }
  sprint?: {
    _id: string
    name: string
    status?: string
    startDate?: string
    endDate?: string
  }
  parentTask?: {
    _id: string
    title: string
  }
  storyPoints?: number
  dueDate?: string
  estimatedHours?: number
  actualHours?: number
  labels: string[]
  createdAt: string
  updatedAt: string
  subtasks?: {
    _id?: string
    title: string
    description?: string
    status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'testing' | 'done' | 'cancelled'
    isCompleted: boolean
    assignedTo?: {
      _id: string
      firstName: string
      lastName: string
      email?: string
      avatar?: string
    } | string
    story?: {
      _id: string
      title: string
    } | string
    dueDate?: string
    type?: 'bug' | 'feature' | 'improvement' | 'task' | 'subtask'
    priority?: 'low' | 'medium' | 'high' | 'critical'
    estimatedHours?: number
    subtasks?: {
      _id?: string
      title: string
      description?: string
      status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'testing' | 'done' | 'cancelled'
      isCompleted: boolean
      createdAt?: string
      updatedAt?: string
    }[]
    createdAt?: string
    updatedAt?: string
  }[]
  attachments?: Array<{
    name: string
    url: string
    size: number
    type: string
    uploadedAt?: string
    uploadedBy?: {
      firstName?: string
      lastName?: string
      email?: string
    }
  }>
  comments?: Array<{
    _id?: string
    content: string
    parentCommentId?: string | null
    createdAt: string
    updatedAt?: string
    attachments?: Array<{
      name: string
      url: string
      size?: number
      type?: string
      uploadedAt?: string
    }>
    author?: {
      firstName?: string
      lastName?: string
      email?: string
      _id?: string
    }
    mentions?: string[]
    linkedIssues?: Array<{
      _id?: string
      displayId?: string
      title?: string
    }>
  }>
}

interface AssignableUser {
  _id: string
  firstName: string
  lastName: string
  email: string
  avatar?: string
}

const SUBTASK_STATUS_OPTIONS = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'review', label: 'Review' },
  { value: 'testing', label: 'Testing' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' }
] as const

type SuggestionItem = {
  _id: string
  name?: string
  displayId?: string
  title?: string
}

type CommentNode = {
  _id: string
  content: string
  parentCommentId?: string | null
  createdAt?: string
  updatedAt?: string
  attachments?: Array<{
    name: string
    url: string
    size?: number
    type?: string
    uploadedAt?: string
  }>
  author?: {
    firstName?: string
    lastName?: string
    email?: string
    _id?: string
  }
  mentions?: string[]
  linkedIssues?: Array<{
    _id?: string
    displayId?: string
    title?: string
  }>
  children: CommentNode[]
}

type ComposerType = 'comment' | 'reply'

export default function TaskDetailPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuthContext()

  const router = useRouter()
  const params = useParams()
  const taskId = params.id as string
  const { setItems } = useBreadcrumb()
  const { formatDate, formatDateTimeSafe, formatDuration } = useDateTime()

  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [commentContent, setCommentContent] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [mentionsList, setMentionsList] = useState<Array<{ _id: string; name: string }>>([])
  const [issuesList, setIssuesList] = useState<Array<{ _id: string; displayId?: string; title?: string }>>([])
  const [suggestionMode, setSuggestionMode] = useState<'mention' | 'issue' | null>(null)
  const [suggestionQuery, setSuggestionQuery] = useState('')
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
  const [suggestionComposer, setSuggestionComposer] = useState<ComposerType | null>(null)
  const [currentUserId, setCurrentUserId] = useState('')
  const [currentOrganizationId, setCurrentOrganizationId] = useState('')
  const [showStartTimerModal, setShowStartTimerModal] = useState(false)
  const [activeTimer, setActiveTimer] = useState<any | null | undefined>(undefined)
  const [activeTimerDisplay, setActiveTimerDisplay] = useState(() => formatDuration(0))
  const activeTimerBaseMinutesRef = useRef<number>(0)
  const activeTimerTickStartMsRef = useRef<number | null>(null)
  const activeTimerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [stoppingTimer, setStoppingTimer] = useState(false)
  const [timerActionLoading, setTimerActionLoading] = useState<'pause' | 'resume' | null>(null)
  const [showStopTimerConfirmModal, setShowStopTimerConfirmModal] = useState(false)
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState<string>('')
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null)
  const [replyContent, setReplyContent] = useState<string>('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [commentAttachments, setCommentAttachments] = useState<Array<{ name: string; url: string; size?: number; type?: string; uploadedAt?: string }>>([])
  const [replyAttachments, setReplyAttachments] = useState<Array<{ name: string; url: string; size?: number; type?: string; uploadedAt?: string }>>([])
  const [uploading, setUploading] = useState(false)
  const [commentsCurrentPage, setCommentsCurrentPage] = useState(1)
  const [commentsPageSize, setCommentsPageSize] = useState(5)
  const commentEditorRef = useRef<HTMLTextAreaElement | null>(null)
  const replyEditorRef = useRef<HTMLTextAreaElement | null>(null)
  const commentFileInputRef = useRef<HTMLInputElement | null>(null)
  const replyFileInputRef = useRef<HTMLInputElement | null>(null)
  const commentComposerRef = useRef<HTMLDivElement | null>(null)
  const replyComposerRef = useRef<HTMLDivElement | null>(null)
  const activeSuggestionComposerRef = useRef<ComposerType | null>(null)
  const suggestionMenuRef = useRef<HTMLDivElement | null>(null)
  const measurementCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [suggestionPosition, setSuggestionPosition] = useState<{ top: number; left: number; flip: boolean }>({ top: 0, left: 0, flip: false })
  const [composerScrollTop, setComposerScrollTop] = useState<{ comment: number; reply: number }>({ comment: 0, reply: 0 })
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({})
  const { success: notifySuccess, error: notifyError } = useNotify()
  const { hasPermission } = usePermissions()

  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([])
  const [showAddSubtask, setShowAddSubtask] = useState(false)
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [newSubtaskAssignee, setNewSubtaskAssignee] = useState<string>('')
  const [newSubtaskType, setNewSubtaskType] = useState<string>('subtask')
  const [newSubtaskPriority, setNewSubtaskPriority] = useState<string>('medium')
  const [newSubtaskDueDate, setNewSubtaskDueDate] = useState<string>('')
  const [dueDateOpen, setDueDateOpen] = useState(false)
  const [newSubtaskEstimatedHours, setNewSubtaskEstimatedHours] = useState<string>('')
  const [newSubtaskStory, setNewSubtaskStory] = useState<string>('')
  const [newSubtaskDescription, setNewSubtaskDescription] = useState<string>('')
  const [projectStories, setProjectStories] = useState<Array<{ _id: string; title: string }>>([])
  const [isAddingSubtask, setIsAddingSubtask] = useState(false)
  const [addingNestedForIndex, setAddingNestedForIndex] = useState<number | null>(null)
  const [newNestedTitle, setNewNestedTitle] = useState('')
  const [isAddingNested, setIsAddingNested] = useState(false)

  const handleRelatedNavigation = (path: string) => {
    if (!path) return
    router.push(path)
  }

  const handleRelatedKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>, path: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleRelatedNavigation(path)
    }
  }

  const sprintDetails = task?.sprint
  const storyDetails = task?.story
  const epicDetails = storyDetails?.epic
  const hasRelatedEntities = Boolean(
    (sprintDetails && sprintDetails._id) ||
    (storyDetails && storyDetails._id) ||
    (epicDetails && epicDetails._id)
  )

  useEffect(() => {
    if (!task?.project?._id) return
    let cancelled = false

    const loadCategories = async () => {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(task.project._id)}/task-categories`)
        const data = await res.json()
        if (!cancelled && res.ok && data.success && Array.isArray(data.data)) {
          const map: Record<string, string> = {}
          data.data.forEach((c: any) => { map[c.key] = c.title })
          setCategoryMap(map)
        }
      } catch {
        // fallback: raw key
      }
    }

    void loadCategories()
    return () => { cancelled = true }
  }, [task?.project?._id])


  // Auth initialization - trigger data loading
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      setLoading(false)
      fetchTask()
      fetchOrganizationUsers()
    } else if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated])
  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      
      if (response.ok) {
        const me = await response.json().catch(() => null)
        const uid = extractUserId(me)
        if (uid) setCurrentUserId(uid)
        const orgRaw = me?.organization
        const orgId = (typeof orgRaw === 'string' ? orgRaw : (orgRaw?._id ?? orgRaw?.id))
        if (orgId) setCurrentOrganizationId(orgId.toString())
        setError('')
        await fetchTask()
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
          const me = await fetch('/api/auth/me').then(r => r.json()).catch(() => null)
          const uid = extractUserId(me)
          if (uid) setCurrentUserId(uid)
          const orgRaw = me?.organization
          const orgId = (typeof orgRaw === 'string' ? orgRaw : (orgRaw?._id ?? orgRaw?.id))
          if (orgId) setCurrentOrganizationId(orgId.toString())
          setError('')
          await fetchTask()
        } else {
          setError('Session expired')
          setTimeout(() => {
            router.push('/login')
          }, 2000)
        }
      } else {
        router.push('/login')
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      setError('Authentication failed')
      setTimeout(() => {
        router.push('/login')
      }, 2000)
    }
  }, [router, taskId])

  useEffect(() => {
    // Set breadcrumb immediately on mount
    setItems([
      { label: 'Tasks', href: '/tasks' },
      { label: 'View Task' }
    ])
  }, [setItems])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const loadActiveTimer = useCallback(async () => {
    if (!currentUserId || !currentOrganizationId) return

    try {
      const response = await fetch(
        `/api/time-tracking/timer?userId=${encodeURIComponent(currentUserId)}&organizationId=${encodeURIComponent(currentOrganizationId)}`
      )

      if (!response.ok) {
        setActiveTimer(null)
        return
      }

      const data = await response.json().catch(() => null)
      setActiveTimer(data?.activeTimer ?? null)
    } catch (error) {
      console.error('Failed to load active timer:', error)
    }
  }, [currentUserId, currentOrganizationId])

  const handleStopTimer = useCallback(async () => {
    if (!currentUserId || !currentOrganizationId || !activeTimer) return

    setStoppingTimer(true)
    try {
      const response = await fetch('/api/time-tracking/timer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          organizationId: currentOrganizationId,
          action: 'stop',
          description: (activeTimer as any)?.description ?? ''
        })
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        notifyError({ title: data?.error || 'Failed to stop timer' })
        return
      }

      notifySuccess({ title: data?.message || 'Timer stopped' })
      setActiveTimer(null)
      setActiveTimerDisplay(formatDuration(0))
      loadActiveTimer()
    } catch (error) {
      console.error('Failed to stop timer:', error)
      notifyError({ title: 'Failed to stop timer' })
    } finally {
      setStoppingTimer(false)
    }
  }, [activeTimer, currentOrganizationId, currentUserId, formatDuration, loadActiveTimer, notifyError, notifySuccess])

  const handlePauseResumeTimer = useCallback(async () => {
    if (!currentUserId || !currentOrganizationId || !activeTimer) return

    const isPaused = Boolean((activeTimer as any)?.isPaused || (activeTimer as any)?.pausedAt)
    const action: 'pause' | 'resume' = isPaused ? 'resume' : 'pause'

    setTimerActionLoading(action)
    try {
      const response = await fetch('/api/time-tracking/timer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          organizationId: currentOrganizationId,
          action
        })
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        notifyError({ title: data?.error || `Failed to ${action} timer` })
        return
      }

      setActiveTimer(data?.activeTimer ?? null)
      notifySuccess({ title: action === 'pause' ? 'Timer paused' : 'Timer resumed' })
      loadActiveTimer()
    } catch (error) {
      console.error(`Failed to ${action} timer:`, error)
      notifyError({ title: `Failed to ${action} timer` })
    } finally {
      setTimerActionLoading(null)
    }
  }, [activeTimer, currentOrganizationId, currentUserId, loadActiveTimer, notifyError, notifySuccess])

  useEffect(() => {
    if (!currentUserId || !currentOrganizationId) return

    loadActiveTimer()
    const interval = setInterval(loadActiveTimer, 30_000)
    return () => clearInterval(interval)
  }, [currentUserId, currentOrganizationId, loadActiveTimer])

  useEffect(() => {
    if (activeTimerIntervalRef.current) {
      clearInterval(activeTimerIntervalRef.current)
      activeTimerIntervalRef.current = null
    }

    const activeTimerTaskId = (() => {
      const candidate = (activeTimer as any)?.task
      if (!candidate) return null
      if (typeof candidate === 'string') return candidate
      if (typeof candidate === 'object') {
        if ((candidate as any)._id) return (candidate as any)._id.toString()
        if ((candidate as any).id) return (candidate as any).id.toString()
      }
      return candidate?.toString?.() ?? null
    })()

    const currentTaskId = task?._id?.toString?.() ?? null
    const isRelevant = Boolean(activeTimer && currentTaskId && activeTimerTaskId && activeTimerTaskId === currentTaskId)

    if (!activeTimer || !isRelevant) {
      activeTimerBaseMinutesRef.current = 0
      activeTimerTickStartMsRef.current = null
      setActiveTimerDisplay(formatDuration(0))
      return
    }

    const baseMinutes = Number(activeTimer?.currentDuration || 0)
    activeTimerBaseMinutesRef.current = baseMinutes
    setActiveTimerDisplay(formatDuration(baseMinutes))

    const isPaused = Boolean(activeTimer?.isPaused || activeTimer?.pausedAt)
    if (isPaused) {
      activeTimerTickStartMsRef.current = null
      return
    }

    activeTimerTickStartMsRef.current = Date.now()
    activeTimerIntervalRef.current = setInterval(() => {
      const tickStart = activeTimerTickStartMsRef.current
      if (!tickStart) return
      const elapsedMinutes = (Date.now() - tickStart) / 60_000
      const runningMinutes = activeTimerBaseMinutesRef.current + elapsedMinutes
      setActiveTimerDisplay(formatDuration(runningMinutes))
    }, 1000)

    return () => {
      if (activeTimerIntervalRef.current) {
        clearInterval(activeTimerIntervalRef.current)
        activeTimerIntervalRef.current = null
      }
    }
  }, [activeTimer, task?._id, formatDuration])

  // Load mentions and issues when component mounts
  useEffect(() => {
    fetchOrganizationUsers()
    fetchOrganizationTasks()
  }, [])

  const fetchTask = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/tasks/${taskId}`)
      const data = await response.json()

      if (data.success) {
        setTask(data.data)


        if (data.data?.project?._id) {
          fetchProjectMembers(data.data.project._id)
          fetchProjectStories(data.data.project._id)
        } else {
          fetchProjectMembers('')
          setProjectStories([])
        }
        // preload mentions and issues lists (organization users and organization tasks)
        fetchOrganizationUsers()
        fetchOrganizationTasks()
        // Ensure breadcrumb is set
        setItems([
          { label: 'Tasks', href: '/tasks' },
          { label: 'View Task' }
        ])
      } else {
        setError(data.error || 'Failed to fetch task')
      }
    } catch (err) {
      setError('Failed to fetch task')
    } finally {
      setLoading(false)
    }
  }

  const fetchProjectMembers = async (projectId: string) => {
    if (projectId) {
      try {
        const response = await fetch(`/api/projects/${projectId}`)
        const data = await response.json()
        if (data.success && data.data?.teamMembers && Array.isArray(data.data.teamMembers)) {
          const members: AssignableUser[] = data.data.teamMembers
            .map((m: any) => {
              const memberObj = m.memberId || m.user || m
              return {
                _id: String(memberObj._id || memberObj.id),
                firstName: memberObj.firstName || '',
                lastName: memberObj.lastName || '',
                email: memberObj.email || '',
                avatar: memberObj.avatar
              }
            })
            .filter((m: AssignableUser) => m._id && (m.firstName || m.lastName || m.email))

          if (members.length > 0) {
            setAssignableUsers(members)
            return
          }
        }
      } catch (err) {
        console.error('Failed to fetch project members', err)
      }
    }

    try {
      const res = await fetch('/api/users')
      const data = await res.json()
      if (Array.isArray(data)) {
        const users: AssignableUser[] = data
          .filter((u: any) => u && u._id)
          .map((u: any) => ({
            _id: String(u._id),
            firstName: u.firstName || '',
            lastName: u.lastName || '',
            email: u.email || '',
            avatar: u.avatar
          }))
        setAssignableUsers(users)
      }
    } catch (err) {
      console.error('Failed to fetch users', err)
    }
  }

  const fetchProjectStories = async (projectId: string) => {
    if (!projectId) {
      setProjectStories([])
      return
    }
    try {
      const res = await fetch(`/api/stories?projectId=${projectId}`)
      const data = await res.json()
      if (data.success && Array.isArray(data.data)) {
        setProjectStories(data.data)
      } else {
        setProjectStories([])
      }
    } catch (err) {
      console.error('Failed to fetch project stories', err)
      setProjectStories([])
    }
  }

  const fetchOrganizationUsers = async () => {
    try {
      setIsLoadingSuggestions(true)
      const res = await fetch('/api/users')
      const data = await res.json()

      if (data && Array.isArray(data)) {
        const users = data
          .filter((u: any) => u && u._id) // Only include valid users
          .map((u: any) => ({
            _id: u._id,
            name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || 'User'
          })) as Array<{ _id: string; name: string }>

        setMentionsList(users)
      } else {
        setMentionsList([])
      }
    } catch (e) {
      console.error('Failed to fetch organization users for mentions', e)
      setMentionsList([])
    } finally {
      setIsLoadingSuggestions(false)
    }
  }

  const fetchOrganizationTasks = async () => {
    try {
      setIsLoadingSuggestions(true)
      // Get current user's organization from the task data or use a different approach
      // For now, let's use a broader query that gets recent tasks
      const params = new URLSearchParams({
        limit: '100',
        sort: 'updatedAt',
        order: 'desc'
      })
      const res = await fetch(`/api/tasks?${params.toString()}`)
      const data = await res.json()

      if (data?.success && Array.isArray(data.data)) {
        const tasks = data.data
          .filter((t: any) => t && t._id && t.displayId) // Only include valid tasks
          .map((t: any) => ({
            _id: t._id,
            displayId: t.displayId,
            title: t.title
          }))
        setIssuesList(tasks)
      } else {
        setIssuesList([])
      }
    } catch (e) {
      console.error('Failed to fetch organization tasks for linking', e)
      setIssuesList([])
    } finally {
      setIsLoadingSuggestions(false)
    }
  }

  const handleDeleteTask = async () => {
    if (!deleteAllowed) return
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE'
      })
      const data = await response.json()

      if (data.success) {
        setShowDeleteConfirmModal(false)
        router.push('/tasks')
        notifySuccess({ title: 'Task deleted successfully' })
      } else {
        setError(data.error || 'Failed to delete task')
        notifyError({ title: data.error || 'Failed to delete task' })
      }
    } catch (error) {
      setError('Failed to delete task')
      notifyError({ title: 'Failed to delete task' })
    }
  }

  const [updatingSubtask, setUpdatingSubtask] = useState(false)

  const allAssignableUsers = useMemo(() => {
    const map = new Map<string, AssignableUser>()
    for (const u of assignableUsers) {
      map.set(u._id, u)
    }
    if (task?.assignedTo && Array.isArray(task.assignedTo)) {
      for (const a of task.assignedTo) {
        if (a.user?._id && !map.has(a.user._id)) {
          map.set(a.user._id, {
            _id: a.user._id,
            firstName: a.user.firstName || a.firstName || '',
            lastName: a.user.lastName || a.lastName || '',
            email: a.user.email || a.email || ''
          })
        }
      }
    }
    return Array.from(map.values())
  }, [assignableUsers, task?.assignedTo])

  const handleUpdateSubtaskStatus = async (subtaskIndex: number, newStatus: string, nestedIndex?: number) => {
    if (!task || !task.subtasks || updatingSubtask) return

    const updatedSubtasks = task.subtasks.map((st, i) => {
      const assignedToId = typeof st.assignedTo === 'object' && st.assignedTo !== null
        ? (st.assignedTo as any)._id
        : st.assignedTo
      const storyId = typeof st.story === 'object' && st.story !== null
        ? (st.story as any)._id
        : st.story

      if (i !== subtaskIndex) {
        return {
          ...st,
          assignedTo: assignedToId,
          story: storyId || undefined
        }
      }

      if (nestedIndex !== undefined) {
        const nextNested = (st.subtasks || []).map((n, ni) => {
          if (ni !== nestedIndex) return n
          const nextCompleted = newStatus === 'done'
          return {
            ...n,
            status: newStatus,
            isCompleted: nextCompleted
          }
        })
        return {
          ...st,
          assignedTo: assignedToId,
          story: storyId || undefined,
          subtasks: nextNested
        }
      } else {
        const nextCompleted = newStatus === 'done'
        return {
          ...st,
          assignedTo: assignedToId,
          story: storyId || undefined,
          status: newStatus,
          isCompleted: nextCompleted
        }
      }
    })

    try {
      setUpdatingSubtask(true)
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subtasks: updatedSubtasks
        })
      })
      const data = await response.json()
      if (data.success && data.data) {
        setTask(data.data)
        notifySuccess({ title: 'Subtask status updated' })
      } else {
        notifyError({ title: data.error || 'Failed to update subtask status' })
      }
    } catch (err) {
      notifyError({ title: 'Failed to update subtask status' })
    } finally {
      setUpdatingSubtask(false)
    }
  }

  const handleToggleSubtask = async (subtaskIndex: number, nestedIndex?: number) => {
    if (!task || !task.subtasks) return
    const targetSubtask = task.subtasks[subtaskIndex]
    if (!targetSubtask) return

    if (nestedIndex !== undefined) {
      const targetNested = targetSubtask.subtasks?.[nestedIndex]
      if (!targetNested) return
      const isDone = targetNested.isCompleted || targetNested.status === 'done'
      await handleUpdateSubtaskStatus(subtaskIndex, isDone ? 'todo' : 'done', nestedIndex)
    } else {
      const isDone = targetSubtask.isCompleted || targetSubtask.status === 'done'
      await handleUpdateSubtaskStatus(subtaskIndex, isDone ? 'todo' : 'done')
    }
  }

  const handleUpdateSubtaskAssignee = async (subtaskIndex: number, newAssigneeId: string | null) => {
    if (!task || !task.subtasks || updatingSubtask) return

    const updatedSubtasks = task.subtasks.map((st, i) => {
      const currentAssignedToId = typeof st.assignedTo === 'object' && st.assignedTo !== null
        ? (st.assignedTo as any)._id
        : st.assignedTo
      const storyId = typeof st.story === 'object' && st.story !== null
        ? (st.story as any)._id
        : st.story

      if (i !== subtaskIndex) {
        return {
          ...st,
          assignedTo: currentAssignedToId,
          story: storyId || undefined
        }
      }

      return {
        ...st,
        assignedTo: newAssigneeId || undefined,
        story: storyId || undefined
      }
    })

    try {
      setUpdatingSubtask(true)
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subtasks: updatedSubtasks
        })
      })
      const data = await response.json()
      if (data.success && data.data) {
        setTask(data.data)
        notifySuccess({ title: newAssigneeId ? 'Subtask assignee updated' : 'Subtask assignee removed' })
      } else {
        notifyError({ title: data.error || 'Failed to update subtask assignee' })
      }
    } catch (err) {
      notifyError({ title: 'Failed to update subtask assignee' })
    } finally {
      setUpdatingSubtask(false)
    }
  }

  const handleAddSubtask = async () => {
    if (!task || !newSubtaskTitle.trim() || isAddingSubtask) return

    const newSubtask = {
      title: newSubtaskTitle.trim(),
      description: newSubtaskDescription.trim() || undefined,
      status: 'todo',
      isCompleted: false,
      assignedTo: newSubtaskAssignee ? newSubtaskAssignee : undefined,
      story: newSubtaskStory ? newSubtaskStory : undefined,
      dueDate: newSubtaskDueDate ? newSubtaskDueDate : undefined,
      type: newSubtaskType || 'subtask',
      priority: newSubtaskPriority || 'medium',
      estimatedHours: newSubtaskEstimatedHours ? Number(newSubtaskEstimatedHours) : undefined,
      subtasks: []
    }

    const currentSubtasks = (task.subtasks || []).map(st => ({
      ...st,
      assignedTo: typeof st.assignedTo === 'object' && st.assignedTo !== null
        ? (st.assignedTo as any)._id
        : st.assignedTo,
      story: typeof st.story === 'object' && st.story !== null
        ? (st.story as any)._id
        : st.story
    }))

    try {
      setIsAddingSubtask(true)
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subtasks: [...currentSubtasks, newSubtask]
        })
      })
      const data = await response.json()
      if (data.success && data.data) {
        setTask(data.data)
        setNewSubtaskTitle('')
        setNewSubtaskAssignee('')
        setNewSubtaskType('subtask')
        setNewSubtaskPriority('medium')
        setNewSubtaskDueDate('')
        setNewSubtaskEstimatedHours('')
        setNewSubtaskStory('')
        setNewSubtaskDescription('')
        setShowAddSubtask(false)
        notifySuccess({ title: 'Subtask added successfully' })
      } else {
        notifyError({ title: data.error || 'Failed to add subtask' })
      }
    } catch (err) {
      notifyError({ title: 'Failed to add subtask' })
    } finally {
      setIsAddingSubtask(false)
    }
  }

  const handleAddNestedSubtask = async (parentIndex: number) => {
    if (!task || !task.subtasks || !newNestedTitle.trim() || isAddingNested) return

    const newNested = {
      title: newNestedTitle.trim(),
      status: 'todo',
      isCompleted: false
    }

    const updatedSubtasks = task.subtasks.map((st, i) => {
      const assignedToId = typeof st.assignedTo === 'object' && st.assignedTo !== null
        ? (st.assignedTo as any)._id
        : st.assignedTo
      const storyId = typeof st.story === 'object' && st.story !== null
        ? (st.story as any)._id
        : st.story

      if (i !== parentIndex) {
        return {
          ...st,
          assignedTo: assignedToId,
          story: storyId || undefined
        }
      }

      return {
        ...st,
        assignedTo: assignedToId,
        story: storyId || undefined,
        subtasks: [...(st.subtasks || []), newNested]
      }
    })

    try {
      setIsAddingNested(true)
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subtasks: updatedSubtasks
        })
      })
      const data = await response.json()
      if (data.success && data.data) {
        setTask(data.data)
        setNewNestedTitle('')
        setAddingNestedForIndex(null)
        notifySuccess({ title: 'Nested subtask added' })
      } else {
        notifyError({ title: data.error || 'Failed to add nested subtask' })
      }
    } catch (err) {
      notifyError({ title: 'Failed to add nested subtask' })
    } finally {
      setIsAddingNested(false)
    }
  }


  const filteredSuggestions = useMemo<SuggestionItem[]>(() => {
    const q = suggestionQuery.toLowerCase().trim()

    if (!suggestionMode) return []

    if (suggestionMode === 'mention') {
      const filtered = mentionsList
        .filter(m => {
          if (!m.name) return false
          // Show all users if no query, otherwise filter by name
          return q === '' || m.name.toLowerCase().includes(q)
        })
        .slice(0, 8) // Show more suggestions
        .map(m => ({ _id: m._id, name: m.name }))

      // If query is empty and we have no results, show a few default users
      if (q === '' && filtered.length === 0 && mentionsList.length > 0) {
        return mentionsList.slice(0, 8).map(m => ({ _id: m._id, name: m.name }))
      }

      return filtered
    }

    const filtered = issuesList
      .filter(i => {
        const displayId = (i.displayId || '').toLowerCase()
        const title = (i.title || '').toLowerCase()
        // Show all tasks if no query, otherwise filter by ID or title
        return q === '' || displayId.includes(q) || title.includes(q)
      })
      .slice(0, 8) // Show more suggestions
      .map(i => ({ _id: i._id, displayId: i.displayId, title: i.title }))

    // If query is empty and we have no results, show a few default tasks
    if (q === '' && filtered.length === 0 && issuesList.length > 0) {
      return issuesList.slice(0, 8).map(i => ({ _id: i._id, displayId: i.displayId, title: i.title }))
    }

    return filtered
  }, [suggestionMode, suggestionQuery, mentionsList, issuesList])

  // Reset selected index when filtered suggestions change
  useEffect(() => {
    setSelectedSuggestionIndex(0)
  }, [filteredSuggestions])

  const closeSuggestions = useCallback(() => {
    setSuggestionMode(null)
    setSuggestionQuery('')
    setSelectedSuggestionIndex(0)
    setSuggestionComposer(null)
  }, [])

  // Helper function to highlight matched text
  const highlightMatch = (text: string | undefined, query: string) => {
    if (!text || !query.trim()) return text || ''

    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    const parts = text.split(regex)

    return parts.map((part, index) => {
      if (regex.test(part)) {
        return <mark key={index} className="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">{part}</mark>
      }
      return part
    })
  }

  const replaceActiveToken = useCallback((replacement: string, composer: ComposerType) => {
    const textarea = composer === 'reply' ? replyEditorRef.current : commentEditorRef.current
    const setContent = composer === 'reply' ? setReplyContent : setCommentContent

    setContent(prev => {
      if (!textarea) return prev
      const cursorPos = textarea.selectionStart ?? prev.length
      const textBefore = prev.slice(0, cursorPos)
      const textAfter = prev.slice(cursorPos)
      // match last @word or #word before cursor
      const match = textBefore.match(/([@#][^\s@#]*)$/)
      if (!match) return prev
      const start = textBefore.lastIndexOf(match[1])
      const newBefore = textBefore.slice(0, start) + replacement + ' '
      const nextContent = newBefore + textAfter
      // move cursor to after inserted token
      const newCursor = newBefore.length
      setTimeout(() => {
        if (textarea) {
          textarea.focus()
          textarea.setSelectionRange(newCursor, newCursor)
        }
      }, 0)
      return nextContent
    })
    closeSuggestions()
  }, [closeSuggestions])

  const getCaretOffsets = useCallback((textarea: HTMLTextAreaElement) => {
    const selectionEnd = textarea.selectionEnd ?? textarea.value.length
    const computed = window.getComputedStyle(textarea)
    const beforeText = textarea.value.slice(0, selectionEnd)
    const lines = beforeText.split('\n')
    const currentLine = lines[lines.length - 1] ?? ''
    const lineIndex = Math.max(0, lines.length - 1)
    const fontSize = parseFloat(computed.fontSize) || 16
    const lineHeightValue = parseFloat(computed.lineHeight)
    const lineHeight = Number.isFinite(lineHeightValue) ? lineHeightValue : fontSize * 1.4
    const paddingLeft = parseFloat(computed.paddingLeft) || 0
    const paddingTop = parseFloat(computed.paddingTop) || 0
    const borderLeft = parseFloat(computed.borderLeftWidth) || 0
    const borderTop = parseFloat(computed.borderTopWidth) || 0

    const canvas = measurementCanvasRef.current || document.createElement('canvas')
    if (!measurementCanvasRef.current) {
      measurementCanvasRef.current = canvas
    }
    const ctx = measurementCanvasRef.current.getContext('2d')
    let lineWidth = 0
    if (ctx) {
      const fontParts = [computed.fontStyle, computed.fontVariant, computed.fontWeight, computed.fontSize, computed.fontFamily]
        .filter(Boolean)
        .join(' ')
        .trim()
      ctx.font = fontParts.length ? fontParts : `${fontSize}px sans-serif`
      lineWidth = ctx.measureText(currentLine).width
    } else {
      lineWidth = currentLine.length * fontSize * 0.6
    }

    const top = lineIndex * lineHeight - textarea.scrollTop + paddingTop + borderTop
    const left = lineWidth - textarea.scrollLeft + paddingLeft + borderLeft

    return {
      top: Math.max(paddingTop + borderTop, top),
      left: Math.max(paddingLeft + borderLeft + 2, left),
      lineHeight
    }
  }, [])

  const updateSuggestionPosition = useCallback((composer?: ComposerType | null) => {
    if (!suggestionMode) return
    const targetComposer = composer ?? suggestionComposer
    if (!targetComposer) return
    const textarea = targetComposer === 'reply' ? replyEditorRef.current : commentEditorRef.current
    const container = targetComposer === 'reply' ? replyComposerRef.current : commentComposerRef.current
    if (!textarea || !container) return

    const caret = getCaretOffsets(textarea)
    const textareaRect = textarea.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const rawTop = textareaRect.top - containerRect.top + caret.top
    const rawLeft = textareaRect.left - containerRect.left + caret.left

    const containerWidth = container.clientWidth || containerRect.width || 0
    const containerHeight = container.clientHeight || containerRect.height || 0
    const menuWidth = suggestionMenuRef.current?.offsetWidth || 240
    const menuHeight = suggestionMenuRef.current?.offsetHeight || 196
    const halfMenu = menuWidth / 2

    const minLeft = halfMenu + 8
    const maxLeft = Math.max(minLeft, containerWidth - halfMenu - 8)
    const boundedLeft = Math.min(Math.max(rawLeft, minLeft), maxLeft)

    const minTop = 12
    const maxTop = Math.max(minTop, containerHeight - minTop)
    const boundedTop = Math.min(Math.max(rawTop, minTop), maxTop)

    const flip = boundedTop + menuHeight + 12 > containerHeight
    setSuggestionPosition({ top: boundedTop, left: boundedLeft, flip })
  }, [commentComposerRef, commentEditorRef, getCaretOffsets, replyComposerRef, replyEditorRef, suggestionMenuRef, suggestionMode, suggestionComposer])

  const scheduleSuggestionPositionUpdate = useCallback((composer?: ComposerType | null) => {
    const targetComposer = composer ?? suggestionComposer
    if (!suggestionMode || !targetComposer) return
    requestAnimationFrame(() => {
      updateSuggestionPosition(targetComposer)
    })
  }, [suggestionMode, suggestionComposer, updateSuggestionPosition])

  useLayoutEffect(() => {
    if (!suggestionMode || !suggestionComposer) return
    updateSuggestionPosition(suggestionComposer)
  }, [suggestionMode, suggestionComposer, suggestionQuery, filteredSuggestions, composerScrollTop.comment, composerScrollTop.reply, updateSuggestionPosition])

  useEffect(() => {
    activeSuggestionComposerRef.current = suggestionComposer
  }, [suggestionComposer])

  const insertSelectedSuggestion = (composer: ComposerType) => {
    if (!suggestionMode) return
    const selectedSuggestion = filteredSuggestions[selectedSuggestionIndex]
    if (!selectedSuggestion) return

    if (suggestionMode === 'mention') {
      replaceActiveToken(`@${selectedSuggestion.name}`, composer)
    } else {
      replaceActiveToken(`#${selectedSuggestion.displayId || selectedSuggestion._id}`, composer)
    }
  }

  const handleComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>, composer: ComposerType) => {
    if (!suggestionMode || suggestionComposer !== composer || filteredSuggestions.length === 0) return

    switch (event.key) {
      case 'Escape': {
        event.preventDefault()
        closeSuggestions()
        break
      }
      case 'ArrowDown': {
        event.preventDefault()
        setSelectedSuggestionIndex(prev => (prev < filteredSuggestions.length - 1 ? prev + 1 : prev))
        break
      }
      case 'ArrowUp': {
        event.preventDefault()
        setSelectedSuggestionIndex(prev => (prev > 0 ? prev - 1 : prev))
        break
      }
      case 'Enter': {
        event.preventDefault()
        insertSelectedSuggestion(composer)
        break
      }
      case 'Tab': {
        if (selectedSuggestionIndex === 0) {
          closeSuggestions()
        } else {
          event.preventDefault()
          insertSelectedSuggestion(composer)
        }
        break
      }
    }
  }

  const handleComposerInput = (value: string, composer: ComposerType, textarea: HTMLTextAreaElement | null) => {
    if (composer === 'comment') {
      setCommentContent(value)
    } else {
      setReplyContent(value)
    }

    if (!textarea) return

    const cursor = textarea.selectionStart ?? value.length
    const before = value.slice(0, cursor)
    const match = before.match(/([@#])([^\s@#]{0,30})?$/)

    if (match) {
      const mode = match[1] === '@' ? 'mention' : 'issue'
      const query = match[2] || ''
      setSuggestionMode(mode)
      setSuggestionQuery(query)
      setSelectedSuggestionIndex(0)
      setSuggestionComposer(composer)
    } else if (suggestionComposer === composer) {
      closeSuggestions()
    }
  }

  const handleComposerBlur = (composer: ComposerType) => {
    setTimeout(() => {
      if (activeSuggestionComposerRef.current === composer) {
        closeSuggestions()
      }
    }, 150)
  }

  const renderSuggestionMenu = useCallback((composer: ComposerType) => {
    if (!suggestionMode || suggestionComposer !== composer) return null

    return (
      <div
        ref={suggestionMenuRef}
        className="absolute z-50 rounded-md border bg-background shadow-lg border-border overflow-hidden"
        style={{
          top: suggestionPosition.top,
          left: suggestionPosition.left,
          minWidth: 240,
          transform: suggestionPosition.flip ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
          marginTop: suggestionPosition.flip ? '-8px' : '8px'
        }}
      >
        <div className="max-h-48 overflow-y-auto py-1">
          {isLoadingSuggestions ? (
            <div className="px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
              <div className="animate-spin rounded-full h-3 w-3 border-b border-muted-foreground"></div>
              Loading...
            </div>
          ) : filteredSuggestions.length > 0 ? (
            filteredSuggestions.map((s, index) => (
              <button
                key={s._id}
                type="button"
                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted focus:bg-muted focus:outline-none transition-colors ${index === selectedSuggestionIndex ? 'bg-muted' : ''
                  }`}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (suggestionMode === 'mention') {
                    replaceActiveToken(`@${s.name}`, composer)
                  } else {
                    replaceActiveToken(`#${s.displayId || s._id}`, composer)
                  }
                }}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setSelectedSuggestionIndex(index)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs font-medium">
                    {suggestionMode === 'mention' ? '@' : '#'}
                  </span>
                  <div className="flex-1 min-w-0">
                    {suggestionMode === 'mention' ? (
                      <span className="truncate">
                        {highlightMatch(s.name || '', suggestionQuery)}
                      </span>
                    ) : (
                      <div className="truncate">
                        <span className="font-medium">
                          {highlightMatch(s.displayId || s._id, suggestionQuery)}
                        </span>
                        {s.title && (
                          <span className="text-muted-foreground ml-1">
                            — {highlightMatch(s.title || '', suggestionQuery)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {suggestionMode === 'mention' ? 'No users found' : 'No tasks found'}
            </div>
          )}
        </div>
        {filteredSuggestions.length > 0 && (
          <div className="px-3 py-1 border-t bg-muted/50 text-xs text-muted-foreground">
            Use ↑↓ to navigate, Enter to select, Esc to close
          </div>
        )}
      </div>
    )
  }, [filteredSuggestions, highlightMatch, isLoadingSuggestions, replaceActiveToken, selectedSuggestionIndex, suggestionComposer, suggestionMode, suggestionPosition, suggestionQuery])
  const buildMentionAndIssueIds = (text: string) => {
    const mentionIds: string[] = []
    mentionsList.forEach(m => {
      const token = `@${m.name}`
      if (text.includes(token)) {
        mentionIds.push(m._id)
      }
    })
    const issueIds: string[] = []
    issuesList.forEach(i => {
      const token = `#${i.displayId || i._id}`
      if (text.includes(token)) {
        issueIds.push(i._id)
      }
    })
    return { mentionIds, issueIds }
  }

  const submitComment = async (text: string, parentCommentId?: string | null) => {
    setCommentSubmitting(true)
    try {
      const { mentionIds, issueIds } = buildMentionAndIssueIds(text)
      const attachmentsPayload = (parentCommentId ? replyAttachments : commentAttachments).map(att => ({
        name: att.name,
        url: att.url,
        size: att.size,
        type: att.type,
        uploadedAt: att.uploadedAt
      }))
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text,
          mentions: mentionIds,
          linkedIssues: issueIds,
          attachments: attachmentsPayload,
          parentCommentId: parentCommentId || null
        })
      })
      const data = await res.json()
      if (data.success) {
        const newComment = {
          _id: data.data._id || Math.random().toString(36),
          content: text,
          createdAt: new Date().toISOString(),
          parentCommentId: parentCommentId || null,
          attachments: attachmentsPayload,
          author: {
            firstName: 'You',
            lastName: '',
            email: '',
            _id: currentUserId
          },
          mentions: mentionIds,
          linkedIssues: issuesList.filter(i => issueIds.includes(i._id))
        }
        setTask(prev => prev ? { ...prev, comments: [...(prev.comments || []), newComment] } : prev)
        if (parentCommentId) {
          setReplyAttachments([])
        } else {
          setCommentAttachments([])
        }
        return true
      } else {
        setError(data.error || 'Failed to add comment')
        return false
      }
    } catch (e) {
      setError('Failed to add comment')
      return false
    } finally {
      setCommentSubmitting(false)
    }
  }

  const handleAddComment = async () => {
    if (!commentContent.trim()) return
    const ok = await submitComment(commentContent)
    if (ok) setCommentContent('')
  }

  const uploadAttachmentFile = async (file: File, isReply = false) => {
    setUploading(true)
    try {
      const formDataUpload = new FormData()
      formDataUpload.append('attachment', file)
      const response = await fetch('/api/uploads/attachments', {
        method: 'POST',
        body: formDataUpload
      })
      const uploadData = await response.json()
      if (!response.ok || !uploadData?.success) {
        throw new Error(uploadData?.error || 'Failed to upload attachment')
      }
      const att = uploadData.data
      const newAttachment = {
        name: att.name || file.name,
        url: att.url,
        size: att.size || file.size,
        type: att.type || file.type,
        uploadedAt: att.uploadedAt || new Date().toISOString()
      }
      if (isReply) {
        setReplyAttachments(prev => [...prev, newAttachment])
      } else {
        setCommentAttachments(prev => [...prev, newAttachment])
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to upload attachment')
    } finally {
      setUploading(false)
    }
  }

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>, isReply = false) => {
    const file = e.target.files?.[0]
    if (file) {
      await uploadAttachmentFile(file, isReply)
      e.target.value = ''
    }
  }

  const handleStartReply = (commentId: string) => {
    setReplyTargetId(commentId)
    setReplyContent('')
  }

  const handleCancelReply = () => {
    if (suggestionComposer === 'reply') {
      closeSuggestions()
    }
    setReplyTargetId(null)
    setReplyContent('')
  }

  const handleSubmitReply = async () => {
    if (!replyTargetId || !replyContent.trim()) return
    const ok = await submitComment(replyContent, replyTargetId)
    if (ok) {
      setReplyContent('')
      setReplyTargetId(null)
      setReplyAttachments([])
    }
  }

  const handleStartEditComment = (commentId: string, content: string) => {
    setEditingCommentId(commentId)
    setEditingContent(content)
  }

  const handleCancelEdit = () => {
    setEditingCommentId(null)
    setEditingContent('')
  }

  const handleSaveEdit = async () => {
    if (!editingCommentId || !editingContent.trim()) return
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId: editingCommentId, content: editingContent })
      })
      const data = await res.json()
      if (data.success) {
        setTask(prev => prev ? {
          ...prev,
          comments: (prev.comments || []).map(c =>
            (c._id || '').toString() === editingCommentId
              ? { ...c, content: editingContent, updatedAt: data.data.updatedAt || new Date().toISOString() }
              : c
          )
        } : prev)
        handleCancelEdit()
      } else {
        setError(data.error || 'Failed to update comment')
      }
    } catch (e) {
      setError('Failed to update comment')
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId })
      })
      const data = await res.json()
      if (data.success) {
        setTask(prev => prev ? {
          ...prev,
          comments: (prev.comments || []).filter(c => (c._id || '').toString() !== commentId)
        } : prev)
        if (editingCommentId === commentId) handleCancelEdit()
      } else {
        setError(data.error || 'Failed to delete comment')
      }
    } catch (e) {
      setError('Failed to delete comment')
    }
  }

  const commentTree = useMemo<CommentNode[]>(() => {
    if (!task?.comments || task.comments.length === 0) return []
    const map: Record<string, CommentNode> = {}
    const roots: CommentNode[] = []
    const sorted = [...task.comments].sort((a, b) => {
      const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return aDate - bDate
    })
    sorted.forEach((c) => {
      const id = (c._id || Math.random().toString(36)).toString()
      map[id] = {
        _id: id,
        content: c.content,
        parentCommentId: c.parentCommentId || null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        attachments: c.attachments,
        author: c.author,
        mentions: c.mentions,
        linkedIssues: c.linkedIssues,
        children: []
      }
    })
    Object.values(map).forEach((node) => {
      const parentId = node.parentCommentId || ''
      if (parentId && map[parentId]) {
        map[parentId].children.push(node)
      } else {
        roots.push(node)
      }
    })
    const sortChildren = (arr: CommentNode[]) => {
      arr.sort((a, b) => {
        const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return aDate - bDate
      })
      arr.forEach((c) => sortChildren(c.children))
    }
    sortChildren(roots)
    return roots
  }, [task?.comments])

  const renderCommentNode = useCallback((comment: CommentNode, depth = 0) => {
    const commentId = (comment._id || '').toString()
    const isAuthor = comment.author?._id === currentUserId
    const isEditing = editingCommentId === commentId
    const isReplying = replyTargetId === commentId
    const authorName = comment.author?.firstName || comment.author?.lastName
      ? `${comment.author?.firstName || ''} ${comment.author?.lastName || ''}`.trim()
      : comment.author?.email || 'User'
    const initials = authorName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()

    return (
      <div key={commentId} className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] p-4 bg-[var(--apple-quaternary-fill)]" style={{ marginLeft: depth ? depth * 20 : 0 }}>
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-full bg-[var(--apple-system-blue)]/15 flex items-center justify-center flex-shrink-0">
            <span className="text-[11px] font-semibold text-[var(--apple-system-blue)]">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[14px] font-semibold text-[var(--apple-label)]">{authorName}</span>
              <span className="text-[12px] text-[var(--apple-tertiary-label)]">
                {comment.updatedAt ? formatDateTimeSafe(comment.updatedAt) : (comment.createdAt ? formatDateTimeSafe(comment.createdAt) : '')}
                {comment.updatedAt && <span className="ml-1 text-[11px]">(edited)</span>}
              </span>
            </div>
            {isEditing ? (
              <div className="space-y-2">
                <Textarea
                  value={editingContent}
                  onChange={(e) => setEditingContent(e.target.value)}
                  rows={3}
                  className="text-[14px] rounded-[var(--apple-radius-md)] border-[var(--apple-separator)]"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveEdit} disabled={!editingContent.trim()} className="rounded-full h-7 px-3 text-[13px] bg-[var(--apple-system-blue)] text-white hover:opacity-90">Save</Button>
                  <Button size="sm" variant="outline" onClick={handleCancelEdit} className="rounded-full h-7 px-3 text-[13px] border-[var(--apple-separator)]">Cancel</Button>
                </div>
              </div>
            ) : (
              <p className="text-[14px] text-[var(--apple-label)] whitespace-pre-wrap leading-relaxed">{comment.content}</p>
            )}
            {comment.linkedIssues && comment.linkedIssues.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {comment.linkedIssues.map((issue) => (
                  <button
                    key={issue?._id || Math.random().toString(36)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[var(--apple-separator)] text-[11px] text-[var(--apple-system-blue)] hover:bg-[var(--apple-system-blue)]/10 apple-transition"
                    onClick={() => { if (issue?._id) router.push(`/tasks/${issue._id}`) }}
                  >
                    #{issue?.displayId || issue?._id}{issue?.title ? ` — ${issue.title}` : ''}
                  </button>
                ))}
              </div>
            )}
            {comment.attachments && comment.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {comment.attachments.map((att, idx) => (
                  <a key={`${att.url}-${idx}`} href={att.url} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[var(--apple-separator)] text-[12px] text-[var(--apple-system-blue)] hover:bg-[var(--apple-system-blue)]/10 apple-transition">
                    <Paperclip className="h-3 w-3" />{att.name}{att.size ? ` (${(att.size / 1024).toFixed(1)} KB)` : ''}
                  </a>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1 mt-2">
              {!isAuthor && !isEditing && (
                <button onClick={() => handleStartReply(commentId)} className="text-[12px] text-[var(--apple-secondary-label)] hover:text-[var(--apple-system-blue)] apple-transition font-medium px-1">Reply</button>
              )}
              {isAuthor && !isEditing && (
                <>
                  <button onClick={() => handleStartEditComment(commentId, comment.content)} className="text-[12px] text-[var(--apple-secondary-label)] hover:text-[var(--apple-system-blue)] apple-transition font-medium px-1">Edit</button>
                  <button onClick={() => setDeleteConfirmId(commentId)} className="text-[12px] text-[var(--apple-secondary-label)] hover:text-[var(--apple-system-red)] apple-transition font-medium px-1">Delete</button>
                </>
              )}
            </div>
          </div>
        </div>
        {isReplying && (
          <div className="mt-3 ml-11 space-y-2">
            <div ref={replyComposerRef} className="relative space-y-2">
              <Textarea
                ref={replyEditorRef}
                value={replyContent}
                onChange={(e) => handleComposerInput(e.target.value, 'reply', e.target)}
                onKeyDown={(e) => handleComposerKeyDown(e, 'reply')}
                onKeyUp={() => scheduleSuggestionPositionUpdate('reply')}
                onClick={() => scheduleSuggestionPositionUpdate('reply')}
                onScroll={(e) => {
                  setComposerScrollTop(prev => ({ ...prev, reply: e.currentTarget.scrollTop }))
                  scheduleSuggestionPositionUpdate('reply')
                }}
                onBlur={() => handleComposerBlur('reply')}
                rows={3}
                placeholder="Write a reply…"
                className={`text-[14px] rounded-[var(--apple-radius-md)] border-[var(--apple-separator)] ${suggestionMode && suggestionComposer === 'reply' ? 'ring-2 ring-[var(--apple-system-blue)]/20 border-[var(--apple-system-blue)]/40' : ''}`}
              />
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div role="button" aria-label="Attachments"
                        className="h-8 w-8 inline-flex items-center justify-center rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] hover:bg-[var(--apple-tertiary-fill)] cursor-pointer apple-transition"
                        onClick={() => replyFileInputRef.current?.click()}>
                        <Paperclip className="h-4 w-4 text-[var(--apple-secondary-label)]" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top">Attachments</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <input ref={replyFileInputRef} type="file" className="hidden" onChange={(e) => handleFileInputChange(e, true)} />
                {replyAttachments.map((att, idx) => (
                  <span key={`${att.url}-${idx}`} className="inline-flex items-center gap-1 rounded-full border border-[var(--apple-separator)] px-2.5 py-1 text-[12px] text-[var(--apple-secondary-label)]">
                    <a className="text-[var(--apple-system-blue)] hover:underline" href={att.url} target="_blank" rel="noreferrer">{att.name}</a>
                  </span>
                ))}
              </div>
              {renderSuggestionMenu('reply')}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSubmitReply} disabled={!replyContent.trim() || commentSubmitting}
                className="rounded-full h-8 px-4 text-[13px] bg-[var(--apple-system-blue)] text-white hover:opacity-90">Reply</Button>
              <Button size="sm" variant="outline" onClick={handleCancelReply}
                className="rounded-full h-8 px-4 text-[13px] border-[var(--apple-separator)]">Cancel</Button>
            </div>
          </div>
        )}
        {comment.children && comment.children.length > 0 && (
          <div className="mt-3 space-y-2">
            {comment.children.map(child => renderCommentNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }, [
    commentSubmitting,
    currentUserId,
    editingCommentId,
    editingContent,
    handleCancelEdit,
    handleCancelReply,
    handleComposerBlur,
    handleComposerInput,
    handleComposerKeyDown,
    handleDeleteComment,
    handleSaveEdit,
    handleStartEditComment,
    handleStartReply,
    handleSubmitReply,
    renderSuggestionMenu,
    replyAttachments,
    replyContent,
    replyTargetId,
    router,
    scheduleSuggestionPositionUpdate,
    suggestionComposer,
    suggestionMode,
    suggestionQuery
  ])

  // Pagination logic for comments
  const paginatedComments = useMemo(() => {
    const startIndex = (commentsCurrentPage - 1) * commentsPageSize
    const endIndex = startIndex + commentsPageSize
    return commentTree.slice(startIndex, endIndex)
  }, [commentTree, commentsCurrentPage, commentsPageSize])

  const commentsTotalPages = Math.ceil(commentTree.length / commentsPageSize)

  const renderComments = useMemo(() => {
    if (!commentTree.length) {
      return <p className="text-sm text-muted-foreground">No comments yet.</p>
    }
    return (
      <div className="space-y-3">
        {paginatedComments.map((c) => renderCommentNode(c))}
      </div>
    )
  }, [paginatedComments, renderCommentNode])

  const deleteTargetComment = useMemo(() => {
    if (!deleteConfirmId || !task?.comments) return null
    return task.comments.find(c => (c._id || '').toString() === deleteConfirmId) || null
  }, [deleteConfirmId, task?.comments])


  const getStatusColor = (status: string) => {
    switch (status) {
      case 'backlog': return 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800'
      case 'todo': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
      case 'in_progress': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800'
      case 'review': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 hover:bg-yellow-200 dark:hover:bg-yellow-800'
      case 'testing': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 hover:bg-purple-200 dark:hover:bg-purple-800'
      case 'done': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-800'
      case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-200 dark:hover:bg-red-800'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'backlog': return <Layers className="h-4 w-4" />
      case 'todo': return <Target className="h-4 w-4" />
      case 'in_progress': return <Play className="h-4 w-4" />
      case 'review': return <AlertTriangle className="h-4 w-4" />
      case 'testing': return <Zap className="h-4 w-4" />
      case 'done': return <CheckCircle className="h-4 w-4" />
      case 'cancelled': return <XCircle className="h-4 w-4" />
      default: return <Target className="h-4 w-4" />
    }
  }

  const formatDateTime = (value?: string) => {
    if (!value) return 'Not set'
    const date = new Date(value)
    return formatDateTimeSafe(date)
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

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'bug': return <Bug className="h-8 w-8" />
      case 'feature': return <Layers className="h-8 w-8" />
      case 'improvement': return <Wrench className="h-8 w-8" />
      case 'task': return <Target className="h-8 w-8" />
      case 'subtask': return <Layers className="h-8 w-8" />
      default: return <Target className="h-8 w-8" />
    }
  }

  const getCategoryTitle = (categoryKey?: string): string | null => {
    if (!categoryKey) return null
    return categoryMap[categoryKey] || categoryKey
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-[var(--apple-system-blue)]" />
            <p className="text-[15px] text-[var(--apple-secondary-label)]">Loading task…</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (error || !task) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <XCircle className="h-12 w-12 text-[var(--apple-system-red)]" />
          <h2 className="text-[22px] font-semibold text-[var(--apple-label)]">{error || 'Task not found'}</h2>
          <Button
            onClick={() => router.back()}
            className="rounded-full bg-[var(--apple-system-blue)] text-white text-[15px] font-semibold px-5 h-9 hover:opacity-90 apple-transition"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </MainLayout>
    )
  }

  const isCreator = (t: Task) => {
    const creatorId = (t as any)?.createdBy?._id || (t as any)?.createdBy?.id
    return creatorId && currentUserId && creatorId.toString() === currentUserId.toString()
  }

  const editAllowed = hasPermission(Permission.TASK_EDIT_ALL) || isCreator(task)
  const deleteAllowed = hasPermission(Permission.TASK_DELETE_ALL)

  const attachmentListItems = (task.attachments || []).map(attachment => ({
    name: attachment.name,
    url: attachment.url,
    size: attachment.size,
    type: attachment.type,
    uploadedAt: attachment.uploadedAt || new Date().toISOString(),
    uploadedBy:
      attachment.uploadedBy
        ? `${attachment.uploadedBy.firstName || ''} ${attachment.uploadedBy.lastName || ''}`.trim() ||
        attachment.uploadedBy.email ||
        'Unknown'
        : 'Unknown'
  }))

  const isActiveTimerLoading = activeTimer === undefined
  const hasActiveTimer = Boolean(activeTimer)
  const activeTimerTaskId = (() => {
    const candidate = (activeTimer as any)?.task
    if (!candidate) return null
    if (typeof candidate === 'string') return candidate
    if (typeof candidate === 'object') {
      if ((candidate as any)._id) return (candidate as any)._id.toString()
      if ((candidate as any).id) return (candidate as any).id.toString()
    }
    return candidate?.toString?.() ?? null
  })()
  const isAssignee = task.assignedTo?.some(assignee => assignee.user?._id === currentUserId) || false

  const isRelevantActiveTimer = Boolean(
    hasActiveTimer &&
    task?._id &&
    activeTimerTaskId &&
    activeTimerTaskId === task._id.toString()
  )

  const STATUS_BADGE: Record<string, { bg: string; text: string; dot: string; border: string }> = {
    backlog:     { bg: 'bg-slate-50 dark:bg-slate-950/30',    text: 'text-slate-600 dark:text-slate-400',    dot: 'bg-slate-400',    border: 'border-slate-200 dark:border-slate-800' },
    todo:        { bg: 'bg-gray-50 dark:bg-gray-900/40',      text: 'text-gray-500 dark:text-gray-400',      dot: 'bg-gray-400',     border: 'border-gray-200 dark:border-gray-700' },
    in_progress: { bg: 'bg-blue-50 dark:bg-blue-950/30',      text: 'text-blue-600 dark:text-blue-400',      dot: 'bg-blue-500',     border: 'border-blue-200 dark:border-blue-800' },
    review:      { bg: 'bg-yellow-50 dark:bg-yellow-950/30',  text: 'text-yellow-600 dark:text-yellow-400',  dot: 'bg-yellow-500',   border: 'border-yellow-200 dark:border-yellow-800' },
    testing:     { bg: 'bg-purple-50 dark:bg-purple-950/30',  text: 'text-purple-600 dark:text-purple-400',  dot: 'bg-purple-500',   border: 'border-purple-200 dark:border-purple-800' },
    done:        { bg: 'bg-emerald-50 dark:bg-emerald-950/30',text: 'text-emerald-600 dark:text-emerald-400',dot: 'bg-emerald-500',  border: 'border-emerald-200 dark:border-emerald-800' },
    cancelled:   { bg: 'bg-red-50 dark:bg-red-950/30',        text: 'text-red-600 dark:text-red-400',        dot: 'bg-red-500',      border: 'border-red-200 dark:border-red-800' },
  }
  const PRIORITY_BADGE: Record<string, { bg: string; text: string; dot: string; border: string }> = {
    low:      { bg: 'bg-gray-50 dark:bg-gray-900/40',      text: 'text-gray-500 dark:text-gray-400',      dot: 'bg-gray-400',    border: 'border-gray-200 dark:border-gray-700' },
    medium:   { bg: 'bg-blue-50 dark:bg-blue-950/30',      text: 'text-blue-600 dark:text-blue-400',      dot: 'bg-blue-500',    border: 'border-blue-200 dark:border-blue-800' },
    high:     { bg: 'bg-orange-50 dark:bg-orange-950/30',  text: 'text-orange-600 dark:text-orange-400',  dot: 'bg-orange-500',  border: 'border-orange-200 dark:border-orange-800' },
    critical: { bg: 'bg-red-50 dark:bg-red-950/30',        text: 'text-red-600 dark:text-red-400',        dot: 'bg-red-500',     border: 'border-red-200 dark:border-red-800' },
  }
  const TYPE_BADGE: Record<string, { bg: string; text: string; dot: string; border: string }> = {
    bug:        { bg: 'bg-red-50 dark:bg-red-950/30',         text: 'text-red-600 dark:text-red-400',         dot: 'bg-red-500',      border: 'border-red-200 dark:border-red-800' },
    feature:    { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500',  border: 'border-emerald-200 dark:border-emerald-800' },
    improvement:{ bg: 'bg-blue-50 dark:bg-blue-950/30',       text: 'text-blue-600 dark:text-blue-400',       dot: 'bg-blue-500',     border: 'border-blue-200 dark:border-blue-800' },
    task:       { bg: 'bg-gray-50 dark:bg-gray-900/40',       text: 'text-gray-500 dark:text-gray-400',       dot: 'bg-gray-400',     border: 'border-gray-200 dark:border-gray-700' },
    subtask:    { bg: 'bg-purple-50 dark:bg-purple-950/30',   text: 'text-purple-600 dark:text-purple-400',   dot: 'bg-purple-500',   border: 'border-purple-200 dark:border-purple-800' },
  }

  const renderStatusChip = (cfg: Record<string, { bg: string; text: string; dot: string; border: string }>, key: string, label: string) => {
    const c = cfg[key] ?? cfg['task'] ?? { bg: 'bg-gray-50', text: 'text-gray-500', dot: 'bg-gray-400', border: 'border-gray-200' }
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[12px] font-medium ${c.bg} ${c.text} ${c.border}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
        {label}
      </span>
    )
  }

  const renderInteractiveStatusBadge = (
    currentStatus: string,
    onSelect: (newStatus: string) => void,
    disabled?: boolean
  ) => {
    const cfg = STATUS_BADGE[currentStatus] ?? STATUS_BADGE['todo'] ?? { bg: 'bg-gray-50', text: 'text-gray-500', dot: 'bg-gray-400', border: 'border-gray-200' }
    const label = formatToTitleCase(currentStatus)

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[12px] font-medium transition-all cursor-pointer hover:opacity-85 focus:outline-none disabled:opacity-50 ${cfg.bg} ${cfg.text} ${cfg.border}`}
            title="Click to change status"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
            <span>{label}</span>
            <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44 z-[10050]">
          <DropdownMenuLabel className="text-xs text-muted-foreground font-medium">Change Status</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {SUBTASK_STATUS_OPTIONS.map((opt) => {
            const optCfg = STATUS_BADGE[opt.value]
            const isSelected = opt.value === currentStatus
            return (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => onSelect(opt.value)}
                className="flex items-center justify-between cursor-pointer py-1.5 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${optCfg?.dot || 'bg-gray-400'}`} />
                  <span className={isSelected ? 'font-semibold' : ''}>{opt.label}</span>
                </div>
                {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const renderInteractiveAssigneeBadge = (
    assignedTo: any,
    onSelect: (userId: string | null) => void,
    disabled?: boolean
  ) => {
    const assigneeObj = typeof assignedTo === 'object' && assignedTo !== null ? assignedTo : null
    const currentId = assigneeObj?._id ? String(assigneeObj._id) : (typeof assignedTo === 'string' ? assignedTo : '')

    const initials = assigneeObj
      ? ((assigneeObj.firstName?.[0] || '') + (assigneeObj.lastName?.[0] || '')).toUpperCase() || 'U'
      : ''

    const displayName = assigneeObj
      ? `${assigneeObj.firstName || ''} ${assigneeObj.lastName || ''}`.trim() || assigneeObj.email || 'Assigned'
      : null

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {displayName ? (
            <button
              type="button"
              disabled={disabled}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--apple-secondary-fill)] text-[12px] font-medium text-[var(--apple-secondary-label)] hover:text-foreground hover:bg-[var(--apple-tertiary-fill)] transition-colors cursor-pointer focus:outline-none disabled:opacity-50"
              title="Click to change assignee"
            >
              <span className="h-4 w-4 rounded-full bg-[var(--apple-card-gradient)] text-white flex items-center justify-center text-[9px] font-bold">
                {initials}
              </span>
              <span className="truncate max-w-[130px]">{displayName}</span>
              <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
            </button>
          ) : (
            <button
              type="button"
              disabled={disabled}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-[var(--apple-separator)] text-[12px] text-[var(--apple-tertiary-label)] hover:text-[var(--apple-label)] hover:border-[var(--apple-secondary-label)] transition-colors cursor-pointer focus:outline-none disabled:opacity-50"
              title="Assign team member"
            >
              <UserPlus className="h-3 w-3" />
              <span>Assign</span>
              <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
            </button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 z-[10050] max-h-72 overflow-y-auto">
          <DropdownMenuLabel className="text-xs text-muted-foreground font-medium">Assign To</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {allAssignableUsers.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No team members available</div>
          ) : (
            allAssignableUsers.map((member) => {
              const isSelected = member._id === currentId
              const mInitials = ((member.firstName?.[0] || '') + (member.lastName?.[0] || '')).toUpperCase() || 'U'
              const mName = `${member.firstName} ${member.lastName}`.trim() || member.email

              return (
                <DropdownMenuItem
                  key={member._id}
                  onClick={() => onSelect(member._id)}
                  className="flex items-center justify-between cursor-pointer py-1.5 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                      {mInitials}
                    </div>
                    <div className="truncate">
                      <p className={`truncate leading-none ${isSelected ? 'font-semibold' : ''}`}>{mName}</p>
                      {member.email && (
                        <p className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">{member.email}</p>
                      )}
                    </div>
                  </div>
                  {isSelected && <Check className="h-3.5 w-3.5 text-primary ml-2 flex-shrink-0" />}
                </DropdownMenuItem>
              )
            })
          )}
          {currentId && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onSelect(null)}
                className="text-xs text-destructive hover:text-destructive cursor-pointer py-1.5"
              >
                <Trash2 className="h-3 w-3 mr-2" />
                <span>Unassign</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6 overflow-x-hidden animate-in fade-in-0 duration-300">

        {/* ── Page Header ─────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.back()}
              className="inline-flex items-center gap-1.5 text-[14px] text-[var(--apple-secondary-label)] hover:text-[var(--apple-system-blue)] apple-transition font-medium"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
            {/* Title row: icon > task number > title — all inline */}
            <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
              <span className="flex-shrink-0" style={{ color: 'var(--apple-card-gradient)' }}>
                {getTypeIcon(task.type)}
              </span>
              <span className="font-apple-mono text-[12px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 text-white" style={{ background: 'var(--apple-card-gradient)' }}>{task.displayId}</span>
              <h1 className="text-[22px] sm:text-[26px] font-bold tracking-tight text-[var(--apple-label)] leading-tight min-w-0">{task.title}</h1>
            </div>

            {/* Action buttons — timer row + edit/delete row */}
            <div className="flex flex-col gap-2 flex-shrink-0">
              {/* Timer controls (only when relevant) */}
              {isAssignee && (
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {isRelevantActiveTimer && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[13px] font-apple-mono text-[var(--apple-label)]">
                      <Clock className="h-3.5 w-3.5" style={{ color: 'var(--apple-card-gradient)' }} />
                      {activeTimerDisplay}
                    </div>
                  )}
                  {isRelevantActiveTimer && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button onClick={handlePauseResumeTimer} disabled={stoppingTimer || !!timerActionLoading}
                            className="h-9 w-9 rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] flex items-center justify-center text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)] hover:bg-[var(--apple-tertiary-fill)] apple-transition disabled:opacity-40">
                            {Boolean((activeTimer as any)?.isPaused || (activeTimer as any)?.pausedAt) ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{Boolean((activeTimer as any)?.isPaused || (activeTimer as any)?.pausedAt) ? 'Resume' : 'Pause'}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {isRelevantActiveTimer && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button onClick={() => setShowStopTimerConfirmModal(true)} disabled={stoppingTimer || !!timerActionLoading}
                            className="h-9 w-9 rounded-full border border-[var(--apple-system-red)]/40 bg-[var(--apple-system-red)]/10 flex items-center justify-center text-[var(--apple-system-red)] hover:bg-[var(--apple-system-red)]/20 apple-transition disabled:opacity-40">
                            <XCircle className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Stop Timer</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <button onClick={() => setShowStartTimerModal(true)}
                    disabled={isActiveTimerLoading || hasActiveTimer || !currentUserId || !currentOrganizationId || !task.project?._id || !task._id}
                    className="inline-flex items-center gap-1.5 rounded-full text-white text-[13px] font-semibold px-3 h-9 hover:opacity-90 apple-transition disabled:opacity-40"
                    style={{ background: 'var(--apple-card-gradient)' }}>
                    <Play className="h-3.5 w-3.5" />
                    Start Timer
                  </button>
                </div>
              )}

              {/* Edit + Delete — separate row, full-width on mobile */}
              <div className="flex items-center gap-2">
                <button onClick={() => editAllowed && router.push(`/tasks/${taskId}/edit`)} disabled={!editAllowed}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-full text-white text-[13px] font-semibold px-4 h-9 hover:opacity-90 apple-transition disabled:opacity-40"
                  style={{ background: 'var(--apple-card-gradient)' }}>
                  <Edit className="h-3.5 w-3.5" />
                  Edit Task
                </button>
                <button onClick={() => deleteAllowed && setShowDeleteConfirmModal(true)} disabled={!deleteAllowed}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--apple-system-red)]/40 bg-[var(--apple-system-red)]/10 text-[var(--apple-system-red)] text-[13px] font-medium px-4 h-9 hover:bg-[var(--apple-system-red)]/20 apple-transition disabled:opacity-40">
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Main Grid ───────────────────────────────────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-3">

          {/* Left column — main content */}
          <div className="lg:col-span-2 space-y-5">

            {/* Description */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                <h2 className="text-[15px] font-semibold text-[var(--apple-label)]">Description</h2>
              </div>
              <div className="px-5 py-4">
                {task.description ? (() => {
                  const isHtml = /<(p|br|div|ul|ol|li|strong|em|u|h[1-6]|img|a)(\s|>|\/)/i.test(task.description)
                  return isHtml
                    ? <div className="task-description max-w-none" dangerouslySetInnerHTML={{ __html: task.description }} />
                    : <div className="task-description text-[15px] text-[var(--apple-label)] whitespace-pre-line leading-relaxed">{task.description}</div>
                })() : (
                  <p className="text-[15px] text-[var(--apple-tertiary-label)]">No description provided.</p>
                )}
              </div>
            </div>

            {/* Related entities */}
            {hasRelatedEntities && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sprintDetails?._id && (
                  <div
                    role="button"
                    tabIndex={0}
                    className="text-left rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-4 hover:shadow-[0_4px_16px_rgba(0,0,0,0.09)] hover:-translate-y-0.5 apple-transition cursor-pointer"
                    onClick={() => handleRelatedNavigation(`/sprints/${sprintDetails._id}`)}
                    onKeyDown={(event) => handleRelatedKeyDown(event, `/sprints/${sprintDetails._id}`)}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="h-4 w-4 text-[var(--apple-system-blue)]" />
                      <span className="apple-section-label text-[var(--apple-tertiary-label)]">Sprint</span>
                    </div>
                    <p className="text-[14px] font-semibold text-[var(--apple-label)] truncate">{sprintDetails.name || '—'}</p>
                    {sprintDetails.status && <p className="text-[12px] text-[var(--apple-secondary-label)] mt-0.5">{formatToTitleCase(sprintDetails.status)}</p>}
                    {(sprintDetails.startDate || sprintDetails.endDate) && (
                      <p className="text-[12px] text-[var(--apple-tertiary-label)] mt-1">
                        {sprintDetails.startDate ? formatDate(sprintDetails.startDate) : 'TBD'} – {sprintDetails.endDate ? formatDate(sprintDetails.endDate) : 'TBD'}
                      </p>
                    )}
                  </div>
                )}
                {storyDetails?._id && (
                  <div
                    role="button"
                    tabIndex={0}
                    className="text-left rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-4 hover:shadow-[0_4px_16px_rgba(0,0,0,0.09)] hover:-translate-y-0.5 apple-transition cursor-pointer"
                    onClick={() => handleRelatedNavigation(`/stories/${storyDetails._id}`)}
                    onKeyDown={(event) => handleRelatedKeyDown(event, `/stories/${storyDetails._id}`)}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Layers className="h-4 w-4 text-[var(--apple-system-purple)]" />
                      <span className="apple-section-label text-[var(--apple-tertiary-label)]">User Story</span>
                    </div>
                    <p className="text-[14px] font-semibold text-[var(--apple-label)] truncate">{storyDetails.title || '—'}</p>
                    {storyDetails.status && <p className="text-[12px] text-[var(--apple-secondary-label)] mt-0.5">{formatToTitleCase(storyDetails.status)}</p>}
                  </div>
                )}
                {epicDetails?._id && (
                  <div
                    role="button"
                    tabIndex={0}
                    className="text-left rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-4 hover:shadow-[0_4px_16px_rgba(0,0,0,0.09)] hover:-translate-y-0.5 apple-transition cursor-pointer"
                    onClick={() => handleRelatedNavigation(`/epics/${epicDetails._id}`)}
                    onKeyDown={(event) => handleRelatedKeyDown(event, `/epics/${epicDetails._id}`)}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Star className="h-4 w-4 text-[var(--apple-system-orange)]" />
                      <span className="apple-section-label text-[var(--apple-tertiary-label)]">Epic</span>
                    </div>
                    <p className="text-[14px] font-semibold text-[var(--apple-label)] truncate">{epicDetails.title || '—'}</p>
                    {epicDetails.status && <p className="text-[12px] text-[var(--apple-secondary-label)] mt-0.5">{formatToTitleCase(epicDetails.status)}</p>}
                  </div>
                )}
              </div>
            )}

            {/* Subtasks */}
            {(() => {
              const subtasksList = task.subtasks || []
              const allSubtasksCount = subtasksList.reduce((acc, s) => acc + 1 + (s.subtasks?.length || 0), 0)
              const allDoneCount = subtasksList.reduce((acc, s) => {
                const sDone = (s.isCompleted || s.status === 'done') ? 1 : 0
                const nestedDone = (s.subtasks || []).filter(n => n.isCompleted || n.status === 'done').length
                return acc + sDone + nestedDone
              }, 0)
              const pct = allSubtasksCount > 0 ? Math.round((allDoneCount / allSubtasksCount) * 100) : 0

              return (
                <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
                  <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h2 className="text-[15px] font-semibold text-[var(--apple-label)]">Subtasks</h2>
                        {allSubtasksCount > 0 && (
                          <span className="text-[13px] text-[var(--apple-secondary-label)] font-apple-mono">
                            {allDoneCount}/{allSubtasksCount}
                          </span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAddSubtask(!showAddSubtask)}
                        className="h-7 px-2 text-[12px] font-medium text-[var(--apple-system-blue)] hover:bg-[var(--apple-system-blue)]/10"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add Subtask
                      </Button>
                    </div>
                    {allSubtasksCount > 0 && (
                      <div className="mt-2.5 h-[6px] rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            background: 'linear-gradient(90deg,#34C759 0%,#30D158 100%)',
                            boxShadow: pct > 2 ? '0 0 6px rgba(52,199,89,0.40)' : 'none'
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Inline Add Subtask Form */}
                  {showAddSubtask && (
                    <div className="p-4 bg-muted/30 border-b border-[var(--apple-separator)] space-y-3">
                      <div className="font-medium text-xs text-muted-foreground uppercase tracking-wider">
                        New Subtask
                      </div>

                      {/* Row 1: Title & Assignee */}
                      <div className="grid gap-2 sm:grid-cols-12">
                        <div className="sm:col-span-8">
                          <label className="text-[11px] font-medium text-muted-foreground block mb-1">Title *</label>
                          <Input
                            placeholder="What needs to be done?"
                            value={newSubtaskTitle}
                            onChange={(e) => setNewSubtaskTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddSubtask()
                            }}
                            className="h-9 text-sm"
                            autoFocus
                          />
                        </div>
                        <div className="sm:col-span-4">
                          <label className="text-[11px] font-medium text-muted-foreground block mb-1">Assignee</label>
                          <Select
                            value={newSubtaskAssignee || 'unassigned'}
                            onValueChange={(val) => setNewSubtaskAssignee(val === 'unassigned' ? '' : val)}
                          >
                            <SelectTrigger className="h-9 rounded-lg border-input bg-background text-xs font-normal text-foreground focus:ring-1 focus:ring-primary shadow-xs">
                              <SelectValue placeholder="Unassigned" />
                            </SelectTrigger>
                            <SelectContent className="z-[10050] max-h-60 overflow-y-auto thin-scrollbar w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)]">
                              <SelectItem value="unassigned">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                                    <User className="w-2.5 h-2.5" />
                                  </div>
                                  <span className="truncate">Unassigned</span>
                                </div>
                              </SelectItem>
                              {allAssignableUsers.map((u) => {
                                const initials = ((u.firstName?.[0] || '') + (u.lastName?.[0] || '')).toUpperCase() || 'U'
                                return (
                                  <SelectItem key={u._id} value={u._id}>
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-[8px] font-bold shrink-0">
                                        {initials}
                                      </div>
                                      <span className="font-medium truncate">{u.firstName} {u.lastName}</span>
                                      <span className="text-[10px] text-muted-foreground truncate">({u.email})</span>
                                    </div>
                                  </SelectItem>
                                )
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Row 2: Type, Priority, Due Date, Est. Hours */}
                      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
                        <div>
                          <label className="text-[11px] font-medium text-muted-foreground block mb-1">Type</label>
                          <Select
                            value={newSubtaskType}
                            onValueChange={(val) => setNewSubtaskType(val)}
                          >
                            <SelectTrigger className="h-8 rounded-lg border-input bg-background text-xs font-normal text-foreground focus:ring-1 focus:ring-primary shadow-xs">
                              <SelectValue placeholder="Subtask" />
                            </SelectTrigger>
                            <SelectContent className="z-[10050] w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)]">
                              <SelectItem value="subtask">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
                                  <span className="truncate">Subtask</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="task">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
                                  <span className="truncate">Task</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="bug">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                                  <span className="truncate">Bug</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="feature">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                  <span className="truncate">Feature</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="improvement">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                                  <span className="truncate">Improvement</span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-[11px] font-medium text-muted-foreground block mb-1">Priority</label>
                          <Select
                            value={newSubtaskPriority}
                            onValueChange={(val) => setNewSubtaskPriority(val)}
                          >
                            <SelectTrigger className="h-8 rounded-lg border-input bg-background text-xs font-normal text-foreground focus:ring-1 focus:ring-primary shadow-xs">
                              <SelectValue placeholder="Medium" />
                            </SelectTrigger>
                            <SelectContent className="z-[10050] w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)]">
                              <SelectItem value="low">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-2 h-2 rounded-full bg-gray-400 shrink-0" />
                                  <span className="truncate">Low</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="medium">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                                  <span className="truncate">Medium</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="high">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                                  <span className="truncate">High</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="critical">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                                  <span className="truncate">Critical</span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-[11px] font-medium text-muted-foreground block mb-1">Due Date</label>
                          <Popover open={dueDateOpen} onOpenChange={setDueDateOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                type="button"
                                className={cn(
                                  "h-8 w-full justify-between rounded-lg border-input bg-background px-2.5 text-xs font-normal shadow-xs hover:bg-accent/40 focus:ring-1 focus:ring-primary",
                                  !newSubtaskDueDate ? "text-muted-foreground" : "text-foreground font-medium"
                                )}
                              >
                                <span className="truncate">
                                  {(() => {
                                    if (!newSubtaskDueDate) return 'mm/dd/yyyy'
                                    const d = new Date(newSubtaskDueDate.includes('T') ? newSubtaskDueDate : `${newSubtaskDueDate}T00:00:00`)
                                    return !isNaN(d.getTime()) ? format(d, 'MMM d, yyyy') : 'mm/dd/yyyy'
                                  })()}
                                </span>
                                {newSubtaskDueDate ? (
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    className="h-4 w-4 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 ml-1.5 transition-colors cursor-pointer"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setNewSubtaskDueDate('')
                                    }}
                                    title="Clear date"
                                  >
                                    <X className="h-3 w-3" />
                                  </span>
                                ) : (
                                  <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1.5 opacity-70" />
                                )}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-[var(--radix-popover-trigger-width)] min-w-[var(--radix-popover-trigger-width)] max-w-[var(--radix-popover-trigger-width)] p-0 z-[10050] bg-popover rounded-xl border border-border shadow-lg overflow-hidden"
                              align="start"
                            >
                              <CalendarUI
                                mode="single"
                                selected={(() => {
                                  if (!newSubtaskDueDate) return undefined
                                  const d = new Date(newSubtaskDueDate.includes('T') ? newSubtaskDueDate : `${newSubtaskDueDate}T00:00:00`)
                                  return !isNaN(d.getTime()) ? d : undefined
                                })()}
                                onSelect={(date) => {
                                  if (date) {
                                    setNewSubtaskDueDate(format(date, 'yyyy-MM-dd'))
                                  } else {
                                    setNewSubtaskDueDate('')
                                  }
                                  setDueDateOpen(false)
                                }}
                                disabled={(date) => date < startOfDay(new Date())}
                                initialFocus
                                className="p-2 w-full"
                                classNames={{
                                  months: "w-full",
                                  month: "w-full space-y-2",
                                  caption: "flex justify-center pt-0.5 relative items-center mb-1",
                                  caption_label: "text-xs font-semibold",
                                  nav: "space-x-1 flex items-center",
                                  nav_button: "h-6 w-6 bg-transparent p-0 opacity-70 hover:opacity-100 flex items-center justify-center rounded-md border border-input",
                                  nav_button_previous: "absolute left-0",
                                  nav_button_next: "absolute right-0",
                                  table: "w-full border-collapse",
                                  head_row: "flex w-full justify-between items-center",
                                  head_cell: "text-muted-foreground rounded-md flex-1 text-center font-normal text-[10px] sm:text-[11px] py-0.5",
                                  row: "flex w-full justify-between items-center mt-1",
                                  cell: "flex-1 text-center text-xs p-0 relative flex items-center justify-center",
                                  day: "h-6 sm:h-7 w-full max-w-[28px] p-0 text-[11px] sm:text-xs font-normal aria-selected:opacity-100 rounded-md flex items-center justify-center hover:bg-accent hover:text-accent-foreground transition-colors",
                                  day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground font-semibold",
                                  day_today: "bg-accent text-accent-foreground font-medium",
                                  day_disabled: "text-muted-foreground/30 opacity-30 cursor-not-allowed pointer-events-none hover:bg-transparent",
                                }}
                              />
                              <div className="flex items-center justify-between border-t border-border px-2.5 py-1.5 text-xs bg-muted/20">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                                  onClick={() => {
                                    setNewSubtaskDueDate('')
                                    setDueDateOpen(false)
                                  }}
                                >
                                  Clear
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[11px] text-primary font-medium hover:text-primary hover:bg-primary/10"
                                  onClick={() => {
                                    setNewSubtaskDueDate(format(new Date(), 'yyyy-MM-dd'))
                                    setDueDateOpen(false)
                                  }}
                                >
                                  Today
                                </Button>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div>
                          <label className="text-[11px] font-medium text-muted-foreground block mb-1">Est. Hours</label>
                          <Input
                            type="number"
                            min="0"
                            step="0.5"
                            placeholder="0"
                            value={newSubtaskEstimatedHours}
                            onChange={(e) => setNewSubtaskEstimatedHours(e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>

                      {/* Row 3: User Story & Description */}
                      <div className="grid gap-2 sm:grid-cols-12">
                        <div className="sm:col-span-5">
                          <label className="text-[11px] font-medium text-muted-foreground block mb-1">User Story</label>
                          <Select
                            value={newSubtaskStory || 'none'}
                            onValueChange={(val) => setNewSubtaskStory(val === 'none' ? '' : val)}
                          >
                            <SelectTrigger className="h-8 rounded-lg border-input bg-background text-xs font-normal text-foreground focus:ring-1 focus:ring-primary shadow-xs">
                              <SelectValue placeholder="None" />
                            </SelectTrigger>
                            <SelectContent className="z-[10050] max-h-60 overflow-y-auto thin-scrollbar w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)]">
                              <SelectItem value="none">
                                <div className="flex items-center gap-2 text-muted-foreground min-w-0">
                                  <span className="truncate">None</span>
                                </div>
                              </SelectItem>
                              {projectStories.map((s) => (
                                <SelectItem key={s._id} value={s._id}>
                                  <div className="flex items-center gap-2 min-w-0">
                                    <BookOpen className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                                    <span className="truncate">{s.title}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="sm:col-span-7">
                          <label className="text-[11px] font-medium text-muted-foreground block mb-1">Description (optional)</label>
                          <Input
                            placeholder="Optional notes or details..."
                            value={newSubtaskDescription}
                            onChange={(e) => setNewSubtaskDescription(e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>

                      {/* Buttons */}
                      <div className="flex justify-end gap-2 pt-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setShowAddSubtask(false)
                            setNewSubtaskTitle('')
                            setNewSubtaskAssignee('')
                            setNewSubtaskType('subtask')
                            setNewSubtaskPriority('medium')
                            setNewSubtaskDueDate('')
                            setDueDateOpen(false)
                            setNewSubtaskEstimatedHours('')
                            setNewSubtaskStory('')
                            setNewSubtaskDescription('')
                          }}
                          className="h-8 text-xs"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleAddSubtask}
                          disabled={!newSubtaskTitle.trim() || isAddingSubtask}
                          className="h-8 text-xs"
                        >
                          {isAddingSubtask ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                          Add Subtask
                        </Button>
                      </div>
                    </div>
                  )}

                  {subtasksList.length === 0 ? (
                    <div className="px-5 py-8 text-center text-muted-foreground">
                      <p className="text-sm">No subtasks yet.</p>
                      {!showAddSubtask && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowAddSubtask(true)}
                          className="mt-3 text-xs"
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add First Subtask
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="divide-y divide-[var(--apple-separator)]">
                      {subtasksList.map((subtask, index) => {
                        const isSubtaskDone = subtask.isCompleted || subtask.status === 'done'

                        return (
                          <div
                            key={subtask._id || index}
                            className="px-5 py-3 space-y-2 hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <button
                                type="button"
                                disabled={updatingSubtask}
                                onClick={() => handleToggleSubtask(index)}
                                className="mt-1 flex-shrink-0 text-muted-foreground hover:text-foreground focus:outline-none disabled:opacity-50 transition-colors cursor-pointer"
                                title={isSubtaskDone ? 'Mark as incomplete' : 'Mark as complete'}
                              >
                                {isSubtaskDone ? (
                                  <CheckCircle className="h-4 w-4 text-[var(--apple-system-green)]" />
                                ) : (
                                  <Circle className="h-4 w-4 text-[var(--apple-tertiary-label)] hover:text-foreground" />
                                )}
                              </button>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span
                                    className={`text-[14px] font-medium leading-tight ${
                                      isSubtaskDone
                                        ? 'line-through text-[var(--apple-tertiary-label)]'
                                        : 'text-[var(--apple-label)]'
                                    }`}
                                  >
                                    {subtask.title}
                                  </span>

                                  {/* Interactive Status Dropdown */}
                                  {renderInteractiveStatusBadge(
                                    subtask.status,
                                    (newStatus) => handleUpdateSubtaskStatus(index, newStatus),
                                    updatingSubtask
                                  )}

                                  {/* Interactive Assignee Dropdown */}
                                  {renderInteractiveAssigneeBadge(
                                    subtask.assignedTo,
                                    (newAssigneeId) => handleUpdateSubtaskAssignee(index, newAssigneeId),
                                    updatingSubtask
                                  )}

                                  {/* Type Badge */}
                                  {subtask.type && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground capitalize">
                                      {subtask.type}
                                    </span>
                                  )}

                                  {/* Priority Badge */}
                                  {subtask.priority && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground capitalize">
                                      <span className={`w-1.5 h-1.5 rounded-full ${
                                        subtask.priority === 'critical' ? 'bg-red-500' :
                                        subtask.priority === 'high' ? 'bg-orange-500' :
                                        subtask.priority === 'medium' ? 'bg-amber-500' : 'bg-blue-500'
                                      }`} />
                                      {subtask.priority}
                                    </span>
                                  )}

                                  {/* Due Date Badge */}
                                  {subtask.dueDate && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground">
                                      <Calendar className="h-3 w-3" />
                                      {new Date(subtask.dueDate).toLocaleDateString()}
                                    </span>
                                  )}

                                  {/* Estimated Hours Badge */}
                                  {subtask.estimatedHours !== undefined && subtask.estimatedHours !== null && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground">
                                      <Clock className="h-3 w-3" />
                                      {subtask.estimatedHours}h
                                    </span>
                                  )}

                                  {/* User Story Badge */}
                                  {subtask.story && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300">
                                      <BookOpen className="h-3 w-3" />
                                      {typeof subtask.story === 'object' ? subtask.story.title : 'Story'}
                                    </span>
                                  )}

                                  {/* Add Child button */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAddingNestedForIndex(addingNestedForIndex === index ? null : index)
                                      setNewNestedTitle('')
                                    }}
                                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors ml-1 px-1.5 py-0.5 rounded hover:bg-muted"
                                    title="Add nested subtask"
                                  >
                                    <Plus className="h-3 w-3" />
                                    <span>Add child</span>
                                  </button>
                                </div>

                                {subtask.description && (
                                  <p className="text-[13px] text-[var(--apple-secondary-label)] mt-1 ml-0.5">
                                    {subtask.description}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Nested Subtasks */}
                            {subtask.subtasks && subtask.subtasks.length > 0 && (
                              <div className="ml-7 pl-3.5 border-l-2 border-slate-200 dark:border-slate-800 space-y-2 pt-1">
                                {subtask.subtasks.map((nested, nIdx) => {
                                  const isNestedDone = nested.isCompleted || nested.status === 'done'
                                  return (
                                    <div key={nested._id || nIdx} className="flex items-start gap-2.5">
                                      <button
                                        type="button"
                                        disabled={updatingSubtask}
                                        onClick={() => handleToggleSubtask(index, nIdx)}
                                        className="mt-0.5 flex-shrink-0 text-muted-foreground hover:text-foreground focus:outline-none disabled:opacity-50 transition-colors cursor-pointer"
                                        title={isNestedDone ? 'Mark as incomplete' : 'Mark as complete'}
                                      >
                                        {isNestedDone ? (
                                          <CheckCircle className="h-3.5 w-3.5 text-[var(--apple-system-green)]" />
                                        ) : (
                                          <Circle className="h-3.5 w-3.5 text-[var(--apple-tertiary-label)] hover:text-foreground" />
                                        )}
                                      </button>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span
                                            className={`text-[13px] ${
                                              isNestedDone
                                                ? 'line-through text-[var(--apple-tertiary-label)]'
                                                : 'text-[var(--apple-label)]'
                                            }`}
                                          >
                                            {nested.title}
                                          </span>

                                          {/* Nested Subtask Status Dropdown */}
                                          {renderInteractiveStatusBadge(
                                            nested.status,
                                            (newStatus) => handleUpdateSubtaskStatus(index, newStatus, nIdx),
                                            updatingSubtask
                                          )}
                                        </div>
                                        {nested.description && (
                                          <p className="text-[12px] text-[var(--apple-secondary-label)] mt-0.5">
                                            {nested.description}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            {/* Inline Add Nested Subtask Form */}
                            {addingNestedForIndex === index && (
                              <div className="ml-7 pl-3.5 border-l-2 border-primary/40 pt-1">
                                <div className="flex items-center gap-2 bg-muted/40 p-2 rounded-md">
                                  <Input
                                    placeholder="Nested subtask title *"
                                    value={newNestedTitle}
                                    onChange={(e) => setNewNestedTitle(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleAddNestedSubtask(index)
                                    }}
                                    className="h-8 text-xs bg-background"
                                    autoFocus
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => handleAddNestedSubtask(index)}
                                    disabled={!newNestedTitle.trim() || isAddingNested}
                                    className="h-8 text-xs px-2.5 flex-shrink-0"
                                  >
                                    {isAddingNested ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setAddingNestedForIndex(null)
                                      setNewNestedTitle('')
                                    }}
                                    className="h-8 text-xs px-2 flex-shrink-0"
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Attachments */}
            {task.attachments && task.attachments.length > 0 && (
              <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-[var(--apple-secondary-label)]" />
                    <h2 className="text-[15px] font-semibold text-[var(--apple-label)]">Attachments</h2>
                    <span className="text-[12px] text-[var(--apple-secondary-label)] font-apple-mono">{task.attachments.length}</span>
                  </div>
                </div>
                <div className="px-5 py-4">
                  <AttachmentList
                    attachments={attachmentListItems}
                    onDownload={(attachment) => {
                      const viewableTypes = ['application/pdf', 'image/', 'text/']
                      const isViewable = viewableTypes.some(type => attachment.type.startsWith(type))
                      if (isViewable) { window.open(attachment.url, '_blank') }
                      else {
                        const link = document.createElement('a')
                        link.href = attachment.url
                        link.download = attachment.name
                        document.body.appendChild(link)
                        link.click()
                        document.body.removeChild(link)
                      }
                    }}
                    canDelete={false}
                  />
                </div>
              </div>
            )}

            {/* Parent task */}
            {task.parentTask && (
              <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none px-5 py-4">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-[var(--apple-secondary-label)]" />
                  <span className="apple-section-label text-[var(--apple-tertiary-label)]">Parent Task</span>
                  <span className="text-[14px] text-[var(--apple-label)] font-medium ml-1">{task.parentTask.title}</span>
                </div>
              </div>
            )}

            {/* Comments */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquarePlus className="h-4 w-4 text-[var(--apple-secondary-label)]" />
                    <h2 className="text-[15px] font-semibold text-[var(--apple-label)]">Comments</h2>
                    {commentTree.length > 0 && (
                      <span className="text-[12px] text-[var(--apple-secondary-label)] font-apple-mono">{commentTree.length}</span>
                    )}
                  </div>
                  <button
                    onClick={handleAddComment}
                    disabled={commentSubmitting || !commentContent.trim()}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--apple-system-blue)] text-white text-[13px] font-semibold px-3 h-8 hover:opacity-90 apple-transition disabled:opacity-40"
                  >
                    {commentSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    {commentSubmitting ? 'Posting…' : 'Post'}
                  </button>
                </div>
              </div>
              <div className="px-5 py-4 space-y-4">
                <div ref={commentComposerRef} className="relative">
                  <Textarea
                    ref={commentEditorRef}
                    value={commentContent}
                    className={`text-[14px] rounded-[var(--apple-radius-md)] border-[var(--apple-separator)] ${suggestionMode && suggestionComposer === 'comment' ? 'ring-2 ring-[var(--apple-system-blue)]/20 border-[var(--apple-system-blue)]/40' : ''}`}
                    onChange={(e) => handleComposerInput(e.target.value, 'comment', e.target)}
                    onKeyDown={(e) => handleComposerKeyDown(e, 'comment')}
                    onKeyUp={() => scheduleSuggestionPositionUpdate('comment')}
                    onClick={() => scheduleSuggestionPositionUpdate('comment')}
                    onScroll={(e) => {
                      setComposerScrollTop(prev => ({ ...prev, comment: e.currentTarget.scrollTop }))
                      scheduleSuggestionPositionUpdate('comment')
                    }}
                    onBlur={() => handleComposerBlur('comment')}
                    placeholder="Write a comment… Use @ to mention, # to link tasks"
                    rows={3}
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div role="button" aria-label="Attach file"
                            className="h-8 w-8 inline-flex items-center justify-center rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] hover:bg-[var(--apple-tertiary-fill)] cursor-pointer apple-transition"
                            onClick={() => commentFileInputRef.current?.click()}>
                            <Paperclip className="h-4 w-4 text-[var(--apple-secondary-label)]" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top">Attach file</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <input ref={commentFileInputRef} type="file" className="hidden" onChange={(e) => handleFileInputChange(e, false)} />
                    {commentAttachments.map((att, idx) => (
                      <span key={`${att.url}-${idx}`} className="inline-flex items-center gap-1 rounded-full border border-[var(--apple-separator)] px-2.5 py-1 text-[12px] text-[var(--apple-secondary-label)]">
                        <a className="text-[var(--apple-system-blue)] hover:underline" href={att.url} target="_blank" rel="noreferrer">{att.name}</a>
                        {att.size ? <span>({(att.size / 1024).toFixed(1)} KB)</span> : null}
                      </span>
                    ))}
                  </div>
                  {suggestionMode && suggestionComposer === 'comment' && (
                    <p className="mt-1 text-[12px] text-[var(--apple-system-blue)]">
                      {suggestionMode === 'mention' ? '@' : '#'}{suggestionQuery || '…'} — ↑↓ navigate · Enter select · Esc close
                    </p>
                  )}
                  {renderSuggestionMenu('comment')}
                </div>

                {/* All comments */}
                {commentTree.length > 0 && (
                  <div className="space-y-3 pt-4 border-t border-[var(--apple-separator)]">
                    {renderComments}
                    {commentTree.length > commentsPageSize && (
                      <div className="flex items-center justify-between pt-3 border-t border-[var(--apple-separator)]">
                        <p className="text-[13px] text-[var(--apple-secondary-label)]">
                          {((commentsCurrentPage - 1) * commentsPageSize) + 1}–{Math.min(commentsCurrentPage * commentsPageSize, commentTree.length)} of {commentTree.length}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setCommentsCurrentPage(commentsCurrentPage - 1)} disabled={commentsCurrentPage === 1}
                            className="h-8 px-3 rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[13px] text-[var(--apple-label)] hover:bg-[var(--apple-tertiary-fill)] apple-transition disabled:opacity-40">
                            Previous
                          </button>
                          <span className="text-[13px] text-[var(--apple-secondary-label)] font-apple-mono px-1">{commentsCurrentPage}/{commentsTotalPages || 1}</span>
                          <button onClick={() => setCommentsCurrentPage(commentsCurrentPage + 1)} disabled={commentsCurrentPage >= commentsTotalPages}
                            className="h-8 px-3 rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[13px] text-[var(--apple-label)] hover:bg-[var(--apple-tertiary-fill)] apple-transition disabled:opacity-40">
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {commentTree.length === 0 && (
                  <div className="pt-4 border-t border-[var(--apple-separator)] text-center py-8">
                    <MessageSquarePlus className="h-8 w-8 mx-auto mb-2 text-[var(--apple-tertiary-label)]" />
                    <p className="text-[14px] text-[var(--apple-secondary-label)]">No comments yet. Be the first to comment.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Right Sidebar ──────────────────────────────────────────────────── */}
          <div className="space-y-5">

            {/* Properties */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                <h2 className="text-[13px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-tertiary-label)]">Properties</h2>
              </div>
              <div className="px-5 py-1 divide-y divide-[var(--apple-separator)]">
                {/* Status */}
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Status</span>
                  {renderStatusChip(STATUS_BADGE, task.status, formatToTitleCase(task.status))}
                </div>
                {/* Priority */}
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Priority</span>
                  {renderStatusChip(PRIORITY_BADGE, task.priority, formatToTitleCase(task.priority))}
                </div>
                {/* Type */}
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Type</span>
                  {renderStatusChip(TYPE_BADGE, task.type, formatToTitleCase(task.type))}
                </div>
                {/* Category */}
                {task.category && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-[var(--apple-secondary-label)]">
                      Category
                    </span>

                    <CategoryBadge
                      category={task.category}
                      title={getCategoryTitle(task.category)}
                    />
                  </div>
                )}
                {/* Project */}
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Project</span>
                  <span className="text-[13px] font-medium text-[var(--apple-label)] truncate max-w-[160px]" title={task.project?.name}>{task.project?.name || '—'}</span>
                </div>
                {/* Due Date */}
                {task.dueDate && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-[var(--apple-secondary-label)]">Due Date</span>
                    <div className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--apple-label)]">
                      <Calendar className="h-3.5 w-3.5 text-[var(--apple-tertiary-label)]" />
                      {formatDate(task.dueDate)}
                    </div>
                  </div>
                )}
                {/* Story points */}
                {task.storyPoints && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-[var(--apple-secondary-label)]">Story Points</span>
                    <span className="text-[13px] font-apple-mono font-medium text-[var(--apple-label)]">{task.storyPoints}</span>
                  </div>
                )}
                {/* Estimated hours */}
                {task.estimatedHours && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-[var(--apple-secondary-label)]">Estimated</span>
                    <span className="text-[13px] font-apple-mono font-medium text-[var(--apple-label)]">{task.estimatedHours}h</span>
                  </div>
                )}
                {/* Actual hours */}
                {task.actualHours != null && task.actualHours > 0 && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-[var(--apple-secondary-label)]">Actual</span>
                    <span className="text-[13px] font-apple-mono font-medium text-[var(--apple-label)]">{task.actualHours}h</span>
                  </div>
                )}
                {/* Labels row inside Properties */}
                {task.labels.length > 0 && (
                  <div className="py-3">
                    <span className="text-[13px] text-[var(--apple-secondary-label)] block mb-2">Labels</span>
                    <div className="flex flex-wrap gap-1.5">
                      {task.labels.map((label, index) => (
                        <span key={index} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[12px] text-[var(--apple-label)] font-medium">
                          <Star className="h-3 w-3" style={{ color: 'var(--apple-card-gradient)' }} />
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Assignees */}
            {task.assignedTo && task.assignedTo.length > 0 && (
              <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                  <h2 className="text-[13px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-tertiary-label)]">Assigned To</h2>
                </div>
                <div className="px-5 py-3 space-y-2.5">
                  {task.assignedTo.map((assignee: any, idx) => {
                    let userId: string
                    let displayName: string
                    if (typeof assignee === 'string') {
                      userId = assignee
                      const userInfo = mentionsList.find(u => u._id === userId)
                      displayName = userInfo?.name || 'Unknown User'
                    } else {
                      userId = assignee?.user?._id || assignee?.user || assignee?._id
                      const firstName = assignee?.user?.firstName || assignee?.firstName
                      const lastName = assignee?.user?.lastName || assignee?.lastName
                      displayName = firstName && lastName ? `${firstName} ${lastName}`.trim() : 'Unknown User'
                    }
                    const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
                    return (
                      <div key={userId || `assignee-${idx}`} className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold text-[13px] select-none"
                          style={{ background: 'var(--apple-card-gradient)', boxShadow: '0 1px 4px var(--apple-chart-glow)' }}>
                          {initials}
                        </div>
                        <span className="text-[13px] text-[var(--apple-label)] font-medium leading-tight">{displayName}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                <h2 className="text-[13px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-tertiary-label)]">Metadata</h2>
              </div>
              <div className="px-5 py-1 divide-y divide-[var(--apple-separator)]">
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Created by</span>
                  <span className="text-[13px] font-medium text-[var(--apple-label)]">{task.createdBy.firstName} {task.createdBy.lastName}</span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Created</span>
                  <span className="text-[13px] text-[var(--apple-label)]">{formatDate(task.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Updated</span>
                  <span className="text-[13px] text-[var(--apple-label)]">{formatDate(task.updatedAt)}</span>
                </div>
              </div>
            </div>

            {/* Activity log */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                <h2 className="text-[13px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-tertiary-label)]">Activity</h2>
              </div>
              <div className="px-5 py-4">
                <TaskActivityLog taskId={task._id} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete comment confirmation */}
      <ConfirmationModal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title="Delete comment"
        description="Are you sure you want to delete this comment?"
        confirmText="Delete"
        onConfirm={async () => {
          if (!deleteConfirmId) return
          await handleDeleteComment(deleteConfirmId)
          setDeleteConfirmId(null)
        }}
      />

      <StartTimerModal
        open={showStartTimerModal}
        onOpenChange={setShowStartTimerModal}
        userId={currentUserId}
        organizationId={currentOrganizationId}
        project={{ id: task.project._id, name: task.project.name }}
        task={{ id: task._id, title: task.title }}
        onStarted={(startedTimer) => {
          if (startedTimer) setActiveTimer(startedTimer)
          else loadActiveTimer()
        }}
      />

      <ConfirmationModal
        isOpen={showStopTimerConfirmModal}
        onClose={() => setShowStopTimerConfirmModal(false)}
        onConfirm={async () => {
          setShowStopTimerConfirmModal(false)
          await handleStopTimer()
        }}
        title="Stop Timer"
        description={
          <>
            Are you sure you want to stop the active timer?
            <span className="block mt-2 text-[var(--apple-label)] font-medium">
              {task.project?.name || 'Unknown project'} • {task.title}
            </span>
          </>
        }
        confirmText="Stop Timer"
        cancelText="Cancel"
        variant="destructive"
        isLoading={stoppingTimer}
      />

      <ConfirmationModal
        isOpen={showDeleteConfirmModal}
        onClose={() => setShowDeleteConfirmModal(false)}
        onConfirm={handleDeleteTask}
        title="Delete Task"
        description={`Are you sure you want to delete "${task?.title}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />
    </MainLayout>
  )
}
