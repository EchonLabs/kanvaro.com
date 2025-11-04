'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from '@radix-ui/react-dropdown-menu'
import { DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import { Eye, Edit, Trash2 } from 'lucide-react'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
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
  ArrowUp,
  ArrowDown,
  Star
} from 'lucide-react'

interface BacklogItem {
  _id: string
  title: string
  description: string
  type: 'epic' | 'story' | 'task'
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'backlog' | 'sprint' | 'in_progress' | 'done'
  project?: {
    _id: string
    name: string
  } | null
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
  labels: string[]
  sprint?: {
    _id: string
    name: string
  }
  epic?: {
    _id: string
    name: string
  }
  createdAt: string
  updatedAt: string
}

export default function BacklogPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [backlogItems, setBacklogItems] = useState<BacklogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [selectedForDelete, setSelectedForDelete] = useState<{ id: string; type: BacklogItem['type']; title: string } | null>(null)
  const [authError, setAuthError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('priority')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      
      if (response.ok) {
        setAuthError('')
        await fetchBacklogItems()
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
          setAuthError('')
          await fetchBacklogItems()
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

  useEffect(() => {
    const successParam = searchParams?.get('success')
    if (successParam === 'story-created') {
      setSuccess('User story created successfully.')
      const timeout = setTimeout(() => setSuccess(''), 3000)
      return () => clearTimeout(timeout)
    }
  }, [searchParams])

  const fetchBacklogItems = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/backlog')
      const data = await response.json()

      if (data.success) {
        setBacklogItems(data.data)
      } else {
        setError(data.error || 'Failed to fetch backlog items')
      }
    } catch (err) {
      setError('Failed to fetch backlog items')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteClick = (item: BacklogItem) => {
    setSelectedForDelete({ id: item._id, type: item.type, title: item.title })
    setShowDeleteConfirmModal(true)
  }

  const handleDeleteItem = async () => {
    if (!selectedForDelete) return
    setDeleting(true)
    setDeleteError('')
    try {
      let endpoint = ''
      if (selectedForDelete.type === 'task') endpoint = `/api/tasks/${selectedForDelete.id}`
      else if (selectedForDelete.type === 'story') endpoint = `/api/stories/${selectedForDelete.id}`
      else if (selectedForDelete.type === 'epic') endpoint = `/api/epics/${selectedForDelete.id}`

      const res = await fetch(endpoint, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok && data.success) {
        setBacklogItems(prev => prev.filter(x => x._id !== selectedForDelete.id))
        setSuccess(`${selectedForDelete.type.charAt(0).toUpperCase() + selectedForDelete.type.slice(1)} deleted successfully.`)
        setTimeout(() => setSuccess(''), 3000)
        setShowDeleteConfirmModal(false)
        setSelectedForDelete(null)
      } else {
        setDeleteError(data.error || 'Failed to delete item')
        setShowDeleteConfirmModal(false)
      }
    } catch (e) {
      setDeleteError('Failed to delete item')
      setShowDeleteConfirmModal(false)
    } finally {
      setDeleting(false)
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'epic': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      case 'story': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'task': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'backlog': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
      case 'sprint': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'in_progress': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      case 'done': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  const filteredAndSortedItems = backlogItems
    .filter(item => {
      const matchesSearch = !searchQuery || 
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.project?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
      
      const matchesType = typeFilter === 'all' || item.type === typeFilter
      const matchesPriority = priorityFilter === 'all' || item.priority === priorityFilter
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter

      return matchesSearch && matchesType && matchesPriority && matchesStatus
    })
    .sort((a, b) => {
      let comparison = 0
      
      switch (sortBy) {
        case 'priority':
          const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 }
          comparison = (priorityOrder[b.priority as keyof typeof priorityOrder] || 0) - 
                      (priorityOrder[a.priority as keyof typeof priorityOrder] || 0)
          break
        case 'title':
          comparison = a.title.localeCompare(b.title)
          break
        case 'created':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          break
        case 'dueDate':
          const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
          const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
          comparison = aDate - bDate
          break
        default:
          comparison = 0
      }
      
      return sortOrder === 'asc' ? comparison : -comparison
    })

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading backlog...</p>
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
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Product Backlog</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Manage your product backlog and sprint planning</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={() => router.push('/epics/create')} className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              New Epic
            </Button>
            <Button onClick={() => router.push('/stories/create')} className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              New Story
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Backlog Items</CardTitle>
                  <CardDescription>
                    {filteredAndSortedItems.length} item{filteredAndSortedItems.length !== 1 ? 's' : ''} found
                  </CardDescription>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Search backlog..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 w-full"
                  />
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-full sm:w-32">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="epic">Epics</SelectItem>
                      <SelectItem value="story">Stories</SelectItem>
                      <SelectItem value="task">Tasks</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger className="w-full sm:w-32">
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
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-32">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="backlog">Backlog</SelectItem>
                      <SelectItem value="sprint">Sprint</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-full sm:w-32">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="priority">Priority</SelectItem>
                      <SelectItem value="title">Title</SelectItem>
                      <SelectItem value="created">Created</SelectItem>
                      <SelectItem value="dueDate">Due Date</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    className="w-full sm:w-auto"
                  >
                    {sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredAndSortedItems.map((item) => (
                <Card key={item._id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex-1 min-w-0 w-full">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <h3 className="font-medium text-foreground text-sm sm:text-base truncate flex-1 min-w-0">{item.title}</h3>
                          <Badge className={getTypeColor(item.type)}>
                            {item.type}
                          </Badge>
                          <Badge className={getPriorityColor(item.priority)}>
                            {item.priority}
                          </Badge>
                          <Badge className={getStatusColor(item.status)}>
                            {item.status.replace('_', ' ')}
                          </Badge>
                          {item.epic && (
                            <Badge variant="outline" className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                              {item.epic.name}
                            </Badge>
                          )}
                          {item.sprint && (
                            <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                              {item.sprint.name}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs sm:text-sm text-muted-foreground mb-2 break-words">
                          {item.description || 'No description'}
                        </p>
                        {item.assignedTo && (
                          <p className="text-xs sm:text-sm text-muted-foreground mb-2">
                            {item.assignedTo.firstName} {item.assignedTo.lastName}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                          <div className="flex items-center space-x-1">
                            <Target className="h-3 w-3 sm:h-4 sm:w-4" />
                            {item.project?.name ? (
                              <span className="truncate">{item.project.name}</span>
                            ) : (
                              <span className="truncate italic text-muted-foreground">Project deleted or unavailable</span>
                            )}
                          </div>
                          {item.dueDate && (
                            <div className="flex items-center space-x-1">
                              <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
                              <span>Due {new Date(item.dueDate).toLocaleDateString()}</span>
                            </div>
                          )}
                          {item.storyPoints && (
                            <div className="flex items-center space-x-1">
                              <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4" />
                              <span>{item.storyPoints} points</span>
                            </div>
                          )}
                          {item.estimatedHours && (
                            <div className="flex items-center space-x-1">
                              <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                              <span>{item.estimatedHours}h estimated</span>
                            </div>
                          )}
                          {item.labels.length > 0 && (
                            <div className="flex items-center space-x-1">
                              <Star className="h-3 w-3 sm:h-4 sm:w-4" />
                              <span className="truncate">{item.labels.join(', ')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 flex-shrink-0">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="flex-shrink-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[172px] py-2 rounded-md shadow-lg border border-border bg-background z-[10000]">
                            {/* View */}
                            {item.type === 'task' && (
                              <DropdownMenuItem onClick={() => router.push(`/tasks/${item._id}`)} className="flex items-center space-x-2 px-4 py-2 focus:bg-accent cursor-pointer">
                                <Eye className="h-4 w-4 mr-2" />
                                <span>View Task</span>
                              </DropdownMenuItem>
                            )}
                            {item.type === 'story' && (
                              <DropdownMenuItem onClick={() => router.push(`/stories/${item._id}`)} className="flex items-center space-x-2 px-4 py-2 focus:bg-accent cursor-pointer">
                                <Eye className="h-4 w-4 mr-2" />
                                <span>View Story</span>
                              </DropdownMenuItem>
                            )}
                            {item.type === 'epic' && (
                              <DropdownMenuItem onClick={() => router.push(`/epics/${item._id}`)} className="flex items-center space-x-2 px-4 py-2 focus:bg-accent cursor-pointer">
                                <Eye className="h-4 w-4 mr-2" />
                                <span>View Epic</span>
                              </DropdownMenuItem>
                            )}

                            {/* Edit */}
                            {item.type === 'task' && (
                              <DropdownMenuItem onClick={() => router.push(`/tasks/${item._id}/edit`)} className="flex items-center space-x-2 px-4 py-2 focus:bg-accent cursor-pointer">
                                <Edit className="h-4 w-4 mr-2" />
                                <span>Edit Task</span>
                              </DropdownMenuItem>
                            )}
                            {item.type === 'story' && (
                              <DropdownMenuItem onClick={() => router.push(`/stories/${item._id}/edit`)} className="flex items-center space-x-2 px-4 py-2 focus:bg-accent cursor-pointer">
                                <Edit className="h-4 w-4 mr-2" />
                                <span>Edit Story</span>
                              </DropdownMenuItem>
                            )}

                            {/* Delete */}
                            <DropdownMenuItem onClick={() => handleDeleteClick(item)} className="flex items-center space-x-2 px-4 py-2 text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer">
                              <Trash2 className="h-4 w-4 mr-2" />
                              <span>Delete {item.type.charAt(0).toUpperCase() + item.type.slice(1)}</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        <ConfirmationModal
          isOpen={showDeleteConfirmModal}
          onClose={() => { setShowDeleteConfirmModal(false); setSelectedForDelete(null); }}
          onConfirm={handleDeleteItem}
          title={`Delete ${selectedForDelete?.type ? selectedForDelete.type.charAt(0).toUpperCase() + selectedForDelete.type.slice(1) : 'Item'}`}
          description={`Are you sure you want to delete "${selectedForDelete?.title}"? This action cannot be undone.`}
          confirmText={deleting ? 'Deleting...' : 'Delete'}
          cancelText="Cancel"
        />
      </div>
    </MainLayout>
  )
}