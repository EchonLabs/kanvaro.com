'use client'

import { useState, useEffect, useMemo, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { Button } from '@/components/ui/Button'
import { formatToTitleCase } from '@/lib/utils'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { useNotify } from '@/lib/notify'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { useAuthContext } from '@/contexts/AuthContext'
import {
  ArrowLeft,
  Calendar,
  User,
  Loader2,
  Edit,
  Trash2,
  Star,
  BookOpen,
  XCircle
} from 'lucide-react'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { extractUserId } from '@/lib/auth/user-utils'

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

export default function EpicDetailPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuthContext()

  const router = useRouter()
  const params = useParams()
  const epicId = params.id as string
  const { setItems } = useBreadcrumb()
  const { success: notifySuccess, error: notifyError } = useNotify()
  const { formatDate } = useDateTime()

  const [epic, setEpic] = useState<Epic | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [stories, setStories] = useState<any[]>([])
  const [storiesLoading, setStoriesLoading] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)

  // Pagination logic for stories (must be called before any conditional returns)
  const paginatedStories = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    const endIndex = startIndex + pageSize
    return stories.slice(startIndex, endIndex)
  }, [stories, currentPage, pageSize])

  const totalPages = Math.ceil(stories.length / pageSize)

  const { hasPermission } = usePermissions()

  const handleStoryNavigation = (path: string) => {
    if (!path) return
    router.push(path)
  }

  const handleStoryKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>, path: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleStoryNavigation(path)
    }
  }

  useEffect(() => {
    // Set breadcrumb immediately on mount
    setItems([
      { label: 'Epics', href: '/epics' },
      { label: 'View Epic' }
    ])
  }, [setItems])

  // Initialize: set user ID from context and fetch data
  useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      const userId = extractUserId(user)
      if (userId) setCurrentUserId(userId.toString())
      fetchEpic()
    } else if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, user, epicId])

  const fetchEpic = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/epics/${epicId}`)
      const data = await response.json()

      if (data.success) {
        setEpic(data.data)
        // Ensure breadcrumb is set
        setItems([
          { label: 'Epics', href: '/epics' },
          { label: 'View Epic' }
        ])
        // Fetch stories for this epic
        fetchStories()
      } else {
        setError(data.error || 'Failed to fetch epic')
      }
    } catch (err) {
      setError('Failed to fetch epic')
    } finally {
      setLoading(false)
    }
  }

  const fetchStories = async () => {
    try {
      setStoriesLoading(true)
      const response = await fetch(`/api/stories?epicId=${epicId}`)
      const data = await response.json()

      if (data.success) {
        setStories(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch stories:', err)
    } finally {
      setStoriesLoading(false)
    }
  }

  const handleDeleteClick = () => {
    setShowDeleteConfirmModal(true)
  }

  const handleDeleteConfirm = async () => {
    try {
      setDeleting(true)
      const res = await fetch(`/api/epics/${epicId}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok && data.success) {
        setShowDeleteConfirmModal(false)
        notifySuccess({ title: 'Epic deleted successfully' })
        router.push('/epics')
      } else {
        const message = data?.error || 'Failed to delete epic'
        setError(message)
        setShowDeleteConfirmModal(false)
        notifyError({ title: message })
      }
    } catch (e) {
      setError('Failed to delete epic')
      setShowDeleteConfirmModal(false)
      notifyError({ title: 'Failed to delete epic' })
    } finally {
      setDeleting(false)
    }
  }

  const isCreator = (epic: Epic) => {
    const creatorId = (epic as any)?.createdBy?._id || (epic as any)?.createdBy?.id
    return creatorId && currentUserId && creatorId.toString() === currentUserId.toString()
  }

  const canEditEpic = (epic: Epic) =>
    hasPermission(Permission.EPIC_EDIT) || isCreator(epic)

  const canDeleteEpic = (epic: Epic) =>
    hasPermission(Permission.EPIC_DELETE) || isCreator(epic)

  const editAllowed = epic ? canEditEpic(epic) : false
  const deleteAllowed = epic ? canDeleteEpic(epic) : false

  // Status / priority / story-status chip color maps (Apple HIG style), mirroring the Task detail page
  const STATUS_BADGE: Record<string, { bg: string; text: string; dot: string; border: string }> = {
    todo:        { bg: 'bg-gray-50 dark:bg-gray-900/40',       text: 'text-gray-500 dark:text-gray-400',       dot: 'bg-gray-400',    border: 'border-gray-200 dark:border-gray-700' },
    in_progress: { bg: 'bg-blue-50 dark:bg-blue-950/30',       text: 'text-blue-600 dark:text-blue-400',       dot: 'bg-blue-500',    border: 'border-blue-200 dark:border-blue-800' },
    review:      { bg: 'bg-yellow-50 dark:bg-yellow-950/30',   text: 'text-yellow-600 dark:text-yellow-400',   dot: 'bg-yellow-500',  border: 'border-yellow-200 dark:border-yellow-800' },
    testing:     { bg: 'bg-purple-50 dark:bg-purple-950/30',   text: 'text-purple-600 dark:text-purple-400',   dot: 'bg-purple-500',  border: 'border-purple-200 dark:border-purple-800' },
    done:        { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', border: 'border-emerald-200 dark:border-emerald-800' },
    cancelled:   { bg: 'bg-red-50 dark:bg-red-950/30',         text: 'text-red-600 dark:text-red-400',         dot: 'bg-red-500',     border: 'border-red-200 dark:border-red-800' },
  }
  const PRIORITY_BADGE: Record<string, { bg: string; text: string; dot: string; border: string }> = {
    low:      { bg: 'bg-gray-50 dark:bg-gray-900/40',     text: 'text-gray-500 dark:text-gray-400',     dot: 'bg-gray-400',   border: 'border-gray-200 dark:border-gray-700' },
    medium:   { bg: 'bg-blue-50 dark:bg-blue-950/30',     text: 'text-blue-600 dark:text-blue-400',     dot: 'bg-blue-500',   border: 'border-blue-200 dark:border-blue-800' },
    high:     { bg: 'bg-orange-50 dark:bg-orange-950/30', text: 'text-orange-600 dark:text-orange-400', dot: 'bg-orange-500', border: 'border-orange-200 dark:border-orange-800' },
    critical: { bg: 'bg-red-50 dark:bg-red-950/30',       text: 'text-red-600 dark:text-red-400',       dot: 'bg-red-500',    border: 'border-red-200 dark:border-red-800' },
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

  // Loading states
  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-[var(--apple-system-blue)]" />
            <p className="text-[15px] text-[var(--apple-secondary-label)]">Loading epic…</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (error || !epic) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <XCircle className="h-12 w-12 text-[var(--apple-system-red)]" />
          <h2 className="text-[22px] font-semibold text-[var(--apple-label)]">{error || 'Epic not found'}</h2>
          <Button onClick={() => router.back()} className="rounded-full bg-[var(--apple-system-blue)] text-white text-[15px] font-semibold px-5 h-9 hover:opacity-90 apple-transition">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </MainLayout>
    )
  }

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
            {/* Title row: icon > title — all inline */}
            <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
              <Star className="h-8 w-8 flex-shrink-0" style={{ color: 'var(--apple-card-gradient)' }} />
              <h1 className="text-[22px] sm:text-[26px] font-bold tracking-tight text-[var(--apple-label)] leading-tight min-w-0">{epic.title}</h1>
            </div>

            {/* Edit + Delete */}
            <div className="flex flex-col gap-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <button onClick={() => editAllowed && router.push(`/epics/${epicId}/edit`)} disabled={!editAllowed}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-full text-white text-[13px] font-semibold px-4 h-9 hover:opacity-90 apple-transition disabled:opacity-40"
                  style={{ background: 'var(--apple-card-gradient)' }}>
                  <Edit className="h-3.5 w-3.5" />
                  Edit Epic
                </button>
                <button onClick={() => deleteAllowed && handleDeleteClick()} disabled={!deleteAllowed}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--apple-system-red)]/40 bg-[var(--apple-system-red)]/10 text-[var(--apple-system-red)] text-[13px] font-medium px-4 h-9 hover:bg-[var(--apple-system-red)]/20 apple-transition disabled:opacity-40">
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
                {epic.description ? (() => {
                  const isHtml = /<(p|br|div|ul|ol|li|strong|em|u|h[1-6]|img|a)(\s|>|\/)/i.test(epic.description)
                  return isHtml
                    ? <div className="task-description max-w-none" dangerouslySetInnerHTML={{ __html: epic.description }} />
                    : <div className="task-description text-[15px] text-[var(--apple-label)] whitespace-pre-line leading-relaxed">{epic.description}</div>
                })() : (
                  <p className="text-[15px] text-[var(--apple-tertiary-label)]">No description provided.</p>
                )}
              </div>
            </div>

            {/* Progress */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                <h2 className="text-[15px] font-semibold text-[var(--apple-label)]">Progress</h2>
                <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">Epic completion status</p>
              </div>
              <div className="px-5 py-4 space-y-4">
                <div>
                  <div className="flex items-center justify-between text-[13px] mb-1.5">
                    <span className="text-[var(--apple-secondary-label)]">Overall Progress</span>
                    <span className="font-medium text-[var(--apple-label)]">{epic.progress?.completionPercentage || 0}%</span>
                  </div>
                  <div className="h-[6px] rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${epic.progress?.completionPercentage || 0}%`, background: 'linear-gradient(90deg,#34C759 0%,#30D158 100%)' }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between text-[13px] mb-1.5">
                      <span className="text-[var(--apple-secondary-label)]">Stories</span>
                      <span className="font-medium text-[var(--apple-label)]">
                        {epic.progress?.storiesCompleted || 0} / {epic.progress?.totalStories || 0}
                      </span>
                    </div>
                    <div className="h-[6px] rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${epic.progress?.totalStories ? ((epic.progress.storiesCompleted / epic.progress.totalStories) * 100) : 0}%`,
                          background: 'linear-gradient(90deg,#0A84FF 0%,#409CFF 100%)'
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[13px] mb-1.5">
                      <span className="text-[var(--apple-secondary-label)]">Story Points</span>
                      <span className="font-medium text-[var(--apple-label)]">
                        {epic.progress?.storyPointsCompleted || 0} / {epic.progress?.totalStoryPoints || 0}
                      </span>
                    </div>
                    <div className="h-[6px] rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${epic.progress?.totalStoryPoints ? ((epic.progress.storyPointsCompleted / epic.progress.totalStoryPoints) * 100) : 0}%`,
                          background: 'linear-gradient(90deg,#34C759 0%,#30D158 100%)'
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Stories */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                <div className="flex items-center justify-between">
                  <h2 className="text-[15px] font-semibold text-[var(--apple-label)] flex items-center gap-2">
                    <BookOpen className="h-4 w-4" style={{ color: 'var(--apple-card-gradient)' }} />
                    Stories ({stories.length})
                  </h2>
                </div>
                <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">Stories under this epic</p>
              </div>
              <div className="px-5 py-4">
                {storiesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-[var(--apple-secondary-label)]" />
                  </div>
                ) : stories.length === 0 ? (
                  <p className="text-[14px] text-[var(--apple-tertiary-label)] text-center py-8">No stories found for this epic.</p>
                ) : (
                  <div className="space-y-3">
                    {paginatedStories.map((story: any) => (
                      <div
                        key={story._id}
                        role="button"
                        tabIndex={0}
                        className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-4 hover:shadow-[0_4px_16px_rgba(0,0,0,0.09)] hover:-translate-y-0.5 apple-transition cursor-pointer"
                        onClick={() => handleStoryNavigation(`/stories/${story._id}`)}
                        onKeyDown={(event) => handleStoryKeyDown(event, `/stories/${story._id}`)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-[14px] font-semibold text-[var(--apple-label)] mb-1 truncate" title={story.title}>
                              {story.title}
                            </h4>
                            {story.description && (
                              <p className="text-[13px] text-[var(--apple-secondary-label)] line-clamp-2 mb-2">
                                {story.description}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-1.5">
                              {renderStatusChip(STATUS_BADGE, story.status, formatToTitleCase(story.status))}
                              {renderStatusChip(PRIORITY_BADGE, story.priority, formatToTitleCase(story.priority))}
                              {story.storyPoints && (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[12px] text-[var(--apple-label)] font-medium font-apple-mono">
                                  {story.storyPoints} pts
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pagination Controls */}
              {stories.length > pageSize && (
                <div className="px-5 py-4 border-t border-[var(--apple-separator)]">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-[13px] text-[var(--apple-secondary-label)]">
                      <span>Items per page:</span>
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(parseInt(e.target.value))
                          setCurrentPage(1)
                        }}
                        className="px-2 py-1 border border-[var(--apple-separator)] rounded-[var(--apple-radius-sm)] text-[13px] bg-card text-[var(--apple-label)]"
                      >
                        <option value="5">5</option>
                        <option value="10">10</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                      </select>
                      <span>
                        Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, stories.length)} of {stories.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(currentPage - 1)}
                        disabled={currentPage === 1 || storiesLoading}
                        className="h-8 px-3 rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[13px] text-[var(--apple-label)] hover:bg-[var(--apple-tertiary-fill)] apple-transition disabled:opacity-40"
                      >
                        Previous
                      </button>
                      <span className="text-[13px] text-[var(--apple-secondary-label)] px-2">
                        Page {currentPage} of {totalPages || 1}
                      </span>
                      <button
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={currentPage >= totalPages || storiesLoading}
                        className="h-8 px-3 rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[13px] text-[var(--apple-label)] hover:bg-[var(--apple-tertiary-fill)] apple-transition disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
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
                {/* Status */}
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Status</span>
                  {renderStatusChip(STATUS_BADGE, epic.status, formatToTitleCase(epic.status))}
                </div>
                {/* Priority */}
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Priority</span>
                  {renderStatusChip(PRIORITY_BADGE, epic.priority, formatToTitleCase(epic.priority))}
                </div>
                {/* Project */}
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Project</span>
                  <span className="text-[13px] font-medium text-[var(--apple-label)] truncate max-w-[160px]" title={epic.project?.name}>
                    {epic.project?.name || '—'}
                  </span>
                </div>
                {/* Assigned To */}
                {epic.assignedTo && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-[var(--apple-secondary-label)]">Assigned To</span>
                    <span className="text-[13px] font-medium text-[var(--apple-label)] truncate max-w-[160px]">
                      {epic.assignedTo.firstName} {epic.assignedTo.lastName}
                    </span>
                  </div>
                )}
                {/* Due Date */}
                {epic.dueDate && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-[var(--apple-secondary-label)]">Due Date</span>
                    <div className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--apple-label)]">
                      <Calendar className="h-3.5 w-3.5 text-[var(--apple-tertiary-label)]" />
                      {formatDate(epic.dueDate)}
                    </div>
                  </div>
                )}
                {/* Story Points */}
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Story Points</span>
                  <span className="text-[13px] font-apple-mono font-medium text-[var(--apple-label)]">
                    {epic.progress?.totalStoryPoints ?? 0}
                  </span>
                </div>
                {/* Estimated Hours */}
                {epic.estimatedHours && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-[var(--apple-secondary-label)]">Estimated</span>
                    <span className="text-[13px] font-apple-mono font-medium text-[var(--apple-label)]">{epic.estimatedHours}h</span>
                  </div>
                )}
              </div>
            </div>

            {/* Tags */}
            {epic.tags?.length > 0 && (
              <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                  <h2 className="text-[13px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-tertiary-label)]">Tags</h2>
                </div>
                <div className="px-5 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    {epic.tags.map((label, index) => (
                      <span key={index} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[12px] text-[var(--apple-label)] font-medium">
                        <Star className="h-3 w-3" style={{ color: 'var(--apple-card-gradient)' }} />
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Created By / Metadata */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                <h2 className="text-[13px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-tertiary-label)]">Created By</h2>
              </div>
              <div className="px-5 py-4">
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-[var(--apple-tertiary-label)] flex-shrink-0" />
                  <span className="text-[13px] text-[var(--apple-label)] font-medium truncate">
                    {epic.createdBy?.firstName} {epic.createdBy?.lastName}
                  </span>
                </div>
                <p className="text-[12px] text-[var(--apple-tertiary-label)] mt-1">
                  {formatDate(epic.createdAt)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <ConfirmationModal
        isOpen={showDeleteConfirmModal}
        onClose={() => setShowDeleteConfirmModal(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Epic"
        description={`Are you sure you want to delete "${epic?.title}"? This action cannot be undone.`}
        confirmText={deleting ? 'Deleting...' : 'Delete'}
        cancelText="Cancel"
        variant="destructive"
      />
    </MainLayout>
  )
}
