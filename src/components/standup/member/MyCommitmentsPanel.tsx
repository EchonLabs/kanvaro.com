'use client'

import { CheckCircle2, Clock, AlertTriangle, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

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

interface MyCommitment {
  _id: string
  date: string
  project: { _id: string; name: string }
  tasks: CommitmentTask[]
  pmNote: PMNote | null
  daysOpen: number
}

interface MyCommitmentsPanelProps {
  commitment: MyCommitment
}

function formatMinutes(m: number): string {
  if (m === 0) return '—'
  const h = Math.floor(m / 60)
  const min = m % 60
  return h > 0 ? `${h}h${min > 0 ? ` ${min}m` : ''}` : `${min}m`
}

export function MyCommitmentsPanel({ commitment }: MyCommitmentsPanelProps) {
  const done = commitment.tasks.filter((t) => t.fulfilled).length
  const total = commitment.tasks.length

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">
            {new Date(commitment.date).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {done}/{total} done
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{commitment.project.name}</p>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        {commitment.tasks.map((task) => (
          <div
            key={task.task}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 bg-muted/40"
          >
            {task.fulfilled ? (
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            ) : task.noMovement ? (
              <XCircle className="h-4 w-4 text-red-400 shrink-0" />
            ) : task.zeroTime ? (
              <AlertTriangle className="h-4 w-4 text-orange-400 shrink-0" />
            ) : (
              <Clock className="h-4 w-4 text-yellow-500 shrink-0" />
            )}
            <span className="flex-1 text-sm truncate">{task.taskTitle}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {formatMinutes(task.timeLoggedMinutes)}
            </span>
          </div>
        ))}

        {commitment.pmNote && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 mt-1">
            <p className="text-xs font-medium text-orange-700 mb-1">PM Note</p>
            <p className="text-xs text-orange-800">{commitment.pmNote.content}</p>
            {commitment.pmNote.blocker && (
              <p className="text-xs text-muted-foreground mt-1">
                Blocker: {commitment.pmNote.blocker}
              </p>
            )}
            {commitment.pmNote.targetResolution && (
              <p className="text-xs text-muted-foreground">
                Target: {new Date(commitment.pmNote.targetResolution).toLocaleDateString()}
              </p>
            )}
            {commitment.pmNote.resolved && (
              <p className="text-xs text-green-600 mt-1">Resolved</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
