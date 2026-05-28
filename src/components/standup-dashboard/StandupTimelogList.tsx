'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { formatToTitleCase } from '@/lib/utils'
import type { StandupMember, StandupTimelogItem } from './standup-dashboard-types'

interface StandupTimelogListProps {
  timelogs: StandupTimelogItem[]
  members: StandupMember[]
}

export function StandupTimelogList({ timelogs, members }: StandupTimelogListProps) {
  const { formatDateTimeSafe } = useDateTime()
  const [selectedMemberId, setSelectedMemberId] = useState('all')

  const filteredTimelogs = useMemo(() => {
    if (selectedMemberId === 'all') {
      return timelogs
    }

    return timelogs.filter((timelog) => timelog.userId === selectedMemberId)
  }, [selectedMemberId, timelogs])

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div>
          <CardTitle className="text-base sm:text-lg">Task Timelogs</CardTitle>
          <CardDescription>Time entries recorded for the meeting date.</CardDescription>
        </div>
        <div className="max-w-sm">
          <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by member" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All members</SelectItem>
              {members.map((member) => (
                <SelectItem key={member._id} value={member._id}>
                  {member.firstName} {member.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {filteredTimelogs.length > 0 ? filteredTimelogs.map((log) => (
          <div key={log._id} className="rounded-xl border border-border/60 bg-background p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="font-medium text-foreground">{log.userName}</p>
                <p className="text-sm text-muted-foreground">
                  {log.taskTitle || 'Task log'} • {log.projectName}
                </p>
              </div>
              <Badge variant="outline" className="capitalize">
                {formatToTitleCase(log.status)}
              </Badge>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-muted/40 p-3 text-sm">
                <p className="text-xs text-muted-foreground">Start</p>
                <p>{formatDateTimeSafe(log.startTime)}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3 text-sm">
                <p className="text-xs text-muted-foreground">End</p>
                <p>{log.endTime ? formatDateTimeSafe(log.endTime) : 'Still running'}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3 text-sm">
                <p className="text-xs text-muted-foreground">Duration</p>
                <p>{log.duration} mins</p>
              </div>
            </div>

            <p className="mt-3 text-sm text-muted-foreground">
              {log.description || 'No description provided.'}
            </p>
          </div>
        )) : (
          <div className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
            No timelogs were found for this schedule date.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
