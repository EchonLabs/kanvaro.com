'use client'

import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { CheckCircle2, Clock, Users, Zap } from 'lucide-react'
import { useDateTime } from '@/components/providers/DateTimeProvider'

interface Project {
  _id: string; name: string; status: string; startDate: string; endDate?: string
  description?: string; team?: any[]
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

  const avgCompletion = projects.length > 0
    ? projects.reduce((s, p) => s + p.stats.tasks.completionRate, 0) / projects.length
    : 0

  const progressData = projects.map(p => ({
    name: p.name.length > 12 ? p.name.slice(0, 12) + '…' : p.name,
    'Completion %': p.stats.tasks.completionRate,
    'Budget %': p.stats.budget.utilizationRate,
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
          { label: 'Total Projects', value: String(projects.length), sub: 'All tracked projects', color: '#007AFF' },
          { label: 'Avg Completion', value: `${avgCompletion.toFixed(1)}%`, sub: 'Across all projects', color: '#34C759' },
          { label: 'Active Projects', value: String(projects.filter(p => p.status === 'active').length), sub: 'Currently in progress', color: '#FF9500' },
          { label: 'Completed', value: String(projects.filter(p => p.status === 'completed').length), sub: 'Successfully finished', color: '#BF5AF2' },
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
              <defs>
                <linearGradient id="pp-comp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34C759" stopOpacity={0.25} /><stop offset="100%" stopColor="#34C759" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="pp-budget" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF9500" stopOpacity={0.20} /><stop offset="100%" stopColor="#FF9500" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${v}%`} domain={[0,100]} />
              <Tooltip content={<AppleTooltip formatValue={(v: number) => `${v}%`} />} cursor={{ stroke: 'var(--apple-separator)', strokeWidth: 1 }} />
              <Area type="monotone" dataKey="Completion %" stroke="#34C759" strokeWidth={2} fill="url(#pp-comp)" dot={false} activeDot={{ r: 4 }} />
              <Area type="monotone" dataKey="Budget %" stroke="#FF9500" strokeWidth={2} fill="url(#pp-budget)" dot={false} activeDot={{ r: 4 }} />
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
                  <rect key={i} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Bar — tasks completed vs total */}
        <ChartCard title="Task Progress by Project" subtitle="Completed tasks vs total tasks per project">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={taskData} barCategoryGap="30%" barGap={4} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="pp-total" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#007AFF" stopOpacity={0.9} /><stop offset="100%" stopColor="#5AC8FA" stopOpacity={0.7} />
                </linearGradient>
                <linearGradient id="pp-done" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34C759" stopOpacity={0.9} /><stop offset="100%" stopColor="#30D158" stopOpacity={0.7} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={<AppleTooltip />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
              <Bar dataKey="Total" fill="url(#pp-total)" radius={[5,5,0,0]} maxBarSize={28} />
              <Bar dataKey="Completed" fill="url(#pp-done)" radius={[5,5,0,0]} maxBarSize={28} />
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[12px] text-[var(--apple-secondary-label)]">{v}</span>} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Sprint activity */}
        <ChartCard title="Sprint Overview" subtitle="Active and total sprints per project">
          <div className="space-y-3 mt-1">
            {projects.map(p => (
              <div key={p._id} className="flex items-center gap-3">
                <p className="text-[13px] font-medium w-28 truncate flex-shrink-0">{p.name}</p>
                <div className="flex-1 h-1.5 rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${p.stats.sprints.total > 0 ? (p.stats.sprints.active / p.stats.sprints.total) * 100 : 0}%`,
                      background: 'linear-gradient(90deg,#007AFF,#5AC8FA)',
                    }}
                  />
                </div>
                <div className="flex items-center gap-1 text-[12px] font-apple-mono flex-shrink-0">
                  <span className="font-semibold text-[var(--apple-system-blue)]">{p.stats.sprints.active}</span>
                  <span className="text-[var(--apple-tertiary-label)]">/ {p.stats.sprints.total}</span>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* ── Detailed Progress List ── */}
      <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-[var(--apple-separator)]">
          <p className="text-[17px] font-semibold">Project Progress Details</p>
          <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">Detailed progress tracking for each project</p>
        </div>
        <div className="divide-y divide-[var(--apple-separator)]">
          {projects.map(project => {
            const st = getStatus(project.status)
            const compPct = project.stats.tasks.completionRate
            const budPct = Math.min(100, project.stats.budget.utilizationRate)
            const budColor = budPct > 85 ? '#FF453A' : budPct > 65 ? '#FF9F0A' : '#007AFF'
            return (
              <div key={project._id} className="px-5 py-4 apple-transition hover:bg-[var(--apple-quaternary-fill)]">
                <div className="flex items-center gap-2.5 flex-wrap mb-3">
                  <p className="text-[15px] font-semibold">{project.name}</p>
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span>
                  {project.endDate && (
                    <span className="text-[12px] text-[var(--apple-tertiary-label)]">Due {formatDate(project.endDate)}</span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between text-[12px] mb-1">
                      <span className="flex items-center gap-1 text-[var(--apple-secondary-label)]"><CheckCircle2 className="h-3 w-3" />Tasks</span>
                      <span className="font-semibold font-apple-mono" style={{ color: '#34C759' }}>{compPct.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${compPct}%`, backgroundColor: '#34C759' }} />
                    </div>
                    <p className="text-[11px] text-[var(--apple-tertiary-label)] mt-0.5">{project.stats.tasks.completed} of {project.stats.tasks.total} tasks</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[12px] mb-1">
                      <span className="text-[var(--apple-secondary-label)]">Budget</span>
                      <span className="font-semibold font-apple-mono" style={{ color: budColor }}>{budPct.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${budPct}%`, backgroundColor: budColor }} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-2.5 text-[12px] text-[var(--apple-tertiary-label)]">
                  <span className="flex items-center gap-1"><Zap className="h-3 w-3" />{project.stats.sprints.active} active sprint{project.stats.sprints.active !== 1 ? 's' : ''}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{project.stats.timeTracking.totalHours.toFixed(0)}h logged</span>
                  {project.team && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{project.team.length} members</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
