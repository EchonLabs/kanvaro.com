'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { formatToTitleCase } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { useDateTime } from '@/components/providers/DateTimeProvider'
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useNotify } from '@/lib/notify'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { extractUserId } from '@/lib/auth/user-utils'

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
  assignedTo?: [Array<{
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
  }>]
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

export default function TaskDetailPage() {
  const router = useRouter()
  const params = useParams()
  const taskId = params.id as string
  const { setItems } = useBreadcrumb()
  const { formatDate, formatDateTimeSafe } = useDateTime()

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
  const [currentUserId, setCurrentUserId] = useState('')
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState<string>('')
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null)
  const [replyContent, setReplyContent] = useState<string>('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [commentAttachments, setCommentAttachments] = useState<Array<{ name: string; url: string; size?: number; type?: string; uploadedAt?: string }>>([])
  const [replyAttachments, setReplyAttachments] = useState<Array<{ name: string; url: string; size?: number; type?: string; uploadedAt?: string }>>([])
  const [uploading, setUploading] = useState(false)
  const editorRef = useRef<HTMLTextAreaElement | null>(null)
  const commentFileInputRef = useRef<HTMLInputElement | null>(null)
  const replyFileInputRef = useRef<HTMLInputElement | null>(null)
  const { success: notifySuccess, error: notifyError } = useNotify()
  const { hasPermission } = usePermissions()

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      
      if (response.ok) {
        const me = await response.json().catch(() => null)
        const uid = extractUserId(me)
        if (uid) setCurrentUserId(uid)
        setAuthError('')
        await fetchTask()
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
          const me = await fetch('/api/auth/me').then(r => r.json()).catch(() => null)
          const uid = extractUserId(me)
          if (uid) setCurrentUserId(uid)
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
          const projectId = task?.project?._id
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


  const filteredSuggestions = useMemo<SuggestionItem[]>(() => {
    const q = suggestionQuery.trim().toLowerCase()
    if (!suggestionMode) return []
    if (suggestionMode === 'mention') {
      return mentionsList
        .filter(m => m.name.toLowerCase().includes(q))
        .slice(0, 6)
        .map(m => ({ _id: m._id, name: m.name }))
    }
    return issuesList
      .filter(i => (i.displayId || '').toLowerCase().includes(q) || (i.title || '').toLowerCase().includes(q))
      .slice(0, 6)
      .map(i => ({ _id: i._id, displayId: i.displayId, title: i.title }))
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

    return (
      <div key={commentId} className="rounded-md border p-3 bg-muted/30" style={{ marginLeft: depth ? depth * 16 : 0 }}>
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium">
            {comment.author?.firstName || comment.author?.lastName
              ? `${comment.author?.firstName || ''} ${comment.author?.lastName || ''}`.trim()
              : comment.author?.email || 'User'}
          </div>
          <div className="text-xs text-muted-foreground">
            {comment.createdAt ? formatDateTimeSafe(comment.createdAt) : ''}
            {comment.updatedAt && (
              <span className="ml-2 text-[11px]">(edited)</span>
            )}
          </div>
        </div>
        {isEditing ? (
          <div className="space-y-2 mt-1">
            <Textarea
              value={editingContent}
              onChange={(e) => setEditingContent(e.target.value)}
              rows={3}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveEdit} disabled={!editingContent.trim()}>
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-foreground whitespace-pre-wrap mt-1">{comment.content}</div>
        )}
        <div className="flex flex-wrap gap-2 mt-2 items-center">
          {comment.mentions && comment.mentions.length > 0 && (
            <Badge variant="outline" className="text-xs">
              Mentions: {comment.mentions.length}
            </Badge>
          )}
          {comment.linkedIssues && comment.linkedIssues.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {comment.linkedIssues.map((issue) => (
                <Badge
                  key={issue?._id || Math.random().toString(36)}
                  variant="secondary"
                  className="text-xs cursor-pointer"
                  onClick={() => {
                    if (issue?._id) router.push(`/tasks/${issue._id}`)
                  }}
                >
                  #{issue?.displayId || issue?._id} {issue?.title ? `— ${issue.title}` : ''}
                </Badge>
              ))}
            </div>
          )}
          <div className="flex gap-2 text-xs ml-auto">
            {!isEditing && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => handleStartReply(commentId)}
              >
                Reply
              </Button>
            )}
            {isAuthor && !isEditing && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => handleStartEditComment(commentId, comment.content)}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-destructive"
                    onClick={() => setDeleteConfirmId(commentId)}
                >
                  Delete
                </Button>
              </>
            )}
          </div>
        </div>
        {isReplying && (
          <div className="mt-2 space-y-2">
            <Textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              rows={3}
              placeholder="Write a reply..."
            />
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      role="button"
                      aria-label="Attachments"
                      className="h-8 w-8 inline-flex items-center justify-center rounded-md border hover:bg-muted cursor-pointer"
                      onClick={() => replyFileInputRef.current?.click()}
                    >
                      <Paperclip className="h-4 w-4" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">Attachments</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <input
                ref={replyFileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => handleFileInputChange(e, true)}
              />
              {replyAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {replyAttachments.map((att, idx) => (
                    <span key={`${att.url}-${idx}`} className="inline-flex items-center gap-1 rounded border px-2 py-1">
                      <a className="text-primary hover:underline" href={att.url} target="_blank" rel="noreferrer">
                        {att.name}
                      </a>
                      {att.size ? <span>({(att.size / 1024).toFixed(1)} KB)</span> : null}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSubmitReply} disabled={!replyContent.trim() || commentSubmitting}>
                Reply
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancelReply}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {comment.children && comment.children.length > 0 && (
          <div className="mt-3 space-y-2">
            {comment.children.map(child => renderCommentNode(child, depth + 1))}
          </div>
        )}
        {comment.attachments && comment.attachments.length > 0 && (
          <div className="mt-2 space-y-1">
            {comment.attachments.map((att, idx) => (
              <div key={`${att.url}-${idx}`} className="flex items-center gap-2 text-xs text-muted-foreground">
                <a href={att.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  {att.name}
                </a>
                {att.size ? <span>({(att.size / 1024).toFixed(1)} KB)</span> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }, [
    commentSubmitting,
    currentUserId,
    editingCommentId,
    editingContent,
    replyContent,
    replyTargetId,
    router,
    handleStartReply,
    handleStartEditComment,
    handleDeleteComment,
    handleSaveEdit,
    handleCancelEdit,
    handleSubmitReply,
    handleCancelReply
  ])

  const renderComments = useMemo(() => {
    if (!commentTree.length) {
      return <p className="text-sm text-muted-foreground">No comments yet.</p>
    }
    return (
      <div className="space-y-3">
        {commentTree.map((c) => renderCommentNode(c))}
      </div>
    )
  }, [commentTree, renderCommentNode])

  const deleteTargetComment = useMemo(() => {
    if (!deleteConfirmId || !task?.comments) return null
    return task.comments.find(c => (c._id || '').toString() === deleteConfirmId) || null
  }, [deleteConfirmId, task?.comments])

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

  const isCreator = (t: Task) => {
    const creatorId = (t as any)?.createdBy?._id || (t as any)?.createdBy?.id
    return creatorId && currentUserId && creatorId.toString() === currentUserId.toString()
  }

  const editAllowed = hasPermission(Permission.TASK_EDIT_ALL) || isCreator(task)
  const deleteAllowed = hasPermission(Permission.TASK_DELETE_ALL) || isCreator(task)

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
      <div className="space-y-8 sm:space-y-10 lg:space-y-12 overflow-x-hidden">
        <div className="border-b border-border/40 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <Button
                variant="ghost"
                onClick={() => router.back()}
                className="self-start text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 h-9 px-3"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 flex-1 min-w-0">
                <h1
                  className="text-2xl font-semibold leading-snug text-foreground flex items-start gap-2 min-w-0 flex-wrap max-w-[70ch] [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden break-words overflow-wrap-anywhere"
                  title={`${task.title} ${task.displayId}`}
                >
                  <span className="flex-shrink-0">{getTypeIcon(task.type)}</span>
                  <span className="break-words overflow-wrap-anywhere">{task.title} {task.displayId}</span>
                </h1>
                <div className="flex flex-row items-stretch sm:items-center gap-2 flex-shrink-0 flex-wrap sm:flex-nowrap">
                  <Button
                    variant="outline"
                    disabled={!editAllowed}
                    onClick={() => {
                      if (!editAllowed) return
                      router.push(`/tasks/${taskId}/edit`)
                    }}
                    className="min-h-[36px] w-full sm:w-auto"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={!deleteAllowed}
                    onClick={() => {
                      if (!deleteAllowed) return
                      setShowDeleteConfirmModal(true)
                    }}
                    className="min-h-[36px] w-full sm:w-auto"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">Task Details</p>
          </div>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          <div className="md:col-span-2 space-y-8">
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
              <div className="flex items-center gap-2 mt-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        role="button"
                        aria-label="Attachments"
                        className="h-9 w-9 inline-flex items-center justify-center rounded-md border hover:bg-muted cursor-pointer"
                        onClick={() => commentFileInputRef.current?.click()}
                      >
                        <Paperclip className="h-4 w-4" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top">Attachments</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <input
                  ref={commentFileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => handleFileInputChange(e, false)}
                />
                {commentAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {commentAttachments.map((att, idx) => (
                      <span key={`${att.url}-${idx}`} className="inline-flex items-center gap-1 rounded border px-2 py-1">
                        <a className="text-primary hover:underline" href={att.url} target="_blank" rel="noreferrer">
                          {att.name}
                        </a>
                        {att.size ? <span>({(att.size / 1024).toFixed(1)} KB)</span> : null}
                      </span>
                    ))}
                  </div>
                )}
              </div>
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

          <div className="space-y-8">
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
                
                {task.assignedTo && task.assignedTo.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Assigned To</span>
                    <div className="font-medium flex flex-wrap gap-1">
                      {task.assignedTo.map((assignee: any, idx) => {
                        // Try to get user data from populated user field first, then from denormalized fields
                        const firstName = assignee?.user?.firstName || assignee?.firstName;
                        const lastName = assignee?.user?.lastName || assignee?.lastName;
                        const userId = assignee?.user?._id || assignee?.user;

                        if (firstName && lastName) {
                          const displayName = `${firstName} ${lastName}`.trim();
                          return (
                            <span key={userId || `assignee-${idx}`}>
                              {displayName}
                              {idx < (task.assignedTo?.length ?? 0) - 1 && ', '}
                            </span>
                          );
                        }

                        return (
                          <span key={`unknown-${idx}`}>
                            Unknown User
                            {idx < (task.assignedTo?.length ?? 0) - 1 && ', '}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {task.dueDate && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Due Date</span>
                    <span className="font-medium">
                      {formatDate(task.dueDate)}
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
                  {formatDate(task.createdAt)}
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
