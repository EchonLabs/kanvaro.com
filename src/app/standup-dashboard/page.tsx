'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { StandupProjectCard } from '@/components/standup/StandupProjectCard'
import { useNotify } from '@/lib/notify'
import { useAuthContext } from '@/contexts/AuthContext'
import { Input } from '@/components/ui/Input'
import { Loader2, Activity, Search } from 'lucide-react'

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
  const [search, setSearch] = useState('')

  const todayStr = new Date().toISOString().split('T')[0]

  const fetchProjectSessions = useCallback(async () => {
    try {
      setLoading(true)
      const projectsRes = await fetch('/api/projects')
      if (!projectsRes.ok) throw new Error('Failed to fetch projects')
      const body = await projectsRes.json()
      const projects: any[] = body.projects ?? body.data ?? []
      console.log('[standup] projects fetched:', projects.length, projects.map((p: any) => p.name))

      const withSessions = await Promise.all(
        projects.map(async (project: any) => {
          try {
            const sessRes = await fetch(
              `/api/standup/sessions?projectId=${project._id}&date=${todayStr}`
            )
            if (!sessRes.ok) {
              console.log(`[standup] sessions 403/error for ${project.name} (${project._id})`)
              return { project: { _id: project._id, name: project.name, memberCount: project.teamMembers?.length ?? 0 }, todaySession: null }
            }
            const { sessions } = await sessRes.json()
            return {
              project: {
                _id: project._id,
                name: project.name,
                memberCount: project.teamMembers?.length ?? 0,
              },
              todaySession: sessions?.[0] ?? null,
            }
          } catch (e) {
            console.error(`[standup] error fetching session for ${project.name}:`, e)
            return {
              project: { _id: project._id, name: project.name, memberCount: 0 },
              todaySession: null,
            }
          }
        })
      )

      console.log('[standup] withSessions count:', withSessions.length)

      const order: Record<string, number> = { active: 0, pending: 1, completed: 2 }
      withSessions.sort((a, b) => {
        const aOrder = a.todaySession ? (order[a.todaySession.status] ?? 1) : 1
        const bOrder = b.todaySession ? (order[b.todaySession.status] ?? 1) : 1
        return aOrder - bOrder
      })

      setProjectSessions(withSessions)
    } catch (err: any) {
      console.error('[standup] fetchProjectSessions error:', err)
      notify.error({ title: err.message ?? 'Failed to load standup dashboard' })
    } finally {
      setLoading(false)
    }
  }, [todayStr])

  useEffect(() => {
    fetchProjectSessions()
  }, [fetchProjectSessions])

  const handleOpenProject = (projectId: string) => {
    router.push(`/standup-dashboard/${projectId}`)
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

        {/* Search filter */}
        {!loading && projectSessions.length > 0 && (
          <div className="relative max-w-sm">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="Search projects…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}

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
          (() => {
            const filtered = search.trim()
              ? projectSessions.filter(({ project }) =>
                  project.name.toLowerCase().includes(search.toLowerCase())
                )
              : projectSessions
            return filtered.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <p className="text-sm">No projects match &ldquo;{search}&rdquo;</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map(({ project, todaySession }) => (
                  <StandupProjectCard
                    key={project._id}
                    project={project}
                    todaySession={todaySession}
                    onOpenProject={handleOpenProject}
                  />
                ))}
              </div>
            )
          })()
        )}
      </div>
    </MainLayout>
  )
}
