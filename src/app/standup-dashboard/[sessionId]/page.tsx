'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { PreStandupPanel } from '@/components/standup/PreStandupPanel'
import { MemberCommitmentRow } from '@/components/standup/MemberCommitmentRow'
import { CommitmentCapture } from '@/components/standup/CommitmentCapture'
import { PMNoteModal } from '@/components/standup/PMNoteModal'
import { AnalysisReport } from '@/components/standup/AnalysisReport'
import { TrendPanel } from '@/components/standup/TrendPanel'
import { MyCommitmentsPanel } from '@/components/standup/member/MyCommitmentsPanel'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useNotify } from '@/lib/notify'
import { useAuthContext } from '@/contexts/AuthContext'
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Users,
  TrendingUp,
  Zap,
  Play,
  ClipboardList,
} from 'lucide-react'

interface SessionData {
  session: any
  commitments: any[]
  accessLevel: 'full' | 'own'
}

export default function StandupSessionPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuthContext()
  const notify = useNotify()
  const sessionId = params.sessionId as string

  const [data, setData] = useState<SessionData | null>(null)
  const [trends, setTrends] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)

  // PM Note modal state
  const [noteModal, setNoteModal] = useState<{
    open: boolean
    commitmentId: string | null
    existingNote: any | null
    memberName: string
  }>({ open: false, commitmentId: null, existingNote: null, memberName: '' })

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/standup/sessions/${sessionId}`)
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Session not found')
      }
      const sessionData = await res.json()
      setData(sessionData)

      // Fetch trends for full view
      if (sessionData.accessLevel === 'full' && sessionData.session?.project) {
        fetch(`/api/standup/trends?projectId=${sessionData.session.project._id ?? sessionData.session.project}&days=14`)
          .then((r) => r.json())
          .then((t) => setTrends(t.trends))
          .catch(() => {})
      }
    } catch (err: any) {
      notify.error({ title: err.message })
      router.push('/standup-dashboard')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    fetchSession()
  }, [fetchSession])

  const handleCompleteSession = async () => {
    setCompleting(true)
    try {
      const res = await fetch(`/api/standup/sessions/${sessionId}/complete`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setData((prev) => prev ? { ...prev, session: { ...prev.session, status: 'completed', completedAt: new Date().toISOString() } } : prev)
      notify.success({ title: 'Standup session completed' })
    } catch (err: any) {
      notify.error({ title: err.message })
    } finally {
      setCompleting(false)
    }
  }

  const handleRequestAnalysis = async () => {
    setAnalyzing(true)
    try {
      const res = await fetch(`/api/standup/sessions/${sessionId}/analyze?force=true`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setData((prev) =>
        prev ? { ...prev, session: { ...prev.session, analysis: d.analysis } } : prev
      )
    } catch (err: any) {
      notify.error({ title: err.message })
    } finally {
      setAnalyzing(false)
    }
  }

  const handleCommitmentSaved = async () => {
    await fetchSession()
  }

  const handleSaveNote = async (
    commitmentId: string,
    noteData: { content: string; blocker?: string; targetResolution?: string }
  ) => {
    const res = await fetch(
      `/api/standup/sessions/${sessionId}/commitments/${commitmentId}/note`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(noteData),
      }
    )
    const d = await res.json()
    if (!res.ok) throw new Error(d.error)
    notify.success({ title: 'Note saved' })
    await fetchSession()
  }

  const handleResolveNote = async (commitmentId: string) => {
    const res = await fetch(
      `/api/standup/sessions/${sessionId}/commitments/${commitmentId}/note`,
      { method: 'DELETE' }
    )
    const d = await res.json()
    if (!res.ok) throw new Error(d.error)
    notify.success({ title: 'Note resolved' })
    await fetchSession()
  }

  const openNoteModal = (commitmentId: string, existingNote: any | null, memberName: string) => {
    setNoteModal({ open: true, commitmentId, existingNote, memberName })
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

  if (!data) return null

  const { session, commitments, accessLevel } = data
  const isFullView = accessLevel === 'full'
  const members: any[] = session.members ?? []
  const projectName = session.project?.name ?? 'Project'
  const sessionDate = new Date(session.date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  // ── MEMBER OWN VIEW ──
  if (!isFullView) {
    const myCommitment = commitments[0]
    return (
      <MainLayout>
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push('/standup-dashboard')}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </div>

          <div>
            <h1 className="text-xl font-bold">{projectName} Standup</h1>
            <p className="text-sm text-muted-foreground">{sessionDate}</p>
          </div>

          {myCommitment ? (
            <MyCommitmentsPanel commitment={{ ...myCommitment, project: session.project }} />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No commitments recorded for you yet.</p>
                <p className="text-xs mt-1">Your PM will add tasks during the standup.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </MainLayout>
    )
  }

  // ── FULL VIEW (PM / Admin / HR) ──
  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push('/standup-dashboard')}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">{projectName}</h1>
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
              </div>
              <p className="text-sm text-muted-foreground">{sessionDate}</p>
            </div>
          </div>

          {session.status !== 'completed' && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleCompleteSession}
              disabled={completing}
              className="shrink-0"
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

        <Tabs defaultValue="overview">
          <TabsList className="h-9">
            <TabsTrigger value="overview" className="text-xs">
              <Play className="h-3.5 w-3.5 mr-1.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="commitments" className="text-xs">
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Commitments
            </TabsTrigger>
            <TabsTrigger value="analysis" className="text-xs">
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              AI Analysis
            </TabsTrigger>
            <TabsTrigger value="trends" className="text-xs">
              <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
              Trends
            </TabsTrigger>
          </TabsList>

          {/* ── OVERVIEW TAB ── */}
          <TabsContent value="overview" className="mt-4 space-y-5">
            {/* Pre-standup briefing */}
            {session.briefingSnapshot ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Pre-Standup Briefing
                </p>
                <PreStandupPanel briefing={session.briefingSnapshot} members={members} />
              </div>
            ) : (
              <Card>
                <CardContent className="py-5 text-sm text-muted-foreground text-center">
                  Briefing snapshot not yet generated.
                </CardContent>
              </Card>
            )}

            {/* Capture today's commitments */}
            {session.status !== 'completed' && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Today&apos;s Commitments
                </p>
                <CommitmentCapture
                  sessionId={sessionId}
                  projectId={session.project?._id ?? session.project}
                  sprintId={session.sprint}
                  members={members}
                  onCommitmentSaved={handleCommitmentSaved}
                />
              </div>
            )}
          </TabsContent>

          {/* ── COMMITMENTS TAB ── */}
          <TabsContent value="commitments" className="mt-4 space-y-3">
            {commitments.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No commitments captured yet.</p>
                  <p className="text-xs mt-1">Use the Overview tab to assign tasks per person.</p>
                </CardContent>
              </Card>
            ) : (
              commitments.map((commitment) => {
                const member = commitment.user
                const memberName = `${member?.firstName ?? ''} ${member?.lastName ?? ''}`.trim()
                return (
                  <MemberCommitmentRow
                    key={commitment._id}
                    commitment={commitment}
                    onAddNote={(cId, note) => openNoteModal(cId, note, memberName)}
                    onResolveNote={handleResolveNote}
                    readOnly={session.status === 'completed'}
                  />
                )
              })
            )}
          </TabsContent>

          {/* ── AI ANALYSIS TAB ── */}
          <TabsContent value="analysis" className="mt-4">
            <AnalysisReport
              analysis={session.analysis}
              members={members}
              onRequestAnalysis={handleRequestAnalysis}
              analyzing={analyzing}
            />
          </TabsContent>

          {/* ── TRENDS TAB ── */}
          <TabsContent value="trends" className="mt-4">
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold">14-Day Trends</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {trends ? (
                  <TrendPanel
                    perMember={trends.perMember ?? []}
                    recurringCarryOvers={trends.recurringCarryOvers ?? []}
                    sessionsAnalyzed={trends.sessionsAnalyzed ?? 0}
                    trends={session.analysis?.trends ?? []}
                  />
                ) : (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* PM Note Modal */}
      <PMNoteModal
        open={noteModal.open}
        commitmentId={noteModal.commitmentId}
        existingNote={noteModal.existingNote}
        memberName={noteModal.memberName}
        onClose={() => setNoteModal({ open: false, commitmentId: null, existingNote: null, memberName: '' })}
        onSave={handleSaveNote}
      />
    </MainLayout>
  )
}
