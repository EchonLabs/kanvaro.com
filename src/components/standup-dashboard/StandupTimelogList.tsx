'use client'

import { useMemo, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Clock } from 'lucide-react'
import type { StandupMember, StandupTimelogItem } from './standup-dashboard-types'
import { filterStandupTimelogs, formatLoggedHours } from './standup-timelog-utils'

interface StandupTimelogListProps {
  timelogs: StandupTimelogItem[]
  members: StandupMember[]
  standupDate: string | Date
}

export function StandupTimelogList({ timelogs, members, standupDate }: StandupTimelogListProps) {
  const [selectedMemberId, setSelectedMemberId] = useState('all')

  const filteredTimelogs = useMemo(() => {
    const dateScopedTimelogs = filterStandupTimelogs({
      timelogs,
      standupDate,
      memberIds: selectedMemberId === 'all' ? undefined : [selectedMemberId]
    })
    if (selectedMemberId === 'all') return dateScopedTimelogs
    return dateScopedTimelogs.filter((log) => log.userId === selectedMemberId)
  }, [selectedMemberId, standupDate, timelogs])

  const totalMinutes = filteredTimelogs.reduce((sum, log) => sum + log.duration, 0)

  return (
    <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--apple-radius-sm)]"
            style={{ background: 'linear-gradient(135deg,#AF52DE 0%,#BF5AF2 100%)', boxShadow: '0 4px 12px rgba(175,82,222,0.25)' }}
          >
            <Clock className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-[15px] font-semibold">Task Timelogs</p>
            <p className="text-[11px] text-[var(--apple-secondary-label)] mt-0.5">
              Actual time entries tracked for this project on the scheduled date.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {filteredTimelogs.length > 0 && (
            <span className="text-[12px] font-apple-mono tabular-nums font-semibold text-[var(--apple-secondary-label)]">
              {formatLoggedHours(totalMinutes)} total
            </span>
          )}
          <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
            <SelectTrigger className="h-8 w-40 text-[12px] rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] bg-card">
              <SelectValue placeholder="Filter member" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[12px]">All members</SelectItem>
              {members.map((m) => (
                <SelectItem key={m._id} value={m._id} className="text-[12px]">
                  {m.firstName} {m.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      <div className="p-4">
        {filteredTimelogs.length > 0 ? (
          <ul className="divide-y divide-[var(--apple-separator)] max-h-[300px] overflow-y-auto">
            {filteredTimelogs.map((log) => (
              <li key={log._id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 apple-transition hover:bg-[var(--apple-quaternary-fill)] -mx-2 px-2 rounded-[var(--apple-radius-sm)]">
                <div className="flex flex-col min-w-0">
                  <span className="text-[13px] font-semibold truncate">{log.taskTitle || 'Task Log'}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-[var(--apple-secondary-label)]">{log.userName}</span>
                    {log.taskStatus && (
                      <span className="text-[10px] capitalize rounded-full bg-[var(--apple-tertiary-fill)] px-2 py-0.5 font-medium text-[var(--apple-secondary-label)]">
                        {log.taskStatus.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                </div>
                <span className="font-apple-mono tabular-nums text-[13px] font-bold shrink-0 pl-3">
                  {formatLoggedHours(log.duration)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-[var(--apple-radius-md)] border border-dashed border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] py-10 text-center text-[12px] text-[var(--apple-secondary-label)]">
            No time logs available for this standup date yet.
          </div>
        )}
      </div>
    </div>
  )
}
