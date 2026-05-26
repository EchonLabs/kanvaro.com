'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Users, CalendarDays } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { MemberCommitmentRow } from './MemberCommitmentRow'

interface TeamHistoryTabProps {
  projectId: string
  currentSession: any
  currentCommitments: any[]
  onAddNote: (
    commitmentId: string,
    existingNote: any,
    memberName: string,
    sessionId?: string
  ) => void
  onResolveNote: (commitmentId: string, sessionId?: string) => void
}

export function TeamHistoryTab({
  projectId,
  currentSession,
  currentCommitments,
  onAddNote,
  onResolveNote,
}: TeamHistoryTabProps) {
  const todayStr = new Date().toISOString().split('T')[0]
  const sessionDateStr = currentSession?.date
    ? new Date(currentSession.date).toISOString().split('T')[0]
    : todayStr

  const [selectedDate, setSelectedDate] = useState(sessionDateStr)
  const [session, setSession] = useState<any>(currentSession)
  const [commitments, setCommitments] = useState<any[]>(currentCommitments)
  const [loading, setLoading] = useState(false)

  // Keep in sync when parent refreshes current session data
  useEffect(() => {
    if (selectedDate === sessionDateStr) {
      setSession(currentSession)
      setCommitments(currentCommitments)
    }
  }, [currentSession, currentCommitments, selectedDate, sessionDateStr])

  const fetchForDate = useCallback(
    async (date: string) => {
      if (date === sessionDateStr) {
        setSession(currentSession)
        setCommitments(currentCommitments)
        return
      }
      setLoading(true)
      try {
        const res = await fetch(
          `/api/standup/sessions?projectId=${projectId}&date=${date}`
        )
        if (!res.ok) {
          setSession(null)
          setCommitments([])
          return
        }
        const { sessions } = await res.json()
        const s = sessions?.[0] ?? null
        setSession(s)
        if (s) {
          const cmtRes = await fetch(`/api/standup/sessions/${s._id}/commitments`)
          if (cmtRes.ok) {
            const cmtData = await cmtRes.json()
            setCommitments(cmtData.commitments ?? [])
          }
        } else {
          setCommitments([])
        }
      } catch {
        setSession(null)
        setCommitments([])
      } finally {
        setLoading(false)
      }
    },
    [projectId, currentSession, currentCommitments, sessionDateStr]
  )

  const handleDateChange = (date: string) => {
    setSelectedDate(date)
    fetchForDate(date)
  }

  const displayDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const isReadOnly = !session || session.status === 'completed' || selectedDate !== todayStr

  return (
    <div className="space-y-4">
      {/* Header with date picker */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{displayDate}</p>
          {session && (
            <Badge
              variant="outline"
              className={`text-xs mt-1 ${
                session.status === 'completed'
                  ? 'border-green-300 text-green-700'
                  : session.status === 'active'
                  ? 'border-blue-300 text-blue-700'
                  : 'border-muted-foreground/40'
              }`}
            >
              {session.status}
            </Badge>
          )}
        </div>
        <input
          type="date"
          value={selectedDate}
          max={todayStr}
          onChange={(e) => handleDateChange(e.target.value)}
          className="h-8 px-2 text-sm border border-border rounded-md bg-background text-foreground shrink-0"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !session ? (
        <div className="text-center py-14 border border-dashed rounded-lg">
          <CalendarDays className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground">
            No standup session recorded for this date.
          </p>
        </div>
      ) : commitments.length === 0 ? (
        <div className="text-center py-14 border border-dashed rounded-lg">
          <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground">
            No commitments were recorded for this session.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {commitments.map((commitment) => {
            const member = commitment.user
            const memberName =
              `${member?.firstName ?? ''} ${member?.lastName ?? ''}`.trim()
            return (
              <MemberCommitmentRow
                key={commitment._id}
                commitment={commitment}
                onAddNote={(cId, note) => onAddNote(cId, note, memberName, session._id)}
                onResolveNote={(cId) => onResolveNote(cId, session._id)}
                readOnly={isReadOnly}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
