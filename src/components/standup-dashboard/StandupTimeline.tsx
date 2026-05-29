'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { cn, formatToTitleCase } from '@/lib/utils'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { ArrowRightLeft, Bell, MessageSquare, Plus, TrendingUp } from 'lucide-react'
import { StandupTimelineItem } from './standup-dashboard-types'

interface StandupTimelineProps {
  items: StandupTimelineItem[]
}

const iconMap = {
  update: MessageSquare,
  assignment: Plus,
  blocker: Bell,
  progress: TrendingUp,
  note: ArrowRightLeft
}

const toneMap: Record<StandupTimelineItem['type'], string> = {
  update: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  assignment: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  blocker: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  progress: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  note: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
}

export function StandupTimeline({ items }: StandupTimelineProps) {
  const { formatDateTimeSafe } = useDateTime()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base sm:text-lg">Daily Updates Timeline</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item) => {
          const Icon = iconMap[item.type]

          return (
            <div key={item._id} className="flex gap-4 rounded-xl border border-border/60 p-4">
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', toneMap[item.type])}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0 capitalize">
                    {formatToTitleCase(item.type)}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>{formatDateTimeSafe(item.createdAt)}</span>
                  {item.projectTask ? <span>Task: {item.projectTask}</span> : null}
                </div>
                <div className="flex items-center gap-2">
                  <GravatarAvatar user={item.author} size={24} className="h-6 w-6 border border-border" />
                  <span className="text-xs text-muted-foreground">
                    {item.author.firstName} {item.author.lastName}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}