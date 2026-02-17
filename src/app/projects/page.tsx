
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { formatToTitleCase } from '@/lib/utils'
import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { useOrganization } from '@/hooks/useOrganization'
import { useOrgCurrency } from '@/hooks/useOrgCurrency'
import { useAuth } from '@/hooks/useAuth'
import { useNotify } from '@/lib/notify'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PermissionGate, PermissionButton } from '@/lib/permissions/permission-components'
import { Permission } from '@/lib/permissions/permission-definitions'
import { PageContent } from '@/components/ui/PageContent'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
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
  Edit,
  Trash2,
  Eye
} from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'

interface Project {
  _id: string
  name: string
  description: string
  status: 'draft' | 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  isDraft: boolean
  startDate: string
  endDate?: string
  projectNumber?: number
  budget?: {
    total: number
    spent: number
    currency: string
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
  createdAt: string
}

export default function ProjectsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const { organization } = useOrganization()
  const { formatCurrency } = useOrgCurrency()
  const { success: notifySuccess, error: notifyError } = useNotify()
  const { formatDate } = useDateTime()
  const orgCurrency = organization?.currency || 'USD'
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [authError, setAuthError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [totalCount, setTotalCount] = useState(0)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Seed filters from URL search params on mount
  useEffect(() => {
    const q = searchParams.get('search') || ''
    const s = searchParams.get('status') || 'all'
    const p = searchParams.get('priority') || 'all'
    setSearchQuery(q)
    setDebouncedSearchQuery(q) // Also set debounced query for immediate search
    setStatusFilter(s)
    setPriorityFilter(p)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')

      if (response.ok) {
        setAuthError('')
        await fetchProjects()
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })

        if (refreshResponse.ok) {
          setAuthError('')
          await fetchProjects()
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
    }
  }, [router])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Refetch projects when filters or pagination change
  useEffect(() => {
    if (!loading && !authError) {
      fetchProjects()
    }
  }, [debouncedSearchQuery, statusFilter, priorityFilter, currentPage, pageSize])

  // Debounce search query to avoid excessive API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300) // 300ms delay

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Refresh projects when page regains focus (user returns from another page)
  useEffect(() => {
    const handleFocus = () => {
      if (!loading && !authError) {
        fetchProjects()
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !loading && !authError) {
        fetchProjects()
      }
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, authError])

  const fetchProjects = async () => {
    try {
      // Only show full loading state on initial load
      if (isInitialLoad) {
        setLoading(true)
      } else {
        setSearching(true)
      }
      const params = new URLSearchParams()
      if (debouncedSearchQuery) params.set('search', debouncedSearchQuery)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (priorityFilter !== 'all') params.set('priority', priorityFilter)
      params.set('page', currentPage.toString())
      params.set('limit', pageSize.toString())

      const response = await fetch(`/api/projects?${params.toString()}`)
      const data = await response.json()

      if (data.success) {

        setProjects(data.data)
        setTotalCount(data.pagination?.total || data.data.length)
      } else {
        notifyError({ title: 'Error', message: data.error || 'Failed to fetch projects' })
      }
    } catch (err) {
      notifyError({ title: 'Error', message: 'Failed to fetch projects' })
    } finally {
      if (isInitialLoad) {
        setLoading(false)
        setIsInitialLoad(false)
      } else {
        setSearching(false)
      }
    }
  }

  const handleDeleteClick = (projectId: string) => {
    setProjectToDelete(projectId)
    setDeleteModalOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!projectToDelete) return

    try {
      setIsDeleting(true)
      const response = await fetch(`/api/projects/${projectToDelete}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        setProjects(projects.filter(p => p._id !== projectToDelete))
        setDeleteModalOpen(false)
        setProjectToDelete(null)
        notifySuccess({ title: 'Success', message: 'Project deleted successfully.' })
      } else {
        notifyError({ title: 'Error', message: data.error || 'Failed to delete project' })
      }
    } catch (err) {
      console.error('Delete error:', err)
      notifyError({ title: 'Error', message: 'Failed to delete project' })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false)
    setProjectToDelete(null)
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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
      case 'medium': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900'
      case 'high': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 hover:bg-orange-100 dark:hover:bg-orange-900'
      case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
    }
  }



  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading projects...</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (authError) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-destructive mb-4">{authError}</p>
            <p className="text-muted-foreground">Redirecting to login...</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <PageContent>
        <div className="space-y-6 sm:space-y-8 lg:space-y-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">Projects</h1>
              <p className="text-sm sm:text-base text-muted-foreground mt-1">Manage and track your projects</p>
            </div>
            <PermissionGate permission={Permission.PROJECT_CREATE}>
              <Button
                onClick={() => router.push('/projects/create')}
                className="flex items-center justify-center gap-2 w-full sm:w-auto text-sm sm:text-base hover:bg-primary/90 hover:shadow-lg transition-all duration-200"
              >
                <Plus className="h-4 w-4" />
                <span className="sm:inline">Create New Project</span>
                <span className="sm:hidden">New Project</span>
              </Button>
            </PermissionGate>
          </div>


          <Card>
            <CardHeader className="p-4 sm:p-6">
              <div className="space-y-3 sm:space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg sm:text-xl">All Projects</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      {totalCount} project{totalCount !== 1 ? 's' : ''} found
                    </CardDescription>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:gap-3">
                  <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <Input
                      ref={searchInputRef}
                      placeholder="Search projects..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 w-full text-sm sm:text-base"
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-full sm:w-[140px] text-sm">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="planning">Planning</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="on_hold">On Hold</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                      <SelectTrigger className="w-full sm:w-[140px] text-sm">
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
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'grid' | 'list')}>
                <TabsList className="grid w-full grid-cols-2 mb-4 sm:mb-6">
                  <TabsTrigger value="grid" className="text-xs sm:text-sm">Grid View</TabsTrigger>
                  <TabsTrigger value="list" className="text-xs sm:text-sm">List View</TabsTrigger>
                </TabsList>


                <TabsContent value="grid" className="space-y-4 mt-0">
                  <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {projects.map((project) => (
                      <Card
                        key={project._id}
                        className="hover:shadow-md transition-shadow cursor-pointer flex flex-col"
                        onClick={() => router.push(`/projects/${project._id}`)}
                      >
                        <CardHeader className="p-4 sm:p-6 pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1.5 min-w-0 flex-1">
                              <div className="flex items-start gap-2 min-w-0">
                                <div className="flex-1 min-w-0">
                                  <CardTitle className="text-base sm:text-lg truncate" title={project.name}>
                                    {project.name}
                                  </CardTitle>
                                </div>
                                <div className="flex flex-shrink-0 items-center gap-1.5 flex-wrap">
                                  {typeof project.projectNumber !== 'undefined' && (
                                    <Badge variant="outline" className="text-xs hover:bg-transparent dark:hover:bg-transparent">#{project.projectNumber}</Badge>
                                  )}
                                  {project.isDraft && (
                                    <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900 text-xs">
                                      Draft
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              {/* <CardDescription className="line-clamp-2 text-xs sm:text-sm" title={project.description}>
                            {project.description || 'No description'}
                          </CardDescription> */}
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 flex-shrink-0"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">More options</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(`/projects/${project._id}`)
                                }}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Project
                                </DropdownMenuItem>
                                <PermissionGate permission={Permission.PROJECT_UPDATE} projectId={project._id}>
                                  <DropdownMenuItem onClick={(e) => {
                                    e.stopPropagation()
                                    router.push(`/projects/${project._id}?tab=settings`)
                                  }}>
                                    <Settings className="h-4 w-4 mr-2" />
                                    Settings
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={(e) => {
                                    e.stopPropagation()
                                    router.push(`/projects/create?edit=${project._id}`)
                                  }}>
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit Project
                                  </DropdownMenuItem>
                                </PermissionGate>
                                <PermissionGate permission={Permission.PROJECT_DELETE} projectId={project._id}>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleDeleteClick(project._id)
                                    }}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Project
                                  </DropdownMenuItem>
                                </PermissionGate>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </CardHeader>
                        <CardContent className="p-4 sm:p-6 pt-0 space-y-3 sm:space-y-4 flex-1 flex flex-col">
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                            <Badge className={`${getStatusColor(project.status)} text-xs`}>
                              <span className="hidden sm:inline">{getStatusIcon(project.status)}</span>
                              <span className="sm:ml-1">{formatToTitleCase(project.status)}</span>
                            </Badge>
                            <Badge className={`${getPriorityColor(project.priority)} text-xs`}>
                              {formatToTitleCase(project.priority)}
                            </Badge>
                          </div>

                          <div className="space-y-2 flex-1">
                            <div className="flex items-center justify-between text-xs sm:text-sm">
                              <span className="text-muted-foreground">Progress</span>
                              <span className="font-medium">{project.progress?.completionPercentage || 0}%</span>
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 sm:h-2.5 overflow-hidden">
                              <div
                                className="bg-blue-600 dark:bg-blue-500 h-full rounded-full transition-all duration-300 ease-out"
                                style={{
                                  width: `${Math.min(100, Math.max(0, project.progress?.completionPercentage || 0))}%`,
                                  minWidth: (project.progress?.completionPercentage || 0) > 0 ? '2px' : '0px'
                                }}
                              />
                            </div>
                            {project.progress && project.progress.totalTasks > 0 && (
                              <p className="text-xs text-muted-foreground">
                                {project.progress.tasksCompleted} of {project.progress.totalTasks} tasks completed
                              </p>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
                            <div className="flex items-center space-x-1.5">
                              <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                              <span>{project.teamMembers.length} {project.teamMembers.length === 1 ? 'member' : 'members'}</span>
                            </div>
                            {project.budget && (
                              <div className="flex items-center space-x-1.5">
                                <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                                <span className="whitespace-nowrap">
                                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: orgCurrency }).format(project.budget.total)}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm pt-1">
                            <div className="flex items-center space-x-1.5 text-gray-500 dark:text-gray-400">
                              <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                              <span className="whitespace-nowrap">{formatDate(project.startDate)}</span>
                            </div>
                            {project.endDate && (
                              <div className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm whitespace-nowrap">
                                Due {formatDate(project.endDate)}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="list" className="space-y-4">
                  <div className="space-y-4">
                    {projects.map((project) => (
                      <Card
                        key={project._id}
                        className="hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => router.push(`/projects/${project._id}`)}
                      >
                        <CardContent className="p-3 sm:p-4">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                            {/* Main Content */}
                            <div className="flex-1 min-w-0">
                              {/* Title and Badges Row */}
                              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-medium text-base sm:text-lg truncate" title={project.name}>
                                    {project.name}
                                  </h3>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 flex-shrink-0">
                                  {typeof project.projectNumber !== 'undefined' && (
                                    <Badge variant="outline" className="text-xs hover:bg-transparent dark:hover:bg-transparent">#{project.projectNumber}</Badge>
                                  )}
                                  {project.isDraft && (
                                    <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900 text-xs">
                                      Draft
                                    </Badge>
                                  )}
                                  <Badge className={`${getStatusColor(project.status)} text-xs`}>
                                    <span className="hidden sm:inline">{getStatusIcon(project.status)}</span>
                                    <span className="sm:ml-1">{formatToTitleCase(project.status)}</span>
                                  </Badge>
                                  <Badge className={`${getPriorityColor(project.priority)} text-xs`}>
                                    {formatToTitleCase(project.priority)}
                                  </Badge>
                                </div>
                              </div>

                              {/* Description */}
                              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2" title={project.description}>
                                {project.description || 'No description'}
                              </p>

                              {/* Metadata - Wraps on mobile */}
                              <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                                <div className="flex items-center space-x-1.5">
                                  <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                                  <span>{project.teamMembers.length} {project.teamMembers.length === 1 ? 'member' : 'members'}</span>
                                </div>
                                <div className="flex items-center space-x-1.5">
                                  <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                                  <span className="whitespace-nowrap">{formatDate(project.startDate)}</span>
                                </div>
                                {project.budget && (
                                  <div className="flex items-center space-x-1.5">
                                    <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                                    <span className="whitespace-nowrap">
                                      {formatCurrency(project.budget.total, project.budget.currency || orgCurrency)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Progress and Actions - Stacks on mobile */}
                            <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-2 flex-shrink-0">
                              {/* Progress Section */}
                              <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                                <div className="text-sm font-medium whitespace-nowrap">{project.progress?.completionPercentage || 0}%</div>
                                <div className="w-24 sm:w-20 bg-gray-200 dark:bg-gray-700 rounded-full h-2 sm:h-2.5 overflow-hidden">
                                  <div
                                    className="bg-blue-600 dark:bg-blue-500 h-full rounded-full transition-all duration-300 ease-out"
                                    style={{
                                      width: `${Math.min(100, Math.max(0, project.progress?.completionPercentage || 0))}%`,
                                      minWidth: (project.progress?.completionPercentage || 0) > 0 ? '2px' : '0px'
                                    }}
                                  />
                                </div>
                                {project.progress && project.progress.totalTasks > 0 && (
                                  <p className="text-xs text-muted-foreground hidden sm:block mt-1">
                                    {project.progress.tasksCompleted}/{project.progress.totalTasks}
                                  </p>
                                )}
                              </div>

                              {/* Dropdown Menu */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 flex-shrink-0"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                    <span className="sr-only">More options</span>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuItem onClick={(e) => {
                                    e.stopPropagation()
                                    router.push(`/projects/${project._id}`)
                                  }}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    View Project
                                  </DropdownMenuItem>
                                  <PermissionGate permission={Permission.PROJECT_UPDATE} projectId={project._id}>
                                    <DropdownMenuItem onClick={(e) => {
                                      e.stopPropagation()
                                      router.push(`/projects/${project._id}?tab=settings`)
                                    }}>
                                      <Settings className="h-4 w-4 mr-2" />
                                      Settings
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={(e) => {
                                      e.stopPropagation()
                                      router.push(`/projects/create?edit=${project._id}`)
                                    }}>
                                      <Edit className="h-4 w-4 mr-2" />
                                      Edit Project
                                    </DropdownMenuItem>
                                  </PermissionGate>
                                  <PermissionGate permission={Permission.PROJECT_DELETE} projectId={project._id}>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleDeleteClick(project._id)
                                      }}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete Project
                                    </DropdownMenuItem>
                                  </PermissionGate>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>

                          {/* Task Progress Info - Mobile only */}
                          {project.progress && project.progress.totalTasks > 0 && (
                            <div className="mt-2 sm:hidden">
                              <p className="text-xs text-muted-foreground">
                                {project.progress.tasksCompleted} of {project.progress.totalTasks} tasks completed
                              </p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>

              {/* Pagination Controls */}
              {projects.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Items per page:</span>
                    <Select value={pageSize.toString()} onValueChange={(value) => {
                      setPageSize(parseInt(value))
                      setCurrentPage(1)
                    }}>
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
                      onClick={() => setCurrentPage(currentPage - 1)}
                      disabled={currentPage === 1 || loading}
                      variant="outline"
                      size="sm"
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground px-2">
                      Page {currentPage} of {Math.ceil(totalCount / pageSize) || 1}
                    </span>
                    <Button
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={currentPage >= Math.ceil(totalCount / pageSize) || loading}
                      variant="outline"
                      size="sm"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <ConfirmationModal
          isOpen={deleteModalOpen}
          onClose={handleDeleteCancel}
          onConfirm={handleDeleteConfirm}
          title="Delete Project"
          description={`Are you sure you want to delete "${projects.find(p => p._id === projectToDelete)?.name || 'this project'}"? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          variant="destructive"
          isLoading={isDeleting}
        />
      </PageContent>
    </MainLayout>
  )
}
