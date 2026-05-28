'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatToTitleCase } from '@/lib/utils'
import { Clock } from 'lucide-react'
import type { StandupMember, StandupTimelogItem } from './standup-dashboard-types'

interface StandupTimelogListProps {
  timelogs: StandupTimelogItem[]
  members: StandupMember[]
}

export function StandupTimelogList({ timelogs, members }: StandupTimelogListProps) {
  const [selectedMemberId, setSelectedMemberId] = useState('all')

  const filteredTimelogs = useMemo(() => {
    if (selectedMemberId === 'all') {
      return timelogs
    }
    return timelogs.filter((timelog) => timelog.userId === selectedMemberId)
  }, [selectedMemberId, timelogs])

  return (
    <Card className="shadow-xs border-border/80">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3">
        <div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-primary" />
            <CardTitle className="text-base sm:text-lg">Task Timelogs</CardTitle>
          </div>
          <CardDescription className="text-xs sm:text-sm mt-0.5">
            Actual time entries tracked for this project on the scheduled date.
          </CardDescription>
        </div>
        <div className="w-full sm:max-w-xs shrink-0">
          <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
            <SelectTrigger className="h-8.5 text-xs">
              <SelectValue placeholder="Filter by member" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All members</SelectItem>
              {members.map((member) => (
                <SelectItem key={member._id} value={member._id} className="text-xs">
                  {member.firstName} {member.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      
      <CardContent className="pt-2">
        {filteredTimelogs.length > 0 ? (
          <div className="grid gap-2.5 max-h-[300px] overflow-y-auto pr-1">
            {filteredTimelogs.map((log) => (
              <div 
                key={log._id} 
                className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-card hover:bg-muted/10 hover:border-border transition-all text-sm"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-foreground truncate text-xs sm:text-sm">
                      {log.taskTitle || 'Task Log'}
                    </span>
                    <span className="text-[10px] sm:text-xs text-muted-foreground pt-0.5">
                      {log.userName}
                    </span>
                  </div>
                  {log.taskStatus && (
                    <Badge variant="secondary" className="text-[9px] sm:text-[10px] capitalize h-fit py-0.5 px-1.5 shrink-0 font-medium bg-muted text-muted-foreground">
                      {formatToTitleCase(log.taskStatus)}
                    </Badge>
                  )}
                </div>
                
                <div className="font-bold text-foreground text-xs sm:text-sm shrink-0 pl-2">
                  {log.duration >= 60 
                    ? `${Math.round(log.duration / 60 * 10) / 10}h` 
                    : `${Math.round(log.duration)}m`
                  }
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/70 py-8 text-center text-sm text-muted-foreground bg-muted/5">
            No timelogs were tracked for this schedule date.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
