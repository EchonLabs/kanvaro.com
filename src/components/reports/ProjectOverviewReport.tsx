'use client'

import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { CheckCircle2, Clock, Users, ArrowRight } from 'lucide-react'
import { useOrgCurrency } from '@/hooks/useOrgCurrency'
import Link from 'next/link'

interface Project {
  _id: string; name: string; status: string; startDate: string; endDate?: string
  description?: string; budget?: { total: number; spent: number; remaining: number }; team?: any[]
  stats: {
    tasks: { total: number; completed: number; completionRate: number }
    sprints: { total: number; active: number }
    timeTracking: { totalHours: number; entries: number }
    budget: { total: number; spent: number; remaining: number; utilizationRate: number }
  }
}

interface ProjectOverviewReportProps {
  projects: Project[]
  summary: { totalProjects: number; activeProjects: number; completedProjects: number; totalBudget: number; totalSpent: number; averageCompletionRate: number }
  trends: { projectVelocity: number; budgetUtilization: number; teamUtilization: number }
  filters: any
}

const STATUS_PALETTE: Record<string, { color: string; bg: string; label: string }> = {
  active:    { color: '#34C759', bg: 'rgba(52,199,89,0.12)', label: 'Active' },
  completed: { color: '#007AFF', bg: 'rgba(0,122,255,0.12)', label: 'Completed' },
  'on-hold': { color: '#FF9500', bg: 'rgba(255,149,0,0.12)', label: 'On Hold' },
  cancelled: { color: '#FF453A', bg: 'rgba(255,69,58,0.12)', label: 'Cancelled' },
  planning:  { color: '#BF5AF2', bg: 'rgba(191,90,242,0.12)', label: 'Planning' },
  draft:     { color: '#FF9500', bg: 'rgba(255,149,0,0.12)', label: 'Draft' },
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

const PieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const item = payload[0]
  return (
    <div className="rounded-[14px] border border-[var(--apple-separator)] bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.18)] p-3 text-[13px]">
      <div className="flex items-center gap-1.5 mb-1">
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.payload.fill }} />
        <span className="font-semibold text-[var(--apple-label)]">{item.name}</span>
      </div>
      <p className="font-semibold font-apple-mono text-[var(--apple-label)]">{item.value} projects</p>
      <p className="text-[var(--apple-tertiary-label)]">{(item.payload.percent * 100).toFixed(1)}%</p>
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

export function ProjectOverviewReport({ projects, summary, trends, filters }: ProjectOverviewReportProps) {
  const { formatCurrency } = useOrgCurrency()

  const statusData = [
    { name: 'Active', value: summary.activeProjects, fill: '#34C759' },
    { name: 'Completed', value: summary.completedProjects, fill: 'var(--apple-chart-color)' },
    { name: 'On Hold', value: projects.filter(p => p.status === 'on-hold').length, fill: '#FF9500' },
    { name: 'Cancelled', value: projects.filter(p => p.status === 'cancelled').length, fill: '#FF453A' },
  ].filter(d => d.value > 0)

  const budgetData = projects.map(p => ({
    name: p.name.length > 12 ? p.name.slice(0, 12) + '…' : p.name,
    Budget: p.stats.budget.total,
    Spent: p.stats.budget.spent,
  }))

  const completionData = projects.map(p => ({
    name: p.name.length > 12 ? p.name.slice(0, 12) + '…' : p.name,
    'Completion %': p.stats.tasks.completionRate,
  }))

  const hoursData = projects.map(p => ({
    name: p.name.length > 12 ? p.name.slice(0, 12) + '…' : p.name,
    Hours: p.stats.timeTracking.totalHours,
  }))

  return (
    <div className="space-y-6">

      {/* ── Stats Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Active Projects', value: String(summary.activeProjects), sub: `${summary.completedProjects} completed`, color: '#34C759' },
          { label: 'Budget Used', value: `${trends.budgetUtilization.toFixed(1)}%`, sub: `${formatCurrency(summary.totalSpent)} of ${formatCurrency(summary.totalBudget)}`, color: 'var(--apple-chart-color)' },
          { label: 'Avg Completion', value: `${summary.averageCompletionRate.toFixed(1)}%`, sub: 'Across all projects', color: '#FF9500' },
          { label: 'Velocity', value: `${trends.projectVelocity.toFixed(1)}`, sub: 'Projects per month', color: 'var(--apple-chart-color)' },
        ].map(s => (
          <div key={s.label} className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none p-4">
            <p className="apple-section-label text-[var(--apple-secondary-label)] mb-1.5">{s.label}</p>
            <p className="text-[20px] font-bold font-apple-mono tracking-tight" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[12px] text-[var(--apple-tertiary-label)] mt-0.5 truncate">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Donut — status distribution */}
        <ChartCard title="Project Status Distribution" subtitle="Breakdown of projects by status">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={statusData} cx="50%" cy="50%"
                innerRadius={55} outerRadius={90}
                paddingAngle={3} dataKey="value"
                strokeWidth={0} animationBegin={0} animationDuration={800}
              >
                {statusData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip content={<PieTooltip />} />
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[12px] text-[var(--apple-secondary-label)]">{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Bar — budget by project */}
        <ChartCard title="Budget Utilization by Project" subtitle="Budget vs spent across projects">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={budgetData} barCategoryGap="30%" barGap={4} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={50} tickFormatter={v => formatCurrency(v).replace(/\.00$/, '')} />
              <Tooltip content={<AppleTooltip formatValue={formatCurrency} />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
              <Bar dataKey="Budget" fill="var(--apple-chart-color)" radius={[5,5,0,0]} maxBarSize={28} />
              <Bar dataKey="Spent"  fill="#FF9500"                  radius={[5,5,0,0]} maxBarSize={28} />
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[12px] text-[var(--apple-secondary-label)]">{v}</span>} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Bar — completion rate */}
        <ChartCard title="Task Completion Rates" subtitle="Completion percentage by project">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={completionData} barCategoryGap="40%" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${v}%`} domain={[0,100]} />
              <Tooltip content={<AppleTooltip formatValue={(v: number) => `${v}%`} />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
              <Bar dataKey="Completion %" fill="#34C759" radius={[5,5,0,0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Bar — hours logged */}
        <ChartCard title="Time Tracking by Project" subtitle="Hours logged per project">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={hoursData} barCategoryGap="40%" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${v}h`} />
              <Tooltip content={<AppleTooltip formatValue={(v: number) => `${v}h`} />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
              <Bar dataKey="Hours" fill="var(--apple-chart-color)" radius={[5,5,0,0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Projects List ── */}
      <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-[var(--apple-separator)]">
          <p className="text-[17px] font-semibold">Project Details</p>
          <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">Detailed view of all projects</p>
        </div>
        <div className="divide-y divide-[var(--apple-separator)]">
          {projects.map((project) => {
            const st = getStatus(project.status)
            const compPct = project.stats.tasks.completionRate
            const budPct = Math.min(100, project.stats.budget.utilizationRate)
            return (
              <div key={project._id} className="px-5 py-4 apple-transition hover:bg-[var(--apple-quaternary-fill)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <p className="text-[15px] font-semibold truncate">{project.name}</p>
                      <span
                        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold flex-shrink-0"
                        style={{ backgroundColor: st.bg, color: st.color }}
                      >
                        {st.label}
                      </span>
                    </div>
                    {project.description && (
                      <p className="text-[13px] text-[var(--apple-secondary-label)] mt-1 line-clamp-1">{project.description}</p>
                    )}
                    <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                      <div>
                        <div className="flex items-center justify-between text-[12px] mb-1">
                          <div className="flex items-center gap-1 text-[var(--apple-secondary-label)]">
                            <CheckCircle2 className="h-3 w-3" /><span>Tasks</span>
                          </div>
                          <span className="font-semibold font-apple-mono" style={{ color: '#34C759' }}>{compPct.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${compPct}%`, backgroundColor: '#34C759' }} />
                        </div>
                        <p className="text-[11px] text-[var(--apple-tertiary-label)] mt-0.5">{project.stats.tasks.completed}/{project.stats.tasks.total}</p>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-[12px] mb-1">
                          <span className="text-[var(--apple-secondary-label)]">Budget</span>
                          <span className="font-semibold font-apple-mono" style={{ color: budPct > 85 ? '#FF453A' : budPct > 65 ? '#FF9F0A' : 'var(--apple-chart-color)' }}>{budPct.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${budPct}%`, backgroundColor: budPct > 85 ? '#FF453A' : budPct > 65 ? '#FF9F0A' : 'var(--apple-chart-color)' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-[13px] flex-shrink-0">
                    <div className="text-center hidden sm:block">
                      <p className="font-semibold font-apple-mono">{project.stats.timeTracking.totalHours.toFixed(0)}h</p>
                      <p className="text-[11px] text-[var(--apple-tertiary-label)]"><Clock className="inline h-3 w-3 mr-0.5" />logged</p>
                    </div>
                    <div className="text-center hidden sm:block">
                      <p className="font-semibold font-apple-mono">{project.team?.length || 0}</p>
                      <p className="text-[11px] text-[var(--apple-tertiary-label)]"><Users className="inline h-3 w-3 mr-0.5" />members</p>
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
