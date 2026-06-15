'use client'

import {
  BarChart, Bar, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar'
import { Star } from 'lucide-react'

interface TeamMember {
  _id: string; firstName: string; lastName: string; email: string
  role: string; department: string; avatar?: string
  stats: {
    tasksCompleted: number; totalTasks: number; completionRate: number
    hoursLogged: number; averageSessionLength: number; productivityScore: number; workloadScore: number
  }
}

interface PerformanceTrend {
  // API shape
  date?: string
  productivity?: number
  workload?: number
  hours?: number
  // alt shape
  period?: string
  averageProductivity?: number
  averageCompletionRate?: number
  totalTasksCompleted?: number
  totalHoursLogged?: number
}

interface TeamPerformanceReportProps {
  members: TeamMember[]
  performanceTrends?: PerformanceTrend[]
  productivityTrends?: PerformanceTrend[]
  filters: any
}

const AppleTooltip = ({ active, payload, label, formatValue }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-[14px] border border-[var(--apple-separator)] bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.18)] p-3 text-[13px] min-w-[148px]">
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

const PERF_TIERS = [
  { min: 90, label: 'Outstanding', color: '#007AFF', bg: 'rgba(0,122,255,0.12)' },
  { min: 75, label: 'Excellent',   color: '#34C759', bg: 'rgba(52,199,89,0.12)' },
  { min: 60, label: 'Good',        color: '#FF9500', bg: 'rgba(255,149,0,0.12)' },
  { min: 0,  label: 'Needs Work',  color: '#FF453A', bg: 'rgba(255,69,58,0.12)' },
]
const getTier = (score: number) => PERF_TIERS.find(t => score >= t.min) ?? PERF_TIERS[3]

export function TeamPerformanceReport({ members, performanceTrends, productivityTrends, filters }: TeamPerformanceReportProps) {
  const resolvedTrends = performanceTrends ?? productivityTrends ?? []
  const avgScore = members.length > 0 ? members.reduce((s, m) => s + m.stats.productivityScore, 0) / members.length : 0
  const avgCompletion = members.length > 0 ? members.reduce((s, m) => s + m.stats.completionRate, 0) / members.length : 0
  const topCount = members.filter(m => m.stats.productivityScore >= 75).length
  const totalTasks = members.reduce((s, m) => s + m.stats.tasksCompleted, 0)

  const memberBarData = [...members]
    .sort((a, b) => b.stats.productivityScore - a.stats.productivityScore)
    .slice(0, 10)
    .map(m => ({
      name: `${m.firstName} ${m.lastName.charAt(0)}.`,
      Score: m.stats.productivityScore,
      Completion: m.stats.completionRate,
    }))

  const trendData = resolvedTrends.map(t => ({
    period: t.period ?? t.date ?? '',
    'Productivity': t.averageProductivity ?? t.productivity ?? 0,
    'Completion Rate': t.averageCompletionRate ?? 0,
  }))

  const tasksData = resolvedTrends.map(t => ({
    period: t.period ?? t.date ?? '',
    'Tasks Done': t.totalTasksCompleted ?? 0,
    'Hours': t.totalHoursLogged ?? t.hours ?? 0,
  }))

  return (
    <div className="space-y-6">

      {/* ── Stats Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Avg Score', value: `${avgScore.toFixed(1)}%`, sub: 'Team productivity', color: 'var(--apple-chart-color)' },
          { label: 'Avg Completion', value: `${avgCompletion.toFixed(1)}%`, sub: 'Task completion rate', color: '#34C759' },
          { label: 'High Performers', value: String(topCount), sub: 'Score ≥ 75%', color: '#FF9500' },
          { label: 'Tasks Completed', value: String(totalTasks), sub: 'Total by team', color: 'var(--apple-chart-color)' },
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

        {/* Area — performance trends */}
        <ChartCard title="Performance Trends" subtitle="Productivity and completion rate over time">
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="tp-comp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34C759" stopOpacity={0.20} /><stop offset="100%" stopColor="#34C759" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                <Tooltip content={<AppleTooltip formatValue={(v: number) => `${v.toFixed(1)}%`} />} cursor={{ stroke: 'var(--apple-separator)', strokeWidth: 1 }} />
                <Area type="monotone" dataKey="Productivity" stroke="var(--apple-chart-color)" strokeWidth={2} fill="var(--apple-chart-color)" fillOpacity={0.12} dot={false} activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="Completion Rate" stroke="#34C759" strokeWidth={2} fill="url(#tp-comp)" dot={false} activeDot={{ r: 4 }} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[12px] text-[var(--apple-secondary-label)]">{v}</span>} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex items-center justify-center">
              <p className="text-[13px] text-[var(--apple-secondary-label)]">No trend data available</p>
            </div>
          )}
        </ChartCard>

        {/* Horizontal bar — top members by score */}
        <ChartCard title="Member Performance Ranking" subtitle="Top 10 members by productivity score">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={memberBarData} layout="vertical" barCategoryGap="30%" margin={{ top: 4, right: 8, left: 40, bottom: 0 }}>
              <defs>
                <linearGradient id="tp-compl" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#34C759" stopOpacity={0.9} /><stop offset="100%" stopColor="#30D158" stopOpacity={0.8} />
                </linearGradient>
              </defs>
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip content={<AppleTooltip formatValue={(v: number) => `${v.toFixed(1)}%`} />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
              <Bar dataKey="Score" fill="var(--apple-chart-color)" radius={[0, 5, 5, 0]} maxBarSize={10} />
              <Bar dataKey="Completion" fill="url(#tp-compl)" radius={[0, 5, 5, 0]} maxBarSize={10} />
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[12px] text-[var(--apple-secondary-label)]">{v}</span>} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Line — tasks + hours over time */}
        <ChartCard title="Team Output Over Time" subtitle="Tasks completed and hours logged by period">
          {tasksData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={tasksData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="tasks" tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={28} />
                <YAxis yAxisId="hours" orientation="right" tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${v}h`} />
                <Tooltip content={<AppleTooltip />} cursor={{ stroke: 'var(--apple-separator)', strokeWidth: 1 }} />
                <Line yAxisId="tasks" type="monotone" dataKey="Tasks Done" stroke="#FF9500" strokeWidth={2.5} dot={{ r: 3, fill: '#FF9500' }} activeDot={{ r: 5 }} />
                <Line yAxisId="hours" type="monotone" dataKey="Hours" stroke="#BF5AF2" strokeWidth={2.5} dot={{ r: 3, fill: '#BF5AF2' }} activeDot={{ r: 5 }} strokeDasharray="5 3" />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[12px] text-[var(--apple-secondary-label)]">{v}</span>} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex items-center justify-center">
              <p className="text-[13px] text-[var(--apple-secondary-label)]">No data available</p>
            </div>
          )}
        </ChartCard>

        {/* Performance tier distribution */}
        <ChartCard title="Performance Tier Distribution" subtitle="Members grouped by tier">
          <div className="space-y-4 mt-1">
            {PERF_TIERS.map((tier, idx) => {
              const prevMin = idx === 0 ? Infinity : PERF_TIERS[idx - 1].min
              const count = members.filter(m => m.stats.productivityScore >= tier.min && m.stats.productivityScore < prevMin).length
              const pct = members.length > 0 ? (count / members.length) * 100 : 0
              return (
                <div key={tier.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: tier.bg, color: tier.color }}>{tier.label}</span>
                    <div className="flex items-center gap-2 font-apple-mono">
                      <span className="font-semibold text-[var(--apple-label)]">{count} members</span>
                      <span className="text-[var(--apple-tertiary-label)]">{pct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: tier.color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </ChartCard>
      </div>

      {/* ── Individual Performance Table ── */}
      <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-[var(--apple-separator)]">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-[#FF9500]" />
            <p className="text-[17px] font-semibold">Individual Performance</p>
          </div>
          <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">All team members ranked by performance score</p>
        </div>
        <div className="divide-y divide-[var(--apple-separator)]">
          {[...members].sort((a, b) => b.stats.productivityScore - a.stats.productivityScore).map((m, i) => {
            const tier = getTier(m.stats.productivityScore)
            return (
              <div key={m._id} className="px-5 py-3.5 flex items-center gap-4 apple-transition hover:bg-[var(--apple-quaternary-fill)]">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--apple-tertiary-fill)] text-[12px] font-bold text-[var(--apple-secondary-label)] flex-shrink-0">
                  {i + 1}
                </div>
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarImage src={m.avatar} />
                  <AvatarFallback className="text-[11px] font-semibold bg-gradient-to-br from-blue-500 to-purple-500 text-white">
                    {m.firstName.charAt(0)}{m.lastName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[14px] font-semibold truncate">{m.firstName} {m.lastName}</p>
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold flex-shrink-0" style={{ backgroundColor: tier.bg, color: tier.color }}>{tier.label}</span>
                  </div>
                  <p className="text-[11px] text-[var(--apple-secondary-label)] truncate">{m.role} · {m.department}</p>
                </div>
                <div className="hidden sm:grid grid-cols-4 gap-4 text-center text-[12px] flex-shrink-0">
                  {[
                    { val: `${m.stats.productivityScore.toFixed(0)}%`, lbl: 'Score', c: tier.color },
                    { val: `${m.stats.completionRate.toFixed(0)}%`, lbl: 'Done', c: '#34C759' },
                    { val: String(m.stats.tasksCompleted), lbl: 'Tasks', c: 'var(--apple-label)' },
                    { val: `${m.stats.hoursLogged.toFixed(0)}h`, lbl: 'Hours', c: 'var(--apple-label)' },
                  ].map(s => (
                    <div key={s.lbl}>
                      <p className="font-semibold font-apple-mono" style={{ color: s.c }}>{s.val}</p>
                      <p className="text-[11px] text-[var(--apple-tertiary-label)]">{s.lbl}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
