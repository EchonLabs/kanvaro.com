'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { PageContent } from '@/components/ui/PageContent'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useAuthContext } from '@/contexts/AuthContext'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { useDebounce } from '@/hooks/useDebounce'
import { LayoutGrid, Loader2, Search, ShieldAlert } from 'lucide-react'
import { fetchStandupProjectSummaries } from '@/components/standup-dashboard/standup-dashboard-service'
import { StandupProjectCard } from '@/components/standup-dashboard/StandupProjectCard'
import { formatToTitleCase } from '@/lib/utils'

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

  if (!hasPermission(Permission.PROJECT_MANAGE_TEAM)) {
    return (
      <MainLayout>
        <PageContent>
          <div className="flex min-h-[45vh] items-center justify-center px-4 py-12">
            <Card className="max-w-lg">
              <CardHeader>
                <CardTitle>Standup Dashboard</CardTitle>
                <CardDescription>
                  This area is available to project managers.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ShieldAlert className="h-4 w-4" />
                  <span>You do not currently have permission to view this page.</span>
                </div>
                <Button onClick={() => router.push('/dashboard')}>Return to Dashboard</Button>
              </CardContent>
            </Card>
          </div>
        </PageContent>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <PageContent>
        <div className="space-y-6 sm:space-y-8">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Standup Dashboard</h1>
            <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
              Monitor daily project progress, review blockers, and keep standup follow-ups organized in one place.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,220px)]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search projects by name"
                className="h-10 w-full pl-10"
              />
            </div>

            <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="planning">Planning</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LayoutGrid className="h-4 w-4" />
              <span>{filteredProjects.length} projects</span>
            </div>
            <Badge variant="outline" className="hidden sm:inline-flex">
              {formatToTitleCase(status === 'all' ? 'all' : status)}
            </Badge>
          </div>

          {loading && (
            <Card>
              <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading live projects...
              </CardContent>
            </Card>
          )}

          {!loading && error && (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                {error}.
              </CardContent>
            </Card>
          )}

          {filteredProjects.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
                <p className="font-medium">No projects match your filters</p>
                <p className="text-sm text-muted-foreground">Try clearing the search or changing the status filter.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredProjects.map((project) => (
                <StandupProjectCard key={project._id} project={project} onOpen={(projectId) => router.push(`/tasks/standup-dashboard/${projectId}`)} />
              ))}
            </div>
          )}
        </div>
      </PageContent>
    </MainLayout>
  )
}