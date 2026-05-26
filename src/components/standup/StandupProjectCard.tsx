'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Play, CheckCircle2, Clock, AlertTriangle, Users } from 'lucide-react'

interface StandupProjectCardProps {
  project: {
    _id: string
    name: string
    memberCount: number
  }
  todaySession: {
    _id: string
    status: 'pending' | 'active' | 'completed'
    analysis?: {
      riskScore: number
      riskLevel: 'low' | 'medium' | 'high' | 'critical'
    } | null
    completedAt?: string | null
  } | null
  onOpenProject: (projectId: string) => void
}

const riskColors: Record<string, string> = {
  low: 'bg-green-100 text-green-700 border-green-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  critical: 'bg-red-100 text-red-700 border-red-200',
}

export function StandupProjectCard({
  project,
  todaySession,
  onOpenProject,
}: StandupProjectCardProps) {
  const statusIcon = !todaySession ? (
    <Clock className="h-4 w-4 text-muted-foreground" />
  ) : todaySession.status === 'completed' ? (
    <CheckCircle2 className="h-4 w-4 text-green-500" />
  ) : todaySession.status === 'active' ? (
    <Play className="h-4 w-4 text-blue-500" />
  ) : (
    <Clock className="h-4 w-4 text-muted-foreground" />
  )

  const statusLabel = !todaySession
    ? 'No session today'
    : todaySession.status === 'completed'
    ? 'Completed'
    : todaySession.status === 'active'
    ? 'In Progress'
    : 'Pending'

  const buttonLabel = !todaySession
    ? 'Start Standup'
    : todaySession.status === 'completed'
    ? 'View Report'
    : 'Continue Standup'

  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => onOpenProject(project._id)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base truncate">{project.name}</h3>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              <span>
                {project.memberCount} member{project.memberCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {statusIcon}
            <span className="text-sm text-muted-foreground">{statusLabel}</span>
          </div>
        </div>

        {todaySession?.analysis && (
          <div className="mt-3 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Risk:</span>
            <Badge
              variant="outline"
              className={`text-xs px-2 py-0 ${riskColors[todaySession.analysis.riskLevel]}`}
            >
              {todaySession.analysis.riskScore}/100 · {todaySession.analysis.riskLevel}
            </Badge>
          </div>
        )}

        <div className="mt-4">
          <Button
            size="sm"
            variant={todaySession?.status === 'completed' ? 'outline' : 'default'}
            className="w-full"
            onClick={(e) => {
              e.stopPropagation()
              onOpenProject(project._id)
            }}
          >
            {!todaySession && <Play className="h-3.5 w-3.5 mr-1.5" />}
            {buttonLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
