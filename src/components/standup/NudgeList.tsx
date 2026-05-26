'use client'

import { Bell } from 'lucide-react'

interface Nudge {
  userId: string
  taskId: string
  message: string
}

interface Member {
  _id: string
  firstName: string
  lastName: string
}

interface NudgeListProps {
  nudges: Nudge[]
  members: Member[]
}

export function NudgeList({ nudges, members }: NudgeListProps) {
  if (nudges.length === 0) return null

  const memberMap = new Map(members.map((m) => [m._id, `${m.firstName} ${m.lastName}`]))

  return (
    <div className="space-y-2">
      {nudges.map((nudge, i) => (
        <div
          key={i}
          className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5"
        >
          <Bell className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-amber-700">
              {memberMap.get(nudge.userId) ?? 'Team member'}
            </p>
            <p className="text-xs text-amber-800">{nudge.message}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
