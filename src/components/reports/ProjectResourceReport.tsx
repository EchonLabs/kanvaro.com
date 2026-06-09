'use client'

import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useOrgCurrency } from '@/hooks/useOrgCurrency'
import { Users, Clock, DollarSign } from 'lucide-react'

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

interface ProjectResourceReportProps { projects: Project[]; filters: any }

const APPLE_COLORS = ['#007AFF','#34C759','#FF9500','#BF5AF2','#FF453A','#30B0C7','#FF375F','#FFD60A']

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

const PieTooltip = ({ active, payload, formatValue }: any) => {
  if (!active || !payload?.length) return null
  const item = payload[0]
  return (
    <div className="rounded-[14px] border border-[var(--apple-separator)] bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.18)] p-3 text-[13px]">
      <div className="flex items-center gap-1.5 mb-1">
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.payload.fill }} />
        <span className="font-semibold text-[var(--apple-label)]">{item.name}</span>
      </div>
      <p className="font-semibold font-apple-mono">{formatValue ? formatValue(item.value) : item.value}</p>
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

export function ProjectResourceReport({ projects, filters }: ProjectResourceReportProps) {
  const { formatCurrency } = useOrgCurrency()

  const totalTeamSize = projects.reduce((s, p) => s + (p.team?.length || 0), 0)
  const totalHours = projects.reduce((s, p) => s + p.stats.timeTracking.totalHours, 0)
  const totalBudget = projects.reduce((s, p) => s + p.stats.budget.total, 0)
  const totalSpent = projects.reduce((s, p) => s + p.stats.budget.spent, 0)

  const teamData = projects.map((p, i) => ({
    name: p.name.length > 12 ? p.name.slice(0, 12) + '…' : p.name,
    Members: p.team?.length || 0,
    fill: APPLE_COLORS[i % APPLE_COLORS.length],
  }))

  const hoursData = projects.map((p, i) => ({
    name: p.name.length > 12 ? p.name.slice(0, 12) + '…' : p.name,
    Hours: p.stats.timeTracking.totalHours,
  }))

  const budgetPieData = projects.map((p, i) => ({
    name: p.name.length > 16 ? p.name.slice(0, 16) + '…' : p.name,
    value: p.stats.budget.total,
    fill: APPLE_COLORS[i % APPLE_COLORS.length],
    percent: 0,
  }))

  return (
    <div className="space-y-6">

      {/* ── Stats Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Team Size', value: String(totalTeamSize), sub: 'Across all projects', color: '#007AFF', icon: Users },
          { label: 'Total Hours', value: `${totalHours.toFixed(0)}h`, sub: 'Time logged', color: '#BF5AF2', icon: Clock },
          { label: 'Total Budget', value: formatCurrency(totalBudget), sub: 'Combined allocation', color: '#34C759', icon: DollarSign },
          { label: 'Total Spent', value: formatCurrency(totalSpent), sub: `${totalBudget > 0 ? ((totalSpent/totalBudget)*100).toFixed(1) : 0}% utilized`, color: '#FF9500', icon: DollarSign },
        ].map(s => (
          <div key={s.label} className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none p-4">
            <p className="apple-section-label text-[var(--apple-secondary-label)] mb-1.5">{s.label}</p>
            <p className="text-[20px] font-bold font-apple-mono tracking-tight" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[12px] text-[var(--apple-tertiary-label)] mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Donut — budget distribution */}
        <ChartCard title="Budget Distribution" subtitle="Budget allocation across projects">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={budgetPieData} cx="50%" cy="50%"
                innerRadius={55} outerRadius={90}
                paddingAngle={3} dataKey="value"
                strokeWidth={0} animationBegin={0} animationDuration={800}
              >
                {budgetPieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip content={<PieTooltip formatValue={formatCurrency} />} />
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[12px] text-[var(--apple-secondary-label)]">{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Bar — hours by project */}
        <ChartCard title="Hours Logged by Project" subtitle="Time investment across projects">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={hoursData} barCategoryGap="40%" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="res-hours" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#BF5AF2" stopOpacity={0.9} /><stop offset="100%" stopColor="#FF375F" stopOpacity={0.7} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={40} tickFormatter={v => `${v}h`} />
              <Tooltip content={<AppleTooltip formatValue={(v: number) => `${v}h`} />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
              <Bar dataKey="Hours" fill="url(#res-hours)" radius={[5,5,0,0]} maxBarSize={44} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Bar — team size */}
        <ChartCard title="Team Size by Project" subtitle="Number of team members per project">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={teamData} barCategoryGap="40%" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="res-team" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#007AFF" stopOpacity={0.9} /><stop offset="100%" stopColor="#5AC8FA" stopOpacity={0.7} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={24} allowDecimals={false} />
              <Tooltip content={<AppleTooltip formatValue={(v: number) => `${v} members`} />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
              <Bar dataKey="Members" fill="url(#res-team)" radius={[5,5,0,0]} maxBarSize={44} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Resource efficiency */}
        <ChartCard title="Resource Efficiency" subtitle="Hours per team member per project">
          <div className="space-y-3 mt-1">
            {projects.map((p, i) => {
              const members = p.team?.length || 0
              const hpm = members > 0 ? p.stats.timeTracking.totalHours / members : p.stats.timeTracking.totalHours
              const maxHpm = Math.max(...projects.map(pr => {
                const m = pr.team?.length || 0
                return m > 0 ? pr.stats.timeTracking.totalHours / m : pr.stats.timeTracking.totalHours
              }))
              const pct = maxHpm > 0 ? (hpm / maxHpm) * 100 : 0
              return (
                <div key={p._id} className="space-y-1">
                  <div className="flex items-center justify-between text-[13px]">
                    <p className="font-medium truncate w-36">{p.name}</p>
                    <span className="font-semibold font-apple-mono text-[var(--apple-secondary-label)]">{hpm.toFixed(1)}h/member</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: APPLE_COLORS[i % APPLE_COLORS.length] }} />
                  </div>
                </div>
              )
            })}
          </div>
        </ChartCard>
      </div>

      {/* ── Per-project resource summary ── */}
      <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-[var(--apple-separator)]">
          <p className="text-[17px] font-semibold">Resource Summary</p>
          <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">Team, time, and budget per project</p>
        </div>
        <div className="divide-y divide-[var(--apple-separator)]">
          {projects.map((p, i) => (
            <div key={p._id} className="px-5 py-4 flex items-center gap-4 apple-transition hover:bg-[var(--apple-quaternary-fill)]">
              <div className="flex h-9 w-9 items-center justify-center rounded-[var(--apple-radius-sm)] flex-shrink-0" style={{ backgroundColor: `${APPLE_COLORS[i % APPLE_COLORS.length]}22` }}>
                <Users className="h-4 w-4" style={{ color: APPLE_COLORS[i % APPLE_COLORS.length] }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold truncate">{p.name}</p>
                <div className="flex items-center gap-3 mt-0.5 text-[12px] text-[var(--apple-tertiary-label)]">
                  <span className="flex items-center gap-0.5"><Users className="h-3 w-3" />{p.team?.length || 0} members</span>
                  <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{p.stats.timeTracking.totalHours.toFixed(0)}h</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[15px] font-bold font-apple-mono">{formatCurrency(p.stats.budget.total)}</p>
                <p className="text-[12px] text-[var(--apple-tertiary-label)]">{p.stats.budget.utilizationRate.toFixed(0)}% used</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
