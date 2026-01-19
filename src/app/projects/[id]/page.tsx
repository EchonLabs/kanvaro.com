'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatToTitleCase } from '@/lib/utils'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { useNotify } from '@/lib/notify'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Progress } from '@/components/ui/Progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Users,
  DollarSign,
  Clock,
  CheckCircle,
  AlertTriangle,
  Pause,
  XCircle,
  Play,
  Loader2,
  Settings,
  Plus,
  BarChart3,
  Kanban,
  List,
  User,
  Calendar as CalendarIcon,
  Target,
  Zap,
  Download,
  ChevronDown,
  Edit,
  MoreVertical,
  UserPlus,
  Save,
  Trash2,
  Paperclip,
  Link as LinkIcon,
  File,
  Image,
  ExternalLink
} from 'lucide-react'
import CreateTaskModal from '@/components/tasks/CreateTaskModal'
import { useOrganization } from '@/hooks/useOrganization'
import EditTaskModal from '@/components/tasks/EditTaskModal'
import { AddExpenseDialog } from '@/components/projects/AddExpenseDialog'
import ViewTaskModal from '@/components/tasks/ViewTaskModal'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import TaskList from '@/components/tasks/TaskList'
import KanbanBoard from '@/components/tasks/KanbanBoard'
import CalendarView from '@/components/tasks/CalendarView'
import BacklogView from '@/components/tasks/BacklogView'
import ReportsView from '@/components/tasks/ReportsView'
import TestSuiteTree from '@/components/test-management/TestSuiteTree'
import TestCaseList from '@/components/test-management/TestCaseList'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { TestSuiteForm } from '@/components/test-management/TestSuiteForm'
import { TestCaseForm } from '@/components/test-management/TestCaseForm'
import { ProjectTeamTab } from '@/components/projects/ProjectTeamTab'
import { useOrgCurrency } from '@/hooks/useOrgCurrency'
import { Permission } from '@/lib/permissions'
import { usePermissions } from '@/lib/permissions/permission-context'
import { PermissionGate } from '@/lib/permissions/permission-components'

interface Project {
  _id: string
  name: string
  description: string
  status: 'draft' | 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  isDraft: boolean
  startDate: string
  endDate?: string
  isBillableByDefault: boolean
  projectNumber?: number
  budget?: {
    total: number
    spent: number
    currency: string
    categories: {

      materials: number
      overhead: number
      external: number
    }
  }
  createdBy: {
    firstName: string
    lastName: string
    email: string
  }
  teamMembers: Array<{
    _id?: string
    memberId?: {
      firstName: string
      lastName: string
      email: string
      role?: string
    }
    firstName?: string
    lastName?: string
    email?: string
    role?: string
    hourlyRate?: number
  }>
  client?: {
    firstName: string
    lastName: string
    email: string
  }
  progress: {
    completionPercentage: number
    tasksCompleted: number
    totalTasks: number
  }
  settings: {
    allowTimeTracking: boolean
    allowManualTimeSubmission: boolean
    allowExpenseTracking: boolean
    requireApproval: boolean
    notifications: {
      taskUpdates: boolean
      budgetAlerts: boolean
      deadlineReminders: boolean
    }
  }
  stats?: {
    tasks?: {
      completionRate: number
      completed: number
      total: number
    }
    budget?: {
      utilizationRate: number
      spent: number
      total: number
    }
    timeTracking?: {
      totalHours: number
      entries: number
    }
  }
  tags: string[]
  attachments?: Array<{
    name: string
    url: string
    size: number
    type: string
    uploadedBy?: {
      firstName: string
      lastName: string
      email: string
    }
    uploadedAt: string
  }>
  externalLinks?: {
    figma?: string[]
    documentation?: string[]
  }
  createdAt: string
  updatedAt: string
}

type ExpenseAttachment = {
  url?: string | null
  name?: string | null
  size?: number | null
}

export default function ProjectDetailPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const projectId = params.id as string
  const activeTab = searchParams.get('tab') || 'overview'
  const { organization } = useOrganization()
  const orgCurrency = organization?.currency || 'USD'
  const { formatCurrency } = useOrgCurrency()
  const { formatDate } = useDateTime()
  const { hasPermission } = usePermissions()
  const canUpdateProject = hasPermission(Permission.PROJECT_UPDATE)
  const canCreateTask = hasPermission(Permission.TASK_CREATE)

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false)
  const [showEditTaskModal, setShowEditTaskModal] = useState(false)
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [selectedTask, setSelectedTask] = useState<any | null>(null)
  const [tasks, setTasks] = useState<any[]>([])
  const [suiteDialogOpen, setSuiteDialogOpen] = useState(false)
  const [suiteSaving, setSuiteSaving] = useState(false)
  const [expenses, setExpenses] = useState<any[]>([])
  const [showAddExpenseDialog, setShowAddExpenseDialog] = useState(false)
  const [expensesLoading, setExpensesLoading] = useState(false)
  const [editingSuite, setEditingSuite] = useState<any | null>(null)
  const [editingExpense, setEditingExpense] = useState<any | null>(null)
  const [showDeleteExpenseConfirmModal, setShowDeleteExpenseConfirmModal] = useState(false)
  const [expandedExpenseAttachments, setExpandedExpenseAttachments] = useState<Record<string, boolean>>({})
    const toggleExpenseAttachments = (expenseId: string) => {
      setExpandedExpenseAttachments(prev => ({
        ...prev,
        [expenseId]: !prev[expenseId]
      }))
    }

    const formatFileSize = (size?: number) => {
      if (!size) return ''
      if (size >= 1024 * 1024) {
        return `${(size / (1024 * 1024)).toFixed(1)} MB`
      }
      return `${(size / 1024).toFixed(1)} KB`
    }

  const [expenseToDelete, setExpenseToDelete] = useState<any | null>(null)
  const [parentSuiteIdForCreate, setParentSuiteIdForCreate] = useState<string | undefined>(undefined)
  const [suitesRefreshCounter, setSuitesRefreshCounter] = useState(0)
  const [testCaseDialogOpen, setTestCaseDialogOpen] = useState(false)
  const [testCaseSaving, setTestCaseSaving] = useState(false)
  const [editingTestCase, setEditingTestCase] = useState<any | null>(null)
  const [createCaseSuiteId, setCreateCaseSuiteId] = useState<string | undefined>(undefined)
  const [testCasesRefreshCounter, setTestCasesRefreshCounter] = useState(0)
  const [settingsForm, setSettingsForm] = useState({
    allowTimeTracking: false,
    allowManualTimeSubmission: false,
    allowExpenseTracking: false,
    allowBillableTime: false,
    requireApproval: false,
    notifications: {
      taskUpdates: false,
      budgetAlerts: false,
      deadlineReminders: false,
    },
  })
  const [globalTimeTrackingSettings, setGlobalTimeTrackingSettings] = useState<{
    allowTimeTracking: boolean
    allowManualTimeSubmission: boolean
    requireApproval: boolean
    allowBillableTime: boolean
  } | null>(null)
  const [statusForm, setStatusForm] = useState<Project['status']>('planning')
  const [priorityForm, setPriorityForm] = useState<Project['priority']>('medium')
  const [savingSettings, setSavingSettings] = useState(false)
  const settingsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Attachments pagination
  const [attachmentsPage, setAttachmentsPage] = useState(1)
  const attachmentsPerPage = 10

  // Links pagination
  const [figmaLinksPage, setFigmaLinksPage] = useState(1)
  const [docLinksPage, setDocLinksPage] = useState(1)
  const linkPaginationSize = 5

  // Use the notification hook
  const { success: notifySuccess, error: notifyError } = useNotify()

  const totalExpenses = useMemo(
    () => expenses.reduce((sum, exp) => sum + (exp.fullAmount || 0), 0),
    [expenses]
  )

  // Links pagination computed values
  const figmaLinks = useMemo(() => project?.externalLinks?.figma || [], [project?.externalLinks?.figma])
  const documentationLinks = useMemo(() => project?.externalLinks?.documentation || [], [project?.externalLinks?.documentation])

  const figmaTotalPages = Math.max(1, Math.ceil(figmaLinks.length / linkPaginationSize))
  const documentationTotalPages = Math.max(1, Math.ceil(documentationLinks.length / linkPaginationSize))
  const currentFigmaPage = Math.min(Math.max(figmaLinksPage, 1), figmaTotalPages)
  const currentDocumentationPage = Math.min(Math.max(docLinksPage, 1), documentationTotalPages)
  const figmaSliceStart = (currentFigmaPage - 1) * linkPaginationSize
  const docSliceStart = (currentDocumentationPage - 1) * linkPaginationSize
  const paginatedFigmaLinks = figmaLinks.slice(figmaSliceStart, figmaSliceStart + linkPaginationSize)
  const paginatedDocumentationLinks = documentationLinks.slice(docSliceStart, docSliceStart + linkPaginationSize)
  const figmaShowingStart = figmaLinks.length ? figmaSliceStart + 1 : 0
  const figmaShowingEnd = figmaLinks.length ? Math.min(figmaSliceStart + linkPaginationSize, figmaLinks.length) : 0
  const documentationShowingStart = documentationLinks.length ? docSliceStart + 1 : 0
  const documentationShowingEnd = documentationLinks.length ? Math.min(docSliceStart + linkPaginationSize, documentationLinks.length) : 0

  useEffect(() => {
    if (projectId) {
      fetchProject()
      fetchTasks()
      fetchGlobalTimeTrackingSettings()
    }

    // Listen for organization settings updates to refresh global time tracking settings
    const handleOrganizationSettingsUpdated = () => {
      fetchGlobalTimeTrackingSettings()
    }

    window.addEventListener('organization-settings-updated', handleOrganizationSettingsUpdated)

    return () => {
      window.removeEventListener('organization-settings-updated', handleOrganizationSettingsUpdated)
    }
  }, [projectId])

  const fetchExpenses = async () => {
    if (!projectId || !project?.settings?.allowExpenseTracking) return

    try {
      setExpensesLoading(true)
      const response = await fetch(`/api/projects/${projectId}/expenses`)
      const data = await response.json()

      if (data.success) {
        setExpenses(data.data || [])
      }
    } catch (error) {
      console.error('Error fetching expenses:', error)
    } finally {
      setExpensesLoading(false)
    }
  }

  const handleExpenseAdded = () => {
    fetchExpenses()
    setShowAddExpenseDialog(false)
  }

  const handleExpenseUpdated = () => {
    fetchExpenses()
    setEditingExpense(null)
  }

  const handleExpenseDeleted = async (expenseId: string, expenseName: string) => {
    setExpenseToDelete({ id: expenseId, name: expenseName })
    setShowDeleteExpenseConfirmModal(true)
  }

  const confirmDeleteExpense = async () => {
    if (!expenseToDelete) return

    try {
      const response = await fetch(`/api/projects/${projectId}/expenses?expenseId=${expenseToDelete.id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        notifySuccess({ title: 'Expense Deleted', message: 'Expense has been deleted successfully' })
        fetchExpenses()
      } else {
        const errorData = await response.json()
        notifyError({ title: 'Delete Failed', message: errorData.error || 'Failed to delete expense' })
      }
    } catch (error) {
      console.error('Error deleting expense:', error)
      notifyError({ title: 'Delete Failed', message: 'Failed to delete expense. Please try again.' })
    } finally {
      setShowDeleteExpenseConfirmModal(false)
      setExpenseToDelete(null)
    }
  }

  useEffect(() => {
    if (project && project.settings?.allowExpenseTracking) {
      fetchExpenses()
    }
  }, [project])

  useEffect(() => {
    if (project) {
      setStatusForm(project.status)
      setPriorityForm(project.priority)

      // Respect global settings - if global is OFF, project must be OFF too
      const allowTimeTracking = (project.settings?.allowTimeTracking ?? false) && (globalTimeTrackingSettings?.allowTimeTracking ?? true)
      const allowManualTimeSubmission = (project.settings?.allowManualTimeSubmission ?? false) && (globalTimeTrackingSettings?.allowManualTimeSubmission ?? true)
      const allowBillableTime = (project.isBillableByDefault ?? false) && (globalTimeTrackingSettings?.allowBillableTime ?? true)
      const requireApproval = (project.settings?.requireApproval ?? false) && (globalTimeTrackingSettings?.requireApproval ?? true)

      setSettingsForm({
        allowTimeTracking,
        allowManualTimeSubmission,
        allowExpenseTracking: project.settings?.allowExpenseTracking ?? false,
        allowBillableTime,
        requireApproval,
        notifications: {
          taskUpdates: project.settings?.notifications?.taskUpdates ?? false,
          budgetAlerts: project.settings?.notifications?.budgetAlerts ?? false,
          deadlineReminders: project.settings?.notifications?.deadlineReminders ?? false,
        },
      })
    }
  }, [project, globalTimeTrackingSettings])

  useEffect(() => {
    return () => {
      if (settingsTimeoutRef.current) {
        clearTimeout(settingsTimeoutRef.current)
      }
    }
  }, [])

  const showSettingsSuccess = (message: string) => {
    notifySuccess({ title: 'Settings Updated', message })
  }

  const showExpenseSuccess = (message: string) => {
    notifySuccess({ title: 'Expense Updated', message })
  }

  const handleSaveSettings = async () => {
    if (!projectId) return
    setSavingSettings(true)

    try {
      // Ensure project settings respect global settings
      const finalSettings = {
        ...settingsForm,
        allowTimeTracking: settingsForm.allowTimeTracking && (globalTimeTrackingSettings?.allowTimeTracking ?? true),
        allowManualTimeSubmission: settingsForm.allowManualTimeSubmission && (globalTimeTrackingSettings?.allowManualTimeSubmission ?? true),
        requireApproval: settingsForm.requireApproval && (globalTimeTrackingSettings?.requireApproval ?? true),
        notifications: { ...settingsForm.notifications },
      }

      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          settings: finalSettings,
          isBillableByDefault: settingsForm.allowBillableTime,
          status: statusForm,
          priority: priorityForm,
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setProject(data.data)
        showSettingsSuccess('Project settings updated successfully.')
      } else {
        notifyError({ title: 'Failed to Update Settings', message: data.error || 'Failed to update project settings' })
      }
    } catch (error) {
      console.error('Failed to update project settings:', error)
      notifyError({ title: 'Failed to Update Settings', message: 'Failed to update project settings' })
    } finally {
      setSavingSettings(false)
    }
  }

  const fetchProject = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/projects/${projectId}`)
      const data = await response.json()

      if (data.success) {
        setProject(data.data)
      } else {
        setError(data.error || 'Failed to fetch project')
      }
    } catch (err) {
      setError('Failed to fetch project')
    } finally {
      setLoading(false)
    }
  }

  const fetchTasks = async () => {
    try {
      const response = await fetch(`/api/tasks?project=${projectId}`)
      const data = await response.json()

      if (data.success) {
        setTasks(data.data)
      }
    } catch (error) {
      console.error('Error fetching tasks:', error)
    }
  }

  const fetchGlobalTimeTrackingSettings = async () => {
    try {
      const response = await fetch('/api/time-tracking/settings')
      const data = await response.json()

      // Handle both response structures: {settings: ...} or {success: true, data: ...}
      const settingsData = data.settings || (data.success && data.data)

      if (settingsData) {
        const settings = {
          allowTimeTracking: settingsData.allowTimeTracking ?? true,
          allowManualTimeSubmission: settingsData.allowManualTimeSubmission ?? true,
          requireApproval: settingsData.requireApproval ?? false,
          allowBillableTime: settingsData.allowBillableTime ?? true,
        }
        setGlobalTimeTrackingSettings(settings)
      } else {
        console.warn('[VIEW PROJECT] No settings found in response:', data)
      }
    } catch (error) {
      console.error('[VIEW PROJECT] Error fetching global time tracking settings:', error)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900'
      case 'planning': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900'
      case 'active': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900'
      case 'on_hold': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900'
      case 'completed': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
      case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft': return <Edit className="h-4 w-4" />
      case 'planning': return <Calendar className="h-4 w-4" />
      case 'active': return <Play className="h-4 w-4" />
      case 'on_hold': return <Pause className="h-4 w-4" />
      case 'completed': return <CheckCircle className="h-4 w-4" />
      case 'cancelled': return <XCircle className="h-4 w-4" />
      default: return <Calendar className="h-4 w-4" />
    }
  }

  const statusPriorityChanged = project
    ? statusForm !== project.status || priorityForm !== project.priority
    : false

  const trackingSettingsChanged = project ? (
    settingsForm.allowTimeTracking !== (project.settings?.allowTimeTracking ?? false) ||
    settingsForm.allowManualTimeSubmission !== (project.settings?.allowManualTimeSubmission ?? false) ||
    settingsForm.allowExpenseTracking !== (project.settings?.allowExpenseTracking ?? false) ||
    settingsForm.allowBillableTime !== (project.isBillableByDefault ?? false) ||
    settingsForm.requireApproval !== (project.settings?.requireApproval ?? false)
  ) : false

  const notificationSettingsChanged = project ? (
    settingsForm.notifications.taskUpdates !== (project.settings?.notifications?.taskUpdates ?? false) ||
    settingsForm.notifications.budgetAlerts !== (project.settings?.notifications?.budgetAlerts ?? false) ||
    settingsForm.notifications.deadlineReminders !== (project.settings?.notifications?.deadlineReminders ?? false)
  ) : false

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading project...</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (error) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertTriangle className="h-8 w-8 mx-auto mb-4 text-destructive" />
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={() => router.push('/projects')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Projects
            </Button>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (!project) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-muted-foreground">Project not found</p>
            <Button onClick={() => router.push('/projects')} className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Projects
            </Button>
          </div>
        </div>
      </MainLayout>
    )
  }

  return (
    <TooltipProvider>
      <MainLayout>
      <div className="space-y-8 mt-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-1 min-w-0">
            <Button variant="outline" size="sm" onClick={() => router.back()} className="w-full sm:w-auto">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                <h1
                  className="text-2xl sm:text-3xl font-bold text-foreground line-clamp-2 max-w-full"
                  title={project.name}
                >
                  {project.name}
                </h1>
                {typeof project.projectNumber !== 'undefined' && (
                  <Badge variant="outline" className="flex-shrink-0 hover:bg-transparent dark:hover:bg-transparent">#{project.projectNumber}</Badge>
                )}
                {project.isDraft && project.status !== 'draft' && (
                  <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900 flex-shrink-0">
                    Draft
                  </Badge>
                )}
                <Badge className={getStatusColor(project.status) + ' flex-shrink-0'}>
                  {getStatusIcon(project.status)}
                  <span className="ml-1">{formatToTitleCase(project.status)}</span>
                </Badge>
              </div>
              <p className="text-sm sm:text-base text-muted-foreground mt-1 break-words whitespace-normal" title={project.description || 'No description'}>
                {project.description || 'No description'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto sm:mt-4 lg:mt-6">
            {canUpdateProject && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/projects/create?edit=${projectId}`)}
                className="w-full sm:w-auto"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit Project
              </Button>
            )}
            {canCreateTask && (
              <Button size="sm" onClick={() => setShowCreateTaskModal(true)} className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Add Task
              </Button>
            )}
          </div>
        </div>

        {/* Project Stats */}
        <div className="grid gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mt-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Progress</p>
                  <p className="text-2xl font-bold text-foreground">{project.progress?.completionPercentage || 0}%</p>
                </div>
              </div>
              <div className="mt-4">
                <Progress value={project.progress?.completionPercentage || 0} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {project.progress?.tasksCompleted || 0} of {project.progress?.totalTasks || 0} tasks completed
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                  <Users className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Team Members</p>
                  <p className="text-2xl font-bold text-foreground">{project.teamMembers.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                  <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Duration</p>
                  <p className="text-2xl font-bold text-foreground">
                    {project.startDate && project.endDate
                      ? Math.ceil((new Date(project.endDate).getTime() - new Date(project.startDate).getTime()) / (1000 * 60 * 60 * 24))
                      : 'N/A'
                    }
                  </p>
                  <p className="text-xs text-muted-foreground">days</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                  <DollarSign className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Budget</p>
                  <p className="text-2xl font-bold text-foreground">
                    {project.budget ? new Intl.NumberFormat('en-US', { style: 'currency', currency: orgCurrency }).format(project.budget.total) : 'N/A'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={(value) => {
          const newSearchParams = new URLSearchParams(searchParams.toString())
          newSearchParams.set('tab', value)
          router.push(`/projects/${projectId}?${newSearchParams.toString()}`)
        }} className="space-y-8">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-11 gap-1 overflow-x-auto mt-2">
            <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
            <TabsTrigger value="team" className="text-xs sm:text-sm">Team</TabsTrigger>
            <TabsTrigger value="attachments" className="text-xs sm:text-sm">Attachments</TabsTrigger>
            <TabsTrigger value="budget" className="text-xs sm:text-sm">Budget</TabsTrigger>
            <TabsTrigger value="tasks" className="text-xs sm:text-sm">Tasks</TabsTrigger>
            <TabsTrigger value="kanban" className="text-xs sm:text-sm">Kanban</TabsTrigger>
            <TabsTrigger value="calendar" className="text-xs sm:text-sm">Calendar</TabsTrigger>
            <TabsTrigger value="backlog" className="text-xs sm:text-sm">Backlog</TabsTrigger>
            <TabsTrigger value="testing" className="text-xs sm:text-sm">Testing</TabsTrigger>
            <TabsTrigger value="reports" className="text-xs sm:text-sm">Reports</TabsTrigger>
            <TabsTrigger value="settings" className="text-xs sm:text-sm">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-8">
            <div className="grid gap-8 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-8">
                {/* Project Details */}
                <Card className="mt-2">
                  <CardHeader>
                    <CardTitle>Project Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">Start Date</span>
                          <span className="text-sm text-foreground">
                            {formatDate(project.startDate)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">End Date</span>
                          <span className="text-sm text-foreground">
                            {project.endDate ? formatDate(project.endDate) : 'Not set'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">Created By</span>
                          <span className="text-sm text-foreground">
                            {project.createdBy.firstName} {project.createdBy.lastName}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">Team Size</span>
                          <span className="text-sm text-foreground">{project.teamMembers.length} members</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">Client</span>
                          <span className="text-sm text-foreground">
                            {project.client ? `${project.client.firstName} ${project.client.lastName}` : 'Not assigned'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">Created</span>
                          <span className="text-sm text-foreground">
                            {formatDate(project.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Budget Breakdown */}
                {project.budget && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Budget Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">Total Budget</span>
                          <span className="text-sm font-semibold text-foreground">
                            {formatCurrency(project.budget.total, orgCurrency)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">Spent</span>
                          <span className="text-sm text-foreground">
                            {formatCurrency(project.budget.spent, orgCurrency)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">Remaining</span>
                          <span className="text-sm text-foreground">
                            {formatCurrency(project.budget.total - project.budget.spent, orgCurrency)}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-muted-foreground">Categories</div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span>Materials</span>
                            <span>{formatCurrency(project.budget.categories.materials || 0, orgCurrency)}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span>Overhead</span>
                            <span>{formatCurrency(project.budget.categories.overhead || 0, orgCurrency)}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span>External</span>
                            <span>{formatCurrency(project.budget.categories.external || 0, orgCurrency)}</span>
                          </div>
                        </div>
                        <div className="pt-3 border-t">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">Expenses</span>
                            <span className="text-sm font-semibold">
                              {formatCurrency(totalExpenses || 0, orgCurrency)}
                            </span>
                          </div>
                          <div className="mt-2 space-y-2">
                            {(expenses || []).slice(0, 3).map((expense) => (
                              <div
                                key={expense._id}
                                className="flex items-center justify-between text-sm text-muted-foreground"
                              >
                                <span className="truncate max-w-[65%]" title={expense.name || 'Expense'}>
                                  {expense.name || 'Expense'}
                                </span>
                                <span>{formatCurrency(expense.fullAmount || 0, orgCurrency)}</span>
                              </div>
                            ))}
                            {(!expenses || expenses.length === 0) && (
                              <div className="text-sm text-muted-foreground">No expenses added yet</div>
                            )}
                            {expenses && expenses.length > 3 && (
                              <div className="text-xs text-muted-foreground">
                                + {expenses.length - 3} more expense{expenses.length - 3 === 1 ? '' : 's'}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              <div className="space-y-8 mt-8 lg:mt-0 pt-2">
                {/* Team Members */}
                <Card>
                  <CardHeader>
                    <CardTitle>Team Members</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {project.teamMembers.map((member, index) => {
                      // teamMembers are populated: member = { memberId: userObject, hourlyRate, _id }
                      const user = member.memberId;
                      return (
                        <div key={member._id || index} className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">
                            {user?.firstName?.[0]}{user?.lastName?.[0]}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">
                              {user?.firstName} {user?.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground">{user?.email}</p>
                            {member.hourlyRate && (
                              <p className="text-xs text-muted-foreground">
                                ${member.hourlyRate}/hr
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                {/* Quick Actions */}
                <Card>
                  <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {canUpdateProject && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => router.push(`/projects/create?edit=${projectId}`)}
                      >
                        <Edit className="mr-2 h-4 w-4" />
                        Edit Project
                      </Button>
                    )}
                    {/* <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setShowCreateTaskModal(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Task
                    </Button> */}
                    <PermissionGate 
                      permission={Permission.PROJECT_MANAGE_TEAM}
                      projectId={projectId}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => router.push(`/projects/${projectId}?tab=team`)}
                      >
                        <Users className="mr-2 h-4 w-4" />
                        Manage Team
                      </Button>
                    </PermissionGate>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => router.push(`/projects/${projectId}?tab=reports`)}
                    >
                      <BarChart3 className="mr-2 h-4 w-4" />
                      View Reports
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="team" className="space-y-8">
            <ProjectTeamTab projectId={projectId} project={project} onUpdate={fetchProject} />
          </TabsContent>

          <TabsContent value="attachments" className="space-y-8">
            {/* Combined Attachments Card */}
            <Card className="mt-4">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                  <Paperclip className="h-5 w-5 sm:h-6 sm:w-6" />
                  Attachments & Links
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Uploaded files, Figma designs, and documentation links
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 p-4 sm:p-6">
                {/* File Attachments */}
                <div className="space-y-2 sm:space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs sm:text-sm font-medium flex items-center gap-2">
                      <Paperclip className="h-4 w-4 flex-shrink-0" />
                      <span className="whitespace-nowrap">Uploaded Files</span>
                      {project.attachments && project.attachments.length > 0 && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          {project.attachments.length}
                        </Badge>
                      )}
                    </Label>
                  </div>
                  {project.attachments && project.attachments.length > 0 ? (
                    <div className="space-y-4">
                      {/* Pagination Info */}
                      {project.attachments && project.attachments.length > attachmentsPerPage && (
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>
                            Showing {((attachmentsPage - 1) * attachmentsPerPage) + 1} to {Math.min(attachmentsPage * attachmentsPerPage, project.attachments?.length || 0)} of {project.attachments?.length || 0} attachments
                          </span>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.preventDefault();
                                setAttachmentsPage(prev => Math.max(1, prev - 1));
                              }}
                              disabled={attachmentsPage === 1}
                            >
                              <ArrowLeft className="h-4 w-4" />
                              Previous
                            </Button>
                            <span className="px-3 py-1 bg-muted rounded text-xs">
                              {attachmentsPage} of {Math.ceil((project.attachments?.length || 0) / attachmentsPerPage)}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.preventDefault();
                                setAttachmentsPage(prev => Math.min(Math.ceil((project.attachments?.length || 0) / attachmentsPerPage), prev + 1));
                              }}
                              disabled={attachmentsPage === Math.ceil((project.attachments?.length || 0) / attachmentsPerPage)}
                            >
                              Next
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Attachments List */}
                      <div className="space-y-2">
                        {project.attachments
                          .slice((attachmentsPage - 1) * attachmentsPerPage, attachmentsPage * attachmentsPerPage)
                          .map((attachment, index) => {
                            const actualIndex = (attachmentsPage - 1) * attachmentsPerPage + index;
                            return (
                              <div key={actualIndex} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 p-2 sm:p-3 border rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                                <div className="flex items-center space-x-2 sm:space-x-3 flex-1 min-w-0">
                                  {attachment.type.startsWith('image/') ? (
                                    <Image className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                                  ) : (
                                    <File className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-xs sm:text-sm truncate">{attachment.name}</p>
                                    <p className="text-xs text-muted-foreground break-words sm:break-normal">
                                      <span className="whitespace-nowrap">{(attachment.size / 1024).toFixed(2)} KB</span>
                                      {attachment.uploadedBy && (
                                        <span className="hidden sm:inline">
                                          {` • ${attachment.uploadedBy.firstName} ${attachment.uploadedBy.lastName}`}
                                        </span>
                                      )}
                                      {attachment.uploadedAt && (
                                        <span className="hidden sm:inline">
                                          {` • ${formatDate(attachment.uploadedAt)}`}
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                </div>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => window.open(attachment.url, '_blank')}
                                      className="w-full sm:w-auto self-start sm:self-auto"
                                    >
                                      <ExternalLink className="h-4 w-4 mr-2 sm:mr-0" />
                                      <span className="sm:hidden">Open</span>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Open file</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            );
                          })}
                      </div>

                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-muted rounded-lg p-4 sm:p-6 text-center">
                      <Paperclip className="h-6 w-6 sm:h-8 sm:w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-xs sm:text-sm text-muted-foreground">No files uploaded yet</p>
                    </div>
                  )}
                </div>

                {/* Figma Links */}
                <div className="space-y-2 sm:space-y-3 pt-3 sm:pt-4 border-t">
                  <Label className="text-xs sm:text-sm font-medium flex items-center gap-2">
                    <LinkIcon className="h-4 w-4 flex-shrink-0" />
                    <span className="whitespace-nowrap">Figma Links</span>
                    {project.externalLinks?.figma && project.externalLinks.figma.length > 0 && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {project.externalLinks.figma.length}
                      </Badge>
                    )}
                  </Label>
                  {figmaLinks.length > 0 ? (
                    <div className="space-y-3">
                      {figmaLinks.length > linkPaginationSize && (
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            Showing {figmaShowingStart} to {figmaShowingEnd} of {figmaLinks.length} Figma links
                          </span>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setFigmaLinksPage(prev => Math.max(1, prev - 1))}
                              disabled={currentFigmaPage === 1}
                            >
                              <ArrowLeft className="h-4 w-4" />
                              Previous
                            </Button>
                            <span className="px-2.5 py-1 bg-muted rounded text-[11px]">
                              {currentFigmaPage} of {figmaTotalPages}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setFigmaLinksPage(prev => Math.min(prev + 1, figmaTotalPages))}
                              disabled={currentFigmaPage === figmaTotalPages}
                            >
                              Next
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    <div className="space-y-1 sm:space-y-2">
                        {paginatedFigmaLinks.map((link, index) => {
                          const actualIndex = figmaSliceStart + index
                        // Ensure URL has protocol
                        const formattedLink = link.startsWith('http://') || link.startsWith('https://')
                          ? link
                          : `https://${link}`

                        return (
                          <a
                              key={actualIndex}
                            href={formattedLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 p-2 sm:p-3 border rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer group"
                          >
                            <span className="text-xs sm:text-sm text-primary group-hover:underline flex-1 truncate break-all sm:break-normal">
                              {link}
                            </span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0 group-hover:text-primary transition-colors self-start sm:self-auto cursor-pointer" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Open link</p>
                                </TooltipContent>
                              </Tooltip>
                          </a>
                        )
                      })}
                      </div>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-muted rounded-lg p-4 sm:p-6 text-center">
                      <LinkIcon className="h-6 w-6 sm:h-8 sm:w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-xs sm:text-sm text-muted-foreground">No Figma links added yet</p>
                    </div>
                  )}
                </div>

                {/* Documentation Links */}
                <div className="space-y-2 sm:space-y-3 pt-3 sm:pt-4 border-t">
                  <Label className="text-xs sm:text-sm font-medium flex items-center gap-2">
                    <LinkIcon className="h-4 w-4 flex-shrink-0" />
                    <span className="whitespace-nowrap">Documentation URLs</span>
                    {project.externalLinks?.documentation && project.externalLinks.documentation.length > 0 && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {project.externalLinks.documentation.length}
                      </Badge>
                    )}
                  </Label>
                  {documentationLinks.length > 0 ? (
                    <div className="space-y-3">
                      {documentationLinks.length > linkPaginationSize && (
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            Showing {documentationShowingStart} to {documentationShowingEnd} of {documentationLinks.length} documentation links
                          </span>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setDocLinksPage(prev => Math.max(1, prev - 1))}
                              disabled={currentDocumentationPage === 1}
                            >
                              <ArrowLeft className="h-4 w-4" />
                              Previous
                            </Button>
                            <span className="px-2.5 py-1 bg-muted rounded text-[11px]">
                              {currentDocumentationPage} of {documentationTotalPages}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setDocLinksPage(prev => Math.min(prev + 1, documentationTotalPages))}
                              disabled={currentDocumentationPage === documentationTotalPages}
                            >
                              Next
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    <div className="space-y-1 sm:space-y-2">
                        {paginatedDocumentationLinks.map((link, index) => {
                          const actualIndex = docSliceStart + index
                        // Ensure URL has protocol
                        const formattedLink = link.startsWith('http://') || link.startsWith('https://')
                          ? link
                          : `https://${link}`

                        return (
                          <a
                              key={actualIndex}
                            href={formattedLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 p-2 sm:p-3 border rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer group"
                          >
                            <span className="text-xs sm:text-sm text-primary group-hover:underline flex-1 truncate break-all sm:break-normal">
                              {link}
                            </span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0 group-hover:text-primary transition-colors self-start sm:self-auto cursor-pointer" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Open link</p>
                                </TooltipContent>
                              </Tooltip>
                          </a>
                        )
                      })}
                      </div>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-muted rounded-lg p-4 sm:p-6 text-center">
                      <LinkIcon className="h-6 w-6 sm:h-8 sm:w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-xs sm:text-sm text-muted-foreground">No documentation links added yet</p>
                    </div>
                  )}
                </div>

                {/* Empty State - Show only if all sections are empty */}
                {(!project.attachments || project.attachments.length === 0) &&
                  (!project.externalLinks?.figma || project.externalLinks.figma.length === 0) &&
                  (!project.externalLinks?.documentation || project.externalLinks.documentation.length === 0) && (
                    <div className="border-2 border-dashed border-muted rounded-lg p-6 sm:p-8 text-center">
                      <Paperclip className="h-8 w-8 sm:h-10 sm:w-10 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-sm sm:text-base text-muted-foreground mb-1">No attachments or links added yet</p>
                      <p className="text-xs sm:text-sm text-muted-foreground">Upload files or add external links to get started</p>
                    </div>
                  )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="budget" className="space-y-8">
            {/* Budget Overview */}
            {project.budget && (
              <Card>
                <CardHeader>
                  <CardTitle>Budget Overview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Total Budget</p>
                      <p className="text-2xl font-bold text-foreground">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: orgCurrency }).format(project.budget.total)}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Spent</p>
                      <p className="text-2xl font-bold text-red-600">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: orgCurrency }).format(project.budget.spent || 0)}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Remaining</p>
                      <p className="text-2xl font-bold text-green-600">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: orgCurrency }).format(project.budget.total - (project.budget.spent || 0))}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 pt-4 border-t">
                    <p className="text-sm font-medium text-muted-foreground mb-3">Budget by Category</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">

                      <div>
                        <p className="text-xs text-muted-foreground">Materials</p>
                        <p className="text-sm font-semibold">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: orgCurrency }).format(project.budget.categories.materials || 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Overhead</p>
                        <p className="text-sm font-semibold">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: orgCurrency }).format(project.budget.categories.overhead || 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">External</p>
                        <p className="text-sm font-semibold">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: orgCurrency }).format((project.budget.categories as any).external || 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Expenses Section */}
            {project.settings?.allowExpenseTracking && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Expenses</CardTitle>
                    <PermissionGate 
                      permission={Permission.PROJECT_MANAGE_BUDGET}
                      projectId={projectId}
                    >
                      <Button onClick={() => setShowAddExpenseDialog(true)} size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Expense
                      </Button>
                    </PermissionGate>
                  </div>
                </CardHeader>


                <CardContent>
                  {expensesLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : expenses.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <DollarSign className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No expenses added yet</p>
                      <p className="text-sm mt-1">Click "Add Expense" to get started</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {expenses.map((expense: any) => {
                        const attachments: ExpenseAttachment[] = Array.isArray(expense.attachments)
                          ? expense.attachments as ExpenseAttachment[]
                          : []
                        const isExpanded = expandedExpenseAttachments[expense._id]
                        return (
                          <Card key={expense._id} className="hover:shadow-md transition-shadow">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex-1">
                                  <h4 className="font-semibold text-sm mb-1">{expense.name}</h4>
                                  {expense.description && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <p className="text-xs text-muted-foreground line-clamp-2 mb-2 cursor-help">{expense.description}</p>
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs">
                                          <p className="text-sm">{expense.description}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </div>
                                <PermissionGate 
                                  permission={Permission.PROJECT_MANAGE_BUDGET}
                                  projectId={projectId}
                                >
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={(e) => {
                                        e.stopPropagation()
                                        setEditingExpense(expense)
                                      }}>
                                        <Edit className="h-4 w-4 mr-2" />
                                        Edit Expense
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleExpenseDeleted(expense._id, expense.name)
                                        }}
                                        className="text-destructive"
                                      >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Delete
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </PermissionGate>
                              </div>

                              <div className="flex items-center justify-start mb-2">
                                <Badge variant={expense.paidStatus === 'paid' ? 'default' : 'secondary'}>
                                  {expense.paidStatus === 'paid' ? 'Paid' : 'Unpaid'}
                                </Badge>
                              </div>

                              <div className="space-y-1 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Amount:</span>
                                  <span className="font-semibold">
                                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: orgCurrency }).format(expense.fullAmount)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Category:</span>
                                  <span className="capitalize">{expense.category}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Date:</span>
                                  <span>{formatDate(expense.expenseDate)}</span>
                                </div>
                                {expense.isBillable && (
                                  <Badge variant="outline" className="mt-1">Billable</Badge>
                                )}
                                {expense.paidStatus === 'paid' && expense.paidBy && (
                                  <div className="flex justify-between mt-1">
                                    <span className="text-muted-foreground">Paid by:</span>
                                    <span>{expense.paidBy.firstName} {expense.paidBy.lastName}</span>
                                  </div>
                                )}
                              </div>

                              <div className="mt-4 border-t pt-3">
                                <button
                                  type="button"
                                  onClick={() => toggleExpenseAttachments(expense._id)}
                                  className="flex w-full items-center justify-between text-xs font-semibold text-primary hover:text-primary/80"
                                  aria-expanded={isExpanded ? 'true' : 'false'}
                                >
                                  <span>
                                    View attachments {attachments.length > 0 ? `(${attachments.length})` : ''}
                                  </span>
                                  <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                </button>
                                {isExpanded && (
                                  <div className="mt-3 space-y-2">
                                    {attachments.length === 0 ? (
                                      <p className="text-xs text-muted-foreground">No attachments added for this expense.</p>
                                    ) : (
                                      attachments.map((att, idx) => (
                                        <div
                                          key={`${expense._id}-${att.url || idx}`}
                                          className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-2 text-xs sm:flex-row sm:items-center sm:justify-between"
                                        >
                                          <div className="flex items-center gap-2 min-w-0">
                                            <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                            <div className="min-w-0">
                                              <p className="font-medium text-foreground truncate" title={att.name || 'Attachment'}>
                                                {att.name || 'Attachment'}
                                              </p>
                                              {att.size && (
                                                <p className="text-[11px] text-muted-foreground">{formatFileSize(att.size)}</p>
                                              )}
                                            </div>
                                          </div>
                                          {att.url ? (
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" asChild>
                                                <a href={att.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">
                                                  <ExternalLink className="h-3.5 w-3.5" />
                                                  View
                                                </a>
                                              </Button>
                                              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" asChild>
                                                <a href={att.url} download={att.name || 'attachment'} className="inline-flex items-center gap-1">
                                                  <Download className="h-3.5 w-3.5" />
                                                  Download
                                                </a>
                                              </Button>
                                            </div>
                                          ) : (
                                            <p className="text-[11px] text-destructive">Attachment URL unavailable.</p>
                                          )}
                                        </div>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="tasks" className="space-y-8">
            <TaskList
              projectId={projectId}
              onCreateTask={() => setShowCreateTaskModal(true)}
            />
          </TabsContent>

          <TabsContent value="kanban" className="space-y-8">
            <KanbanBoard
              projectId={projectId}
              onCreateTask={() => setShowCreateTaskModal(true)}
              onEditTask={(task) => {
                setSelectedTask(task)
                setShowEditTaskModal(true)
              }}
              onDeleteTask={(taskId) => {
                const task = tasks.find(t => t._id === taskId)
                if (task) {
                  setSelectedTask(task)
                  setShowDeleteConfirmModal(true)
                }
              }}
            />
          </TabsContent>

          <TabsContent value="calendar" className="space-y-8">
            <CalendarView
              projectId={projectId}
              onCreateTask={() => setShowCreateTaskModal(true)}
            />
          </TabsContent>

          <TabsContent value="backlog" className="space-y-8">
            <BacklogView
              projectId={projectId}
              onCreateTask={() => setShowCreateTaskModal(true)}
            />
          </TabsContent>

          <TabsContent value="testing" className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1">
                <TestSuiteTree
                  key={`${projectId}-${suitesRefreshCounter}`}
                  projectId={projectId}
                  onSuiteSelect={(suite) => console.log('Selected suite:', suite)}
                  onSuiteCreate={(parentSuiteId) => {
                    setEditingSuite(null)
                    setParentSuiteIdForCreate(parentSuiteId)
                    setSuiteDialogOpen(true)
                  }}
                  onSuiteEdit={(suite) => {
                    setEditingSuite(suite)
                    setParentSuiteIdForCreate(undefined)
                    setSuiteDialogOpen(true)
                  }}
                  onSuiteDelete={(suiteId) => console.log('Delete suite:', suiteId)}
                />
              </div>
              <div className="lg:col-span-2">
                <TestCaseList
                  projectId={projectId}
                  key={`${projectId}-${testCasesRefreshCounter}`}
                  onTestCaseSelect={(testCase) => console.log('Selected test case:', testCase)}
                  onTestCaseCreate={(testSuiteId) => {
                    setEditingTestCase(null)
                    setCreateCaseSuiteId(testSuiteId)
                    setTestCaseDialogOpen(true)
                  }}
                  onTestCaseEdit={(testCase) => console.log('Edit test case:', testCase)}
                  onTestCaseDelete={(testCaseId) => console.log('Delete test case:', testCaseId)}
                  onTestCaseExecute={(testCase) => console.log('Execute test case:', testCase)}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="reports" className="space-y-8">
            <div className="space-y-8">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl sm:text-2xl font-semibold text-foreground">Project Reports</h3>
                  <p className="text-sm sm:text-base text-muted-foreground mt-1">
                    View detailed reports and analytics for this project
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                  <Button variant="outline" size="sm" className="w-full sm:w-auto">
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                  <Button variant="outline" size="sm" className="w-full sm:w-auto">
                    <Calendar className="h-4 w-4 mr-2" />
                    Schedule Report
                  </Button>
                </div>
              </div>

              <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Project Progress</CardTitle>
                    <Target className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{project?.stats?.tasks?.completionRate || 0}%</div>
                    <p className="text-xs text-muted-foreground">
                      {project?.stats?.tasks?.completed || 0} of {project?.stats?.tasks?.total || 0} tasks completed
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Budget Utilization</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{project?.stats?.budget?.utilizationRate || 0}%</div>
                    <p className="text-xs text-muted-foreground">
                      ${project?.stats?.budget?.spent || 0} of ${project?.stats?.budget?.total || 0} spent
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Time Tracking</CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{project?.stats?.timeTracking?.totalHours || 0}h</div>
                    <p className="text-xs text-muted-foreground">
                      {project?.stats?.timeTracking?.entries || 0} time entries
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-8 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                    <CardDescription>Latest project activities and updates</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center space-x-4">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium">Project created</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(project?.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium">First task completed</p>
                          <p className="text-xs text-muted-foreground">2 days ago</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Team Performance</CardTitle>
                    <CardDescription>Team member productivity and workload</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {project?.teamMembers?.slice(0, 3).map((member: any, index: number) => {
                        const user = member.memberId;
                        return (
                          <div key={member._id || index} className="flex items-center space-x-4">
                            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs font-medium">
                              {user?.firstName?.[0]}{user?.lastName?.[0]}
                            </div>
                            <div className="flex-1 space-y-1">
                              <p className="text-sm font-medium">
                                {user?.firstName} {user?.lastName}
                              </p>
                              <p className="text-xs text-muted-foreground">{user?.role ? formatToTitleCase(user.role.replace(/_/g, ' ')) : ''}</p>
                              {member.hourlyRate && (
                                <p className="text-xs text-muted-foreground">
                                  ${member.hourlyRate}/hr
                                </p>
                              )}
                            </div>
                            <Badge variant="secondary" className="hover:bg-secondary dark:hover:bg-secondary">Active</Badge>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <div className="space-y-6">
              <div className='mb-4'>
                <h3 className="text-lg font-semibold text-foreground">Project Settings</h3>
                <p className="text-sm text-muted-foreground">
                  Manage project configuration and preferences
                </p>
              </div>


              <div className="grid gap-6 lg:grid-cols-2">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Tracking & Approvals</CardTitle>
                    <CardDescription>Control how work is tracked and approved</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    
                  <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <Label htmlFor="allow-billable-time">Billable Project</Label>
                        <p className="text-sm text-muted-foreground">
                          Mark this project as billable for time tracking and invoicing
                          {globalTimeTrackingSettings && !globalTimeTrackingSettings.allowBillableTime && (
                            <span className="block text-xs text-amber-600 dark:text-amber-400 mt-1">
                              ⚠️ Disabled globally in Application Settings
                            </span>
                          )}
                        </p>
                      </div>
                      <Switch
                        id="allow-billable-time"
                        checked={settingsForm.allowBillableTime && (globalTimeTrackingSettings?.allowBillableTime ?? true)}
                        disabled={!globalTimeTrackingSettings?.allowBillableTime}
                        onCheckedChange={(checked) =>
                          setSettingsForm((prev) => ({
                            ...prev,
                            allowBillableTime: checked,
                          }))
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <Label htmlFor="allow-time-tracking">Allow Time Tracking</Label>
                        <p className="text-sm text-muted-foreground">
                          Enable time tracking for this project
                          {globalTimeTrackingSettings && !globalTimeTrackingSettings.allowTimeTracking && (
                            <span className="block text-xs text-amber-600 dark:text-amber-400 mt-1">
                              ⚠️ Disabled globally in Application Settings
                            </span>
                          )}
                        </p>
                      </div>
                      <Switch
                        id="allow-time-tracking"
                        checked={settingsForm.allowTimeTracking && (globalTimeTrackingSettings?.allowTimeTracking ?? true)}
                        disabled={!globalTimeTrackingSettings?.allowTimeTracking}
                        onCheckedChange={(checked) =>
                          setSettingsForm((prev) => ({
                            ...prev,
                            allowTimeTracking: checked,
                            allowManualTimeSubmission: checked ? prev.allowManualTimeSubmission : false,
                          }))
                        }
                      />
                    </div>

                    {settingsForm.allowTimeTracking && (
                      <div className="ml-0 pl-4 border-l-2 border-muted">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1">
                            <Label htmlFor="allow-manual-time-submission">Allow Manual Time Submission</Label>
                            <p className="text-sm text-muted-foreground">
                              Allow team members to submit time entries manually
                              {globalTimeTrackingSettings && !globalTimeTrackingSettings.allowManualTimeSubmission && (
                                <span className="block text-xs text-amber-600 dark:text-amber-400 mt-1">
                                  ⚠️ Disabled globally in Application Settings
                                </span>
                              )}
                            </p>
                          </div>
                          <Switch
                            id="allow-manual-time-submission"
                            checked={settingsForm.allowManualTimeSubmission && (globalTimeTrackingSettings?.allowManualTimeSubmission ?? true)}
                            disabled={!globalTimeTrackingSettings?.allowManualTimeSubmission}
                            onCheckedChange={(checked) =>
                              setSettingsForm((prev) => ({
                                ...prev,
                                allowManualTimeSubmission: checked,
                              }))
                            }
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <Label htmlFor="allow-expense-tracking">Allow Expense Tracking</Label>
                        <p className="text-sm text-muted-foreground">Enable expense tracking for this project</p>
                      </div>
                      <Switch
                        id="allow-expense-tracking"
                        checked={settingsForm.allowExpenseTracking}
                        onCheckedChange={(checked) =>
                          setSettingsForm((prev) => ({
                            ...prev,
                            allowExpenseTracking: checked,
                          }))
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <Label htmlFor="require-approval">Require Approval</Label>
                        <p className="text-sm text-muted-foreground">
                          Require approval for time entries and expenses
                          {globalTimeTrackingSettings?.requireApproval === false && (
                            <span className="block text-xs text-amber-600 dark:text-amber-400 mt-1">
                              ⚠️ Disabled globally in Application Settings
                            </span>
                          )}
                        </p>
                      </div>
                      <Switch
                        id="require-approval"
                        checked={(() => {
                          const isChecked = globalTimeTrackingSettings?.requireApproval === false ? false : settingsForm.requireApproval
                          return isChecked
                        })()}
                        disabled={globalTimeTrackingSettings?.requireApproval === false}
                        onCheckedChange={(checked) => {      
                          setSettingsForm((prev) => ({
                            ...prev,
                            requireApproval: checked,
                          }))
                        }}
                      />
                    </div>

                  </CardContent>
                  <CardFooter className="justify-end">
                    <Button onClick={handleSaveSettings}
                      disabled={savingSettings || !trackingSettingsChanged}
                    >
                      {savingSettings ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Update Tracking Settings
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>

                {/* <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Notification Preferences</CardTitle>
                    <CardDescription>Choose which notifications to send for this project</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <Label htmlFor="notify-task-updates">Task Updates</Label>
                        <p className="text-sm text-muted-foreground">Notify the team about task status changes</p>
                      </div>
                      <Switch
                        id="notify-task-updates"
                        checked={settingsForm.notifications.taskUpdates}
                        onCheckedChange={(checked) =>
                          setSettingsForm((prev) => ({
                            ...prev,
                            notifications: {
                              ...prev.notifications,
                              taskUpdates: checked,
                            },
                          }))
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <Label htmlFor="notify-budget-alerts">Budget Alerts</Label>
                        <p className="text-sm text-muted-foreground">Receive alerts when budget thresholds are met</p>
                      </div>
                      <Switch
                        id="notify-budget-alerts"
                        checked={settingsForm.notifications.budgetAlerts}
                        onCheckedChange={(checked) =>
                          setSettingsForm((prev) => ({
                            ...prev,
                            notifications: {
                              ...prev.notifications,
                              budgetAlerts: checked,
                            },
                          }))
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <Label htmlFor="notify-deadline-reminders">Deadline Reminders</Label>
                        <p className="text-sm text-muted-foreground">Send reminders as deadlines approach</p>
                      </div>
                      <Switch
                        id="notify-deadline-reminders"
                        checked={settingsForm.notifications.deadlineReminders}
                        onCheckedChange={(checked) =>
                          setSettingsForm((prev) => ({
                            ...prev,
                            notifications: {
                              ...prev.notifications,
                              deadlineReminders: checked,
                            },
                          }))
                        }
                      />
                    </div>
                  </CardContent>
                  <CardFooter className="justify-end">
                    <Button onClick={handleSaveSettings} disabled={savingSettings || !notificationSettingsChanged}>
                      {savingSettings ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Update Notification Settings
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card> */}

              </div>
            </div>
          </TabsContent>
        </Tabs>

        <ResponsiveDialog
          open={suiteDialogOpen}
          onOpenChange={setSuiteDialogOpen}
          title={editingSuite ? 'Edit Test Suite' : 'Create Test Suite'}
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSuiteDialogOpen(false)
                  setEditingSuite(null)
                  setParentSuiteIdForCreate(undefined)
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={suiteSaving}
                form="test-suite-form"
              >
                {suiteSaving ? 'Saving...' : (editingSuite?._id ? 'Update Test Suite' : 'Create Test Suite')}
              </Button>
            </>
          }
        >
          <TestSuiteForm
            testSuite={editingSuite || (parentSuiteIdForCreate ? { name: '', description: '', parentSuite: parentSuiteIdForCreate, project: projectId } as any : undefined)}
            projectId={projectId}
            onSave={async (suiteData) => {
              setSuiteSaving(true)
              try {
                const isEdit = !!editingSuite?._id
                const res = await fetch('/api/test-suites', {
                  method: isEdit ? 'PUT' : 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    ...(isEdit ? { suiteId: editingSuite._id } : {}),
                    name: suiteData.name,
                    description: suiteData.description,
                    projectId: projectId,
                    parentSuiteId: suiteData.parentSuite || parentSuiteIdForCreate,
                  })
                })
                if (res.ok) {
                  setSuiteDialogOpen(false)
                  setEditingSuite(null)
                  setParentSuiteIdForCreate(undefined)
                  setSuitesRefreshCounter(c => c + 1)
                } else {
                  const data = await res.json().catch(() => ({}))
                  console.error('Failed to save test suite', data)
                }
              } catch (e) {
                console.error('Error saving test suite:', e)
              } finally {
                setSuiteSaving(false)
              }
            }}
            onCancel={() => {
              setSuiteDialogOpen(false)
              setEditingSuite(null)
              setParentSuiteIdForCreate(undefined)
            }}
            loading={suiteSaving}
          />
        </ResponsiveDialog>

        <ResponsiveDialog
          open={testCaseDialogOpen}
          onOpenChange={setTestCaseDialogOpen}
          title={editingTestCase ? 'Edit Test Case' : 'Create Test Case'}
        >
          <TestCaseForm
            testCase={editingTestCase || (createCaseSuiteId ? { testSuite: createCaseSuiteId } as any : undefined)}
            projectId={projectId}
            onSave={async (testCaseData: any) => {
              setTestCaseSaving(true)
              try {
                const isEdit = !!editingTestCase?._id
                const res = await fetch('/api/test-cases', {
                  method: isEdit ? 'PUT' : 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    ...(isEdit ? { testCaseId: editingTestCase._id } : {}),
                    ...testCaseData,
                    projectId,
                  })
                })
                if (res.ok) {
                  setTestCaseDialogOpen(false)
                  setEditingTestCase(null)
                  setCreateCaseSuiteId(undefined)
                  setTestCasesRefreshCounter(c => c + 1)
                } else {
                  const data = await res.json().catch(() => ({}))
                  console.error('Failed to save test case', data)
                }
              } catch (e) {
                console.error('Error saving test case:', e)
              } finally {
                setTestCaseSaving(false)
              }
            }}
            onCancel={() => {
              setTestCaseDialogOpen(false)
              setEditingTestCase(null)
              setCreateCaseSuiteId(undefined)
            }}
            loading={testCaseSaving}
          />
        </ResponsiveDialog>

        {/* Create Task Modal */}
        <CreateTaskModal
          isOpen={showCreateTaskModal}
          onClose={() => setShowCreateTaskModal(false)}
          projectId={projectId}
          onTaskCreated={() => {
            setShowCreateTaskModal(false)
            // Refresh project data to update task counts
            fetchProject()
            // Refresh tasks list
            fetchTasks()
          }}
        />

        {/* Edit Task Modal */}
        {selectedTask && (
          <EditTaskModal
            isOpen={showEditTaskModal}
            onClose={() => {
              setShowEditTaskModal(false)
              setSelectedTask(null)
            }}
            task={selectedTask}
            onTaskUpdated={() => {
              setShowEditTaskModal(false)
              setSelectedTask(null)
              // Refresh project data to update task counts
              fetchProject()
              // Refresh tasks list
              fetchTasks()
            }}
          />
        )}

        {/* View Task Modal */}
        {selectedTask && (
          <ViewTaskModal
            isOpen={false} // We'll handle this separately if needed
            onClose={() => {
              setSelectedTask(null)
            }}
            task={selectedTask}
            onEdit={() => {
              setShowEditTaskModal(true)
            }}
            onDelete={() => {
              setShowDeleteConfirmModal(true)
            }}
          />
        )}

        {/* Delete Confirmation Modal */}
        <ConfirmationModal
          isOpen={showDeleteConfirmModal}
          onClose={() => {
            setShowDeleteConfirmModal(false)
            setSelectedTask(null)
          }}
          onConfirm={async () => {
            if (selectedTask) {
              try {
                const response = await fetch(`/api/tasks/${selectedTask._id}`, {
                  method: 'DELETE'
                })

                if (response.ok) {
                  setShowDeleteConfirmModal(false)
                  setSelectedTask(null)
                  // Refresh project data to update task counts
                  fetchProject()
                  // Refresh tasks list
                  fetchTasks()
                } else {
                  console.error('Failed to delete task')
                }
              } catch (error) {
                console.error('Error deleting task:', error)
              }
            }
          }}
          title="Delete Task"
          description={`Are you sure you want to delete "${selectedTask?.title}"? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          variant="destructive"
        />

        <AddExpenseDialog
          open={showAddExpenseDialog}
          onClose={() => setShowAddExpenseDialog(false)}
          projectId={projectId}
          onSuccess={() => {
            showExpenseSuccess('Expense added successfully')
            fetchExpenses()
            fetchProject() // Refresh project to update budget
          }}
        />

        <AddExpenseDialog
          open={!!editingExpense}
          onClose={() => setEditingExpense(null)}
          projectId={projectId}
          expense={editingExpense}
          onSuccess={() => {
            notifySuccess({ title: 'Expense Updated', message: 'Expense has been updated successfully' })
            fetchExpenses()
            fetchProject() // Refresh project to update budget
          }}
        />

        {/* Delete Expense Confirmation Modal */}
        <ConfirmationModal
          isOpen={showDeleteExpenseConfirmModal}
          onClose={() => {
            setShowDeleteExpenseConfirmModal(false)
            setExpenseToDelete(null)
          }}
          onConfirm={confirmDeleteExpense}
          title="Delete Expense"
          description={`Are you sure you want to delete "${expenseToDelete?.name}"? This action cannot be undone.`}
          confirmText="Delete Expense"
          cancelText="Cancel"
          variant="destructive"
        />
      </div>
    </MainLayout>
    </TooltipProvider>
  )
}
