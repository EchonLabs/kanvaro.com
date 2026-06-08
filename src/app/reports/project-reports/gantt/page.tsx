'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GanttChart } from '@/components/reports/GanttChart'
import { GanttData, GanttTask } from '@/lib/gantt'
import { Calendar, Download, SlidersHorizontal, GitBranch } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function GanttReportPage() {
  const { setItems } = useBreadcrumb()
  const [ganttData, setGanttData] = useState<GanttData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    project: '', sprint: '', assignee: '', startDate: '', endDate: ''
  })
  const ALL_PROJECTS = '__ALL_PROJECTS__'
  const ALL_SPRINTS = '__ALL_SPRINTS__'
  const ALL_ASSIGNEES = '__ALL_ASSIGNEES__'
  const [projects, setProjects] = useState<any[]>([])
  const [sprints, setSprints] = useState<any[]>([])
  const [assignees, setAssignees] = useState<any[]>([])
  const [projectSearchQuery, setProjectSearchQuery] = useState('')
  const [sprintSearchQuery, setSprintSearchQuery] = useState('')
  const [assigneeSearchQuery, setAssigneeSearchQuery] = useState('')
  const router = useRouter()

  const projectSearchInputRef = useRef<HTMLInputElement | null>(null)
  const sprintSearchInputRef = useRef<HTMLInputElement | null>(null)
  const assigneeSearchInputRef = useRef<HTMLInputElement | null>(null)

  const focusSearchInput = (el: HTMLInputElement | null) => {
    if (!el || el.disabled) return
    const doFocus = () => { el.focus({ preventScroll: true }); try { el.select?.() } catch {} }
    typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame(doFocus)
      : setTimeout(doFocus, 0)
  }

  useEffect(() => {
    setItems([
      { label: 'Reports', href: '/reports' },
      { label: 'Project Reports', href: '/reports/project-reports' },
      { label: 'Gantt Chart' },
    ])
  }, [setItems])

  useEffect(() => { loadFilterOptions() }, [])
  useEffect(() => { loadGanttData() }, [filters])

  const loadGanttData = async () => {
    try {
      setLoading(true)
      const p = new URLSearchParams()
      if (filters.project) p.append('projectId', filters.project)
      if (filters.sprint) p.append('sprintId', filters.sprint)
      if (filters.assignee) p.append('assigneeId', filters.assignee)
      if (filters.startDate) p.append('startDate', filters.startDate)
      if (filters.endDate) p.append('endDate', filters.endDate)
      const res = await fetch(`/api/reports/gantt?${p}`)
      if (res.ok) setGanttData(await res.json())
    } catch (e) {
      console.error('Failed to load Gantt data:', e)
    } finally {
      setLoading(false)
    }
  }

  const loadFilterOptions = async () => {
    try {
      const [pr, ar] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/members?limit=10000&page=1'),
      ])
      if (pr.ok) {
        const d = await pr.json()
        setProjects(Array.isArray(d) ? d : (d?.data && Array.isArray(d.data) ? d.data : []))
      }
      if (ar.ok) {
        const d = await ar.json()
        setAssignees(Array.isArray(d) ? d : (d?.data && Array.isArray(d.data) ? d.data : []))
      }
    } catch (e) { console.error('Failed to load filter options:', e) }
  }

  const filteredProjects = useMemo(() => {
    const q = projectSearchQuery.trim().toLowerCase()
    return q ? projects.filter(p => p.name.toLowerCase().includes(q)) : projects
  }, [projects, projectSearchQuery])

  const filteredSprints = useMemo(() => {
    const q = sprintSearchQuery.trim().toLowerCase()
    return q ? sprints.filter(s => s.name.toLowerCase().includes(q)) : sprints
  }, [sprints, sprintSearchQuery])

  const filteredAssignees = useMemo(() => {
    const q = assigneeSearchQuery.trim().toLowerCase()
    return q ? assignees.filter(a => a.name.toLowerCase().includes(q)) : assignees
  }, [assignees, assigneeSearchQuery])

  const handleTaskClick = (task: GanttTask) => router.push(`/tasks/${task.id}`)

  const handleExport = () => {
    const p = new URLSearchParams()
    if (filters.project) p.append('projectId', filters.project)
    if (filters.sprint) p.append('sprintId', filters.sprint)
    if (filters.assignee) p.append('assigneeId', filters.assignee)
    if (filters.startDate) p.append('startDate', filters.startDate)
    if (filters.endDate) p.append('endDate', filters.endDate)
    p.append('format', 'csv')
    window.location.href = `/api/reports/gantt/export?${p}`
  }

  const handleFilterChange = async (key: string, value: string) => {
    if (key === 'project') {
      setFilters(prev => ({ ...prev, project: value, sprint: '' }))
      setProjectSearchQuery(''); setSprintSearchQuery('')
      if (value) {
        try {
          const r = await fetch(`/api/sprints?project=${value}`)
          if (r.ok) {
            const d = await r.json()
            setSprints(Array.isArray(d) ? d : (d?.data && Array.isArray(d.data) ? d.data : []))
          }
        } catch (e) { console.error('Failed to load sprints:', e) }
      } else { setSprints([]) }
    } else if (key === 'sprint') {
      setFilters(prev => ({ ...prev, sprint: value })); setSprintSearchQuery('')
    } else if (key === 'assignee') {
      setFilters(prev => ({ ...prev, assignee: value })); setAssigneeSearchQuery('')
    } else {
      setFilters(prev => ({ ...prev, [key]: value }))
    }
  }

  return (
    <MainLayout>
      <PageWrapper>
        <div className="space-y-6">

          {/* ── Header ── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-[var(--apple-radius-md)] shadow-sm flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#FF9500 0%,#FFD60A 100%)', boxShadow: '0 4px 14px rgba(255,149,0,0.30)' }}
              >
                <GitBranch className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight leading-tight">Gantt Chart</h1>
                <p className="text-[13px] text-[var(--apple-secondary-label)]">Visualize project timelines and task dependencies</p>
              </div>
            </div>
            <Button
              onClick={handleExport}
              className="rounded-full h-8 px-4 text-[13px] apple-transition flex items-center gap-1.5"
              style={{ background: 'linear-gradient(135deg,#FF9500 0%,#FFD60A 100%)' }}
            >
              <Download className="h-3.5 w-3.5" />Export CSV
            </Button>
          </div>

          {/* ── Filter Card ── */}
          <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <SlidersHorizontal className="h-4 w-4 text-[var(--apple-secondary-label)]" />
              <p className="text-[13px] font-semibold text-[var(--apple-secondary-label)] uppercase tracking-[0.06em]">Filters</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">

              {/* Project */}
              <Select
                value={filters.project || ALL_PROJECTS}
                onValueChange={v => handleFilterChange('project', v === ALL_PROJECTS ? '' : v)}
                onOpenChange={open => open && focusSearchInput(projectSearchInputRef.current)}
              >
                <SelectTrigger className="h-9 rounded-full text-[13px] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)]">
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent className="p-0 rounded-[var(--apple-radius-md)]">
                  <div className="p-2">
                    <Input
                      ref={projectSearchInputRef}
                      value={projectSearchQuery}
                      onChange={e => setProjectSearchQuery(e.target.value)}
                      placeholder="Search projects…"
                      className="mb-2 h-8 text-[13px] rounded-full"
                      onKeyDown={e => e.stopPropagation()}
                      onMouseDown={e => e.stopPropagation()}
                    />
                    <div className="max-h-56 overflow-y-auto">
                      <SelectItem value={ALL_PROJECTS} className="text-[13px]">All projects</SelectItem>
                      {filteredProjects.length === 0
                        ? <div className="px-2 py-1 text-[12px] text-[var(--apple-tertiary-label)]">No matching projects</div>
                        : filteredProjects.map(p => (
                          <SelectItem key={p._id} value={p._id} className="text-[13px]">{p.name}</SelectItem>
                        ))
                      }
                    </div>
                  </div>
                </SelectContent>
              </Select>

              {/* Sprint */}
              <Select
                value={filters.sprint || ALL_SPRINTS}
                onValueChange={v => handleFilterChange('sprint', v === ALL_SPRINTS ? '' : v)}
                disabled={!filters.project}
                onOpenChange={open => open && focusSearchInput(sprintSearchInputRef.current)}
              >
                <SelectTrigger className="h-9 rounded-full text-[13px] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)]">
                  <SelectValue placeholder="All sprints" />
                </SelectTrigger>
                <SelectContent className="p-0 rounded-[var(--apple-radius-md)]">
                  <div className="p-2">
                    <Input
                      ref={sprintSearchInputRef}
                      value={sprintSearchQuery}
                      onChange={e => setSprintSearchQuery(e.target.value)}
                      placeholder="Search sprints…"
                      className="mb-2 h-8 text-[13px] rounded-full"
                      onKeyDown={e => e.stopPropagation()}
                      onMouseDown={e => e.stopPropagation()}
                    />
                    <div className="max-h-56 overflow-y-auto">
                      <SelectItem value={ALL_SPRINTS} className="text-[13px]">All sprints</SelectItem>
                      {filteredSprints.length === 0
                        ? <div className="px-2 py-1 text-[12px] text-[var(--apple-tertiary-label)]">No matching sprints</div>
                        : filteredSprints.map(s => (
                          <SelectItem key={s._id} value={s._id} className="text-[13px]">{s.name}</SelectItem>
                        ))
                      }
                    </div>
                  </div>
                </SelectContent>
              </Select>

              {/* Assignee */}
              <Select
                value={filters.assignee || ALL_ASSIGNEES}
                onValueChange={v => handleFilterChange('assignee', v === ALL_ASSIGNEES ? '' : v)}
                onOpenChange={open => open && focusSearchInput(assigneeSearchInputRef.current)}
              >
                <SelectTrigger className="h-9 rounded-full text-[13px] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)]">
                  <SelectValue placeholder="All assignees" />
                </SelectTrigger>
                <SelectContent className="p-0 rounded-[var(--apple-radius-md)]">
                  <div className="p-2">
                    <Input
                      ref={assigneeSearchInputRef}
                      value={assigneeSearchQuery}
                      onChange={e => setAssigneeSearchQuery(e.target.value)}
                      placeholder="Search assignees…"
                      className="mb-2 h-8 text-[13px] rounded-full"
                      onKeyDown={e => e.stopPropagation()}
                      onMouseDown={e => e.stopPropagation()}
                    />
                    <div className="max-h-56 overflow-y-auto">
                      <SelectItem value={ALL_ASSIGNEES} className="text-[13px]">All assignees</SelectItem>
                      {filteredAssignees.length === 0
                        ? <div className="px-2 py-1 text-[12px] text-[var(--apple-tertiary-label)]">No matching assignees</div>
                        : filteredAssignees.map(a => (
                          <SelectItem key={a._id} value={a._id} className="text-[13px]">{a.name}</SelectItem>
                        ))
                      }
                    </div>
                  </div>
                </SelectContent>
              </Select>

              {/* Date inputs */}
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--apple-tertiary-label)] pointer-events-none" />
                <Input
                  type="date"
                  value={filters.startDate}
                  onChange={e => handleFilterChange('startDate', e.target.value)}
                  className="pl-9 h-9 rounded-full text-[13px] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)]"
                />
              </div>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--apple-tertiary-label)] pointer-events-none" />
                <Input
                  type="date"
                  value={filters.endDate}
                  onChange={e => handleFilterChange('endDate', e.target.value)}
                  className="pl-9 h-9 rounded-full text-[13px] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)]"
                />
              </div>
            </div>
          </div>

          {/* ── Gantt Chart ── */}
          {loading ? (
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-12 flex flex-col items-center gap-4 animate-pulse">
              <div className="h-10 w-10 rounded-full bg-[var(--apple-tertiary-fill)]" />
              <div className="h-4 w-40 rounded-full bg-[var(--apple-tertiary-fill)]" />
              <div className="w-full h-48 rounded-[var(--apple-radius-md)] bg-[var(--apple-tertiary-fill)] mt-2" />
            </div>
          ) : ganttData && ganttData.tasks.length > 0 ? (
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] overflow-hidden">
              <div className="overflow-x-auto">
                <GanttChart
                  tasks={ganttData.tasks}
                  startDate={ganttData.startDate}
                  endDate={ganttData.endDate}
                  onTaskClick={handleTaskClick}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-16 flex flex-col items-center gap-4">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-[var(--apple-radius-lg)]"
                style={{ background: 'linear-gradient(135deg,#FF9500 0%,#FFD60A 100%)' }}
              >
                <GitBranch className="h-6 w-6 text-white" />
              </div>
              <p className="text-[17px] font-semibold">No tasks found</p>
              <p className="text-[13px] text-[var(--apple-secondary-label)] text-center max-w-sm">
                Try adjusting your filters or create tasks to see the Gantt chart.
              </p>
            </div>
          )}
        </div>
      </PageWrapper>
    </MainLayout>
  )
}
