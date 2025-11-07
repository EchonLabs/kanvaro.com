'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  ArrowLeft, 
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
  Edit,
  UserPlus,
  Save,
  Trash2
} from 'lucide-react'
import CreateTaskModal from '@/components/tasks/CreateTaskModal'
import EditTaskModal from '@/components/tasks/EditTaskModal'
import ViewTaskModal from '@/components/tasks/ViewTaskModal'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
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

interface Project {
  _id: string
  name: string
  description: string
  status: 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  isDraft: boolean
  startDate: string
  endDate?: string
  projectNumber?: number
  budget?: {
    total: number
    spent: number
    currency: string
    categories: {
      labor: number
      materials: number
      overhead: number
    }
  }
  createdBy: {
    firstName: string
    lastName: string
    email: string
  }
  teamMembers: Array<{
    firstName: string
    lastName: string
    email: string
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
  createdAt: string
  updatedAt: string
}

export default function ProjectDetailPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const projectId = params.id as string
  const activeTab = searchParams.get('tab') || 'overview'
  
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
  const [editingSuite, setEditingSuite] = useState<any | null>(null)
  const [parentSuiteIdForCreate, setParentSuiteIdForCreate] = useState<string | undefined>(undefined)
  const [suitesRefreshCounter, setSuitesRefreshCounter] = useState(0)
  const [testCaseDialogOpen, setTestCaseDialogOpen] = useState(false)
  const [testCaseSaving, setTestCaseSaving] = useState(false)
  const [editingTestCase, setEditingTestCase] = useState<any | null>(null)
  const [createCaseSuiteId, setCreateCaseSuiteId] = useState<string | undefined>(undefined)
  const [testCasesRefreshCounter, setTestCasesRefreshCounter] = useState(0)

  useEffect(() => {
    if (projectId) {
      fetchProject()
      fetchTasks()
    }
  }, [projectId])

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planning': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'active': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'on_hold': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      case 'completed': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
      case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'planning': return <Calendar className="h-4 w-4" />
      case 'active': return <Play className="h-4 w-4" />
      case 'on_hold': return <Pause className="h-4 w-4" />
      case 'completed': return <CheckCircle className="h-4 w-4" />
      case 'cancelled': return <XCircle className="h-4 w-4" />
      default: return <Calendar className="h-4 w-4" />
    }
  }

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
    <MainLayout>
      <div className="space-y-6">
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
                  className="text-2xl sm:text-3xl font-bold text-foreground truncate max-w-full"
                  title={project.name}
                >
                  {project.name}
                </h1>
                {typeof project.projectNumber !== 'undefined' && (
                  <Badge variant="outline" className="flex-shrink-0">#{project.projectNumber}</Badge>
                )}
                {project.isDraft && (
                  <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 flex-shrink-0">
                    Draft
                  </Badge>
                )}
                <Badge className={getStatusColor(project.status) + ' flex-shrink-0'}>
                  {getStatusIcon(project.status)}
                  <span className="ml-1">{project.status.replace('_', ' ')}</span>
                </Badge>
              </div>
              <p className="text-sm sm:text-base text-muted-foreground mt-1 break-words whitespace-normal" title={project.description || 'No description'}>
                <span className="sm:hidden">
                  {project.description && project.description.length > 25 
                    ? `${project.description.substring(0, 25)}...` 
                    : (project.description || 'No description')}
                </span>
                <span className="hidden sm:inline">
                  {project.description && project.description.length > 100 
                    ? `${project.description.substring(0, 100)}...` 
                    : (project.description || 'No description')}
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button size="sm" onClick={() => setShowCreateTaskModal(true)} className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Add Task
            </Button>
          </div>
        </div>

        {/* Project Stats */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
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
                    {project.budget ? `${project.budget.currency} ${project.budget.total.toLocaleString()}` : 'N/A'}
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
        }} className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-1 overflow-x-auto">
            <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
            <TabsTrigger value="team" className="text-xs sm:text-sm">Team</TabsTrigger>
            <TabsTrigger value="tasks" className="text-xs sm:text-sm">Tasks</TabsTrigger>
            <TabsTrigger value="kanban" className="text-xs sm:text-sm">Kanban</TabsTrigger>
            <TabsTrigger value="calendar" className="text-xs sm:text-sm">Calendar</TabsTrigger>
            <TabsTrigger value="backlog" className="text-xs sm:text-sm">Backlog</TabsTrigger>
            <TabsTrigger value="testing" className="text-xs sm:text-sm">Testing</TabsTrigger>
            <TabsTrigger value="reports" className="text-xs sm:text-sm">Reports</TabsTrigger>
            <TabsTrigger value="settings" className="text-xs sm:text-sm">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-6">
                {/* Project Details */}
                <Card>
                  <CardHeader>
                    <CardTitle>Project Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">Start Date</span>
                          <span className="text-sm text-foreground">
                            {new Date(project.startDate).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">End Date</span>
                          <span className="text-sm text-foreground">
                            {project.endDate ? new Date(project.endDate).toLocaleDateString() : 'Not set'}
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
                            {new Date(project.createdAt).toLocaleDateString()}
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
                            {project.budget.currency} {project.budget.total.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">Spent</span>
                          <span className="text-sm text-foreground">
                            {project.budget.currency} {project.budget.spent.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">Remaining</span>
                          <span className="text-sm text-foreground">
                            {project.budget.currency} {(project.budget.total - project.budget.spent).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-muted-foreground">Categories</div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span>Labor</span>
                            <span>{project.budget.currency} {project.budget.categories.labor.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span>Materials</span>
                            <span>{project.budget.currency} {project.budget.categories.materials.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span>Overhead</span>
                            <span>{project.budget.currency} {project.budget.categories.overhead.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              <div className="space-y-6">
                {/* Team Members */}
                <Card>
                  <CardHeader>
                    <CardTitle>Team Members</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {project.teamMembers.map((member, index) => (
                      <div key={index} className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">
                          {member.firstName[0]}{member.lastName[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {member.firstName} {member.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Quick Actions */}
                <Card>
                  <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setShowCreateTaskModal(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Task
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full justify-start"
                      onClick={() => router.push(`/projects/${projectId}?tab=team`)}
                    >
                      <Users className="mr-2 h-4 w-4" />
                      Manage Team
                    </Button>
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

          <TabsContent value="team" className="space-y-6">
            <ProjectTeamTab projectId={projectId} project={project} onUpdate={fetchProject} />
          </TabsContent>

          <TabsContent value="tasks" className="space-y-4">
            <TaskList 
              projectId={projectId} 
              onCreateTask={() => setShowCreateTaskModal(true)}
            />
          </TabsContent>

          <TabsContent value="kanban" className="space-y-4">
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

          <TabsContent value="calendar" className="space-y-4">
            <CalendarView 
              projectId={projectId} 
              onCreateTask={() => setShowCreateTaskModal(true)}
            />
          </TabsContent>

          <TabsContent value="backlog" className="space-y-4">
            <BacklogView 
              projectId={projectId} 
              onCreateTask={() => setShowCreateTaskModal(true)}
            />
          </TabsContent>

          <TabsContent value="testing" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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

          <TabsContent value="reports" className="space-y-6">
            <div className="space-y-6">
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

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
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

              <div className="grid gap-6 lg:grid-cols-2">
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
                            {new Date(project?.createdAt).toLocaleDateString()}
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
                      {project?.teamMembers?.slice(0, 3).map((member: any, index: number) => (
                        <div key={index} className="flex items-center space-x-4">
                          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs font-medium">
                            {member.firstName?.[0]}{member.lastName?.[0]}
                          </div>
                          <div className="flex-1 space-y-1">
                            <p className="text-sm font-medium">
                              {member.firstName} {member.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground">{member.role}</p>
                          </div>
                          <Badge variant="secondary">Active</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Project Settings</h3>
                <p className="text-sm text-muted-foreground">
                  Manage project configuration and preferences
                </p>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>General Settings</CardTitle>
                    <CardDescription>Basic project information and settings</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="project-name">Project Name</Label>
                      <Input
                        id="project-name"
                        value={project?.name || ''}
                        readOnly
                        className="bg-muted"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="project-description">Description</Label>
                      <Textarea
                        id="project-description"
                        value={project?.description || ''}
                        readOnly
                        className="bg-muted"
                        rows={3}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="start-date">Start Date</Label>
                        <Input
                          id="start-date"
                          type="date"
                          value={project?.startDate ? new Date(project.startDate).toISOString().split('T')[0] : ''}
                          readOnly
                          className="bg-muted"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="end-date">End Date</Label>
                        <Input
                          id="end-date"
                          type="date"
                          value={project?.endDate ? new Date(project.endDate).toISOString().split('T')[0] : ''}
                          readOnly
                          className="bg-muted"
                        />
                      </div>
                    </div>
                    <Button variant="outline" className="w-full">
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Project Details
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Project Status</CardTitle>
                    <CardDescription>Current project status and workflow settings</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="status">Status</Label>
                      <Select value={project?.status || 'active'}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="on-hold">On Hold</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="priority">Priority</Label>
                      <Select value={project?.priority || 'medium'}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button variant="outline" className="w-full">
                      <Save className="h-4 w-4 mr-2" />
                      Save Settings
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Danger Zone</CardTitle>
                    <CardDescription>Irreversible actions for this project</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-4 border border-destructive rounded-lg">
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-destructive">Delete Project</h4>
                        <p className="text-xs text-muted-foreground">
                          Permanently delete this project and all its data. This action cannot be undone.
                        </p>
                        <Button variant="destructive" size="sm">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Project
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
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

      </div>
    </MainLayout>
  )
}
