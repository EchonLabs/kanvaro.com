'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatDistanceToNow } from 'date-fns'
import { Loader2, MessageSquare, Send, User2 } from 'lucide-react'
import type { StandupMember, StandupScheduleComment } from './standup-dashboard-types'
import { truncateText } from '@/lib/utils'

interface UnifiedCommentsSectionProps {
  comments: StandupScheduleComment[]
  members: StandupMember[]
  projectTasks: Array<{ _id: string; title: string; displayId?: string }>
  onAddComment: (commentPayload: {
    memberId?: string
    taskId?: string
    taskTitle?: string
    reason: string
  }) => Promise<void>
}

export function UnifiedCommentsSection({
  comments = [],
  members = [],
  projectTasks = [],
  onAddComment
}: UnifiedCommentsSectionProps) {
  const [commentText, setCommentText] = useState('')
  const [targetMemberId, setTargetMemberId] = useState<string>('none')
  const [targetTaskId, setTargetTaskId] = useState<string>('none')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentText.trim()) return
    setSubmitting(true)
    try {
      const selectedTask = projectTasks.find((t) => t._id === targetTaskId)
      await onAddComment({
        reason: commentText.trim(),
        memberId: targetMemberId !== 'none' ? targetMemberId : undefined,
        taskId: targetTaskId !== 'none' ? targetTaskId : undefined,
        taskTitle: selectedTask ? selectedTask.title : undefined
      })
      setCommentText('')
      setTargetMemberId('none')
      setTargetTaskId('none')
    } finally {
      setSubmitting(false)
    }
  }

  const getMemberName = (id?: string) => {
    if (!id) return ''
    const match = members.find((m) => m._id === id)
    return match ? `${match.firstName} ${match.lastName}`.trim() : 'Unknown Member'
  }

  const sortedComments = [...comments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  return (
    <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-5 py-4">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--apple-radius-sm)]"
          style={{ background: 'var(--apple-card-gradient)', boxShadow: '0 4px 12px var(--apple-chart-glow)' }}
        >
          <MessageSquare className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-[15px] font-semibold">Discussion & Notes</p>
          <p className="text-[11px] text-[var(--apple-secondary-label)] mt-0.5">
            Communication logs, task comments, and team updates for this standup.
          </p>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Comment form */}
        <form onSubmit={handleSubmit} className="space-y-3 rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] p-4">
          <div className="space-y-1.5">
            <p className="apple-section-label text-[var(--apple-secondary-label)]">New comment / update</p>
            <Textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="What updates or comments do you have for this task or member?"
              rows={3}
              className="resize-none text-[13px] rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] bg-card focus:bg-card"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-[11px] text-[var(--apple-secondary-label)] font-medium">Direct to member (optional)</p>
              <Select value={targetMemberId} onValueChange={setTargetMemberId}>
                <SelectTrigger className="h-8 text-[12px] rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] bg-card">
                  <SelectValue placeholder="Choose a member" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-[12px]">No specific member</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m._id} value={m._id} className="text-[12px]">
                      {m.firstName} {m.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <p className="text-[11px] text-[var(--apple-secondary-label)] font-medium">Link to task (optional)</p>
              <Select value={targetTaskId} onValueChange={setTargetTaskId}>
                <SelectTrigger className="h-8 text-[12px] rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] bg-card">
                  <SelectValue placeholder="Choose a task" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-[12px]">No specific task</SelectItem>
                  {projectTasks.map((task) => {
                    const fullLabel = `${task.displayId ? `${task.displayId} · ` : ''}${task.title}`
                    const { truncated } = truncateText(fullLabel, 48)
                    return (
                      <SelectItem key={task._id} value={task._id} className="text-[12px]" title={fullLabel}>
                        {truncated}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={submitting || !commentText.trim()}
              className="h-8 text-[12px] gap-1.5 apple-transition"
              style={!submitting && commentText.trim() ? { background: 'var(--apple-card-gradient)' } : undefined}
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {submitting ? 'Posting…' : 'Add Comment'}
            </Button>
          </div>
        </form>

        {/* Discussion stream */}
        <div className="space-y-3">
          <p className="apple-section-label text-[var(--apple-secondary-label)]">
            Discussion stream ({comments.length})
          </p>

          {sortedComments.length > 0 ? (
            <div className="divide-y divide-[var(--apple-separator)] max-h-[380px] overflow-y-auto -mx-1 px-1">
              {sortedComments.map((comment) => {
                const directedTo = getMemberName(comment.memberId)
                const timeAgo = formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })

                return (
                  <div key={comment._id} className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
                    {/* Avatar */}
                    <div className="h-8 w-8 rounded-full bg-[var(--apple-tertiary-fill)] flex items-center justify-center shrink-0 mt-0.5">
                      <User2 className="h-4 w-4 text-[var(--apple-secondary-label)]" />
                    </div>

                    {/* Body */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[13px] font-semibold">{comment.authorName}</span>
                        {directedTo && (
                          <span className="text-[10px] text-[var(--apple-secondary-label)] bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded px-1.5 py-0.5">
                            → <strong className="text-[var(--apple-system-blue)] font-medium">{directedTo}</strong>
                          </span>
                        )}
                        {comment.taskTitle && (
                          <span className="text-[10px] text-[var(--apple-secondary-label)] bg-[var(--apple-quaternary-fill)] border border-[var(--apple-separator)] rounded px-1.5 py-0.5 max-w-[200px] truncate">
                            re: <strong>{comment.taskTitle}</strong>
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] leading-relaxed break-words whitespace-pre-wrap">{comment.reason}</p>
                      <span className="text-[10px] text-[var(--apple-tertiary-label)] block pt-0.5">{timeAgo}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-[var(--apple-radius-md)] border border-dashed border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] py-10 text-center text-[12px] text-[var(--apple-secondary-label)]">
              No comments have been posted yet. Use the editor above to add standup comments.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
