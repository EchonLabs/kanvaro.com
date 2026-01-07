'use client'

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect, type KeyboardEvent as ReactKeyboardEvent } from 'react'
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

type ComposerType = 'comment' | 'reply'

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
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
  const [suggestionComposer, setSuggestionComposer] = useState<ComposerType | null>(null)
  const [currentUserId, setCurrentUserId] = useState('')
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
  const { success: notifySuccess, error: notifyError } = useNotify()
  const { hasPermission } = usePermissions()

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
                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted focus:bg-muted focus:outline-none transition-colors ${
                  index === selectedSuggestionIndex ? 'bg-muted' : ''
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

    return (
      <div key={commentId} className="rounded-md border p-3 bg-muted/30" style={{ marginLeft: depth ? depth * 16 : 0 }}>
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium">
            {comment.author?.firstName || comment.author?.lastName
              ? `${comment.author?.firstName || ''} ${comment.author?.lastName || ''}`.trim()
              : comment.author?.email || 'User'}
          </div>
          <div className="text-xs text-muted-foreground">
            {comment.updatedAt ? formatDateTimeSafe(comment.updatedAt) : (comment.createdAt ? formatDateTimeSafe(comment.createdAt) : '')}
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
            {!isAuthor && !isEditing && (
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
                placeholder="Write a reply..."
                className={suggestionMode && suggestionComposer === 'reply' ? 'ring-2 ring-blue-500/20 border-blue-500/30' : ''}
              />
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  Use <code className="bg-muted px-1 py-0.5 rounded text-[11px]">@</code> to mention teammates and
                  <code className="bg-muted px-1 py-0.5 rounded text-[11px] ml-1">#</code> to link tasks.
                </p>
                {suggestionMode && suggestionComposer === 'reply' && (
                  <p className="text-[11px] text-blue-600 dark:text-blue-400">
                    💡 Use ↑↓ arrows to navigate, Enter to select, Esc to close
                  </p>
                )}
              </div>
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
              {renderSuggestionMenu('reply')}
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
                <div className="flex flex-row items-stretch sm:items-center gap-2 flex-shrink-0 flex-wrap sm:flex-nowrap ml-auto justify-end">
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

            {hasRelatedEntities && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sprintDetails?._id && (
                  <Card
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    onClick={() => handleRelatedNavigation(`/sprints/${sprintDetails._id}`)}
                    onKeyDown={(event) => handleRelatedKeyDown(event, `/sprints/${sprintDetails._id}`)}
                    aria-label={sprintDetails.name ? `View sprint ${sprintDetails.name}` : 'View sprint details'}
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Target className="h-4 w-4" />
                        <span>Sprint</span>
                      </CardTitle>
                      <CardDescription>{sprintDetails.name || 'View sprint details'}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      {sprintDetails.status && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Status</span>
                          <Badge variant="outline">{formatToTitleCase(sprintDetails.status)}</Badge>
                        </div>
                      )}
                      {(sprintDetails.startDate || sprintDetails.endDate) && (
                        <div className="text-xs text-muted-foreground space-y-1">
                          <span>Schedule</span>
                          <div className="font-medium text-foreground">
                            {sprintDetails.startDate ? formatDate(sprintDetails.startDate) : 'TBD'}
                            {' '}
                            &ndash;
                            {' '}
                            {sprintDetails.endDate ? formatDate(sprintDetails.endDate) : 'TBD'}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {storyDetails?._id && (
                  <Card
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    onClick={() => handleRelatedNavigation(`/stories/${storyDetails._id}`)}
                    onKeyDown={(event) => handleRelatedKeyDown(event, `/stories/${storyDetails._id}`)}
                    aria-label={storyDetails.title ? `View story ${storyDetails.title}` : 'View user story'}
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Layers className="h-4 w-4" />
                        <span>User Story</span>
                      </CardTitle>
                      <CardDescription>{storyDetails.title || 'View story details'}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      {storyDetails.status ? (
                        <Badge variant="outline">{formatToTitleCase(storyDetails.status)}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </CardContent>
                  </Card>
                )}

                {epicDetails?._id && (
                  <Card
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    onClick={() => handleRelatedNavigation(`/epics/${epicDetails._id}`)}
                    onKeyDown={(event) => handleRelatedKeyDown(event, `/epics/${epicDetails._id}`)}
                    aria-label={epicDetails.title ? `View epic ${epicDetails.title}` : 'View epic details'}
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Star className="h-4 w-4" />
                        <span>Epic</span>
                      </CardTitle>
                      <CardDescription>{epicDetails.title || 'View epic details'}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      {epicDetails.status ? (
                        <Badge variant="outline">{formatToTitleCase(epicDetails.status)}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

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
                <div ref={commentComposerRef} className="relative">
                  <Textarea
                    ref={commentEditorRef}
                    value={commentContent}
                    className={suggestionMode && suggestionComposer === 'comment' ? 'ring-2 ring-blue-500/20 border-blue-500/30' : ''}
                    onChange={(e) => handleComposerInput(e.target.value, 'comment', e.target)}
                    onKeyDown={(e) => handleComposerKeyDown(e, 'comment')}
                    onKeyUp={() => scheduleSuggestionPositionUpdate('comment')}
                    onClick={() => scheduleSuggestionPositionUpdate('comment')}
                    onScroll={(e) => {
                      setComposerScrollTop(prev => ({ ...prev, comment: e.currentTarget.scrollTop }))
                      scheduleSuggestionPositionUpdate('comment')
                    }}
                    onBlur={() => handleComposerBlur('comment')}
                    placeholder=""
                    rows={4}
                  />
                  <div className="mt-2 text-sm text-muted-foreground space-y-1">
                    <p>Enter your comment and click the <strong>Post Comment</strong> button to submit your comment.</p>
                    <div className="flex flex-col gap-1">
                      <p>
                        Use <code className="bg-muted px-1 py-0.5 rounded text-xs">@</code> to mention team members,
                        <code className="bg-muted px-1 py-0.5 rounded text-xs ml-1">#</code> to link project tasks.
                      </p>
                      {suggestionMode && suggestionComposer === 'comment' && (
                        <div className="space-y-1">
                          <p className="text-xs text-blue-600 dark:text-blue-400">
                            💡 Use ↑↓ arrows to navigate, Enter to select, Esc to close
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Searching for: <code className="bg-muted px-1 rounded text-xs">
                              {suggestionMode === 'mention' ? '@' : '#'}{suggestionQuery || '...'}
                            </code>
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
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
                  {renderSuggestionMenu('comment')}
                </div>

                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-2 text-foreground">All Comments</h3>
                  {renderComments}

                  {/* Comments Pagination Controls */}
                  {commentTree.length > commentsPageSize && (
                    <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Items per page:</span>
                        <select
                          value={commentsPageSize}
                          onChange={(e) => {
                            setCommentsPageSize(parseInt(e.target.value))
                            setCommentsCurrentPage(1)
                          }}
                          className="px-2 py-1 border rounded text-sm bg-background"
                        >
                          <option value="5">5</option>
                          <option value="10">10</option>
                          <option value="20">20</option>
                          <option value="50">50</option>
                        </select>
                        <span>
                          Showing {((commentsCurrentPage - 1) * commentsPageSize) + 1} to {Math.min(commentsCurrentPage * commentsPageSize, commentTree.length)} of {commentTree.length}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => setCommentsCurrentPage(commentsCurrentPage - 1)}
                          disabled={commentsCurrentPage === 1}
                          variant="outline"
                          size="sm"
                        >
                          Previous
                        </Button>
                        <span className="text-sm text-muted-foreground px-2">
                          Page {commentsCurrentPage} of {commentsTotalPages || 1}
                        </span>
                        <Button
                          onClick={() => setCommentsCurrentPage(commentsCurrentPage + 1)}
                          disabled={commentsCurrentPage >= commentsTotalPages}
                          variant="outline"
                          size="sm"
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
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
{/* 
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
            )} */}

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
                  <div className="flex flex-col gap-2">
                    <span className="text-muted-foreground">Assigned To</span>
                    <div className="flex flex-wrap gap-2">
                      {task.assignedTo.map((assignee: any, idx) => {
                        // Handle both string (user ID) and object formats for backward compatibility
                        let userId: string;
                        let displayName: string;

                        if (typeof assignee === 'string') {
                          // New format: assignee is a string (user ID)
                          userId = assignee;
                          const userInfo = mentionsList.find(u => u._id === userId);
                          displayName = userInfo?.name || 'Unknown User';
                        } else {
                          // Legacy format: assignee is an object
                          userId = assignee?.user?._id || assignee?.user || assignee?._id;
                          const firstName = assignee?.user?.firstName || assignee?.firstName;
                          const lastName = assignee?.user?.lastName || assignee?.lastName;
                          displayName = firstName && lastName ? `${firstName} ${lastName}`.trim() : 'Unknown User';
                        }

                        return (
                          <Badge key={userId || `assignee-${idx}`} variant="secondary" className="text-xs">
                            <User className="h-3 w-3 mr-1" />
                            {displayName}
                          </Badge>
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
