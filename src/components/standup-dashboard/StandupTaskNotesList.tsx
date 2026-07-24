'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatToTitleCase } from '@/lib/utils'
import type { StandupScheduleMemberSummary } from './standup-dashboard-types'

interface StandupTaskNotesListProps {
  memberSummaries: StandupScheduleMemberSummary[]
}

export function StandupTaskNotesList({ memberSummaries }: StandupTaskNotesListProps) {
  const membersWithNotes = memberSummaries.filter((member) => member.notes.length > 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base sm:text-lg">Task Notes</CardTitle>
        <CardDescription>Notes captured for each member during the standup window.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {membersWithNotes.length > 0 ? membersWithNotes.map((member) => (
          <div key={member._id} className="rounded-xl border border-border/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-foreground">{member.firstName} {member.lastName}</p>
                <p className="text-sm text-muted-foreground">{member.role}</p>
              </div>
              <Badge variant="outline">{member.notes.length} note{member.notes.length === 1 ? '' : 's'}</Badge>
            </div>
            <div className="mt-3 space-y-2">
              {member.notes.map((note, index) => (
                <div key={`${member._id}-${index}`} className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Note {index + 1}</p>
                  <p className="mt-1">{note}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>Current status: {formatToTitleCase(member.status)}</span>
              <span>•</span>
              <span>{member.currentTask}</span>
            </div>
          </div>
        )) : (
          <div className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
            No task notes were recorded for this meeting.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
