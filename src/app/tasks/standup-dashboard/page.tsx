'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { PageContent } from '@/components/ui/PageContent'
import { Input } from '@/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/Button'
import { useAuthContext } from '@/contexts/AuthContext'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { useDebounce } from '@/hooks/useDebounce'
import { Activity, CalendarCheck, LayoutGrid, Loader2, Search, ShieldAlert, Users } from 'lucide-react'
import { fetchStandupProjectSummaries } from '@/components/standup-dashboard/standup-dashboard-service'
import { StandupProjectCard } from '@/components/standup-dashboard/StandupProjectCard'
import { formatToTitleCase } from '@/lib/utils'

const HEADER_GRADIENT = 'var(--apple-card-gradient)'
const HEADER_GLOW = 'var(--apple-chart-glow)'

export default function StandupDashboardPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useAuthContext()
  const { hasPermission } = usePermissions()
  const { setItems } = useBreadcrumb()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | 'planning' | 'active' | 'completed' | 'on_hold'>('all')
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setItems([{ label: 'Standup Dashboard' }])
  }, [setItems])

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

  useEffect(() => {
    const abortController = new AbortController()

    const loadProjects = async () => {
      setLoading(true)
      setError('')
      try {
        const data = await fetchStandupProjectSummaries(abortController.signal)
        if (!abortController.signal.aborted) {
          setProjects(data)
        }
      } catch (fetchError) {
        if (!abortController.signal.aborted) {
          setError('Failed to load standup projects')
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false)
        }
      }
    }

    loadProjects()
    return () => abortController.abort()
  }, [])

  const debouncedSearch = useDebounce(search, 300)
  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchesSearch = project.name.toLowerCase().includes(debouncedSearch.toLowerCase())
      const matchesStatus = status === 'all' || project.status === status
      return matchesSearch && matchesStatus
    })
  }, [debouncedSearch, projects, status])

  const activeCount = projects.filter((p) => p.status === 'active').length
  const totalMeetings = projects.reduce((sum, p) => sum + (p.meetings?.length || 0), 0)
  const upcomingCount = projects.reduce(
    (sum, p) =>
      sum +
      (p.meetings?.filter(
        (m: any) => m.status !== 'completed' && m.status !== 'missed'
      ).length || 0),
    0
  )

  if (!hasPermission(Permission.PROJECT_MANAGE_TEAM)) {
    return (
      <MainLayout>
        <PageContent>
          <div className="flex min-h-[45vh] items-center justify-center px-4 py-12">
            <div className="max-w-lg w-full rounded-[var(--apple-radius-xl)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-8 text-center space-y-5">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10">
                <ShieldAlert className="h-7 w-7 text-[var(--apple-system-red)]" />
              </div>
              <div className="space-y-1">
                <h2 className="text-[17px] font-semibold">Access Restricted</h2>
                <p className="text-[13px] text-[var(--apple-secondary-label)]">
                  The Standup Dashboard is available to project managers only.
                </p>
              </div>
              <Button onClick={() => router.push('/dashboard')}>Return to Dashboard</Button>
            </div>
          </div>
        </PageContent>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <PageContent>
        <div className="space-y-6 sm:space-y-8">

          {/* Page header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Activity className="h-8 w-8 flex-shrink-0" strokeWidth={1.5} style={{ color: 'var(--apple-card-gradient)' }} />
              <div>
                <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight text-[var(--apple-label)]">Standup Dashboard</h1>
                <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">
                  Monitor daily project progress, review blockers, and keep standup follow-ups organized.
                </p>
              </div>
            </div>
          </div>

          {/* Stats bar */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Total Projects', value: projects.length, icon: LayoutGrid, color: 'var(--apple-chart-to)' },
              { label: 'Active',          value: activeCount,    icon: Activity,     color: '#34C759' },
              { label: 'Total Meetings',  value: totalMeetings,  icon: CalendarCheck,color: '#AF52DE' },
              { label: 'Upcoming',        value: upcomingCount,  icon: Users,        color: '#FF9500' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div
                key={label}
                className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-4 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <p className="apple-section-label text-[var(--apple-secondary-label)]">{label}</p>
                  <Icon className="h-4 w-4" style={{ color }} />
                </div>
                <p className="text-[26px] font-bold tracking-tight font-apple-mono tabular-nums" style={{ color }}>
                  {loading ? '—' : value}
                </p>
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--apple-tertiary-label)]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects…"
                className="h-10 w-full pl-10 rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] focus:bg-card"
              />
            </div>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="h-10 w-full sm:w-52 rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="planning">Planning</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Count label */}
          <div className="flex items-center gap-2 text-[13px] text-[var(--apple-secondary-label)]">
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>{filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}</span>
            {status !== 'all' && (
              <span className="rounded-full bg-[var(--apple-tertiary-fill)] px-2 py-0.5 text-[11px] font-medium">
                {formatToTitleCase(status)}
              </span>
            )}
          </div>

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center gap-2.5 py-16 text-[13px] text-[var(--apple-secondary-label)]">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading projects…
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <div className="rounded-[var(--apple-radius-lg)] border border-red-500/20 bg-red-500/5 px-4 py-3 text-[13px] text-[var(--apple-system-red)]">
              {error}
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && filteredProjects.length === 0 && (
            <div className="rounded-[var(--apple-radius-xl)] border border-dashed border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-6 py-16 text-center space-y-2">
              <p className="text-[15px] font-semibold">No projects match your filters</p>
              <p className="text-[13px] text-[var(--apple-secondary-label)]">
                Try clearing the search or changing the status filter.
              </p>
            </div>
          )}

          {/* Project cards grid */}
          {!loading && !error && filteredProjects.length > 0 && (
            <div
              key={`${debouncedSearch}-${status}`}
              className="view-transition-container grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
            >
              {filteredProjects.map((project, index) => (
                <StandupProjectCard
                  key={project._id}
                  project={project}
                  index={index}
                  onOpen={(projectId) => router.push(`/tasks/standup-dashboard/${projectId}`)}
                />
              ))}
            </div>
          )}
        </div>
      </PageContent>
    </MainLayout>
  )
}
