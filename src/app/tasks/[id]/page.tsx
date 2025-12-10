'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { formatToTitleCase } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { 
  ArrowLeft,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  Play,
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
  MessageSquarePlus
} from 'lucide-react'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { AttachmentList } from '@/components/ui/AttachmentList'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'

interface Task {
  _id: string
  title: string
  displayId: string
  description: string
  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'testing' | 'done' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  type: 'bug' | 'feature' | 'improvement' | 'task' | 'subtask'
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
  story?: {
    _id: string
    title: string
    epic?: {
      _id: string
      title: string
    }
  }
  sprint?: {
    _id: string
    name: string
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
    _id: string
    title: string
    description?: string
    status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'testing' | 'done' | 'cancelled'
    isCompleted: boolean
    createdAt: string
    updatedAt: string
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
    createdAt: string
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

export default function TaskDetailPage() {
  const router = useRouter()
  const params = useParams()
  const taskId = params.id as string
  const { setItems } = useBreadcrumb()
  
  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [authError, setAuthError] = useState('')
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [commentContent, setCommentContent] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [mentionsList, setMentionsList] = useState<Array<{ _id: string; name: string }>>([])
  const [issuesList, setIssuesList] = useState<Array<{ _id: string; displayId?: string; title?: string }>>([])
  const [suggestionMode, setSuggestionMode] = useState<'mention' | 'issue' | null>(null)
  const [suggestionQuery, setSuggestionQuery] = useState('')
  const [suggestionPos, setSuggestionPos] = useState<{ top: number; left: number } | null>(null)
  const editorRef = useRef<HTMLTextAreaElement | null>(null)

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      
      if (response.ok) {
        setAuthError('')
        await fetchTask()
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
          setAuthError('')
          await fetchTask()
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

  const fetchTask = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/tasks/${taskId}`)
      const data = await response.json()

      if (data.success) {
        setTask(data.data)
        // preload mentions and issues lists (project members and project tasks)
        const projectId = data.data?.project?._id
        if (projectId) {
          fetchProjectMembers(projectId)
          fetchProjectIssues(projectId)
        }
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
    try {
      const res = await fetch(`/api/projects/${projectId}`)
      const data = await res.json()
      if (data?.success && data.data?.teamMembers) {
        const members = data.data.teamMembers.map((m: any) => ({
          _id: m._id,
          name: `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.email || 'User'
        }))
        setMentionsList(members)
      }
    } catch (e) {
      console.error('Failed to fetch project members for mentions', e)
    }
  }

  const fetchProjectIssues = async (projectId: string) => {
    try {
      const params = new URLSearchParams({ project: projectId, limit: '50' })
      const res = await fetch(`/api/tasks?${params.toString()}`)
      const data = await res.json()
      if (data?.success && Array.isArray(data.data)) {
        const issues = data.data.map((t: any) => ({
          _id: t._id,
          displayId: t.displayId,
          title: t.title
        }))
        setIssuesList(issues)
      }
    } catch (e) {
      console.error('Failed to fetch project issues for linking', e)
    }
  }

  const handleDeleteTask = async () => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE'
      })
      const data = await response.json()
      
      if (data.success) {
        setShowDeleteConfirmModal(false)
        router.push('/tasks')
      } else {
        setError(data.error || 'Failed to delete task')
      }
    } catch (error) {
      setError('Failed to delete task')
    }
  }

  const renderComments = useMemo(() => {
    if (!task?.comments || task.comments.length === 0) {
      return <p className="text-sm text-muted-foreground">No comments yet.</p>
    }
    return (
      <div className="space-y-3">
        {task.comments.map((comment) => (
          <div key={comment._id || Math.random().toString(36)} className="rounded-md border p-3 bg-muted/30">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">
                {comment.author?.firstName || comment.author?.lastName
                  ? `${comment.author?.firstName || ''} ${comment.author?.lastName || ''}`.trim()
                  : comment.author?.email || 'User'}
              </div>
              <div className="text-xs text-muted-foreground">
                {comment.createdAt ? new Date(comment.createdAt).toLocaleString() : ''}
              </div>
            </div>
            <div className="text-sm text-foreground whitespace-pre-wrap mt-1">{comment.content}</div>
            <div className="flex flex-wrap gap-2 mt-2">
              {comment.mentions && comment.mentions.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  Mentions: {comment.mentions.length}
                </Badge>
              )}
              {comment.linkedIssues && comment.linkedIssues.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {comment.linkedIssues.map((issue) => (
                    <Badge
                      key={issue._id || Math.random().toString(36)}
                      variant="secondary"
                      className="text-xs cursor-pointer"
                      onClick={() => {
                        if (issue._id) router.push(`/tasks/${issue._id}`)
                      }}
                    >
                      #{issue.displayId || issue._id} {issue.title ? `— ${issue.title}` : ''}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  }, [router, task?.comments])

  const filteredSuggestions = useMemo(() => {
    const q = suggestionQuery.trim().toLowerCase()
    if (!suggestionMode) return []
    if (suggestionMode === 'mention') {
      return mentionsList.filter(m => m.name.toLowerCase().includes(q)).slice(0, 6)
    }
    return issuesList
      .filter(i => (i.displayId || '').toLowerCase().includes(q) || (i.title || '').toLowerCase().includes(q))
      .slice(0, 6)
  }, [suggestionMode, suggestionQuery, mentionsList, issuesList])

  const replaceActiveToken = (replacement: string) => {
    setCommentContent(prev => {
      const textarea = editorRef.current
      const cursorPos = textarea?.selectionStart ?? prev.length
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
    setSuggestionMode(null)
    setSuggestionQuery('')
    setSuggestionPos(null)
  }
  const handleAddComment = async () => {
    if (!commentContent.trim()) return
    setCommentSubmitting(true)
    try {
      // Parse mentions/links based on stored selections (we track from dropdown insertions)
      // For simplicity, we send IDs for mentions and linked issues we recognized in the textarea.
      // Extract IDs from markers we inserted: we set data attributes? Here we collect from state by matching tokens.
      const mentionIds: string[] = []
      mentionsList.forEach(m => {
        const token = `@${m.name}`
        if (commentContent.includes(token)) {
          mentionIds.push(m._id)
        }
      })
      const issueIds: string[] = []
      issuesList.forEach(i => {
        const token = `#${i.displayId || i._id}`
        if (commentContent.includes(token)) {
          issueIds.push(i._id)
        }
      })

      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: commentContent,
          mentions: mentionIds,
          linkedIssues: issueIds
        })
      })
      const data = await res.json()
      if (data.success) {
        // Optimistically append comment
        const newComment = {
          _id: data.data._id || Math.random().toString(36),
          content: commentContent,
          createdAt: new Date().toISOString(),
          author: {
            firstName: 'You',
            lastName: '',
            email: ''
          },
          mentions: mentionIds,
          linkedIssues: issuesList.filter(i => issueIds.includes(i._id))
        }
        setTask(prev => prev ? { ...prev, comments: [...(prev.comments || []), newComment] } : prev)
        setCommentContent('')
      } else {
        setError(data.error || 'Failed to add comment')
      }
    } catch (e) {
      setError('Failed to add comment')
    } finally {
      setCommentSubmitting(false)
    }
  }

  const updateSuggestionPosition = (value: string, cursorPos: number) => {
    const textarea = editorRef.current
    if (!textarea) return
    const mirror = document.createElement('div')
    const style = window.getComputedStyle(textarea)
    mirror.style.position = 'absolute'
    mirror.style.visibility = 'hidden'
    mirror.style.whiteSpace = 'pre-wrap'
    mirror.style.wordWrap = 'break-word'
    mirror.style.fontSize = style.fontSize
    mirror.style.fontFamily = style.fontFamily
    mirror.style.lineHeight = style.lineHeight
    mirror.style.padding = style.padding
    mirror.style.border = style.border
    mirror.style.boxSizing = style.boxSizing
    mirror.style.width = `${textarea.clientWidth}px`
    mirror.style.left = `${textarea.getBoundingClientRect().left}px`
    mirror.style.top = `${textarea.getBoundingClientRect().top}px`

    const before = value.slice(0, cursorPos)
    const after = value.slice(cursorPos)
    const marker = document.createElement('span')
    marker.textContent = '\u200b'
    mirror.textContent = before
    mirror.appendChild(marker)
    mirror.append(after)
    document.body.appendChild(mirror)
    const markerRect = marker.getBoundingClientRect()
    document.body.removeChild(mirror)

    setSuggestionPos({
      top: markerRect.bottom + 4,
      left: markerRect.left
    })
  }

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
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
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
      case 'bug': return <Bug className="h-4 w-4" />
      case 'feature': return <Layers className="h-4 w-4" />
      case 'improvement': return <Wrench className="h-4 w-4" />
      case 'task': return <Target className="h-4 w-4" />
      case 'subtask': return <Layers className="h-4 w-4" />
      default: return <Target className="h-4 w-4" />
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading task...</p>
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

  if (error || !task) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-destructive mb-4">{error || 'Task not found'}</p>
            <Button onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </div>
        </div>
      </MainLayout>
    )
  }

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

  return (
    <MainLayout>
      <div className="space-y-6 overflow-x-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 w-full sm:w-auto min-w-0">
            <Button variant="ghost" onClick={() => router.back()} className="w-full sm:w-auto flex-shrink-0">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="flex-1 min-w-0 w-full sm:w-auto">
              <h1 
                className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground flex items-center space-x-2 min-w-0"
                title={`${task.title} ${task.displayId}`}
              >
                <span className="flex-shrink-0">{getTypeIcon(task.type)}</span>
                <span className="truncate min-w-0">{task.title} {task.displayId}</span>
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">Task Details</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto flex-shrink-0">
            <Button variant="outline" onClick={() => router.push(`/tasks/${taskId}/edit`)} className="w-full sm:w-auto">
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => setShowDeleteConfirmModal(true)}
              className="w-full sm:w-auto"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  {task.description || 'No description provided'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2">
                  <MessageSquarePlus className="h-4 w-4" />
                  <span>Comments</span>
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddComment}
                  disabled={commentSubmitting || !commentContent.trim()}
                >
                  {commentSubmitting ? 'Posting...' : 'Post Comment'}
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Textarea
                    ref={editorRef}
                    value={commentContent}
                    onChange={(e) => {
                      const val = e.target.value
                      setCommentContent(val)
                      const textarea = e.target
                      const cursor = textarea.selectionStart
                      const before = val.slice(0, cursor)
                      const match = before.match(/([@#])([^\s@#]{0,30})$/)
                      if (match) {
                        const mode = match[1] === '@' ? 'mention' : 'issue'
                        setSuggestionMode(mode)
                        setSuggestionQuery(match[2] || '')
                        updateSuggestionPosition(val, cursor)
                      } else {
                        setSuggestionMode(null)
                        setSuggestionQuery('')
                        setSuggestionPos(null)
                      }
                    }}
                    placeholder="Add a comment. Use @ to mention team members, # to link project tasks."
                    rows={4}
                  />
                  {suggestionMode && filteredSuggestions.length > 0 && suggestionPos && (
                    <div
                      className="z-20 rounded-md border bg-card shadow-lg"
                      style={{
                        position: 'fixed',
                        top: suggestionPos.top,
                        left: suggestionPos.left,
                        minWidth: '220px',
                        maxWidth: '360px'
                      }}
                    >
                      <div className="max-h-56 overflow-y-auto divide-y">
                        {filteredSuggestions.map((s) => (
                          <button
                            key={s._id}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                            onClick={() => {
                              if (suggestionMode === 'mention') {
                                replaceActiveToken(`@${s.name}`)
                              } else {
                                replaceActiveToken(`#${s.displayId || s._id}`)
                              }
                            }}
                          >
                            {suggestionMode === 'mention'
                              ? `@${s.name}`
                              : `#${s.displayId || s._id} ${s.title ? '— ' + s.title : ''}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-2 text-foreground">All Comments</h3>
                  {renderComments}
                </div>
              </CardContent>
            </Card>

            {task.parentTask && (
              <Card>
                <CardHeader>
                  <CardTitle>Parent Task</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-2">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{task.parentTask.title}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {task.story && (
              <Card>
                <CardHeader>
                  <CardTitle>User Story</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-2">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{task.story.title}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {task.subtasks && task.subtasks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Subtasks</CardTitle>
                  <CardDescription>{task.subtasks.length} {task.subtasks.length === 1 ? 'subtask' : 'subtasks'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {task.subtasks.map((subtask, index) => (
                    <div key={subtask._id || index} className="p-3 border rounded-lg">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className="mt-1">
                              {subtask.isCompleted ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <Circle className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`font-medium ${subtask.isCompleted ? 'line-through text-muted-foreground' : ''}`}>
                                  {subtask.title}
                                </span>
                                <Badge className={`${getStatusColor(subtask.status)} text-xs flex items-center gap-1`}>
                                  {getStatusIcon(subtask.status)}
                                  <span>{formatToTitleCase(subtask.status)}</span>
                                </Badge>
                              </div>
                              {subtask.description && (
                                <p className="text-sm text-muted-foreground mt-1">
                                  {subtask.description}
                                </p>
                              )}
                            </div>
                          </div>
                          {subtask.isCompleted && (
                            <Badge variant="outline" className="text-xs text-green-700 border-green-200 bg-green-50">
                              Completed
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                          <span>Created {formatDateTime(subtask.createdAt)}</span>
                          <span>Updated {formatDateTime(subtask.updatedAt)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Attachments Section */}
            {task.attachments && task.attachments.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4" />
                    <span>Attachments</span>
                  </CardTitle>
                  <CardDescription>{task.attachments.length} {task.attachments.length === 1 ? 'file' : 'files'}</CardDescription>
                </CardHeader>
                <CardContent>
                  <AttachmentList
                    attachments={attachmentListItems}
                    onDownload={(attachment) => {
                      // Open in new tab if it's a viewable file (PDF, images, etc.)
                      const viewableTypes = ['application/pdf', 'image/', 'text/'];
                      const isViewable = viewableTypes.some(type => attachment.type.startsWith(type));
                      
                      if (isViewable) {
                        window.open(attachment.url, '_blank');
                      } else {
                        // Download the file
                        const link = document.createElement('a');
                        link.href = attachment.url;
                        link.download = attachment.name;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }
                    }}
                    canDelete={false}
                  />
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge className={getStatusColor(task.status)}>
                    {getStatusIcon(task.status)}
                    <span className="ml-1">{formatToTitleCase(task.status)}</span>
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Priority</span>
                  <Badge className={getPriorityColor(task.priority)}>
                    {formatToTitleCase(task.priority)}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <Badge className={getTypeColor(task.type)}>
                    {getTypeIcon(task.type)}
                    <span className="ml-1">{formatToTitleCase(task.type)}</span>
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Project</span>
                  {task.project?.name ? (
                    <span
                      className="font-medium truncate max-w-[200px]"
                      title={task.project.name && task.project.name.length > 10 ? task.project.name : undefined}
                    >
                      {task.project.name && task.project.name.length > 10 ? `${task.project.name.slice(0, 10)}…` : task.project.name}
                    </span>
                  ) : (
                    <span className="font-medium">—</span>
                  )}
                </div>
                
                {task.sprint?.name && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Sprint</span>
                    <span
                      className="font-medium truncate max-w-[200px]"
                      title={task.sprint.name.length > 20 ? task.sprint.name : undefined}
                    >
                      {task.sprint.name.length > 20 ? `${task.sprint.name.slice(0, 20)}…` : task.sprint.name}
                    </span>
                  </div>
                )}
                
                {task.story?.title && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Story</span>
                    <span
                      className="font-medium truncate max-w-[200px]"
                      title={task.story.title.length > 20 ? task.story.title : undefined}
                    >
                      {task.story.title.length > 20 ? `${task.story.title.slice(0, 20)}…` : task.story.title}
                    </span>
                  </div>
                )}
                
                {task.story?.epic?.title && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Epic</span>
                    <span
                      className="font-medium truncate max-w-[200px]"
                      title={task.story.epic.title.length > 20 ? task.story.epic.title : undefined}
                    >
                      {task.story.epic.title.length > 20 ? `${task.story.epic.title.slice(0, 20)}…` : task.story.epic.title}
                    </span>
                  </div>
                )}
                
                {task.assignedTo && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Assigned To</span>
                    <span className="font-medium">
                      {task.assignedTo.firstName} {task.assignedTo.lastName}
                    </span>
                  </div>
                )}
                
                {task.dueDate && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Due Date</span>
                    <span className="font-medium">
                      {new Date(task.dueDate).toLocaleDateString()}
                    </span>
                  </div>
                )}
                
                {task.storyPoints && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Story Points</span>
                    <span className="font-medium">{task.storyPoints}</span>
                  </div>
                )}
                
                {task.estimatedHours && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Estimated Hours</span>
                    <span className="font-medium">{task.estimatedHours}h</span>
                  </div>
                )}
                
                {task.actualHours != null && task.actualHours > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Actual Hours</span>
                    <span className="font-medium">{task.actualHours}h</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {task.labels.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Labels</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {task.labels.map((label, index) => (
                      <Badge key={index} variant="outline">
                        <Star className="h-3 w-3 mr-1" />
                        {label}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Created By</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {task.createdBy.firstName} {task.createdBy.lastName}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(task.createdAt).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
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
