'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { PageContent } from '@/components/ui/PageContent'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
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
import { ArrowLeft, CalendarDays, Clock3, Loader2, Trash2, Edit3, MessageSquare, Users, X, Sparkles } from 'lucide-react'
import { formatToTitleCase } from '@/lib/utils'

const statusLabels: Record<StandupMeetingStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  missed: 'Missed'
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

  // Edit details and delete states
  const [editOpen, setEditOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Inline comment on specific task states
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
      notifySuccess({ title: 'Standup deleted', message: 'The standup schedule was permanently deleted from the database.' })
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

      await updateStandupSchedule(projectId, meetingId, {
        comment: newComment
      })

      // Refresh data
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
    if (completedTasks >= detail.timelogs.length && detail.timelogs.length > 0) {
      return 'All logged work for the meeting date was completed.'
    }
    return `${completedTasks} logged tasks were completed on the meeting date.`
  }, [detail])

  const getOutcomeStatus = (status: string) => {
    return status === 'on_track' ? 'On Track' : 'Needs Attention'
  }

  const getMemberName = (id: string) => {
    const match = detail?.project.teamMembers.find((m) => m._id === id)
    return match ? `${match.firstName} ${match.lastName}`.trim() : 'Unknown Member'
  }

  if (loading || !detail) {
    return (
      <MainLayout breadcrumbItems={breadcrumbItems}>
        <PageContent>
          <Card>
            <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Loading standup details...
            </CardContent>
          </Card>
        </PageContent>
      </MainLayout>
    )
  }

  return (
    <MainLayout breadcrumbItems={breadcrumbItems}>
      <PageContent>
        <div className="space-y-6 sm:space-y-8">
          {/* Main Title and Page Header layout */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <Button variant="ghost" size="sm" className="w-fit px-0 text-muted-foreground" onClick={() => router.push(`/tasks/standup-dashboard/${projectId}`)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to project
              </Button>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{detail.meeting.title}</h1>
                <Badge variant="outline" className="capitalize">{statusLabels[detail.meeting.status]}</Badge>
              </div>
              <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">{detail.project.name} • {formatDate(detail.meeting.date)}</p>
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{detail.meeting.participants.length} participants</span>
                <span className="flex items-center gap-1.5"><Clock3 className="h-4 w-4" />{detail.meeting.time}</span>
                <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{detail.meeting.durationMinutes} mins</span>
              </div>
            </div>

            {/* Clean top-right actions */}
            <div className="flex flex-wrap gap-2 items-center">
              {detail.meeting.status !== 'completed' && canManageStandup ? (
                <Button variant="outline" onClick={async () => {
                  if (!user?.organization) {
                    notifyError({ title: 'Unable to complete standup' })
                    return
                  }
                  try {
                    await updateStandupSchedule(projectId, meetingId, { status: 'completed', actualDate: new Date().toISOString() })
                    await loadDetail()
                    notifySuccess({ title: 'Standup completed', message: 'Standup marked as completed.' })
                  } catch {
                    notifyError({ title: 'Unable to complete standup' })
                  }
                }}>Mark Complete</Button>
              ) : null}
              {canManageStandup ? (
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  <Edit3 className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              ) : null}
              {canManageStandup ? (
                <Button variant="destructive" onClick={() => setDeleteConfirmOpen(true)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              ) : null}
              <Button variant="outline" onClick={handleViewSummary}>
                <Sparkles className="mr-2 h-4 w-4" />
                View Summary
              </Button>
              {detail.meeting.status === 'completed' ? (
                <StandupSummaryDialog 
                  projectId={projectId} 
                  meetingId={meetingId} 
                  detail={detail} 
                  onGenerated={(summary) => setDetail((current) => current ? { ...current, meeting: { ...current.meeting, summary } } : current)} 
                />
              ) : null}
            </div>
          </div>

          {/* Member outcomes cards */}
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Member Outcomes</h2>
              <p className="text-sm text-muted-foreground">What happened for each team member on this day.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {detail.memberSummaries.map((member) => {
                const outcomeStatus = getOutcomeStatus(member.status)
                
                return (
                  <Card key={member._id} className="shadow-xs border-border/80">
                    <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base font-semibold">{member.firstName} {member.lastName}</CardTitle>
                        <CardDescription className="text-xs">{member.role}</CardDescription>
                      </div>
                      <Badge 
                        variant="outline" 
                        className={`capitalize font-semibold text-xs px-2 py-0.5 ${
                          outcomeStatus === 'On Track' 
                            ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-600' 
                            : 'border-amber-500/25 bg-amber-500/5 text-amber-600'
                        }`}
                      >
                        {outcomeStatus}
                      </Badge>
                    </CardHeader>
                    
                    <CardContent className="space-y-3 pt-2">
                      <div className="space-y-2">
                        {member.assignedTasks.length > 0 ? (
                          <div className="grid gap-2">
                            {member.assignedTasks.map((task) => (
                              <div 
                                key={task.taskId} 
                                className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-card hover:bg-muted/10 transition-colors text-sm"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span className="font-semibold text-foreground truncate text-xs sm:text-sm">
                                    {task.taskTitle}
                                  </span>
                                  {task.status && (
                                    <Badge variant="secondary" className="text-[9px] sm:text-[10px] capitalize h-fit py-0.5 px-1.5 shrink-0 bg-muted text-muted-foreground">
                                      {formatToTitleCase(task.status)}
                                    </Badge>
                                  )}
                                </div>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => setCommentTaskState({ 
                                    memberId: member._id, 
                                    taskId: task.taskId, 
                                    taskTitle: task.taskTitle 
                                  })}
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-primary shrink-0"
                                >
                                  <MessageSquare className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground italic py-2">
                            No assignments captured for this member.
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </section>

          {/* Sleek compact timelogs */}
          <StandupTimelogList timelogs={detail.timelogs} members={detail.meeting.participants} standupDate={detail.meeting.date} />

          {/* Standup date notes/summary info */}
          <Card className="shadow-xs border-border/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg">Day Summary</CardTitle>
              <CardDescription>Overall status for this standup date.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-foreground">
              <p>{overallSummary}</p>
              <p className="text-muted-foreground">{detail.meeting.notes || 'No standup notes were recorded.'}</p>
            </CardContent>
          </Card>

          {/* Unified Discussion Stream */}
          <UnifiedCommentsSection 
            comments={detail.meeting.comments || []} 
            members={detail.project.teamMembers} 
            projectTasks={detail.projectTasks}
            onAddComment={handleAddComment}
          />
        </div>
      </PageContent>

      {/* Edit Standup Schedule Modal */}
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

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteSchedule}
        title="Delete Standup Schedule"
        description="Are you absolutely sure you want to delete this standup schedule? This will permanently remove the record and its compiled summary reports from the database."
        confirmText="Yes, Delete"
        cancelText="Cancel"
        variant="destructive"
        isLoading={deleting}
      />

      {/* Directed Task Comment Modal popup */}
      <Dialog open={commentTaskState !== null} onOpenChange={(open) => !open && setCommentTaskState(null)}>
        <DialogContent className="sm:max-w-md pointer-events-auto">
          <DialogHeader>
            <div className="flex items-center justify-between pb-2 border-b">
              <div>
                <DialogTitle>Comment on Task</DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  Add a comment for "{commentTaskState?.taskTitle}" directed to {commentTaskState ? getMemberName(commentTaskState.memberId) : ''}.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          
          <DialogBody className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="popup-comment-text" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Comment message
              </Label>
              <Textarea 
                id="popup-comment-text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Type your notes, status updates, or blockers here..."
                rows={4}
                className="resize-none text-sm bg-background border-border"
              />
            </div>
          </DialogBody>
          <DialogFooter className="border-t pt-4">
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
            >
              {addingComment ? 'Saving...' : 'Add Comment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  )
}