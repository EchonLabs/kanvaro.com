'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { StandupCaptureTab } from '@/components/standup/StandupCaptureTab'
import { TeamHistoryTab } from '@/components/standup/TeamHistoryTab'
import { PMNoteModal } from '@/components/standup/PMNoteModal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useNotify } from '@/lib/notify'
import { useAuthContext } from '@/contexts/AuthContext'
import {
  ArrowLeft,
  Loader2,
  Play,
  Users,
  CheckCircle2,
  CalendarDays,
} from 'lucide-react'

interface Member {
  _id: string
  firstName: string
  lastName: string
  avatar?: string
  role?: string
}

export default function ProjectStandupPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuthContext()
  const notify = useNotify()
  const projectId = params.projectId as string

  const todayStr = new Date().toISOString().split('T')[0]

  const [project, setProject] = useState<any>(null)
  const [session, setSession] = useState<any>(null)
  const [commitments, setCommitments] = useState<any[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [selectedDate, setSelectedDate] = useState(todayStr)

  const [noteModal, setNoteModal] = useState<{
    open: boolean
    commitmentId: string | null
    existingNote: any | null
    memberName: string
    sessionId: string | null
  }>({ open: false, commitmentId: null, existingNote: null, memberName: '', sessionId: null })

  const isToday = selectedDate === todayStr

  const fetchSession = useCallback(
    async (date: string) => {
      try {
        const res = await fetch(`/api/standup/sessions?projectId=${projectId}&date=${date}`)
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
      }
    },
    [projectId]
  )

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      try {
        const projRes = await fetch(`/api/projects/${projectId}`)
        if (!projRes.ok) throw new Error('Project not found')
        const projData = await projRes.json()
        // API returns { success, data: { ...project } }
        const proj = projData.data ?? projData.project ?? projData
        setProject(proj)

        // teamMembers: [{ memberId: { _id, firstName, lastName, ... }, role, ... }]
        const rawMembers: any[] = proj.teamMembers ?? []
        const extracted: Member[] = rawMembers
          .map((tm: any) => tm.memberId ?? tm)
          .filter((m: any) => m && m._id)
        setMembers(extracted)

        await fetchSession(todayStr)
      } catch (err: any) {
        notify.error({ title: err.message ?? 'Failed to load project' })
        router.push('/standup-dashboard')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [projectId])

  const handleDateChange = async (date: string) => {
    setSelectedDate(date)
    await fetchSession(date)
  }

  const handleStartStandup = async () => {
    setStarting(true)
    try {
      const res = await fetch('/api/standup/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start standup')
      setSession(data.session)
      notify.success({ title: 'Standup started' })
    } catch (err: any) {
      notify.error({ title: err.message })
    } finally {
      setStarting(false)
    }
  }

  const handleCompleteSession = async () => {
    if (!session) return
    setCompleting(true)
    try {
      const res = await fetch(`/api/standup/sessions/${session._id}/complete`, {
        method: 'POST',
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setSession((prev: any) =>
        prev ? { ...prev, status: 'completed', completedAt: new Date().toISOString() } : prev
      )
      notify.success({ title: 'Session completed' })
    } catch (err: any) {
      notify.error({ title: err.message })
    } finally {
      setCompleting(false)
    }
  }

  const handleCommitmentSaved = useCallback(async () => {
    await fetchSession(selectedDate)
  }, [fetchSession, selectedDate])

  const handleSaveNote = async (
    commitmentId: string,
    noteData: { content: string; blocker?: string; targetResolution?: string }
  ) => {
    const sid = noteModal.sessionId ?? session?._id
    if (!sid) return
    const res = await fetch(
      `/api/standup/sessions/${sid}/commitments/${commitmentId}/note`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(noteData),
      }
    )
    const d = await res.json()
    if (!res.ok) throw new Error(d.error)
    notify.success({ title: 'Note saved' })
    await fetchSession(selectedDate)
  }

  const handleResolveNote = async (commitmentId: string, sessionIdOverride?: string) => {
    const sid = sessionIdOverride ?? noteModal.sessionId ?? session?._id
    if (!sid) return
    const res = await fetch(
      `/api/standup/sessions/${sid}/commitments/${commitmentId}/note`,
      { method: 'DELETE' }
    )
    const d = await res.json()
    if (!res.ok) throw new Error(d.error)
    notify.success({ title: 'Note resolved' })
    await fetchSession(selectedDate)
  }

  const openNoteModal = (
    commitmentId: string,
    existingNote: any,
    memberName: string,
    sessionIdOverride?: string
  ) => {
    setNoteModal({
      open: true,
      commitmentId,
      existingNote,
      memberName,
      sessionId: sessionIdOverride ?? session?._id ?? null,
    })
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    )
  }

  const projectName = project?.name ?? 'Project'
  const displayDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/standup-dashboard')}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold">{projectName}</h1>
                {session && (
                  <Badge
                    variant="outline"
                    className={
                      session.status === 'completed'
                        ? 'border-green-300 text-green-700'
                        : session.status === 'active'
                        ? 'border-blue-300 text-blue-700'
                        : 'border-muted-foreground/40'
                    }
                  >
                    {session.status}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{displayDate}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={selectedDate}
              max={todayStr}
              onChange={(e) => handleDateChange(e.target.value)}
              className="h-8 px-2 text-sm border border-border rounded-md bg-background text-foreground"
            />

            {isToday && !session && (
              <Button size="sm" onClick={handleStartStandup} disabled={starting}>
                {starting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                )}
                Start Standup
              </Button>
            )}

            {session && session.status !== 'completed' && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleCompleteSession}
                disabled={completing}
              >
                {completing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                Complete Session
              </Button>
            )}
          </div>
        </div>

        {/* Empty states */}
        {isToday && !session && (
          <div className="text-center py-16 border border-dashed rounded-lg">
            <CalendarDays className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-sm font-medium">No standup started today</p>
            <p className="text-xs text-muted-foreground mt-1">
              Click &ldquo;Start Standup&rdquo; to begin today&apos;s session
            </p>
          </div>
        )}

        {!isToday && !session && (
          <div className="text-center py-16 border border-dashed rounded-lg">
            <CalendarDays className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">
              No standup session recorded for this date.
            </p>
          </div>
        )}

        {/* Session tabs */}
        {session && (
          <Tabs defaultValue="standup">
            <TabsList className="h-9">
              <TabsTrigger value="standup" className="text-xs">
                <Play className="h-3.5 w-3.5 mr-1.5" />
                Standup
              </TabsTrigger>
              <TabsTrigger value="team-view" className="text-xs">
                <Users className="h-3.5 w-3.5 mr-1.5" />
                Team View
              </TabsTrigger>
            </TabsList>

            <TabsContent value="standup" className="mt-4">
              <StandupCaptureTab
                session={session}
                members={members}
                commitments={commitments}
                onCommitmentSaved={handleCommitmentSaved}
                onAddNote={openNoteModal}
                onResolveNote={handleResolveNote}
                readOnly={session.status === 'completed'}
              />
            </TabsContent>

            <TabsContent value="team-view" className="mt-4">
              <TeamHistoryTab
                projectId={projectId}
                currentSession={session}
                currentCommitments={commitments}
                onAddNote={openNoteModal}
                onResolveNote={handleResolveNote}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>

      <PMNoteModal
        open={noteModal.open}
        commitmentId={noteModal.commitmentId}
        existingNote={noteModal.existingNote}
        memberName={noteModal.memberName}
        onClose={() =>
          setNoteModal({
            open: false,
            commitmentId: null,
            existingNote: null,
            memberName: '',
            sessionId: null,
          })
        }
        onSave={handleSaveNote}
      />
    </MainLayout>
  )
}
