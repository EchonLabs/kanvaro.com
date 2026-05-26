'use client'

import { AlertTriangle, Clock, CheckCircle2, MessageSquare, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatDistanceToNow } from 'date-fns'

interface BriefingGap {
  userId: string
  taskId: string
  taskTitle: string
  statusAtCommitment: string
  currentStatus: string
  daysOpen: number
}

interface NoMovementTask {
  taskId: string
  taskTitle: string
  assignedUserId: string
  lastMovedAt: string | null
}

interface OpenNote {
  commitmentId: string
  taskId: string
  taskTitle: string
  userId: string
  noteContent: string
  noteCreatedAt: string
  daysOpen: number
}

interface BriefingSnapshot {
  generatedAt: string
  gaps: BriefingGap[]
  noMovementTasks: NoMovementTask[]
  zeroTimeTasks: { taskId: string; taskTitle: string; assignedUserId: string }[]
  openNotes: OpenNote[]
}

interface Member {
  _id: string
  firstName: string
  lastName: string
  avatar?: string
}

interface PreStandupPanelProps {
  briefing: BriefingSnapshot
  members: Member[]
}

function memberName(members: Member[], userId: string): string {
  const m = members.find((m) => m._id === userId)
  return m ? `${m.firstName} ${m.lastName}` : 'Unknown'
}

function memberInitials(members: Member[], userId: string): string {
  const m = members.find((m) => m._id === userId)
  return m ? `${m.firstName[0]}${m.lastName[0]}`.toUpperCase() : '?'
}

export function PreStandupPanel({ briefing, members }: PreStandupPanelProps) {
  const hasIssues =
    briefing.gaps.length > 0 ||
    briefing.noMovementTasks.length > 0 ||
    briefing.openNotes.length > 0

  if (!hasIssues) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-5">
          <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
          <div>
            <p className="font-medium text-sm">All clear</p>
            <p className="text-xs text-muted-foreground">
              No open gaps or blockers from the previous working circle.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Open PM Notes — highest priority, shown first */}
      {briefing.openNotes.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-orange-700">
              <MessageSquare className="h-4 w-4" />
              Follow-up Required ({briefing.openNotes.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {briefing.openNotes.map((note) => (
              <div
                key={note.commitmentId}
                className="bg-white rounded-lg border border-orange-200 p-3 space-y-1"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium truncate">{note.taskTitle}</p>
                  <Badge variant="outline" className="text-xs shrink-0 border-orange-300 text-orange-700">
                    {note.daysOpen}d open
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {memberName(members, note.userId)}
                </p>
                <p className="text-xs text-orange-700 bg-orange-50 rounded px-2 py-1 border border-orange-100">
                  &ldquo;{note.noteContent}&rdquo;
                </p>
                <p className="text-xs text-muted-foreground">
                  Noted {formatDistanceToNow(new Date(note.noteCreatedAt), { addSuffix: true })}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Gaps — committed but not done */}
      {briefing.gaps.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50/50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-yellow-700">
              <AlertTriangle className="h-4 w-4" />
              Unfinished from Yesterday ({briefing.gaps.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {briefing.gaps.map((gap) => (
              <div
                key={`${gap.userId}-${gap.taskId}`}
                className="flex items-center gap-3 bg-white rounded-lg border border-yellow-200 p-2.5"
              >
                <div className="h-7 w-7 rounded-full bg-yellow-100 flex items-center justify-center text-xs font-medium text-yellow-700 shrink-0">
                  {memberInitials(members, gap.userId)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate font-medium">{gap.taskTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {memberName(members, gap.userId)} · {gap.currentStatus.replace('_', ' ')}
                    {gap.daysOpen > 1 && ` · ${gap.daysOpen}d open`}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* No-movement tasks */}
      {briefing.noMovementTasks.length > 0 && (
        <Card className="border-red-200 bg-red-50/50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-700">
              <Clock className="h-4 w-4" />
              Zero Movement Yesterday ({briefing.noMovementTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {briefing.noMovementTasks.map((t) => (
              <div
                key={`${t.assignedUserId}-${t.taskId}`}
                className="flex items-center gap-3 bg-white rounded-lg border border-red-200 p-2.5"
              >
                <div className="h-7 w-7 rounded-full bg-red-100 flex items-center justify-center text-xs font-medium text-red-700 shrink-0">
                  {memberInitials(members, t.assignedUserId)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate font-medium">{t.taskTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {memberName(members, t.assignedUserId)} · No status change detected
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground px-1">
        Generated {formatDistanceToNow(new Date(briefing.generatedAt), { addSuffix: true })}
      </p>
    </div>
  )
}
