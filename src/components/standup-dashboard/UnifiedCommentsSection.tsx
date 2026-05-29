'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/Badge'
import { formatDistanceToNow } from 'date-fns'
import { MessageSquare, Send, User2, Loader2 } from 'lucide-react'
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

  // Helper to find member by ID
  const getMemberName = (id?: string) => {
    if (!id) return ''
    const match = members.find((m) => m._id === id)
    return match ? `${match.firstName} ${match.lastName}`.trim() : 'Unknown Member'
  }

  const sortedComments = [...comments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  return (
    <Card className="shadow-xs border-border/80">
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-base sm:text-lg">Unified Comments & Notes</CardTitle>
            <CardDescription>
              Communication logs, task comments, and directed team updates for this standup.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Comment Input Form */}
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border bg-muted/20 p-4">
          <div className="space-y-2">
            <Label htmlFor="unified-comment-box" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              New Comment / Update
            </Label>
            <Textarea
              id="unified-comment-box"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="What updates or comments do you have for this task or member?"
              rows={3}
              className="resize-none text-sm bg-background border-border"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Direct to Team Member (Optional)</Label>
              <Select value={targetMemberId} onValueChange={setTargetMemberId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Choose a member" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific member</SelectItem>
                  {members.map((member) => (
                    <SelectItem key={member._id} value={member._id} className="text-xs">
                      {member.firstName} {member.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Link to Project Task (Optional)</Label>
              <Select value={targetTaskId} onValueChange={setTargetTaskId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Choose a task" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific task</SelectItem>
                  {projectTasks.map((task) => (
                    <SelectItem key={task._id} value={task._id} className="text-xs" title={`${task.displayId ? `${task.displayId} · ` : ''}${task.title}`}>
                      {(() => {
                        const fullTaskLabel = `${task.displayId ? `${task.displayId} · ` : ''}${task.title}`
                        const { truncated } = truncateText(fullTaskLabel, 48)
                        return truncated
                      })()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <Button
              type="submit"
              size="sm"
              disabled={submitting || !commentText.trim()}
              className="text-xs px-3 h-8 flex items-center gap-1.5"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Add Comment
            </Button>
          </div>
        </form>

        {/* Comments History list */}
        <div className="space-y-3">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
            Standup Discussion Stream ({comments.length})
          </Label>

          {sortedComments.length > 0 ? (
            <div className="divide-y divide-border/60 max-h-[350px] overflow-y-auto pr-1">
              {sortedComments.map((comment) => {
                const directedTo = getMemberName(comment.memberId)
                const timeAgo = formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })

                return (
                  <div key={comment._id} className="py-3.5 first:pt-0 last:pb-0 flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                      <User2 className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold text-xs text-foreground sm:text-sm">{comment.authorName}</span>
                        {directedTo && (
                          <span className="text-[10px] sm:text-xs text-muted-foreground bg-primary/5 border border-primary/10 rounded px-1.5 py-0.5">
                            to <strong className="text-primary font-medium">{directedTo}</strong>
                          </span>
                        )}
                        {comment.taskTitle && (
                          <span className="text-[10px] sm:text-xs text-muted-foreground bg-muted border rounded px-1.5 py-0.5 truncate max-w-[200px]">
                            re: <strong>{comment.taskTitle}</strong>
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-foreground leading-relaxed break-words whitespace-pre-wrap">{comment.reason}</p>
                      <span className="text-[10px] text-muted-foreground block pt-0.5">{timeAgo}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="border border-dashed rounded-xl p-8 text-center text-sm text-muted-foreground bg-muted/5">
              No comments have been posted yet. Use the editor above to add standup comments.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Small correction: Remove syntax trailing tags if any. Wait, the final line has </Card> and </div> outside of block, let's keep it strictly balanced.
