'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { PageContent } from '@/components/ui/PageContent'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { useAuthContext } from '@/contexts/AuthContext'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { fetchStandupScheduleDetail } from '@/components/standup-dashboard/standup-dashboard-service'
import type { StandupScheduleDetail, StandupMeetingStatus } from '@/components/standup-dashboard/standup-dashboard-types'
import { StandupSummaryDialog } from '@/components/standup-dashboard/StandupSummaryDialog'
import { EditStandupScheduleModal } from '@/components/standup-dashboard/EditStandupScheduleModal'
import { UnifiedCommentsSection } from '@/components/standup-dashboard/UnifiedCommentsSection'
import { deleteStandupSchedule, updateStandupSchedule } from '@/components/standup-dashboard/standup-schedule-storage'
import { useNotify } from '@/lib/notify'
import { StandupTimelogList } from '@/components/standup-dashboard/StandupTimelogList'
import { ArrowLeft, CalendarDays, CalendarCheck, Clock3, Edit3, Loader2, MessageSquare, Sparkles, Trash2, Users } from 'lucide-react'
import { formatToTitleCase } from '@/lib/utils'

const HEADER_GRADIENT = 'var(--apple-card-gradient)'
const HEADER_GLOW = 'var(--apple-chart-glow)'

const STATUS_CONFIG: Record<StandupMeetingStatus, { bg: string; text: string; dot: string; border: string; label: string }> = {
  scheduled:   { bg: 'bg-blue-50 dark:bg-blue-950/30',       text: 'text-blue-600 dark:text-blue-400',       dot: 'bg-blue-500',   border: 'border-blue-200 dark:border-blue-800',   label: 'Scheduled' },
  in_progress: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', border: 'border-emerald-200 dark:border-emerald-800', label: 'In Progress' },
  completed:   { bg: 'bg-gray-50 dark:bg-gray-900/40',       text: 'text-gray-500 dark:text-gray-400',       dot: 'bg-gray-400',   border: 'border-gray-200 dark:border-gray-700',   label: 'Completed' },
  missed:      { bg: 'bg-red-50 dark:bg-red-950/30',         text: 'text-red-600 dark:text-red-400',         dot: 'bg-red-500',    border: 'border-red-200 dark:border-red-800',     label: 'Missed' },
}

const OUTCOME_CONFIG = {
  on_track:        { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800', label: 'On Track' },
  needs_attention: { bg: 'bg-amber-50 dark:bg-amber-950/30',     text: 'text-amber-600 dark:text-amber-400',     border: 'border-amber-200 dark:border-amber-800',     label: 'Needs Attention' },
}

export default function StandupScheduleDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user, isAuthenticated, isLoading: authLoading } = useAuthContext()
  const { hasPermission, canManageProject } = usePermissions()
  const { formatDate } = useDateTime()
  const { success: notifySuccess, error: notifyError } = useNotify()
  const projectId = params.projectId as string
  const meetingId = params.meetingId as string

  const [detail, setDetail] = useState<StandupScheduleDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [commentTaskState, setCommentTaskState] = useState<{ memberId: string; taskId: string; taskTitle: string } | null>(null)
  const [commentText, setCommentText] = useState('')
  const [addingComment, setAddingComment] = useState(false)

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

  const loadDetail = async (signal?: AbortSignal) => {
    if (!user?.organization) {
      setLoading(false)
      return
    }
    try {
      const data = await fetchStandupScheduleDetail(projectId, meetingId, user.organization, signal)
      setDetail(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const abortController = new AbortController()
    loadDetail(abortController.signal)
    return () => abortController.abort()
  }, [meetingId, projectId, user?.organization])

  const breadcrumbItems = [
    { label: 'Tasks', href: '/tasks' },
    { label: 'Standup Dashboard', href: '/tasks/standup-dashboard' },
    { label: `${detail?.project?.name || 'Project'} Standups`, href: `/tasks/standup-dashboard/${projectId}` },
    { label: 'View Details' }
  ]

  const canManageStandup = hasPermission(Permission.PROJECT_MANAGE_TEAM) && canManageProject(projectId)

  const handleViewSummary = () => {
    router.push(`/tasks/standup-dashboard/${projectId}/schedule/${meetingId}/summary`)
  }

  const handleDeleteSchedule = async () => {
    if (!user?.organization) {
      notifyError({ title: 'Unable to delete standup' })
      return
    }
    setDeleting(true)
    try {
      await deleteStandupSchedule(projectId, meetingId)
      notifySuccess({ title: 'Standup deleted', message: 'The standup schedule was permanently deleted.' })
      router.push(`/tasks/standup-dashboard/${projectId}`)
    } catch {
      notifyError({ title: 'Unable to delete standup' })
    } finally {
      setDeleting(false)
      setDeleteConfirmOpen(false)
    }
  }

  const handleAddComment = async (commentPayload: {
    memberId?: string
    taskId?: string
    taskTitle?: string
    reason: string
  }) => {
    if (!user?.id || !detail) return
    try {
      const newComment = {
        author: user.id,
        authorName: `${user.firstName} ${user.lastName}`.trim(),
        memberId: commentPayload.memberId,
        taskId: commentPayload.taskId,
        taskTitle: commentPayload.taskTitle,
        reason: commentPayload.reason,
        createdAt: new Date().toISOString()
      }
      await updateStandupSchedule(projectId, meetingId, { comment: newComment })
      await loadDetail()
      notifySuccess({ title: 'Comment posted', message: 'Comment successfully added to standup logs.' })
    } catch {
      notifyError({ title: 'Unable to add comment' })
    }
  }

  const overallSummary = useMemo(() => {
    if (!detail) return ''
    const completedTasks = detail.timelogs.filter((log) => log.taskStatus === 'completed' || log.taskStatus === 'done').length
    if (completedTasks === 0) return 'No logged work was completed for this meeting date yet.'
    if (completedTasks >= detail.timelogs.length && detail.timelogs.length > 0) return 'All logged work for the meeting date was completed.'
    return `${completedTasks} logged tasks were completed on the meeting date.`
  }, [detail])

  const getMemberName = (id: string) => {
    const match = detail?.project.teamMembers.find((m) => m._id === id)
    return match ? `${match.firstName} ${match.lastName}`.trim() : 'Unknown Member'
  }

  if (loading || !detail) {
    return (
      <MainLayout breadcrumbItems={breadcrumbItems}>
        <PageContent>
          <div className="flex items-center justify-center gap-2.5 py-20 text-[13px] text-[var(--apple-secondary-label)]">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading standup details…
          </div>
        </PageContent>
      </MainLayout>
    )
  }

  const statusCfg = STATUS_CONFIG[detail.meeting.status]

  return (
    <MainLayout breadcrumbItems={breadcrumbItems}>
      <PageContent>
        <div className="space-y-6 sm:space-y-8">

          {/* Page header */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <Button
                variant="ghost"
                size="sm"
                className="w-fit gap-1.5 px-0 text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]"
                onClick={() => router.push(`/tasks/standup-dashboard/${projectId}`)}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to project
              </Button>

              <div className="flex items-center gap-4">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--apple-radius-md)] shadow-lg"
                  style={{ background: HEADER_GRADIENT, boxShadow: `0 8px 24px ${HEADER_GLOW}` }}
                >
                  <CalendarCheck className="h-7 w-7 text-white" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight">{detail.meeting.title}</h1>
                    <div
                      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}
                      style={{ animation: 'badge-border-pulse 3s ease-in-out infinite' }}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} style={{ animation: 'status-pulse 2s ease-in-out infinite' }} />
                      {statusCfg.label}
                    </div>
                  </div>
                  <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">
                    {detail.project.name} · {formatDate(detail.meeting.date)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-[13px] text-[var(--apple-secondary-label)]">
                <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{detail.meeting.participants.length} participants</span>
                <span className="flex items-center gap-1.5"><Clock3 className="h-4 w-4" />{detail.meeting.time}</span>
                <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{detail.meeting.durationMinutes} mins</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 items-center">
              {detail.meeting.status !== 'completed' && canManageStandup && (
                <Button
                  variant="outline"
                  className="apple-transition"
                  onClick={async () => {
                    if (!user?.organization) { notifyError({ title: 'Unable to complete standup' }); return }
                    try {
                      await updateStandupSchedule(projectId, meetingId, { status: 'completed', actualDate: new Date().toISOString() })
                      await loadDetail()
                      notifySuccess({ title: 'Standup completed', message: 'Standup marked as completed.' })
                    } catch {
                      notifyError({ title: 'Unable to complete standup' })
                    }
                  }}
                >
                  Mark Complete
                </Button>
              )}
              {canManageStandup && (
                <Button variant="outline" className="apple-transition" onClick={() => setEditOpen(true)}>
                  <Edit3 className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              )}
              <Button
                variant="outline"
                className="apple-transition"
                onClick={handleViewSummary}
              >
                <Sparkles className="mr-2 h-4 w-4 text-amber-500" />
                View Summary
              </Button>
              {detail.meeting.status === 'completed' && (
                <StandupSummaryDialog
                  projectId={projectId}
                  meetingId={meetingId}
                  detail={detail}
                  onGenerated={(summary) => setDetail((cur) => cur ? { ...cur, meeting: { ...cur.meeting, summary } } : cur)}
                />
              )}
              {canManageStandup && (
                <Button variant="destructive" className="apple-transition" onClick={() => setDeleteConfirmOpen(true)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              )}
            </div>
          </div>

          {/* Member outcome cards */}
          <section className="space-y-4">
            <div>
              <p className="apple-section-label text-[var(--apple-secondary-label)] mb-1">Team</p>
              <h2 className="text-[20px] font-bold tracking-tight">Member Outcomes</h2>
              <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">What happened for each team member on this day.</p>
            </div>

            <div className="view-transition-container grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {detail.memberSummaries.map((member) => {
                const outcomeKey = member.status === 'on_track' ? 'on_track' : 'needs_attention'
                const outcomeCfg = OUTCOME_CONFIG[outcomeKey]

                return (
                  <div
                    key={member._id}
                    className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] overflow-hidden apple-transition hover:shadow-[0_8px_28px_rgba(0,0,0,0.09)] dark:hover:shadow-[0_8px_28px_rgba(0,0,0,0.35)]"
                  >
                    {/* Card header */}
                    <div className="flex items-center justify-between gap-3 border-b border-[var(--apple-separator)] px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold truncate">{member.firstName} {member.lastName}</p>
                        <p className="text-[11px] text-[var(--apple-secondary-label)]">{member.role}</p>
                      </div>
                      <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold shrink-0 ${outcomeCfg.bg} ${outcomeCfg.text} ${outcomeCfg.border}`}>
                        {outcomeCfg.label}
                      </div>
                    </div>

                    {/* Assigned tasks */}
                    <div className="p-3 space-y-2">
                      {member.assignedTasks.length > 0 ? (
                        member.assignedTasks.map((task) => (
                          <div
                            key={task.taskId}
                            className="flex items-center justify-between gap-2 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-3 py-2 apple-transition hover:bg-[var(--apple-tertiary-fill)]"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="text-[12px] font-semibold truncate">{task.taskTitle}</span>
                              {task.status && (
                                <span className="text-[10px] capitalize shrink-0 rounded-full bg-[var(--apple-tertiary-fill)] px-2 py-0.5 font-medium text-[var(--apple-secondary-label)]">
                                  {formatToTitleCase(task.status)}
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => setCommentTaskState({ memberId: member._id, taskId: task.taskId, taskTitle: task.taskTitle })}
                              className="apple-transition h-7 w-7 shrink-0 flex items-center justify-center rounded-full text-[var(--apple-tertiary-label)] hover:bg-[var(--apple-tertiary-fill)] hover:text-[var(--apple-system-blue)]"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className="text-[12px] text-[var(--apple-tertiary-label)] italic py-2 text-center">
                          No assignments captured for this member.
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Timelogs */}
          <StandupTimelogList timelogs={detail.timelogs} members={detail.meeting.participants} standupDate={detail.meeting.date} />

          {/* Day summary */}
          <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-5 space-y-3">
            <div>
              <p className="apple-section-label text-[var(--apple-secondary-label)] mb-1">Overview</p>
              <h2 className="text-[17px] font-semibold">Day Summary</h2>
              <p className="text-[12px] text-[var(--apple-secondary-label)] mt-0.5">Overall status for this standup date.</p>
            </div>
            <p className="text-[13px]">{overallSummary}</p>
            <p className="text-[13px] text-[var(--apple-secondary-label)]">{detail.meeting.notes || 'No standup notes were recorded.'}</p>
          </div>

          {/* Comments */}
          <UnifiedCommentsSection
            comments={detail.meeting.comments || []}
            members={detail.project.teamMembers}
            projectTasks={detail.projectTasks}
            onAddComment={handleAddComment}
          />
        </div>
      </PageContent>

      {/* Edit modal */}
      {editOpen && (
        <EditStandupScheduleModal
          open={editOpen}
          onOpenChange={setEditOpen}
          projectId={projectId}
          organizationId={user?.organization || ''}
          detail={detail}
          onSuccess={(updatedDetail) => setDetail(updatedDetail)}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmationModal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteSchedule}
        title="Delete Standup Schedule"
        description="Are you absolutely sure you want to delete this standup schedule? This will permanently remove the record and its compiled summary reports."
        confirmText="Yes, Delete"
        cancelText="Cancel"
        variant="destructive"
        isLoading={deleting}
      />

      {/* Inline task comment dialog */}
      <Dialog open={commentTaskState !== null} onOpenChange={(open) => !open && setCommentTaskState(null)}>
        <DialogContent className="sm:max-w-md pointer-events-auto">
          <DialogHeader>
            <div className="flex items-center gap-3 pb-3 border-b border-[var(--apple-separator)]">
              <div className="flex h-9 w-9 items-center justify-center rounded-[var(--apple-radius-sm)]" style={{ background: HEADER_GRADIENT }}>
                <MessageSquare className="h-4 w-4 text-white" />
              </div>
              <div>
                <DialogTitle>Comment on Task</DialogTitle>
                <DialogDescription className="text-[11px] mt-0.5">
                  Add a comment for "{commentTaskState?.taskTitle}" directed to {commentTaskState ? getMemberName(commentTaskState.memberId) : ''}.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <DialogBody className="space-y-4 pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="popup-comment-text" className="apple-section-label text-[var(--apple-secondary-label)]">
                Comment message
              </Label>
              <Textarea
                id="popup-comment-text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Type your notes, status updates, or blockers here…"
                rows={4}
                className="resize-none text-[13px] rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] focus:bg-card"
              />
            </div>
          </DialogBody>

          <DialogFooter className="border-t border-[var(--apple-separator)] pt-4">
            <Button variant="outline" onClick={() => setCommentTaskState(null)} disabled={addingComment}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!commentText.trim() || !commentTaskState) return
                setAddingComment(true)
                try {
                  await handleAddComment({
                    memberId: commentTaskState.memberId,
                    taskId: commentTaskState.taskId,
                    taskTitle: commentTaskState.taskTitle,
                    reason: commentText.trim()
                  })
                  setCommentText('')
                  setCommentTaskState(null)
                } finally {
                  setAddingComment(false)
                }
              }}
              disabled={addingComment || !commentText.trim()}
              className="min-w-28"
              style={!addingComment && commentText.trim() ? { background: HEADER_GRADIENT } : undefined}
            >
              {addingComment ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
              ) : 'Add Comment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  )
}
