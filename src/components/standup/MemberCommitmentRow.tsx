'use client'

import { CheckCircle2, Clock, AlertTriangle, XCircle, MessageSquare, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'

interface CommitmentTask {
  task: string
  taskTitle: string
  statusAtCommitment: string
  statusAtEndOfDay: string | null
  timeLoggedMinutes: number
  fulfilled: boolean
  noMovement: boolean
  zeroTime: boolean
}

interface PMNote {
  content: string
  blocker: string | null
  targetResolution: string | null
  resolved: boolean
  createdAt: string
}

interface Commitment {
  _id: string
  user: {
    _id: string
    firstName: string
    lastName: string
    avatar?: string
    role: string
  }
  tasks: CommitmentTask[]
  pmNote: PMNote | null
  daysOpen: number
}

interface MemberCommitmentRowProps {
  commitment: Commitment
  onAddNote: (commitmentId: string, existingNote: PMNote | null) => void
  onResolveNote: (commitmentId: string) => void
  readOnly?: boolean
}

function TaskStatusIcon({ task }: { task: CommitmentTask }) {
  if (task.fulfilled) return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
  if (task.noMovement) return <XCircle className="h-4 w-4 text-red-400 shrink-0" />
  if (task.zeroTime) return <AlertTriangle className="h-4 w-4 text-orange-400 shrink-0" />
  return <Clock className="h-4 w-4 text-yellow-500 shrink-0" />
}

function formatMinutes(minutes: number): string {
  if (minutes === 0) return '0h'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ''}`.trim() : `${m}m`
}

export function MemberCommitmentRow({
  commitment,
  onAddNote,
  onResolveNote,
  readOnly = false,
}: MemberCommitmentRowProps) {
  const { user, tasks, pmNote, daysOpen } = commitment
  const fullName = `${user.firstName} ${user.lastName}`
  const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()

  const doneCount = tasks.filter((t) => t.fulfilled).length
  const totalCount = tasks.length

  return (
    <div className="border rounded-xl p-4 space-y-3 bg-card">
      {/* Member header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
            {initials}
          </div>
          <div>
            <p className="font-medium text-sm">{fullName}</p>
            <p className="text-xs text-muted-foreground capitalize">{user.role.replace('_', ' ')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {doneCount}/{totalCount} done
          </Badge>
          {daysOpen > 0 && (
            <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
              {daysOpen}d carry
            </Badge>
          )}
          {!readOnly && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => onAddNote(commitment._id, pmNote)}
            >
              <MessageSquare className="h-3.5 w-3.5 mr-1" />
              {pmNote ? 'Edit Note' : 'Add Note'}
            </Button>
          )}
        </div>
      </div>

      {/* Task list */}
      {tasks.length === 0 ? (
        <p className="text-xs text-muted-foreground italic px-1">No commitments for this session</p>
      ) : (
        <div className="space-y-1.5">
          {tasks.map((task) => (
            <div
              key={task.task}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 bg-muted/40"
            >
              <TaskStatusIcon task={task} />
              <span className="flex-1 text-sm truncate">{task.taskTitle}</span>
              <div className="flex items-center gap-2 shrink-0">
                {task.timeLoggedMinutes > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {formatMinutes(task.timeLoggedMinutes)}
                  </span>
                )}
                <Badge
                  variant="outline"
                  className="text-xs px-1.5 py-0 capitalize"
                >
                  {(task.statusAtEndOfDay ?? task.statusAtCommitment).replace('_', ' ')}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PM Note */}
      {pmNote && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium text-orange-700">PM Note</p>
            {!readOnly && !pmNote.resolved && (
              <button
                onClick={() => onResolveNote(commitment._id)}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Resolve
              </button>
            )}
            {pmNote.resolved && (
              <span className="text-xs text-green-600">Resolved</span>
            )}
          </div>
          <p className="text-xs text-orange-800">{pmNote.content}</p>
          {pmNote.blocker && (
            <p className="text-xs text-muted-foreground">
              Blocker: {pmNote.blocker}
            </p>
          )}
          {pmNote.targetResolution && (
            <p className="text-xs text-muted-foreground">
              Target: {new Date(pmNote.targetResolution).toLocaleDateString()}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
