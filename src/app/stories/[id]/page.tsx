'use client'

import { useState, useEffect, useCallback, useMemo, KeyboardEvent } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { Button } from '@/components/ui/Button'
import { formatToTitleCase } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { useAuthContext } from '@/contexts/AuthContext'
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  Circle,
  XCircle,
  Target,
  Loader2,
  Edit,
  Trash2,
  Star,
  Layers,
  Rocket,
  ListTodo,
  User
} from 'lucide-react'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions'
import { extractUserId } from '@/lib/auth/user-utils'
import { useNotify } from '@/lib/notify'

interface Story {
  _id: string
  title: string
  description: string
  status: 'todo' | 'in_progress' | 'review' | 'testing' | 'done' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  project?: {
    _id: string
    name: string
  } | null
  epic?: {
    _id: string
    title: string
    description?: string
    status?: 'todo' | 'in_progress' | 'review' | 'testing' | 'done' | 'cancelled'
    priority?: 'low' | 'medium' | 'high' | 'critical'
    dueDate?: string
    tags?: string[]
    project?: {
      _id: string
      name: string
    }
    createdBy?: {
      firstName: string
      lastName: string
      email: string
    }
  } | null
  sprint?: {
    _id: string
    name: string
    description?: string
    status?: 'planning' | 'active' | 'completed' | 'cancelled'
    startDate?: string
    endDate?: string
    goal?: string
    project?: {
      _id: string
      name: string
    }
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
  acceptanceCriteria: string[]
  tags: string[]
  createdAt: string
  updatedAt: string
}

const STATUS_BADGE: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  todo:        { bg: 'bg-gray-50 dark:bg-gray-900/40',      text: 'text-gray-500 dark:text-gray-400',      dot: 'bg-gray-400',    border: 'border-gray-200 dark:border-gray-700' },
  in_progress: { bg: 'bg-blue-50 dark:bg-blue-950/30',      text: 'text-blue-600 dark:text-blue-400',      dot: 'bg-blue-500',    border: 'border-blue-200 dark:border-blue-800' },
  review:      { bg: 'bg-yellow-50 dark:bg-yellow-950/30',  text: 'text-yellow-600 dark:text-yellow-400',  dot: 'bg-yellow-500',  border: 'border-yellow-200 dark:border-yellow-800' },
  testing:     { bg: 'bg-purple-50 dark:bg-purple-950/30',  text: 'text-purple-600 dark:text-purple-400',  dot: 'bg-purple-500',  border: 'border-purple-200 dark:border-purple-800' },
  done:        { bg: 'bg-emerald-50 dark:bg-emerald-950/30',text: 'text-emerald-600 dark:text-emerald-400',dot: 'bg-emerald-500', border: 'border-emerald-200 dark:border-emerald-800' },
  cancelled:   { bg: 'bg-red-50 dark:bg-red-950/30',        text: 'text-red-600 dark:text-red-400',        dot: 'bg-red-500',     border: 'border-red-200 dark:border-red-800' },
  planning:    { bg: 'bg-slate-50 dark:bg-slate-950/30',    text: 'text-slate-600 dark:text-slate-400',    dot: 'bg-slate-400',   border: 'border-slate-200 dark:border-slate-800' },
  active:      { bg: 'bg-blue-50 dark:bg-blue-950/30',      text: 'text-blue-600 dark:text-blue-400',      dot: 'bg-blue-500',    border: 'border-blue-200 dark:border-blue-800' },
  completed:   { bg: 'bg-emerald-50 dark:bg-emerald-950/30',text: 'text-emerald-600 dark:text-emerald-400',dot: 'bg-emerald-500', border: 'border-emerald-200 dark:border-emerald-800' },
}
const PRIORITY_BADGE: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  low:      { bg: 'bg-gray-50 dark:bg-gray-900/40',      text: 'text-gray-500 dark:text-gray-400',      dot: 'bg-gray-400',   border: 'border-gray-200 dark:border-gray-700' },
  medium:   { bg: 'bg-blue-50 dark:bg-blue-950/30',      text: 'text-blue-600 dark:text-blue-400',      dot: 'bg-blue-500',   border: 'border-blue-200 dark:border-blue-800' },
  high:     { bg: 'bg-orange-50 dark:bg-orange-950/30',  text: 'text-orange-600 dark:text-orange-400',  dot: 'bg-orange-500', border: 'border-orange-200 dark:border-orange-800' },
  critical: { bg: 'bg-red-50 dark:bg-red-950/30',        text: 'text-red-600 dark:text-red-400',        dot: 'bg-red-500',    border: 'border-red-200 dark:border-red-800' },
}
const TYPE_BADGE: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  bug:         { bg: 'bg-red-50 dark:bg-red-950/30',         text: 'text-red-600 dark:text-red-400',         dot: 'bg-red-500',     border: 'border-red-200 dark:border-red-800' },
  feature:     { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', border: 'border-emerald-200 dark:border-emerald-800' },
  improvement: { bg: 'bg-blue-50 dark:bg-blue-950/30',       text: 'text-blue-600 dark:text-blue-400',       dot: 'bg-blue-500',    border: 'border-blue-200 dark:border-blue-800' },
  task:        { bg: 'bg-gray-50 dark:bg-gray-900/40',       text: 'text-gray-500 dark:text-gray-400',       dot: 'bg-gray-400',    border: 'border-gray-200 dark:border-gray-700' },
  subtask:     { bg: 'bg-purple-50 dark:bg-purple-950/30',   text: 'text-purple-600 dark:text-purple-400',   dot: 'bg-purple-500',  border: 'border-purple-200 dark:border-purple-800' },
}

const renderStatusChip = (cfg: Record<string, { bg: string; text: string; dot: string; border: string }>, key: string, label: string) => {
  const c = cfg[key] ?? { bg: 'bg-gray-50', text: 'text-gray-500', dot: 'bg-gray-400', border: 'border-gray-200' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[12px] font-medium ${c.bg} ${c.text} ${c.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {label}
    </span>
  )
}

export default function StoryDetailPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuthContext()

  const router = useRouter()
  const params = useParams()
  const storyId = params.id as string
  const { setItems } = useBreadcrumb()
  const { formatDate } = useDateTime()

  const [story, setStory] = useState<Story | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [tasks, setTasks] = useState<any[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [storyTasksCurrentPage, setStoryTasksCurrentPage] = useState(1)
  const [storyTasksPageSize, setStoryTasksPageSize] = useState(5)

  // Pagination logic for story tasks
  const paginatedStoryTasks = useMemo(() => {
    const startIndex = (storyTasksCurrentPage - 1) * storyTasksPageSize
    const endIndex = startIndex + storyTasksPageSize
    return tasks.slice(startIndex, endIndex)
  }, [tasks, storyTasksCurrentPage, storyTasksPageSize])

  const storyTasksTotalPages = Math.ceil(tasks.length / storyTasksPageSize)

  const { hasPermission } = usePermissions()
  const { success: notifySuccess, error: notifyError } = useNotify()

  // Initialize: set currentUserId from context and fetch data
  useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      const userId = extractUserId(user)
      if (userId) setCurrentUserId(userId.toString())
      fetchStory()
      fetchTasks()
    } else if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, user, router, storyId])

  useEffect(() => {
    // Set breadcrumb immediately on mount
    setItems([
      { label: 'Stories', href: '/stories' },
      { label: 'View Story' }
    ])
  }, [setItems])

  useEffect(() => {
    if (error) {
      notifyError({ title: error })
    }
    if (deleteError) {
      notifyError({ title: deleteError })
    }
    // notifyError is stable enough; omit from deps to avoid re-run loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, deleteError])

  const fetchStory = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/stories/${storyId}`)
      const data = await response.json()

      if (data.success) {
        setStory(data.data)
        // Ensure breadcrumb is set
        setItems([
          { label: 'Stories', href: '/stories' },
          { label: data.data.title || 'View Story' }
        ])
      } else {
        setError(data.error || 'Failed to fetch story')
      }
    } catch (err) {
      setError('Failed to fetch story')
    } finally {
      setLoading(false)
    }
  }

  const fetchTasks = async () => {
    if (!storyId) return

    try {
      setTasksLoading(true)
      // Add minimal=true parameter to get lightweight task data for story view
      const response = await fetch(`/api/tasks?story=${storyId}&minimal=true`)
      const data = await response.json()

      if (data.success) {
        setTasks(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch tasks:', err)
    } finally {
      setTasksLoading(false)
    }
  }

  const handleDeleteStory = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      const response = await fetch(`/api/stories/${storyId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        notifySuccess({ title: 'Story deleted successfully' })
        router.push('/stories');
      } else {
        const data = await response.json();
        setDeleteError(data.error || 'Failed to delete story');
        setShowDeleteConfirmModal(false);
        notifyError({ title: data.error || 'Failed to delete story' })
      }
    } catch (e) {
      setDeleteError('Failed to delete story');
      setShowDeleteConfirmModal(false);
      notifyError({ title: 'Failed to delete story' })
    } finally {
      setDeleting(false);
    }
  };

  const isCreator = (story: Story) => {
    const creatorId = (story as any)?.createdBy?._id || (story as any)?.createdBy?.id
    return creatorId && currentUserId && creatorId.toString() === currentUserId.toString()
  }

  const canEditStory = (story: Story) =>
    hasPermission(Permission.STORY_UPDATE, story.project?._id) || isCreator(story)

  const canDeleteStory = (story: Story) =>
    hasPermission(Permission.STORY_DELETE, story.project?._id) || isCreator(story)

  const handleRelatedNavigation = (path: string | null) => {
    if (!path) return
    router.push(path)
  }

  const handleRelatedKeyDown = (event: KeyboardEvent<HTMLDivElement>, path: string | null) => {
    if (!path) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      router.push(path)
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-[var(--apple-system-blue)]" />
            <p className="text-[15px] text-[var(--apple-secondary-label)]">Loading story…</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (error || !story) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <XCircle className="h-12 w-12 text-[var(--apple-system-red)]" />
          <h2 className="text-[22px] font-semibold text-[var(--apple-label)]">{error || 'Story not found'}</h2>
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

  const editAllowed = story ? canEditStory(story) : false
  const deleteAllowed = story ? canDeleteStory(story) : false
  const epicDetailHref = story?.epic?._id ? `/epics/${story.epic._id}` : null
  const sprintDetailHref = story?.sprint?._id ? `/sprints/${story.sprint._id}` : null

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
            {/* Title row: icon > story id > title */}
            <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
              <Layers className="h-8 w-8 flex-shrink-0" style={{ color: 'var(--apple-card-gradient)' }} />
              <span className="font-apple-mono text-[12px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 text-white" style={{ background: 'var(--apple-card-gradient)' }}>
                STORY
              </span>
              <h1 className="text-[22px] sm:text-[26px] font-bold tracking-tight text-[var(--apple-label)] leading-tight min-w-0">{story.title}</h1>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => editAllowed && router.push(`/stories/${storyId}/edit`)}
                  disabled={!editAllowed}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-full text-white text-[13px] font-semibold px-4 h-9 hover:opacity-90 apple-transition disabled:opacity-40"
                  style={{ background: 'var(--apple-card-gradient)' }}
                >
                  <Edit className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  onClick={() => deleteAllowed && setShowDeleteConfirmModal(true)}
                  disabled={!deleteAllowed}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--apple-system-red)]/40 bg-[var(--apple-system-red)]/10 text-[var(--apple-system-red)] text-[13px] font-medium px-4 h-9 hover:bg-[var(--apple-system-red)]/20 apple-transition disabled:opacity-40"
                >
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
                {story.description ? (() => {
                  const isHtml = /<(p|br|div|ul|ol|li|strong|em|u|h[1-6]|img|a)(\s|>|\/)/i.test(story.description)
                  return isHtml
                    ? <div className="task-description max-w-none" dangerouslySetInnerHTML={{ __html: story.description }} />
                    : <div className="task-description text-[15px] text-[var(--apple-label)] whitespace-pre-line leading-relaxed">{story.description}</div>
                })() : (
                  <p className="text-[15px] text-[var(--apple-tertiary-label)]">No description provided.</p>
                )}
              </div>
            </div>

            {/* Acceptance Criteria */}
            {story.acceptanceCriteria && story.acceptanceCriteria.length > 0 && (
              <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                  <h2 className="text-[15px] font-semibold text-[var(--apple-label)]">Acceptance Criteria</h2>
                  <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">Criteria that must be met for this story to be considered complete</p>
                </div>
                <div className="divide-y divide-[var(--apple-separator)]">
                  {story.acceptanceCriteria.map((criteria, index) => (
                    <div key={index} className="px-5 py-3 flex items-start gap-3">
                      <CheckCircle className="h-4 w-4 text-[var(--apple-system-green)] mt-0.5 flex-shrink-0" />
                      <span className="text-[14px] text-[var(--apple-label)] leading-relaxed">{criteria}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Epic */}
            {story.epic && (
              <div
                role="button"
                tabIndex={0}
                className="text-left rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden hover:shadow-[0_4px_16px_rgba(0,0,0,0.09)] hover:-translate-y-0.5 apple-transition cursor-pointer"
                onClick={() => handleRelatedNavigation(epicDetailHref)}
                onKeyDown={(event) => handleRelatedKeyDown(event, epicDetailHref)}
                aria-label={story.epic.title ? `View epic ${story.epic.title}` : 'View epic details'}
              >
                <div className="px-5 py-4 border-b border-[var(--apple-separator)] flex items-center gap-2">
                  <Star className="h-4 w-4 text-[var(--apple-system-orange)]" />
                  <h2 className="text-[15px] font-semibold text-[var(--apple-label)]">Epic</h2>
                </div>
                <div className="px-5 py-4 space-y-4">
                  <div className="flex items-start gap-2 min-w-0">
                    <Layers className="h-4 w-4 text-[var(--apple-system-purple)] flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-[var(--apple-label)] truncate" title={story.epic.title}>
                        {story.epic.title}
                      </p>
                      {story.epic.description && (
                        <p className="text-[13px] text-[var(--apple-secondary-label)] mt-1">
                          {story.epic.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {story.epic.status && (
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-[var(--apple-secondary-label)]">Status</span>
                        {renderStatusChip(STATUS_BADGE, story.epic.status, formatToTitleCase(story.epic.status))}
                      </div>
                    )}

                    {story.epic.priority && (
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-[var(--apple-secondary-label)]">Priority</span>
                        {renderStatusChip(PRIORITY_BADGE, story.epic.priority, formatToTitleCase(story.epic.priority))}
                      </div>
                    )}

                    {story.epic.project?.name && (
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-[var(--apple-secondary-label)]">Project</span>
                        <span className="font-medium text-[var(--apple-label)] truncate max-w-[160px]" title={story.epic.project.name}>
                          {story.epic.project.name}
                        </span>
                      </div>
                    )}

                    {story.epic.dueDate && (
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-[var(--apple-secondary-label)]">Due Date</span>
                        <span className="font-medium text-[var(--apple-label)] whitespace-nowrap">
                          {formatDate(story.epic.dueDate)}
                        </span>
                      </div>
                    )}
                  </div>

                  {story.epic.tags && story.epic.tags.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[13px] text-[var(--apple-secondary-label)] block">Tags</span>
                      <div className="flex flex-wrap gap-1.5">
                        {story.epic.tags.map((tag, index) => (
                          <span key={index} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[12px] text-[var(--apple-label)] font-medium">
                            <Star className="h-3 w-3" style={{ color: 'var(--apple-card-gradient)' }} />
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {story.epic.createdBy && (
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-[var(--apple-secondary-label)]">Created By</span>
                      <span className="font-medium text-[var(--apple-label)] truncate max-w-[200px]">
                        {story.epic.createdBy.firstName} {story.epic.createdBy.lastName}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sprint */}
            {story.sprint && (
              <div
                role="button"
                tabIndex={0}
                className="text-left rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden hover:shadow-[0_4px_16px_rgba(0,0,0,0.09)] hover:-translate-y-0.5 apple-transition cursor-pointer"
                onClick={() => handleRelatedNavigation(sprintDetailHref)}
                onKeyDown={(event) => handleRelatedKeyDown(event, sprintDetailHref)}
                aria-label={story.sprint.name ? `View sprint ${story.sprint.name}` : 'View sprint details'}
              >
                <div className="px-5 py-4 border-b border-[var(--apple-separator)] flex items-center gap-2">
                  <Target className="h-4 w-4 text-[var(--apple-system-blue)]" />
                  <h2 className="text-[15px] font-semibold text-[var(--apple-label)]">Sprint</h2>
                </div>
                <div className="px-5 py-4 space-y-4">
                  <div className="flex items-start gap-2 min-w-0">
                    <Rocket className="h-4 w-4 text-[var(--apple-system-blue)] flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-[var(--apple-label)] truncate" title={story.sprint.name}>
                        {story.sprint.name}
                      </p>
                      {story.sprint.description && (
                        <p className="text-[13px] text-[var(--apple-secondary-label)] mt-1">
                          {story.sprint.description}
                        </p>
                      )}
                      {story.sprint.goal && (
                        <p className="text-[13px] text-[var(--apple-secondary-label)] mt-1">
                          <span className="font-medium text-[var(--apple-label)]">Goal:</span> {story.sprint.goal}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {story.sprint.status && (
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-[var(--apple-secondary-label)]">Status</span>
                        {renderStatusChip(STATUS_BADGE, story.sprint.status, formatToTitleCase(story.sprint.status))}
                      </div>
                    )}

                    {story.sprint.project?.name && (
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-[var(--apple-secondary-label)]">Project</span>
                        <span className="font-medium text-[var(--apple-label)] truncate max-w-[160px]" title={story.sprint.project.name}>
                          {story.sprint.project.name}
                        </span>
                      </div>
                    )}

                    {story.sprint.startDate && (
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-[var(--apple-secondary-label)]">Start Date</span>
                        <span className="font-medium text-[var(--apple-label)] whitespace-nowrap">
                          {formatDate(story.sprint.startDate)}
                        </span>
                      </div>
                    )}

                    {story.sprint.endDate && (
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-[var(--apple-secondary-label)]">End Date</span>
                        <span className="font-medium text-[var(--apple-label)] whitespace-nowrap">
                          {formatDate(story.sprint.endDate)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tasks */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                <div className="flex items-center gap-2">
                  <ListTodo className="h-4 w-4 text-[var(--apple-secondary-label)]" />
                  <h2 className="text-[15px] font-semibold text-[var(--apple-label)]">Tasks</h2>
                  <span className="text-[12px] text-[var(--apple-secondary-label)] font-apple-mono">{tasks.length}</span>
                </div>
                <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">Tasks under this story</p>
              </div>

              {tasksLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-[var(--apple-secondary-label)]" />
                </div>
              ) : tasks.length === 0 ? (
                <p className="text-[14px] text-[var(--apple-tertiary-label)] text-center py-10">No tasks found for this story.</p>
              ) : (
                <div className="divide-y divide-[var(--apple-separator)]">
                  {paginatedStoryTasks.map((task) => (
                    <div
                      key={task._id}
                      role="button"
                      tabIndex={0}
                      className="px-5 py-3 flex items-start gap-3 cursor-pointer hover:bg-[var(--apple-quaternary-fill)] apple-transition"
                      onClick={() => router.push(`/tasks/${task._id}`)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          router.push(`/tasks/${task._id}`)
                        }
                      }}
                    >
                      <div className="mt-0.5 flex-shrink-0">
                        {task.status === 'done'
                          ? <CheckCircle className="h-4 w-4 text-[var(--apple-system-green)]" />
                          : <Circle className="h-4 w-4 text-[var(--apple-tertiary-label)]" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {task.displayId && (
                            <span className="font-apple-mono text-[11px] text-[var(--apple-tertiary-label)]">{task.displayId}</span>
                          )}
                          <span className="text-[14px] font-medium text-[var(--apple-label)] truncate" title={task.title}>
                            {task.title}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          {renderStatusChip(STATUS_BADGE, task.status, formatToTitleCase(task.status))}
                          {renderStatusChip(PRIORITY_BADGE, task.priority, formatToTitleCase(task.priority))}
                          {task.type && renderStatusChip(TYPE_BADGE, task.type, formatToTitleCase(task.type))}
                          {task.storyPoints && (
                            <span className="text-[12px] font-apple-mono text-[var(--apple-secondary-label)]">{task.storyPoints} pts</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination Controls */}
              {tasks.length > storyTasksPageSize && (
                <div className="px-5 py-3 border-t border-[var(--apple-separator)] flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-[13px] text-[var(--apple-secondary-label)]">
                    <span>Items per page:</span>
                    <select
                      value={storyTasksPageSize}
                      onChange={(e) => {
                        setStoryTasksPageSize(parseInt(e.target.value))
                        setStoryTasksCurrentPage(1)
                      }}
                      className="px-2 py-1 border border-[var(--apple-separator)] rounded-md text-[13px] bg-card text-[var(--apple-label)]"
                    >
                      <option value="5">5</option>
                      <option value="10">10</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </select>
                    <span>
                      Showing {((storyTasksCurrentPage - 1) * storyTasksPageSize) + 1} to {Math.min(storyTasksCurrentPage * storyTasksPageSize, tasks.length)} of {tasks.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setStoryTasksCurrentPage(storyTasksCurrentPage - 1)}
                      disabled={storyTasksCurrentPage === 1}
                      className="inline-flex items-center justify-center rounded-full border border-[var(--apple-separator)] text-[13px] font-medium text-[var(--apple-label)] px-3 h-8 hover:bg-[var(--apple-quaternary-fill)] apple-transition disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <span className="text-[13px] text-[var(--apple-secondary-label)] px-2">
                      Page {storyTasksCurrentPage} of {storyTasksTotalPages || 1}
                    </span>
                    <button
                      onClick={() => setStoryTasksCurrentPage(storyTasksCurrentPage + 1)}
                      disabled={storyTasksCurrentPage >= storyTasksTotalPages}
                      className="inline-flex items-center justify-center rounded-full border border-[var(--apple-separator)] text-[13px] font-medium text-[var(--apple-label)] px-3 h-8 hover:bg-[var(--apple-quaternary-fill)] apple-transition disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
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
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Status</span>
                  {renderStatusChip(STATUS_BADGE, story.status, formatToTitleCase(story.status))}
                </div>

                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Priority</span>
                  {renderStatusChip(PRIORITY_BADGE, story.priority, formatToTitleCase(story.priority))}
                </div>

                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Project</span>
                  <span className="text-[13px] font-medium text-[var(--apple-label)] truncate max-w-[160px]" title={story.project?.name}>
                    {story.project?.name || <span className="italic text-[var(--apple-tertiary-label)]">Unavailable</span>}
                  </span>
                </div>

                {story.assignedTo && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-[var(--apple-secondary-label)]">Assigned To</span>
                    <span className="text-[13px] font-medium text-[var(--apple-label)] truncate max-w-[160px]">
                      {story.assignedTo.firstName} {story.assignedTo.lastName}
                    </span>
                  </div>
                )}

                {story.dueDate && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-[var(--apple-secondary-label)]">Due Date</span>
                    <div className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--apple-label)]">
                      <Calendar className="h-3.5 w-3.5 text-[var(--apple-tertiary-label)]" />
                      {formatDate(story.dueDate)}
                    </div>
                  </div>
                )}

                {story.storyPoints && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-[var(--apple-secondary-label)]">Story Points</span>
                    <span className="text-[13px] font-apple-mono font-medium text-[var(--apple-label)]">{story.storyPoints}</span>
                  </div>
                )}

                {story.estimatedHours && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-[var(--apple-secondary-label)]">Estimated Hours</span>
                    <span className="text-[13px] font-apple-mono font-medium text-[var(--apple-label)]">{story.estimatedHours}h</span>
                  </div>
                )}
              </div>
            </div>

            {/* Tags */}
            {story.tags && story.tags.length > 0 && (
              <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                  <h2 className="text-[13px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-tertiary-label)]">Tags</h2>
                </div>
                <div className="px-5 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    {story.tags.map((tag, index) => (
                      <span key={index} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[12px] text-[var(--apple-label)] font-medium">
                        <Star className="h-3 w-3" style={{ color: 'var(--apple-card-gradient)' }} />
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Metadata / Created By */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                <h2 className="text-[13px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-tertiary-label)]">Metadata</h2>
              </div>
              <div className="px-5 py-1 divide-y divide-[var(--apple-separator)]">
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Created by</span>
                  <span className="text-[13px] font-medium text-[var(--apple-label)] flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-[var(--apple-tertiary-label)]" />
                    {story.createdBy.firstName} {story.createdBy.lastName}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Created</span>
                  <span className="text-[13px] text-[var(--apple-label)]">{formatDate(story.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Updated</span>
                  <span className="text-[13px] text-[var(--apple-label)]">{formatDate(story.updatedAt)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {deleteError && (
        <Alert variant="destructive" className="my-4">
          <AlertDescription>{deleteError}</AlertDescription>
        </Alert>
      )}
      <ConfirmationModal
        isOpen={showDeleteConfirmModal}
        onClose={() => setShowDeleteConfirmModal(false)}
        onConfirm={handleDeleteStory}
        title="Delete Story"
        description={`Are you sure you want to delete "${story?.title}"? This action cannot be undone.`}
        confirmText={deleting ? 'Deleting...' : 'Delete'}
        cancelText="Cancel"
        variant="destructive"
      />
    </MainLayout>
  )
}
