'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { formatToTitleCase } from '@/lib/utils'
import { Progress } from '@/components/ui/Progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { useNotify } from '@/lib/notify'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { extractUserId } from '@/lib/auth/user-utils'
import { 
  Plus, 
  Search, 
  Filter, 
  MoreHorizontal, 
  Calendar, 
  Clock,
  CheckCircle,
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
  Users,
  TrendingUp,
  Calendar as CalendarIcon,
  Star,
  Layers,
  Eye,
  Edit,
  Trash2,
  X
} from 'lucide-react'

interface Epic {
  _id: string
  title: string
  description: string
  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'testing' | 'done' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  project: {
    _id: string
    name: string
  }
  assignedTo?: {
    firstName: string
    lastName: string
    email: string
  }
  createdBy: {
    firstName: string
    lastName: string
    email: string
  }
  storyPoints?: number
  dueDate?: string
  estimatedHours?: number
  tags: string[]
  progress: {
    completionPercentage: number
    storiesCompleted: number
    totalStories: number
    storyPointsCompleted: number
    totalStoryPoints: number
  }
  createdAt: string
  updatedAt: string
}

export default function EpicsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [epics, setEpics] = useState<Epic[]>([])
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedEpic, setSelectedEpic] = useState<Epic | null>(null)
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [totalCount, setTotalCount] = useState(0)
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const filtersInitializedRef = useRef(false)

  const { hasPermission } = usePermissions()
  const { success: notifySuccess, error: notifyError } = useNotify()
  const { formatDate } = useDateTime()

  // Show success when redirected with ?updated=true
  useEffect(() => {
    const updated = searchParams.get('updated')
    if (updated === 'true') {
      notifySuccess({ title: 'Epic updated successfully' })
      router.replace('/epics', { scroll: false })
    }
    // notifySuccess is stable enough; omit from deps to avoid re-run loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router])

  const fetchAndSetCurrentUser = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      if (response.ok) {
        const data = await response.json().catch(() => ({}))
        const userId = extractUserId(data)
        if (userId) setCurrentUserId(userId.toString())
      }
      return response
    } catch (error) {
      console.error('Auth check failed:', error)
      throw error
    }
  }, [])

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetchAndSetCurrentUser()

      if (response.ok) {
        setAuthError('')
        await fetchEpics()
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
          const meResponse = await fetchAndSetCurrentUser()
          if (meResponse.ok) {
            setAuthError('')
            await fetchEpics()
          } else {
            setAuthError('Session expired')
            setTimeout(() => {
              router.push('/login')
            }, 2000)
          }
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
  }, [router, fetchAndSetCurrentUser])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])


  // Fetch when pagination changes (after initial load)
  useEffect(() => {
    if (!loading && !authError) {
      fetchEpics()
    }
  }, [currentPage, pageSize])

  // Fetch when filters change
  useEffect(() => {
    if (!filtersInitializedRef.current) {
      filtersInitializedRef.current = true
      return
    }
    if (authError) return
    if (currentPage === 1) {
      fetchEpics()
    } else {
      setCurrentPage(1)
    }
  }, [searchQuery, statusFilter, priorityFilter])

  const fetchEpics = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.set('page', currentPage.toString())
      params.set('limit', pageSize.toString())
      const trimmedSearch = searchQuery.trim()
      if (trimmedSearch) params.set('search', trimmedSearch)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (priorityFilter !== 'all') params.set('priority', priorityFilter)
      
      const response = await fetch(`/api/epics?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        const epicData = Array.isArray(data.data) ? data.data : []
        setEpics(epicData)
        setTotalCount(data.pagination?.total ?? epicData.length)
      } else {
        console.error('Failed to fetch epics:', data)
        notifyError({ title: 'Failed to Load Epics', message: data.error || 'Failed to fetch epics' })
      }
    } catch (err) {
      console.error('Fetch epics error:', err)
      notifyError({ title: 'Failed to Load Epics', message: 'Failed to fetch epics' })
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteClick = (epic: Epic) => {
    setSelectedEpic(epic)
    setShowDeleteConfirmModal(true)
  }

  const handleDeleteConfirm = async () => {
    if (!selectedEpic) return
    
    try {
      setDeleting(true)
      const res = await fetch(`/api/epics/${selectedEpic._id}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok && data.success) {
        setEpics(prev => prev.filter(e => e._id !== selectedEpic._id))
        setShowDeleteConfirmModal(false)
        setSelectedEpic(null)
        notifySuccess({ title: 'Epic deleted successfully' })
      } else {
        notifyError({ title: 'Failed to Delete Epic', message: data.error || 'Failed to delete epic' })
        setShowDeleteConfirmModal(false)
      }
    } catch (e) {
      notifyError({ title: 'Failed to Delete Epic', message: 'Failed to delete epic' })
      setShowDeleteConfirmModal(false)
    } finally {
      setDeleting(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'backlog': return 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900'
      case 'todo': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900'
      case 'inprogress': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900'
      case 'done': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900'
      case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'backlog': return <Layers className="h-4 w-4" />
      case 'todo': return <Target className="h-4 w-4" />
      case 'inprogress': return <Play className="h-4 w-4" />
      case 'done': return <CheckCircle className="h-4 w-4" />
      case 'cancelled': return <XCircle className="h-4 w-4" />
      default: return <Target className="h-4 w-4" />
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

  const displayedEpics = epics
  const totalEpicsCount = totalCount ?? displayedEpics.length
  const totalPages = Math.max(1, Math.ceil((totalEpicsCount || 0) / pageSize) || 1)
  const pageStartIndex = totalEpicsCount === 0 ? 0 : ((currentPage - 1) * pageSize) + 1
  const pageEndIndex = totalEpicsCount === 0 ? 0 : Math.min(currentPage * pageSize, totalEpicsCount)

  const isCreator = (epic: Epic) => {
    const creatorId = (epic as any)?.createdBy?._id || (epic as any)?.createdBy?.id
    return creatorId && currentUserId && creatorId.toString() === currentUserId.toString()
  }

  const canViewEpic = (epic: Epic) =>
    hasPermission(Permission.EPIC_VIEW) ||
    hasPermission(Permission.EPIC_READ) ||
    isCreator(epic)

  const canEditEpic = (epic: Epic) =>
    hasPermission(Permission.EPIC_EDIT) || isCreator(epic)

  const canDeleteEpic = (epic: Epic) =>
    hasPermission(Permission.EPIC_DELETE) || isCreator(epic)

  const canCreateEpic = hasPermission(Permission.EPIC_CREATE)

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading epics...</p>
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
      <div className="space-y-8 sm:space-y-10 overflow-x-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Epics</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Manage your product epics and large features</p>
          </div>
          <Button
            onClick={() => {
              if (!canCreateEpic) return
              router.push('/epics/create')
            }}
            disabled={!canCreateEpic}
            title={!canCreateEpic ? 'You need epic:create permission to create an epic.' : undefined}
            className="w-full sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Epic
          </Button>
        </div>


        <Card className="overflow-x-hidden">
          <CardHeader>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>All Epics</CardTitle>
                  <CardDescription>
                    {totalEpicsCount} epic{totalEpicsCount !== 1 ? 's' : ''} found
                  </CardDescription>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Search epics..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 w-full"
                  />
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="backlog">backlog</SelectItem>
                      <SelectItem value="todo">To Do</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue placeholder="Filter by priority" />
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
          <CardContent>
            <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'grid' | 'list')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="grid">Grid View</TabsTrigger>
                <TabsTrigger value="list">List View</TabsTrigger>
              </TabsList>
              
              <TabsContent value="grid" className="space-y-4">
                <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                  {displayedEpics.map((epic) => {
                    const epicIsCreator = isCreator(epic)
                    const viewAllowed = canViewEpic(epic)
                    const editAllowed = canEditEpic(epic)
                    const deleteAllowed = canDeleteEpic(epic)
                    return (
                    <Card 
                      key={epic?._id} 
                      className={`hover:shadow-md transition-shadow overflow-x-hidden ${viewAllowed ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                      onClick={() => {
                        if (!viewAllowed) return
                        router.push(`/epics/${epic?._id}`)
                      }}
                    >
                      <CardHeader className="p-3 sm:p-6">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1 flex-1 min-w-0">
                            <CardTitle className="text-base sm:text-lg flex items-center space-x-2 min-w-0" title={epic?.title}>
                              <Layers className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 flex-shrink-0" />
                              <span className="truncate">{epic?.title}</span>
                            </CardTitle>
                            <CardDescription className="line-clamp-2 text-xs sm:text-sm" title={epic?.description || 'No description'}>
                              {epic?.description || 'No description'}
                            </CardDescription>
                          </div>
                          <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  disabled={!viewAllowed}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (!viewAllowed) return
                                    router.push(`/epics/${epic._id}`)
                                  }}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Epic
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={!editAllowed}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (!editAllowed) return
                                    router.push(`/epics/${epic._id}/edit`)
                                  }}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit Epic
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  disabled={!deleteAllowed}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (!deleteAllowed) return
                                    handleDeleteClick(epic)
                                  }}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Epic
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                      </CardHeader>
                      <CardContent className="p-3 sm:p-6 pt-0 space-y-3 sm:space-y-4">
                        <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                          <Badge className={`${getStatusColor(epic?.status)} text-xs`}>
                            {getStatusIcon(epic?.status)}
                            <span className="ml-1 hidden sm:inline">{formatToTitleCase(epic?.status)}</span>
                          </Badge>
                          <Badge className={`${getPriorityColor(epic?.priority)} text-xs`}>
                            {formatToTitleCase(epic?.priority)}
                          </Badge>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs sm:text-sm">
                            <span className="text-muted-foreground">Progress</span>
                            <span className="font-medium">{epic?.progress?.completionPercentage || 0}%</span>
                          </div>
                          <Progress value={epic?.progress?.completionPercentage || 0} className="h-1.5 sm:h-2" />
                          <div className="text-xs text-muted-foreground">
                            {epic?.progress?.storiesCompleted || 0} of {epic?.progress?.totalStories || 0} stories completed
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs sm:text-sm">
                            <span className="text-muted-foreground">Story Points</span>
                            <span className="font-medium">
                              {epic?.progress?.storyPointsCompleted || 0} / {epic?.progress?.totalStoryPoints || 0}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs sm:text-sm text-muted-foreground">
                          <div className="flex items-center space-x-1 min-w-0">
                            <Target className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                            <span 
                              className="truncate"
                              title={epic?.project?.name && epic?.project?.name.length > 10 ? epic?.project?.name : undefined}
                            >
                              {epic?.project?.name && epic?.project?.name.length > 10 ? `${epic?.project?.name.slice(0, 10)}…` : epic?.project?.name}
                            </span>
                          </div>
                          {epic?.dueDate && (
                            <div className="flex items-center space-x-1 flex-shrink-0 whitespace-nowrap">
                              <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
                              <span>Due {formatDate(epic?.dueDate)}</span>
                            </div>
                          )}
                        </div>

                        {epic?.tags?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {epic?.tags?.slice(0, 3).map((label, index) => (
                              <Badge key={index} variant="outline" className="text-xs hover:bg-transparent dark:hover:bg-transparent">
                                {label}
                              </Badge>
                            ))}
                            {epic?.tags?.length > 3 && (
                              <Badge variant="outline" className="text-xs hover:bg-transparent dark:hover:bg-transparent">
                                +{epic?.tags?.length - 3} more
                              </Badge>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    )
                  })}
                </div>
              </TabsContent>

              <TabsContent value="list" className="space-y-4">
                <div className="space-y-4">
                  {displayedEpics.map((epic) => {
                    const viewAllowed = canViewEpic(epic)
                    const editAllowed = canEditEpic(epic)
                    const deleteAllowed = canDeleteEpic(epic)
                    return (
                    <Card 
                      key={epic?._id} 
                      className={`hover:shadow-md transition-shadow overflow-x-hidden ${viewAllowed ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                      onClick={() => {
                        if (!viewAllowed) return
                        router.push(`/epics/${epic?._id}`)
                      }}
                    >
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 min-w-0">
                          <div className="flex-1 min-w-0 w-full">
                            <div className="flex flex-wrap items-center justify-end gap-1 sm:gap-2 mb-2">
                              <Badge className={`${getStatusColor(epic?.status)} text-xs`}>
                                {getStatusIcon(epic?.status)}
                                <span className="ml-1 hidden sm:inline">{formatToTitleCase(epic?.status)}</span>
                              </Badge>
                              <Badge className={`${getPriorityColor(epic?.priority)} text-xs`}>
                                {formatToTitleCase(epic?.priority)}
                              </Badge>
                            </div>
                            <div className="flex items-start gap-2 mb-2">
                              <Layers className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 flex-shrink-0 mt-0.5" />
                              <h3 className="font-medium text-sm sm:text-base text-foreground truncate flex-1 min-w-0" title={epic?.title}>
                                {epic?.title}
                              </h3>
                            </div>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p className="text-xs sm:text-sm text-muted-foreground mb-2 line-clamp-2 cursor-default">
                                    {epic?.description || 'No description'}
                                  </p>
                                </TooltipTrigger>
                                {(epic?.description && epic.description.length > 0) && (
                                  <TooltipContent>
                                    <p className="max-w-xs break-words">{epic.description}</p>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            </TooltipProvider>
                            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                              <div className="flex items-center space-x-1 min-w-0">
                                <Target className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                                <span 
                                  className="truncate"
                                  title={epic?.project?.name && epic?.project?.name.length > 10 ? epic?.project?.name : undefined}
                                >
                                  {epic?.project?.name && epic?.project?.name.length > 10 ? `${epic?.project?.name.slice(0, 10)}…` : epic?.project?.name}
                                </span>
                              </div>
                              {epic?.dueDate && (
                                <div className="flex items-center space-x-1 flex-shrink-0 whitespace-nowrap">
                                  <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
                                  <span>Due {formatDate(epic?.dueDate)}</span>
                                </div>
                              )}
                              {epic?.storyPoints && (
                                <div className="flex items-center space-x-1 flex-shrink-0 whitespace-nowrap">
                                  <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4" />
                                  <span>{epic?.storyPoints} pts</span>
                                </div>
                              )}
                              {epic?.estimatedHours && (
                                <div className="flex items-center space-x-1 flex-shrink-0 whitespace-nowrap">
                                  <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                                  <span>{epic?.estimatedHours}h</span>
                                </div>
                              )}
                              {epic?.tags?.length > 0 && (
                                <div className="flex items-center space-x-1 min-w-0">
                                  <Star className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                                  <span className="truncate">{epic?.tags?.slice(0, 2).join(', ')}</span>
                                  {epic?.tags?.length > 2 && <span className="flex-shrink-0">+{epic?.tags?.length - 2} more</span>}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
                            <div className="text-right sm:text-left">
                              <div className="text-xs sm:text-sm font-medium text-foreground">{epic?.progress?.completionPercentage || 0}%</div>
                              <div className="w-16 sm:w-20 bg-gray-200 rounded-full h-1.5 sm:h-2">
                                <div 
                                  className="bg-purple-600 h-1.5 sm:h-2 rounded-full"
                                  style={{ width: `${epic?.progress?.completionPercentage || 0}%` }}
                                />
                              </div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  disabled={!viewAllowed}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (!viewAllowed) return
                                    router.push(`/epics/${epic._id}`)
                                  }}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Epic
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={!editAllowed}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (!editAllowed) return
                                    router.push(`/epics/${epic._id}/edit`)
                                  }}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit Epic
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  disabled={!deleteAllowed}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (!deleteAllowed) return
                                    handleDeleteClick(epic)
                                  }}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Epic
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    )
                  })}
                </div>
              </TabsContent>
            </Tabs>

            {/* Pagination Controls */}
            {totalEpicsCount > 0 && (
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
                    Showing {pageStartIndex} to {pageEndIndex} of {totalEpicsCount}
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
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage >= totalPages || loading}
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
        isOpen={showDeleteConfirmModal}
        onClose={() => { setShowDeleteConfirmModal(false); setSelectedEpic(null); }}
        onConfirm={handleDeleteConfirm}
        title="Delete Epic"
        description={`Are you sure you want to delete "${selectedEpic?.title}"? This action cannot be undone.`}
        confirmText={deleting ? 'Deleting...' : 'Delete'}
        cancelText="Cancel"
        variant="destructive"
      />
    </MainLayout>
  )
}
