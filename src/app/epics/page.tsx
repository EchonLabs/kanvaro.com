'use client'

import { useState, useEffect, useCallback } from 'react'
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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import { 
  Plus, 
  Search, 
  Filter, 
  MoreHorizontal, 
  Calendar, 
  Clock,
  CheckCircle,
  AlertTriangle,
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
  Settings,
  Edit,
  Trash2
} from 'lucide-react'

interface Epic {
  _id: string
  title: string
  description: string
  status: 'todo' | 'in_progress' | 'review' | 'testing' | 'done' | 'cancelled'
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
  const [error, setError] = useState('')
  const [authError, setAuthError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedEpic, setSelectedEpic] = useState<Epic | null>(null)
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      
      if (response.ok) {
        setAuthError('')
        await fetchEpics()
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
          setAuthError('')
          await fetchEpics()
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

  const fetchEpics = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/epics')
      const data = await response.json()

      if (data.success) {
        setEpics(data.data)
      } else {
        console.error('Failed to fetch epics:', data)
        setError(data.error || 'Failed to fetch epics')
      }
    } catch (err) {
      console.error('Fetch epics error:', err)
      setError('Failed to fetch epics')
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
      } else {
        setError(data.error || 'Failed to delete epic')
        setShowDeleteConfirmModal(false)
      }
    } catch (e) {
      setError('Failed to delete epic')
      setShowDeleteConfirmModal(false)
    } finally {
      setDeleting(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'todo': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
      case 'in_progress': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'review': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      case 'testing': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      case 'done': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'todo': return <Target className="h-4 w-4" />
      case 'in_progress': return <Play className="h-4 w-4" />
      case 'review': return <AlertTriangle className="h-4 w-4" />
      case 'testing': return <Zap className="h-4 w-4" />
      case 'done': return <CheckCircle className="h-4 w-4" />
      case 'cancelled': return <XCircle className="h-4 w-4" />
      default: return <Target className="h-4 w-4" />
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
      case 'medium': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'high': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
      case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  const filteredEpics = epics.filter(epic => {
    const matchesSearch = !searchQuery || 
      epic?.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      epic?.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      epic?.project?.name?.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesStatus = statusFilter === 'all' || epic?.status === statusFilter
    const matchesPriority = priorityFilter === 'all' || epic?.priority === priorityFilter

    return matchesSearch && matchesStatus && matchesPriority
  })

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
      <div className="space-y-6 overflow-x-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Epics</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Manage your product epics and large features</p>
          </div>
          <Button onClick={() => router.push('/epics/create')} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            New Epic
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card className="overflow-x-hidden">
          <CardHeader>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>All Epics</CardTitle>
                  <CardDescription>
                    {filteredEpics.length} epic{filteredEpics.length !== 1 ? 's' : ''} found
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
                      <SelectItem value="todo">To Do</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="review">Review</SelectItem>
                      <SelectItem value="testing">Testing</SelectItem>
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
                  {filteredEpics.map((epic) => (
                    <Card 
                      key={epic?._id} 
                      className="hover:shadow-md transition-shadow cursor-pointer overflow-x-hidden"
                      onClick={() => router.push(`/epics/${epic?._id}`)}
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
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(`/epics/${epic._id}`)
                                }}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Epic
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(`/epics/${epic._id}?tab=settings`)
                                }}>
                                  <Settings className="h-4 w-4 mr-2" />
                                  Settings
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(`/epics/${epic._id}/edit`)
                                }}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit Epic
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  onClick={(e) => {
                                    e.stopPropagation()
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
                              <span>Due {new Date(epic?.dueDate).toLocaleDateString()}</span>
                            </div>
                          )}
                        </div>

                        {epic?.tags?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {epic?.tags?.slice(0, 3).map((label, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {label}
                              </Badge>
                            ))}
                            {epic?.tags?.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{epic?.tags?.length - 3} more
                              </Badge>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="list" className="space-y-4">
                <div className="space-y-4">
                  {filteredEpics.map((epic) => (
                    <Card 
                      key={epic?._id} 
                      className="hover:shadow-md transition-shadow cursor-pointer overflow-x-hidden"
                      onClick={() => router.push(`/epics/${epic?._id}`)}
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
                            <p className="text-xs sm:text-sm text-muted-foreground mb-2 line-clamp-2" title={epic?.description || 'No description'}>
                              {epic?.description || 'No description'}
                            </p>
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
                                  <span>Due {new Date(epic?.dueDate).toLocaleDateString()}</span>
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
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(`/epics/${epic._id}`)
                                }}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Epic
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(`/epics/${epic._id}?tab=settings`)
                                }}>
                                  <Settings className="h-4 w-4 mr-2" />
                                  Settings
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(`/epics/${epic._id}/edit`)
                                }}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit Epic
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  onClick={(e) => {
                                    e.stopPropagation()
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
                  ))}
                </div>
              </TabsContent>
            </Tabs>
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
