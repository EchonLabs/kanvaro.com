'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Progress } from '@/components/ui/Progress'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { formatToTitleCase } from '@/lib/utils'
import { ArrowRight, Calendar, Users } from 'lucide-react'
import { StandupProjectSummary } from './standup-dashboard-types'

interface StandupProjectCardProps {
  project: StandupProjectSummary
  onOpen: (projectId: string) => void
}

const statusClassMap: Record<StandupProjectSummary['status'], string> = {
  planning: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900',
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900',
  completed: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900',
  on_hold: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900'
}

export function StandupProjectCard({ project, onOpen }: StandupProjectCardProps) {
  const { formatDate } = useDateTime()

  return (
    <Card className="overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md border-border/60">
      <CardHeader className="space-y-3 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base sm:text-lg">{project.name}</CardTitle>
            <CardDescription className="mt-1 line-clamp-2 text-xs sm:text-sm">
              {project.summary}
            </CardDescription>
          </div>
          <Badge className={`${statusClassMap[project.status]} text-xs shrink-0`}>
            {formatToTitleCase(project.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4 pt-0 sm:px-5 sm:pb-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs sm:text-sm text-muted-foreground">
            <span>Standup progress</span>
            <span className="font-medium text-foreground">{project.progressPercent}%</span>
          </div>
          <Progress value={project.progressPercent} className="h-2" />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            <span>{project.teamMembers.length} members</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            <span>Last standup {formatDate(project.lastStandupAt)}</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            {project.teamMembers.length} people on the standup roster
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={() => onOpen(project._id)}
            className="w-full bg-foreground text-background hover:bg-foreground/90"
          >
            Open Dashboard
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}