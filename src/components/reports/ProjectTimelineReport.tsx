'use client'

import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { Calendar, CheckCircle2, AlertCircle } from 'lucide-react'

interface Project {
  _id: string; name: string; status: string; startDate: string; endDate?: string
  description?: string; teamMembers?: any[]
  stats: {
    tasks: { total: number; completed: number; completionRate: number }
    sprints: { total: number; active: number }
    timeTracking: { totalHours: number; entries: number }
    budget: { total: number; spent: number; remaining: number; utilizationRate: number }
  }
}

interface ProjectTimelineReportProps { projects: Project[]; filters: any }

const STATUS_PALETTE: Record<string, { color: string; bg: string; label: string }> = {
  active:    { color: '#34C759', bg: 'rgba(52,199,89,0.12)', label: 'Active' },
  completed: { color: '#007AFF', bg: 'rgba(0,122,255,0.12)', label: 'Completed' },
  'on-hold': { color: '#FF9500', bg: 'rgba(255,149,0,0.12)', label: 'On Hold' },
  cancelled: { color: '#FF453A', bg: 'rgba(255,69,58,0.12)', label: 'Cancelled' },
  planning:  { color: '#BF5AF2', bg: 'rgba(191,90,242,0.12)', label: 'Planning' },
}
const getStatus = (s: string) => STATUS_PALETTE[s] || { color: '#8E8E93', bg: 'rgba(142,142,147,0.12)', label: s }

const BAR_COLORS = ['#007AFF', '#34C759', '#FF9500', '#BF5AF2', '#FF453A', '#5AC8FA', '#FFD60A', '#30D158', '#FF6B6B', '#5E5CE6']

const AppleTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-[14px] border border-[var(--apple-separator)] bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.18)] p-3 text-[13px] min-w-[140px]">
      {label && <p className="font-semibold text-[var(--apple-label)] mb-2">{label}</p>}
      {payload.map((item: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color || item.fill }} />
            <span className="text-[var(--apple-secondary-label)]">{item.name}</span>
          </div>
          <span className="font-semibold font-apple-mono text-[var(--apple-label)]">{item.value} days</span>
        </div>
      ))}
    </div>
  )
}

export function ProjectTimelineReport({ projects, filters }: ProjectTimelineReportProps) {
  const { formatDate } = useDateTime()
  const today = new Date()

  const timelineProjects = projects.map(p => {
    const start = new Date(p.startDate)
    const end = p.endDate ? new Date(p.endDate) : today
    const duration = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
    const elapsed = Math.max(0, Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
    const daysLeft = p.endDate ? Math.ceil((new Date(p.endDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null
    const isOverdue = daysLeft !== null && daysLeft < 0 && p.status !== 'completed'
    return { ...p, duration, elapsed, daysLeft, isOverdue }
  })

  const durationData = timelineProjects.map(p => ({
    name: p.name.length > 12 ? p.name.slice(0, 12) + '…' : p.name,
    Duration: p.duration,
  }))

  const avgDuration = timelineProjects.length > 0
    ? timelineProjects.reduce((s, p) => s + p.duration, 0) / timelineProjects.length
    : 0

  const overdueCount = timelineProjects.filter(p => p.isOverdue).length
  const onTimeCount = timelineProjects.filter(p => !p.isOverdue && p.status !== 'completed').length

  return (
    <div className="space-y-6">

      {/* ── Stats Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Projects', value: String(projects.length), sub: 'All tracked', color: 'var(--apple-chart-color)' },
          { label: 'Avg Duration', value: `${avgDuration.toFixed(0)} days`, sub: 'Per project', color: '#FF9500' },
          { label: 'Overdue', value: String(overdueCount), sub: 'Past deadline', color: '#FF453A' },
          { label: 'On Track', value: String(onTimeCount), sub: 'Within schedule', color: '#34C759' },
        ].map(s => (
          <div key={s.label} className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none p-4">
            <p className="apple-section-label text-[var(--apple-secondary-label)] mb-1.5">{s.label}</p>
            <p className="text-[22px] font-bold font-apple-mono tracking-tight" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[12px] text-[var(--apple-tertiary-label)] mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Duration Chart ── */}
      <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none p-5">
        <div className="mb-4">
          <p className="text-[17px] font-semibold">Project Durations</p>
          <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">Total duration in days per project</p>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={durationData} barCategoryGap="40%" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${v}d`} />
            <Tooltip content={<AppleTooltip />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
            <Bar dataKey="Duration" radius={[5,5,0,0]} maxBarSize={44}>
              {durationData.map((_, i) => (
                <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Timeline Rows ── */}
      <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-[var(--apple-separator)]">
          <p className="text-[17px] font-semibold">Project Timeline</p>
          <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">Schedule and progress for all projects</p>
        </div>

        {/* Column headers */}
        <div className="hidden md:grid grid-cols-[1fr_180px_90px_90px_80px] gap-4 px-5 py-2 border-b border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)]">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--apple-tertiary-label)]">Project</p>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--apple-tertiary-label)]">Date Range</p>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--apple-tertiary-label)] text-right">Duration</p>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--apple-tertiary-label)] text-right">Tasks</p>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--apple-tertiary-label)] text-right">Schedule</p>
        </div>

        <div className="divide-y divide-[var(--apple-separator)]">
          {timelineProjects.map(p => {
            const st = getStatus(p.status)
            const progress = Math.min(100, (p.elapsed / p.duration) * 100)
            const taskColor = p.stats.tasks.completionRate >= 75 ? '#34C759' : p.stats.tasks.completionRate >= 40 ? '#FF9F0A' : 'var(--apple-chart-color)'
            const scheduleColor = p.status === 'completed' ? '#007AFF' : p.isOverdue ? '#FF453A' : p.daysLeft !== null && p.daysLeft <= 7 ? '#FF9F0A' : '#34C759'
            const scheduleLabel = p.status === 'completed'
              ? 'Done'
              : p.daysLeft === null
              ? '—'
              : p.isOverdue
              ? `${Math.abs(p.daysLeft)}d over`
              : `${p.daysLeft}d left`
            return (
              <div key={p._id} className="apple-transition hover:bg-[var(--apple-quaternary-fill)]">
                {/* Desktop row */}
                <div className="hidden md:grid grid-cols-[1fr_180px_90px_90px_80px] gap-4 items-center px-5 py-3.5">
                  {/* Name + status */}
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: st.color }} />
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold truncate">{p.name}</p>
                      <span className="text-[11px] font-medium" style={{ color: st.color }}>{st.label}</span>
                    </div>
                    {p.isOverdue && (
                      <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-50 dark:bg-red-950/30 text-red-500 flex-shrink-0">
                        <AlertCircle className="h-2.5 w-2.5" />Overdue
                      </span>
                    )}
                  </div>

                  {/* Date range */}
                  <div className="flex items-center gap-1.5 text-[12px] text-[var(--apple-secondary-label)]">
                    <Calendar className="h-3 w-3 flex-shrink-0 text-[var(--apple-tertiary-label)]" />
                    <span className="font-apple-mono">{formatDate(p.startDate)}</span>
                    {p.endDate && (
                      <>
                        <span className="text-[var(--apple-tertiary-label)]">→</span>
                        <span className="font-apple-mono">{formatDate(p.endDate)}</span>
                      </>
                    )}
                  </div>

                  {/* Duration */}
                  <div className="text-right">
                    <p className="text-[14px] font-semibold font-apple-mono text-[var(--apple-label)]">{p.duration}d</p>
                    <p className="text-[11px] text-[var(--apple-tertiary-label)]">{Math.round(progress)}% elapsed</p>
                  </div>

                  {/* Tasks */}
                  <div className="text-right">
                    <p className="text-[14px] font-semibold font-apple-mono" style={{ color: taskColor }}>{p.stats.tasks.completionRate.toFixed(0)}%</p>
                    <p className="text-[11px] text-[var(--apple-tertiary-label)]">{p.stats.tasks.completed}/{p.stats.tasks.total}</p>
                  </div>

                  {/* Schedule status */}
                  <div className="text-right">
                    <p className="text-[14px] font-semibold font-apple-mono" style={{ color: scheduleColor }}>{scheduleLabel}</p>
                    <p className="text-[11px] text-[var(--apple-tertiary-label)]">{p.duration}d total</p>
                  </div>
                </div>

                {/* Mobile card */}
                <div className="md:hidden px-5 py-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: st.color }} />
                      <p className="text-[14px] font-semibold truncate">{p.name}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-[11px] font-semibold rounded-full px-2 py-0.5" style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span>
                      {p.isOverdue && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[12px] text-[var(--apple-secondary-label)]">
                    <Calendar className="h-3 w-3 text-[var(--apple-tertiary-label)]" />
                    <span className="font-apple-mono">{formatDate(p.startDate)}{p.endDate ? ` → ${formatDate(p.endDate)}` : ''}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-[8px] bg-[var(--apple-quaternary-fill)] p-2 text-center">
                      <p className="text-[13px] font-semibold font-apple-mono text-[var(--apple-label)]">{p.duration}d</p>
                      <p className="text-[10px] text-[var(--apple-tertiary-label)]">Duration</p>
                    </div>
                    <div className="rounded-[8px] bg-[var(--apple-quaternary-fill)] p-2 text-center">
                      <p className="text-[13px] font-semibold font-apple-mono" style={{ color: taskColor }}>{p.stats.tasks.completionRate.toFixed(0)}%</p>
                      <p className="text-[10px] text-[var(--apple-tertiary-label)]">Tasks</p>
                    </div>
                    <div className="rounded-[8px] bg-[var(--apple-quaternary-fill)] p-2 text-center">
                      <p className="text-[13px] font-semibold font-apple-mono" style={{ color: scheduleColor }}>{scheduleLabel}</p>
                      <p className="text-[10px] text-[var(--apple-tertiary-label)]">Schedule</p>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
