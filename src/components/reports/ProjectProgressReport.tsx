'use client'

import {
  BarChart, Bar, Cell, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { CheckCircle2, Clock, Users, Zap } from 'lucide-react'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { useOrgCurrency } from '@/hooks/useOrgCurrency'

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

interface ProjectProgressReportProps {
  projects: Project[]
  filters: any
}

const STATUS_PALETTE: Record<string, { color: string; bg: string; label: string }> = {
  active:    { color: '#34C759', bg: 'rgba(52,199,89,0.12)', label: 'Active' },
  completed: { color: '#007AFF', bg: 'rgba(0,122,255,0.12)', label: 'Completed' },
  'on-hold': { color: '#FF9500', bg: 'rgba(255,149,0,0.12)', label: 'On Hold' },
  cancelled: { color: '#FF453A', bg: 'rgba(255,69,58,0.12)', label: 'Cancelled' },
  planning:  { color: '#BF5AF2', bg: 'rgba(191,90,242,0.12)', label: 'Planning' },
}
const getStatus = (s: string) => STATUS_PALETTE[s] || { color: '#8E8E93', bg: 'rgba(142,142,147,0.12)', label: s }

const AppleTooltip = ({ active, payload, label, formatValue }: any) => {
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
          <span className="font-semibold font-apple-mono text-[var(--apple-label)]">
            {formatValue ? formatValue(item.value) : item.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none p-5">
      <div className="mb-4">
        <p className="text-[17px] font-semibold tracking-tight">{title}</p>
        {subtitle && <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

export function ProjectProgressReport({ projects, filters }: ProjectProgressReportProps) {
  const { formatDate } = useDateTime()
  const { formatCurrency } = useOrgCurrency()

  const projectsWithTasks = projects.filter(p => p.stats.tasks.total > 0)
  const avgCompletion = projectsWithTasks.length > 0
    ? projectsWithTasks.reduce((s, p) => s + p.stats.tasks.completionRate, 0) / projectsWithTasks.length
    : 0

  const progressData = projects.map(p => ({
    name: p.name.length > 12 ? p.name.slice(0, 12) + '…' : p.name,
    'Completion %': p.stats.tasks.completionRate,
    'Budget %': Math.min(100, p.stats.budget.utilizationRate),
  }))

  const taskData = projects.map(p => ({
    name: p.name.length > 12 ? p.name.slice(0, 12) + '…' : p.name,
    Total: p.stats.tasks.total,
    Completed: p.stats.tasks.completed,
  }))

  const statusCounts = projects.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const statusData = Object.entries(statusCounts).map(([s, n]) => ({
    status: getStatus(s).label,
    Count: n,
    fill: getStatus(s).color,
  }))

  return (
    <div className="space-y-6">

      {/* ── Stats Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Projects', value: String(projects.length), sub: 'All tracked projects', color: 'var(--apple-chart-color)' },
          { label: 'Avg Completion', value: `${avgCompletion.toFixed(1)}%`, sub: 'Across all projects', color: '#34C759' },
          { label: 'Active Projects', value: String(projects.filter(p => p.status === 'active').length), sub: 'Currently in progress', color: '#FF9500' },
          { label: 'Completed', value: String(projects.filter(p => p.status === 'completed').length), sub: 'Successfully finished', color: 'var(--apple-chart-color)' },
        ].map(s => (
          <div key={s.label} className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none p-4">
            <p className="apple-section-label text-[var(--apple-secondary-label)] mb-1.5">{s.label}</p>
            <p className="text-[24px] font-bold font-apple-mono tracking-tight" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[12px] text-[var(--apple-tertiary-label)] mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Area — completion vs budget */}
        <ChartCard title="Completion vs Budget Utilization" subtitle="Task progress vs budget burn correlation">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={progressData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${v}%`} domain={[0,100]} />
              <Tooltip content={<AppleTooltip formatValue={(v: number) => `${v}%`} />} cursor={{ stroke: 'var(--apple-separator)', strokeWidth: 1 }} />
              <Area type="monotone" dataKey="Completion %" stroke="#34C759" strokeWidth={2} fill="#34C759" fillOpacity={0.12} dot={false} activeDot={{ r: 4 }} />
              <Area type="monotone" dataKey="Budget %"     stroke="#FF9500" strokeWidth={2} fill="#FF9500" fillOpacity={0.12} dot={false} activeDot={{ r: 4 }} />
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[12px] text-[var(--apple-secondary-label)]">{v}</span>} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Bar — status distribution */}
        <ChartCard title="Project Status Distribution" subtitle="Count of projects by current status">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={statusData} barCategoryGap="40%" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="status" tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
              <Tooltip content={<AppleTooltip />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
              <Bar dataKey="Count" radius={[6,6,0,0]} maxBarSize={48}>
                {statusData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Bar — tasks completed vs total */}
        <ChartCard title="Task Progress by Project" subtitle="Completed tasks vs total tasks per project">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={taskData} barCategoryGap="30%" barGap={4} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={<AppleTooltip />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
              <Bar dataKey="Total"     fill="var(--apple-chart-color)" radius={[5,5,0,0]} maxBarSize={28} />
              <Bar dataKey="Completed" fill="#34C759"                  radius={[5,5,0,0]} maxBarSize={28} />
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[12px] text-[var(--apple-secondary-label)]">{v}</span>} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Sprint activity */}
        <ChartCard title="Sprint Overview" subtitle="Active and total sprints per project">
          <div className="space-y-2 mt-1 max-h-[220px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-[var(--apple-tertiary-fill)] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--apple-separator)]">
            {projects.map(p => {
              return (
                <div key={p._id} className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-[8px] hover:bg-[var(--apple-quaternary-fill)] transition-colors">
                  <p className="text-[13px] font-medium truncate flex-shrink-0 max-w-[120px]">{p.name}</p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="flex gap-0.5">
                      {Array.from({ length: Math.min(p.stats.sprints.total, 8) }).map((_, i) => (
                        <div
                          key={i}
                          className="h-4 w-1.5 rounded-full"
                          style={{ backgroundColor: i < p.stats.sprints.active ? 'var(--apple-chart-color)' : 'var(--apple-tertiary-fill)' }}
                        />
                      ))}
                      {p.stats.sprints.total > 8 && <span className="text-[10px] text-[var(--apple-tertiary-label)] ml-0.5">+{p.stats.sprints.total - 8}</span>}
                    </div>
                    <span className="text-[12px] font-apple-mono text-[var(--apple-tertiary-label)] w-10 text-right">
                      <span className="font-semibold" style={{ color: 'var(--apple-chart-color)' }}>{p.stats.sprints.active}</span>/{p.stats.sprints.total}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </ChartCard>
      </div>

      {/* ── Detailed Progress List ── */}
      <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-[var(--apple-separator)]">
          <p className="text-[17px] font-semibold">Project Progress Details</p>
          <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">Detailed progress tracking for each project</p>
        </div>

        {/* Column headers */}
        <div className="hidden sm:grid grid-cols-[1fr_100px_120px_80px_90px_80px] gap-2 px-5 py-2 border-b border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)]">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--apple-tertiary-label)]">Project</p>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--apple-tertiary-label)] text-right">Tasks</p>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--apple-tertiary-label)] text-right">Budget Used</p>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--apple-tertiary-label)] text-right">Sprints</p>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--apple-tertiary-label)] text-right">Hours</p>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--apple-tertiary-label)] text-right">Team</p>
        </div>

        <div className="divide-y divide-[var(--apple-separator)]">
          {projects.map(project => {
            const st = getStatus(project.status)
            const compPct = project.stats.tasks.completionRate
            const budPct = Math.min(100, project.stats.budget.utilizationRate)
            const budColor = budPct > 85 ? '#FF453A' : budPct > 65 ? '#FF9F0A' : '#34C759'
            const compColor = compPct >= 75 ? '#34C759' : compPct >= 40 ? '#FF9F0A' : '#FF453A'
            return (
              <div key={project._id} className="px-5 py-3.5 apple-transition hover:bg-[var(--apple-quaternary-fill)]">
                {/* Desktop row */}
                <div className="hidden sm:grid grid-cols-[1fr_100px_120px_80px_90px_80px] gap-2 items-center">
                  {/* Name + status */}
                  <div className="min-w-0 flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: st.color }} />
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold truncate">{project.name}</p>
                      {project.endDate && (
                        <p className="text-[11px] text-[var(--apple-tertiary-label)]">Due {formatDate(project.endDate)}</p>
                      )}
                    </div>
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold flex-shrink-0" style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span>
                  </div>

                  {/* Tasks */}
                  <div className="text-right">
                    <p className="text-[14px] font-semibold font-apple-mono" style={{ color: compColor }}>{compPct.toFixed(0)}%</p>
                    <p className="text-[11px] text-[var(--apple-tertiary-label)]">{project.stats.tasks.completed}/{project.stats.tasks.total}</p>
                  </div>

                  {/* Budget */}
                  <div className="text-right">
                    <p className="text-[14px] font-semibold font-apple-mono" style={{ color: budColor }}>{budPct.toFixed(0)}%</p>
                    <p className="text-[11px] text-[var(--apple-tertiary-label)]">{formatCurrency(project.stats.budget.spent)}</p>
                  </div>

                  {/* Sprints */}
                  <div className="text-right">
                    <p className="text-[14px] font-semibold font-apple-mono" style={{ color: 'var(--apple-chart-color)' }}>{project.stats.sprints.active}</p>
                    <p className="text-[11px] text-[var(--apple-tertiary-label)]">of {project.stats.sprints.total}</p>
                  </div>

                  {/* Hours */}
                  <div className="text-right">
                    <p className="text-[14px] font-semibold font-apple-mono text-[var(--apple-label)]">{project.stats.timeTracking.totalHours.toFixed(0)}h</p>
                    <p className="text-[11px] text-[var(--apple-tertiary-label)]">{project.stats.timeTracking.entries} entries</p>
                  </div>

                  {/* Team */}
                  <div className="text-right">
                    <p className="text-[14px] font-semibold font-apple-mono text-[var(--apple-label)]">{project.teamMembers?.length ?? 0}</p>
                    <p className="text-[11px] text-[var(--apple-tertiary-label)]">members</p>
                  </div>
                </div>

                {/* Mobile card */}
                <div className="sm:hidden space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: st.color }} />
                    <p className="text-[14px] font-semibold">{project.name}</p>
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-[8px] bg-[var(--apple-quaternary-fill)] p-2 text-center">
                      <p className="text-[13px] font-semibold font-apple-mono" style={{ color: compColor }}>{compPct.toFixed(0)}%</p>
                      <p className="text-[10px] text-[var(--apple-tertiary-label)]">Tasks</p>
                    </div>
                    <div className="rounded-[8px] bg-[var(--apple-quaternary-fill)] p-2 text-center">
                      <p className="text-[13px] font-semibold font-apple-mono" style={{ color: budColor }}>{budPct.toFixed(0)}%</p>
                      <p className="text-[10px] text-[var(--apple-tertiary-label)]">Budget</p>
                    </div>
                    <div className="rounded-[8px] bg-[var(--apple-quaternary-fill)] p-2 text-center">
                      <p className="text-[13px] font-semibold font-apple-mono text-[var(--apple-label)]">{project.stats.timeTracking.totalHours.toFixed(0)}h</p>
                      <p className="text-[10px] text-[var(--apple-tertiary-label)]">Logged</p>
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
