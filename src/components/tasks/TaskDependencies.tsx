'use client'

import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/Dialog'
import {
  Link2,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Trash2,
  Search,
  Loader2,
  ExternalLink,
  X,
} from 'lucide-react'
import { useNotify } from '@/lib/notify'
import { DEFAULT_TASK_STATUS_BADGE_MAP, DEFAULT_TASK_STATUS_LABELS } from '@/constants/taskStatuses'
import { formatToTitleCase } from '@/lib/utils'

export interface DependencyTask {
  _id: string
  displayId?: string
  taskNumber?: number
  title: string
  status: string
  priority?: string
  type?: string
  dueDate?: string | Date
  assignedTo?: Array<{
    user?: {
      _id?: string
      firstName?: string
      lastName?: string
      email?: string
      avatar?: string
    }
    firstName?: string
    lastName?: string
    email?: string
  }>
}

interface TaskDependenciesProps {
  taskId: string
  taskStatus?: string
  initialBlockedBy?: DependencyTask[]
  initialBlocking?: DependencyTask[]
  onUpdated?: () => void
  readOnly?: boolean
  staged?: boolean
  onChange?: (data: { blockedBy: DependencyTask[]; blocking: DependencyTask[] }) => void
}

/**
 * Helper to sync staged dependency changes when a form is submitted
 */
export async function syncTaskDependencies(
  taskId: string,
  initialBlockedBy: any[] = [],
  initialBlocking: any[] = [],
  finalBlockedBy: any[] = [],
  finalBlocking: any[] = []
): Promise<void> {
  const initialBlockedIds = new Set(initialBlockedBy.map((t) => (t?._id || t).toString()))
  const finalBlockedIds = new Set(finalBlockedBy.map((t) => (t?._id || t).toString()))

  const toAddBlocked = finalBlockedBy.filter((t) => !initialBlockedIds.has((t?._id || t).toString()))
  const toRemoveBlocked = initialBlockedBy.filter((t) => !finalBlockedIds.has((t?._id || t).toString()))

  const initialBlockingIds = new Set(initialBlocking.map((t) => (t?._id || t).toString()))
  const finalBlockingIds = new Set(finalBlocking.map((t) => (t?._id || t).toString()))

  const toAddBlocking = finalBlocking.filter((t) => !initialBlockingIds.has((t?._id || t).toString()))
  const toRemoveBlocking = initialBlocking.filter((t) => !finalBlockingIds.has((t?._id || t).toString()))

  const requests: Promise<any>[] = []

  for (const t of toAddBlocked) {
    requests.push(
      fetch(`/api/tasks/${taskId}/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTaskId: t._id || t, relationship: 'blocked_by' }),
      })
    )
  }

  for (const t of toRemoveBlocked) {
    requests.push(
      fetch(`/api/tasks/${taskId}/dependencies`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTaskId: t._id || t, relationship: 'blocked_by' }),
      })
    )
  }

  for (const t of toAddBlocking) {
    requests.push(
      fetch(`/api/tasks/${taskId}/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTaskId: t._id || t, relationship: 'blocking' }),
      })
    )
  }

  for (const t of toRemoveBlocking) {
    requests.push(
      fetch(`/api/tasks/${taskId}/dependencies`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTaskId: t._id || t, relationship: 'blocking' }),
      })
    )
  }

  if (requests.length > 0) {
    const responses = await Promise.all(requests)
    for (const res of responses) {
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || 'Failed to sync dependencies')
      }
    }
  }
}

const EMPTY_DEPENDENCIES: DependencyTask[] = []

export function TaskDependencies({
  taskId,
  taskStatus,
  initialBlockedBy = EMPTY_DEPENDENCIES,
  initialBlocking = EMPTY_DEPENDENCIES,
  onUpdated,
  readOnly = false,
  staged = false,
  onChange,
}: TaskDependenciesProps) {
  const { success: notifySuccess, error: notifyError } = useNotify()

  const isCurrentTaskCompleted = Boolean(taskStatus && ['done', 'cancelled'].includes(taskStatus))
  const [blockedBy, setBlockedBy] = useState<DependencyTask[]>(initialBlockedBy)
  const [blocking, setBlocking] = useState<DependencyTask[]>(initialBlocking)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [relationshipType, setRelationshipType] = useState<'blocked_by' | 'blocking'>('blocked_by')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [removingKey, setRemovingKey] = useState<string | null>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Keep live references to avoid effect dependency re-triggers
  const blockedByRef = useRef(blockedBy)
  blockedByRef.current = blockedBy
  const blockingRef = useRef(blocking)
  blockingRef.current = blocking

  // Sync state when props change
  const prevBlockedRef = useRef(initialBlockedBy)
  useEffect(() => {
    if (initialBlockedBy !== prevBlockedRef.current) {
      prevBlockedRef.current = initialBlockedBy
      if (initialBlockedBy && initialBlockedBy.length > 0) {
        setBlockedBy(initialBlockedBy)
      }
    }
  }, [initialBlockedBy])

  const prevBlockingRef = useRef(initialBlocking)
  useEffect(() => {
    if (initialBlocking !== prevBlockingRef.current) {
      prevBlockingRef.current = initialBlocking
      if (initialBlocking && initialBlocking.length > 0) {
        setBlocking(initialBlocking)
      }
    }
  }, [initialBlocking])

  // Fetch dependencies from API if not provided or empty
  useEffect(() => {
    if (!taskId || staged) return
    let isMounted = true
    fetch(`/api/tasks/${taskId}/dependencies`)
      .then((res) => res.json())
      .then((json) => {
        if (isMounted && json.success && json.data) {
          if (Array.isArray(json.data.blockedBy)) setBlockedBy(json.data.blockedBy)
          if (Array.isArray(json.data.blocking)) setBlocking(json.data.blocking)
        }
      })
      .catch((err) => console.error('Failed to load task dependencies:', err))

    return () => {
      isMounted = false
    }
  }, [taskId, staged])

  // Count active (incomplete) blockers
  const activeBlockers = blockedBy.filter(
    (t) => t && !['done', 'cancelled'].includes(t.status)
  )

  // Fetch search results whenever search query or dialog open state changes
  useEffect(() => {
    if (!isAddOpen) {
      setSearchQuery('')
      setSearchResults(EMPTY_DEPENDENCIES)
      setIsSearching(false)
      return
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    const trimmed = searchQuery.trim()

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const url = trimmed
          ? `/api/tasks?search=${encodeURIComponent(trimmed)}&limit=10&minimal=true`
          : `/api/tasks?limit=10&minimal=true`
        const res = await fetch(url)
        if (res.ok) {
          const json = await res.json()
          const list: any[] = Array.isArray(json.data)
            ? json.data
            : Array.isArray(json.data?.tasks)
            ? json.data.tasks
            : Array.isArray(json.tasks)
            ? json.tasks
            : []

          // Exclude the current task and already linked tasks in the selected relationship
          const currentList = relationshipType === 'blocked_by' ? blockedByRef.current : blockingRef.current
          const currentLinkedIds = new Set(currentList.map((t) => (t?._id || t).toString()))
          currentLinkedIds.add(taskId.toString())

          const filtered = list.filter((t: any) => !currentLinkedIds.has(t._id?.toString()))
          setSearchResults(filtered)
        }
      } catch (err) {
        console.error('Failed to search tasks for dependencies:', err)
      } finally {
        setIsSearching(false)
      }
    }, trimmed ? 200 : 10)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery, isAddOpen, relationshipType, taskId])

  // Single-link dependency handler
  const handleAddSingle = async (targetTask: any) => {
    if (!targetTask?._id) return

    // 1. Done/Cancelled validation on target task
    if (['done', 'cancelled'].includes(targetTask.status)) {
      notifyError({
        title: 'Cannot Add Dependency',
        message:
          relationshipType === 'blocked_by'
            ? `Cannot add an already completed task as a blocker: "${targetTask.displayId || targetTask.title}" is marked as ${formatToTitleCase(targetTask.status)}.`
            : `Cannot block an already completed task: "${targetTask.displayId || targetTask.title}" is marked as ${formatToTitleCase(targetTask.status)}.`,
      })
      return
    }

    // 2. Loop protection check
    const opposingList = relationshipType === 'blocked_by' ? blocking : blockedBy
    const opposingIdSet = new Set(opposingList.map((t) => (t._id || t).toString()))
    if (opposingIdSet.has(targetTask._id.toString())) {
      notifyError({
        title: 'Cannot Add Dependency',
        message:
          relationshipType === 'blocked_by'
            ? `Circular dependency detected: ${targetTask.displayId || 'Target task'} is already blocked by this task.`
            : `Circular dependency detected: This task is already blocked by ${targetTask.displayId || 'target task'}.`,
      })
      return
    }

    // 3. Staged mode
    if (staged) {
      if (relationshipType === 'blocked_by') {
        const nextBlocked = [...blockedBy, targetTask]
        setBlockedBy(nextBlocked)
        onChange?.({ blockedBy: nextBlocked, blocking })
      } else {
        const nextBlocking = [...blocking, targetTask]
        setBlocking(nextBlocking)
        onChange?.({ blockedBy, blocking: nextBlocking })
      }
      setIsAddOpen(false)
      setSearchQuery('')
      return
    }

    // 4. Direct mode
    try {
      setLinkingId(targetTask._id.toString())
      const res = await fetch(`/api/tasks/${taskId}/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTaskId: targetTask._id, relationship: relationshipType }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to link dependency')
      }

      if (data.data) {
        setBlockedBy(data.data.blockedBy || [])
        setBlocking(data.data.blocking || [])
      }
      setIsAddOpen(false)
      setSearchQuery('')
      notifySuccess({
        title: 'Dependency Linked',
        message:
          relationshipType === 'blocked_by'
            ? 'Prerequisite blocker linked'
            : 'Downstream dependency linked',
      })
      onUpdated?.()
    } catch (err: any) {
      console.error('Error adding dependency:', err)
      notifyError({ title: 'Cannot Add Dependency', message: err.message || 'Error adding dependency' })
    } finally {
      setLinkingId(null)
    }
  }

  // Single-remove dependency handler
  const handleRemoveSingle = async (targetTaskId: string, relationship: 'blocked_by' | 'blocking') => {
    if (!targetTaskId) return

    if (staged) {
      if (relationship === 'blocked_by') {
        const nextBlocked = blockedBy.filter((t) => (t._id || t).toString() !== targetTaskId)
        setBlockedBy(nextBlocked)
        onChange?.({ blockedBy: nextBlocked, blocking })
      } else {
        const nextBlocking = blocking.filter((t) => (t._id || t).toString() !== targetTaskId)
        setBlocking(nextBlocking)
        onChange?.({ blockedBy, blocking: nextBlocking })
      }
      return
    }

    // Direct mode
    try {
      setRemovingKey(`${relationship}-${targetTaskId}`)
      const res = await fetch(`/api/tasks/${taskId}/dependencies`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTaskId, relationship }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to remove dependency relationship')
      }

      if (data.data) {
        setBlockedBy(data.data.blockedBy || [])
        setBlocking(data.data.blocking || [])
      }
      notifySuccess({
        title: 'Dependency Removed',
        message: 'The dependency relationship has been unlinked',
      })
      onUpdated?.()
    } catch (err: any) {
      console.error('Error removing dependency:', err)
      notifyError({ title: 'Error', message: err.message || 'Failed to remove dependency' })
    } finally {
      setRemovingKey(null)
    }
  }

  // Helper to render an individual task row in Blocked By / Blocking lists
  const renderTaskRow = (
    taskItem: DependencyTask,
    relationship: 'blocked_by' | 'blocking'
  ) => {
    const isDone = taskItem.status === 'done' || taskItem.status === 'cancelled'
    const removeKey = `${relationship}-${taskItem._id}`
    const isRemoving = removingKey === removeKey

    // Extract assignee name
    let assigneeName = ''
    if (taskItem.assignedTo && taskItem.assignedTo.length > 0) {
      const first = taskItem.assignedTo[0]
      const user = first.user || first
      assigneeName =
        `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || ''
    }

    return (
      <div
        key={taskItem._id}
        className="group flex items-center justify-between gap-3 px-3 py-2 rounded-[var(--apple-radius-md)] border bg-[var(--apple-quaternary-fill)]/50 hover:bg-[var(--apple-quaternary-fill)] border-[var(--apple-separator)]/60 transition-colors"
      >
        {/* Left side: Status badge + Display ID + Task Title */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Status badge */}
          <div className="w-[86px] shrink-0 flex justify-center">
            <span
              className={`text-[10px] w-full text-center py-0.5 px-1.5 rounded-full font-medium truncate ${
                DEFAULT_TASK_STATUS_BADGE_MAP[taskItem.status] || 'bg-gray-100 text-gray-700'
              }`}
            >
              {DEFAULT_TASK_STATUS_LABELS[taskItem.status] || formatToTitleCase(taskItem.status)}
            </span>
          </div>

          {/* Display ID & link */}
          <div className="w-[64px] shrink-0">
            <Link
              href={`/tasks/${taskItem._id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] font-bold text-[var(--apple-system-blue)] font-apple-mono hover:underline flex items-center gap-1 truncate"
              title={taskItem.displayId || `#${taskItem.taskNumber || ''}`}
            >
              <span className="truncate">{taskItem.displayId || `#${taskItem.taskNumber || ''}`}</span>
              <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </Link>
          </div>

          {/* Title */}
          <div className="flex-1 min-w-0">
            <Link
              href={`/tasks/${taskItem._id}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`text-[13px] font-medium text-[var(--apple-label)] hover:underline block truncate ${
                isDone ? 'line-through text-[var(--apple-secondary-label)]' : ''
              }`}
              title={taskItem.title}
            >
              {taskItem.title}
            </Link>
          </div>
        </div>

        {/* Right side: Assignee & Action */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-[110px] text-right hidden sm:block shrink-0">
            {assigneeName ? (
              <span className="text-[11px] text-[var(--apple-secondary-label)] truncate block" title={assigneeName}>
                {assigneeName}
              </span>
            ) : null}
          </div>

          {!readOnly && (
            <div className="w-7 flex justify-end shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isRemoving}
                onClick={() => handleRemoveSingle(taskItem._id, relationship)}
                className="h-7 w-7 p-0 text-[var(--apple-secondary-label)] hover:text-red-500 hover:bg-red-500/10 rounded-full"
                title="Remove dependency"
              >
                {isRemoving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const totalDependencies = blockedBy.length + blocking.length

  return (
    <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--apple-separator)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-[var(--apple-secondary-label)]" />
          <h2 className="text-[15px] font-semibold text-[var(--apple-label)]">Dependencies</h2>

          {/* Blocker status summary pill */}
          {blockedBy.length > 0 && (
            activeBlockers.length > 0 ? (
              <Badge
                variant="outline"
                className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30 text-[11px] gap-1 py-0.5"
              >
                <AlertTriangle className="h-3 w-3" />
                {activeBlockers.length} active blocker{activeBlockers.length > 1 ? 's' : ''}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[11px] gap-1 py-0.5"
              >
                <CheckCircle2 className="h-3 w-3" />
                Blockers resolved
              </Badge>
            )
          )}
        </div>

        {!readOnly && (
          isCurrentTaskCompleted ? (
            <span className="text-[11px] text-[var(--apple-tertiary-label)] italic">
              Task is {taskStatus === 'cancelled' ? 'cancelled' : 'completed'}
            </span>
          ) : (
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsAddOpen(true)}
                className="h-7 px-2 text-[12px] font-medium text-[var(--apple-system-blue)] hover:bg-[var(--apple-system-blue)]/10"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Dependency
              </Button>

              <DialogContent
                onOpenAutoFocus={(e) => e.preventDefault()}
                className="sm:max-w-md flex flex-col p-0 overflow-hidden rounded-[var(--apple-radius-xl)] border-[var(--apple-separator)] shadow-2xl bg-[var(--apple-secondary-system-background)]"
              >
                {/* Header */}
                <DialogHeader className="border-b border-[var(--apple-separator)] px-6 py-4 bg-[var(--apple-bg-primary)] flex-shrink-0 text-left">
                  <DialogTitle className="text-[17px] font-semibold text-[var(--apple-label)]">
                    Add Dependency
                  </DialogTitle>
                  <DialogDescription className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">
                    Connect another task as a blocker or downstream dependency.
                  </DialogDescription>
                </DialogHeader>

                {/* Body */}
                <DialogBody className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
                  {/* Segmented Control */}
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-2 p-1 bg-[var(--apple-tertiary-fill)] rounded-[var(--apple-radius-pill)] border border-[var(--apple-separator)]/40">
                      <button
                        type="button"
                        onClick={() => setRelationshipType('blocked_by')}
                        className={`flex items-center justify-center gap-1.5 py-1.5 rounded-[var(--apple-radius-pill)] text-[13px] font-medium transition-all ${
                          relationshipType === 'blocked_by'
                            ? 'bg-card text-[var(--apple-label)] shadow-sm font-semibold'
                            : 'text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]'
                        }`}
                      >
                        <Lock className="h-3.5 w-3.5 text-orange-500" />
                        Blocked By
                      </button>
                      <button
                        type="button"
                        onClick={() => setRelationshipType('blocking')}
                        className={`flex items-center justify-center gap-1.5 py-1.5 rounded-[var(--apple-radius-pill)] text-[13px] font-medium transition-all ${
                          relationshipType === 'blocking'
                            ? 'bg-card text-[var(--apple-label)] shadow-sm font-semibold'
                            : 'text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]'
                        }`}
                      >
                        <Unlock className="h-3.5 w-3.5 text-blue-500" />
                        Blocking
                      </button>
                    </div>

                    <p className="text-[11.5px] text-[var(--apple-secondary-label)] text-center">
                      {relationshipType === 'blocked_by'
                        ? 'This task cannot finish until the selected task is completed.'
                        : 'The selected task will wait until this task is completed.'}
                    </p>
                  </div>

                  {/* Search input */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--apple-tertiary-label)]" />
                    <Input
                      placeholder="Search by ID (e.g. 1.14) or title..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-9 pl-9 pr-8 text-[13px] rounded-[var(--apple-radius-pill)] bg-[var(--apple-quaternary-fill)] border-[var(--apple-separator)] focus-visible:ring-2 focus-visible:ring-[var(--apple-system-blue)]/30"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--apple-tertiary-label)] hover:text-[var(--apple-label)]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Search Results */}
                  <div className="max-h-[260px] overflow-y-auto space-y-1.5 pr-1 -mr-1">
                    {isSearching ? (
                      <div className="flex items-center justify-center py-8 text-xs text-[var(--apple-secondary-label)]">
                        <Loader2 className="h-4 w-4 mr-2 animate-spin text-[var(--apple-system-blue)]" />
                        Searching tasks...
                      </div>
                    ) : searchResults.length > 0 ? (
                      searchResults.map((taskItem) => {
                        const isCircular = relationshipType === 'blocked_by'
                          ? blocking.some((t) => (t._id || t).toString() === taskItem._id.toString())
                          : blockedBy.some((t) => (t._id || t).toString() === taskItem._id.toString())
                        const isAlreadyDone = ['done', 'cancelled'].includes(taskItem.status)
                        const isDisabled = isCircular || isAlreadyDone
                        const isLinkingThis = linkingId === taskItem._id.toString()

                        return (
                          <div
                            key={taskItem._id}
                            onClick={() => {
                              if (!isDisabled && !linkingId) handleAddSingle(taskItem)
                            }}
                            className={`flex items-center justify-between gap-3 p-2.5 rounded-[var(--apple-radius-md)] border transition-colors ${
                              isDisabled
                                ? 'opacity-60 bg-[var(--apple-quaternary-fill)]/30 border-red-500/20 cursor-not-allowed'
                                : 'border-[var(--apple-separator)] bg-card hover:bg-[var(--apple-quaternary-fill)] cursor-pointer'
                            }`}
                          >
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[11px] font-bold text-[var(--apple-system-blue)] font-apple-mono">
                                  {taskItem.displayId || `#${taskItem.taskNumber || ''}`}
                                </span>
                                <span
                                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-medium ${
                                    DEFAULT_TASK_STATUS_BADGE_MAP[taskItem.status] || 'bg-gray-100 text-gray-700'
                                  }`}
                                >
                                  {DEFAULT_TASK_STATUS_LABELS[taskItem.status] || formatToTitleCase(taskItem.status)}
                                </span>
                                {isCircular && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded-full font-medium bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                                    Circular Loop
                                  </span>
                                )}
                                {isAlreadyDone && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded-full font-medium bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
                                    Already Completed
                                  </span>
                                )}
                              </div>
                              <p className="text-[13px] font-medium text-[var(--apple-label)] truncate">
                                {taskItem.title}
                              </p>
                            </div>

                            <Button
                              size="sm"
                              disabled={Boolean(linkingId) || isDisabled}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleAddSingle(taskItem)
                              }}
                              className={`h-7 px-3 rounded-[var(--apple-radius-pill)] text-xs font-semibold shrink-0 ${
                                isDisabled
                                  ? 'bg-gray-200 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                                  : 'bg-[var(--apple-system-blue)] text-white hover:opacity-90'
                              }`}
                            >
                              {isLinkingThis ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : isCircular ? (
                                'Blocked'
                              ) : isAlreadyDone ? (
                                'Completed'
                              ) : (
                                'Add'
                              )}
                            </Button>
                          </div>
                        )
                      })
                    ) : (
                      <div className="rounded-[var(--apple-radius-md)] border border-dashed border-[var(--apple-separator)] p-6 text-center text-xs text-[var(--apple-secondary-label)]">
                        {searchQuery ? `No tasks found matching "${searchQuery}"` : 'Type above to search tasks'}
                      </div>
                    )}
                  </div>
                </DialogBody>

                {/* Footer */}
                <DialogFooter className="border-t border-[var(--apple-separator)] px-6 py-3 bg-[var(--apple-bg-primary)] flex items-center justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsAddOpen(false)}
                    className="rounded-[var(--apple-radius-pill)] h-8 px-4 text-xs font-medium border-[var(--apple-separator)] hover:bg-[var(--apple-quaternary-fill)]"
                  >
                    Cancel
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )
        )}
      </div>

      {/* Main Body */}
      <div className="px-5 py-4 space-y-5">
        {totalDependencies === 0 ? (
          <div className="py-4 text-center">
            <p className="text-xs text-[var(--apple-secondary-label)]">
              No dependencies linked to this task yet.
            </p>
          </div>
        ) : (
          <>
            {/* Section 1: Blocked By */}
            {blockedBy.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-orange-500" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--apple-secondary-label)]">
                      Blocked By
                    </span>
                    <span className="text-[11px] font-apple-mono text-[var(--apple-tertiary-label)]">
                      ({blockedBy.length})
                    </span>
                  </div>
                  <span className="text-[11px] text-[var(--apple-tertiary-label)]">
                    Must be finished first
                  </span>
                </div>

                <div className="space-y-1.5">
                  {blockedBy.map((item) => renderTaskRow(item, 'blocked_by'))}
                </div>
              </div>
            )}

            {/* Section 2: Blocking */}
            {blocking.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Unlock className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--apple-secondary-label)]">
                      Blocking
                    </span>
                    <span className="text-[11px] font-apple-mono text-[var(--apple-tertiary-label)]">
                      ({blocking.length})
                    </span>
                  </div>
                  <span className="text-[11px] text-[var(--apple-tertiary-label)]">
                    Waiting on this task
                  </span>
                </div>

                <div className="space-y-1.5">
                  {blocking.map((item) => renderTaskRow(item, 'blocking'))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
