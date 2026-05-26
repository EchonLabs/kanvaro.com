'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { StandupProjectCard } from '@/components/standup/StandupProjectCard'
import { useNotify } from '@/lib/notify'
import { useAuthContext } from '@/contexts/AuthContext'
import { Loader2, Activity } from 'lucide-react'

interface ProjectWithSession {
  project: {
    _id: string
    name: string
    memberCount: number
  }
  todaySession: {
    _id: string
    status: 'pending' | 'active' | 'completed'
    analysis?: { riskScore: number; riskLevel: 'low' | 'medium' | 'high' | 'critical' } | null
    completedAt?: string | null
  } | null
}

export default function StandupDashboardPage() {
  const router = useRouter()
  const { user } = useAuthContext()
  const notify = useNotify()

  const [projectSessions, setProjectSessions] = useState<ProjectWithSession[]>([])
  const [loading, setLoading] = useState(true)
  const [startingProjectId, setStartingProjectId] = useState<string | null>(null)

  const todayStr = new Date().toISOString().split('T')[0]

  const fetchProjectSessions = useCallback(async () => {
    try {
      setLoading(true)
      // Fetch all projects the user has access to
      const projectsRes = await fetch('/api/projects')
      if (!projectsRes.ok) throw new Error('Failed to fetch projects')
      const { projects } = await projectsRes.json()

      // For each project, check today's standup session
      const withSessions = await Promise.all(
        (projects ?? []).map(async (project: any) => {
          try {
            const sessRes = await fetch(
              `/api/standup/sessions?projectId=${project._id}&date=${todayStr}`
            )
            if (!sessRes.ok) return { project: { _id: project._id, name: project.name, memberCount: project.teamMembers?.length ?? 0 }, todaySession: null }
            const { sessions } = await sessRes.json()
            return {
              project: {
                _id: project._id,
                name: project.name,
                memberCount: project.teamMembers?.length ?? 0,
              },
              todaySession: sessions?.[0] ?? null,
            }
          } catch {
            return {
              project: { _id: project._id, name: project.name, memberCount: 0 },
              todaySession: null,
            }
          }
        })
      )

      // Sort: active first, then pending, then completed
      const order: Record<string, number> = { active: 0, pending: 1, completed: 2 }
      withSessions.sort((a, b) => {
        const aOrder = a.todaySession ? (order[a.todaySession.status] ?? 1) : 1
        const bOrder = b.todaySession ? (order[b.todaySession.status] ?? 1) : 1
        return aOrder - bOrder
      })

      setProjectSessions(withSessions)
    } catch (err: any) {
      notify.error({ title: err.message ?? 'Failed to load standup dashboard' })
    } finally {
      setLoading(false)
    }
  }, [todayStr])

  useEffect(() => {
    fetchProjectSessions()
  }, [fetchProjectSessions])

  const handleStartStandup = async (projectId: string) => {
    setStartingProjectId(projectId)
    try {
      const res = await fetch('/api/standup/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start standup')
      router.push(`/standup-dashboard/${data.session._id}`)
    } catch (err: any) {
      notify.error({ title: err.message })
    } finally {
      setStartingProjectId(null)
    }
  }

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Standup Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : projectSessions.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No projects found. You need to be a member of at least one project.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projectSessions.map(({ project, todaySession }) => (
              <StandupProjectCard
                key={project._id}
                project={project}
                todaySession={todaySession}
                onStartStandup={handleStartStandup}
                isStarting={startingProjectId === project._id}
              />
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  )
}
