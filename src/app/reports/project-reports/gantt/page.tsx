'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { GanttChart } from '@/components/reports/GanttChart'
import { GanttData, GanttTask } from '@/lib/gantt'
import {
  CalendarIcon, Download, SlidersHorizontal, GitBranch,
  CheckCircle2, Clock, AlertTriangle, Layers, ChevronDown, ChevronUp, RefreshCw
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

const STAT_ACCENTS = [
  { gradient: 'linear-gradient(135deg,#007AFF 0%,#5AC8FA 100%)', glow: 'rgba(0,122,255,0.22)' },
  { gradient: 'linear-gradient(135deg,#34C759 0%,#30D158 100%)', glow: 'rgba(52,199,89,0.22)' },
  { gradient: 'linear-gradient(135deg,#FF9500 0%,#FFD60A 100%)', glow: 'rgba(255,149,0,0.22)' },
  { gradient: 'linear-gradient(135deg,#FF453A 0%,#FF9F0A 100%)', glow: 'rgba(255,69,58,0.22)' },
]

function MiniStatCard({
  label, value, icon: Icon, accent,
}: {
  label: string; value: string | number; icon: React.ElementType; accent: typeof STAT_ACCENTS[0]
}) {
  return (
    <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none p-4 flex items-center gap-3 apple-transition hover:shadow-[0_8px_28px_rgba(0,0,0,0.10)] dark:hover:shadow-[0_8px_28px_rgba(0,0,0,0.38)] hover:-translate-y-0.5">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-[var(--apple-radius-sm)] flex-shrink-0"
        style={{ background: accent.gradient, boxShadow: `0 4px 14px ${accent.glow}` }}
      >
        <Icon className="h-4.5 w-4.5 text-white" style={{ width: 18, height: 18 }} />
      </div>
      <div className="min-w-0">
        <p className="apple-section-label text-[var(--apple-secondary-label)]">{label}</p>
        <p className="text-[22px] font-bold tracking-tight leading-tight font-apple-mono">{value}</p>
      </div>
    </div>
  )
}

interface DateFilter {
  from: Date | undefined
  to: Date | undefined
}

export default function GanttReportPage() {
  const { setItems } = useBreadcrumb()
  const [ganttData, setGanttData] = useState<GanttData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(true)
  const [filters, setFilters] = useState({
    project: '', sprint: '', assignee: '',
  })
  const [dateRange, setDateRange] = useState<DateFilter>({ from: undefined, to: undefined })

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
  useEffect(() => { loadGanttData() }, [filters, dateRange])

  const loadGanttData = async () => {
    try {
      setLoading(true)
      const p = new URLSearchParams()
      if (filters.project) p.append('projectId', filters.project)
      if (filters.sprint) p.append('sprintId', filters.sprint)
      if (filters.assignee) p.append('assigneeId', filters.assignee)
      if (dateRange.from) p.append('startDate', dateRange.from.toISOString())
      if (dateRange.to) p.append('endDate', dateRange.to.toISOString())
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

  // Sprints first (past first), then regular tasks
  const sortedTasks = useMemo((): GanttTask[] => {
    if (!ganttData?.tasks?.length) return []
    const now = new Date()
    const sprintRows = ganttData.tasks
      .filter(t => t.type === 'sprint')
      .sort((a, b) => {
        const aEnd = a.end instanceof Date ? a.end : new Date(a.end)
        const bEnd = b.end instanceof Date ? b.end : new Date(b.end)
        const aPast = aEnd < now
        const bPast = bEnd < now
        // Past sprints first, then sort by start date ascending
        if (aPast !== bPast) return aPast ? -1 : 1
        const aStart = a.start instanceof Date ? a.start : new Date(a.start)
        const bStart = b.start instanceof Date ? b.start : new Date(b.start)
        return aStart.getTime() - bStart.getTime()
      })
    const taskRows = ganttData.tasks.filter(t => t.type !== 'sprint')
    return [...sprintRows, ...taskRows]
  }, [ganttData])

  const handleTaskClick = (task: GanttTask) => {
    if (task.type === 'sprint') {
      // task.id is 'sprint-{mongoObjectId}'
      const sprintId = task.id.replace(/^sprint-/, '')
      router.push(`/sprints/${sprintId}`)
    } else {
      router.push(`/tasks/${task.id}`)
    }
  }

  const handleExport = () => {
    const p = new URLSearchParams()
    if (filters.project) p.append('projectId', filters.project)
    if (filters.sprint) p.append('sprintId', filters.sprint)
    if (filters.assignee) p.append('assigneeId', filters.assignee)
    if (dateRange.from) p.append('startDate', dateRange.from.toISOString())
    if (dateRange.to) p.append('endDate', dateRange.to.toISOString())
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
    }
  }

  // Derive summary stats from sorted tasks
  const stats = useMemo(() => {
    const taskOnly = sortedTasks.filter(t => t.type !== 'sprint')
    if (!taskOnly.length) return { total: 0, done: 0, inProgress: 0, overdue: 0 }
    const now = new Date()
    return {
      total: taskOnly.length,
      done: taskOnly.filter(t => t.status === 'done').length,
      inProgress: taskOnly.filter(t => t.status === 'in_progress').length,
      overdue: taskOnly.filter(t => {
        const end = t.end instanceof Date ? t.end : new Date(t.end)
        return end < now && t.status !== 'done'
      }).length,
    }
  }, [sortedTasks])

  const clearFilters = () => {
    setFilters({ project: '', sprint: '', assignee: '' })
    setDateRange({ from: undefined, to: undefined })
    setSprints([])
  }

  const activeFilterCount = [
    filters.project, filters.sprint, filters.assignee,
    dateRange.from, dateRange.to,
  ].filter(Boolean).length
  const hasActiveFilters = activeFilterCount > 0

  return (
    <MainLayout>
      <PageWrapper>
        <div className="space-y-5">

          {/* ── Header ── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-[var(--apple-radius-md)] flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#FF9500 0%,#FFD60A 100%)', boxShadow: '0 4px 14px rgba(255,149,0,0.30)' }}
              >
                <GitBranch className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight leading-tight">Gantt Chart</h1>
                <p className="text-[13px] text-[var(--apple-secondary-label)]">Visualize project timelines and task dependencies</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="outline" size="sm"
                onClick={() => setShowFilters(v => !v)}
                className={cn(
                  "rounded-full h-8 px-4 text-[13px] border-[var(--apple-separator)] apple-transition",
                  showFilters && "bg-[var(--apple-tertiary-fill)]"
                )}
              >
                <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
                Filters
                {hasActiveFilters && (
                  <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 rounded-full text-[10px] font-bold text-white px-1"
                    style={{ background: 'linear-gradient(135deg,#FF9500 0%,#FFD60A 100%)' }}>
                    {activeFilterCount}
                  </span>
                )}
                {showFilters
                  ? <ChevronUp className="h-3 w-3 ml-1" />
                  : <ChevronDown className="h-3 w-3 ml-1" />
                }
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={loadGanttData}
                className="rounded-full h-8 px-3 border-[var(--apple-separator)] apple-transition"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                onClick={handleExport}
                className="rounded-full h-8 px-4 text-[13px] apple-transition"
                style={{ background: 'linear-gradient(135deg,#FF9500 0%,#FFD60A 100%)' }}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />Export CSV
              </Button>
            </div>
          </div>

          {/* ── Stats Strip ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MiniStatCard label="Total Tasks" value={stats.total} icon={Layers} accent={STAT_ACCENTS[0]} />
            <MiniStatCard label="Completed" value={stats.done} icon={CheckCircle2} accent={STAT_ACCENTS[1]} />
            <MiniStatCard label="In Progress" value={stats.inProgress} icon={Clock} accent={STAT_ACCENTS[2]} />
            <MiniStatCard label="Overdue" value={stats.overdue} icon={AlertTriangle} accent={STAT_ACCENTS[3]} />
          </div>

          {/* ── Filter Panel ── */}
          {showFilters && (
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--apple-secondary-label)]" />
                  <p className="text-[13px] font-semibold text-[var(--apple-secondary-label)] uppercase tracking-[0.06em]">Filters</p>
                </div>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}
                    className="h-7 px-3 text-[12px] rounded-full text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]">
                    Clear all
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">

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
                    <SelectValue placeholder={filters.project ? 'All sprints' : 'Select project first'} />
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

                {/* From date */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "h-9 rounded-full text-[13px] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)] justify-start font-normal",
                        !dateRange.from && "text-[var(--apple-tertiary-label)]"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-3.5 w-3.5 flex-shrink-0" />
                      {dateRange.from ? format(dateRange.from, 'MMM d, yyyy') : 'From date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 rounded-[var(--apple-radius-md)]" align="start">
                    <Calendar
                      mode="single"
                      selected={dateRange.from}
                      onSelect={d => setDateRange(prev => ({ ...prev, from: d }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>

                {/* To date */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "h-9 rounded-full text-[13px] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)] justify-start font-normal",
                        !dateRange.to && "text-[var(--apple-tertiary-label)]"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-3.5 w-3.5 flex-shrink-0" />
                      {dateRange.to ? format(dateRange.to, 'MMM d, yyyy') : 'To date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 rounded-[var(--apple-radius-md)]" align="start">
                    <Calendar
                      mode="single"
                      selected={dateRange.to}
                      onSelect={d => setDateRange(prev => ({ ...prev, to: d }))}
                      disabled={dateRange.from ? { before: dateRange.from } : undefined}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>

              </div>
            </div>
          )}

          {/* ── Gantt Chart ── */}
          {loading ? (
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden animate-pulse">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--apple-separator)]">
                <div className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-full bg-[var(--apple-tertiary-fill)]" />
                  <div className="h-4 w-28 rounded-full bg-[var(--apple-tertiary-fill)]" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-24 rounded-full bg-[var(--apple-tertiary-fill)]" />
                </div>
              </div>
              <div className="p-4 space-y-3">
                {[...Array(7)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3" style={{ opacity: 1 - i * 0.11 }}>
                    <div className="h-10 w-48 rounded-[var(--apple-radius-sm)] bg-[var(--apple-tertiary-fill)] flex-shrink-0" />
                    <div
                      className="h-8 rounded-[var(--apple-radius-sm)] bg-[var(--apple-tertiary-fill)]"
                      style={{ width: `${28 + (i % 3) * 18}%`, marginLeft: `${(i % 4) * 8}%` }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : sortedTasks.length > 0 ? (
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
              <GanttChart
                tasks={sortedTasks}
                startDate={ganttData!.startDate}
                endDate={ganttData!.endDate}
                onTaskClick={handleTaskClick}
              />
            </div>
          ) : (
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none p-16 flex flex-col items-center gap-4">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-[var(--apple-radius-lg)]"
                style={{ background: 'linear-gradient(135deg,#FF9500 0%,#FFD60A 100%)', boxShadow: '0 4px 20px rgba(255,149,0,0.28)' }}
              >
                <GitBranch className="h-7 w-7 text-white" />
              </div>
              <div className="text-center">
                <p className="text-[17px] font-semibold mb-1">No tasks found</p>
                <p className="text-[13px] text-[var(--apple-secondary-label)] max-w-xs">
                  Try adjusting your filters or create tasks with start and due dates to see the Gantt chart.
                </p>
              </div>
              {hasActiveFilters && (
                <Button
                  variant="outline" size="sm" onClick={clearFilters}
                  className="rounded-full h-8 px-4 text-[13px] border-[var(--apple-separator)] apple-transition mt-2"
                >
                  Clear filters
                </Button>
              )}
            </div>
          )}

        </div>
      </PageWrapper>
    </MainLayout>
  )
}
