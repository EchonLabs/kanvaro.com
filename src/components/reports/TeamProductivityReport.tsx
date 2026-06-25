'use client'

import {
  BarChart, Bar, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar'
import { Zap } from 'lucide-react'

interface TeamMember {
  _id: string; firstName: string; lastName: string; email: string
  role: string; department: string; avatar?: string
  stats: {
    tasksCompleted: number; totalTasks: number; completionRate: number
    hoursLogged: number; averageSessionLength: number; productivityScore: number; workloadScore: number
  }
}

interface ProductivityTrend {
  date?: string
  productivity?: number
  workload?: number
  hours?: number
  completionRate?: number
  tasksCompleted?: number
  period?: string
  averageProductivity?: number
  averageCompletionRate?: number
  totalTasksCompleted?: number
  totalHoursLogged?: number
}

interface TeamProductivityReportProps {
  members: TeamMember[]
  productivityTrends: ProductivityTrend[]
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

export function TeamProductivityReport({ members, productivityTrends, filters }: TeamProductivityReportProps) {
  const avgProd = members.length > 0 ? members.reduce((s, m) => s + m.stats.productivityScore, 0) / members.length : 0
  const totalHours = members.reduce((s, m) => s + m.stats.hoursLogged, 0)
  const avgSession = members.length > 0 ? members.reduce((s, m) => s + m.stats.averageSessionLength, 0) / members.length : 0
  const totalTasks = members.reduce((s, m) => s + m.stats.tasksCompleted, 0)

  // Show one label per week on 30-day trend to avoid crowding
  const trendData = productivityTrends.map((t, i) => ({
    period: i % 7 === 0 ? (t.period ?? t.date ?? '').slice(5) : '', // MM-DD only
    fullDate: t.period ?? t.date ?? '',
    'Productivity': t.averageProductivity ?? t.productivity ?? 0,
    'Tasks Done': t.totalTasksCompleted ?? t.tasksCompleted ?? 0,
  }))

  const hoursTrendData = productivityTrends.map((t, i) => ({
    period: i % 7 === 0 ? (t.period ?? t.date ?? '').slice(5) : '',
    fullDate: t.period ?? t.date ?? '',
    'Hours': parseFloat((t.totalHoursLogged ?? t.hours ?? 0).toFixed(2)),
  }))

  const memberData = [...members]
    .sort((a, b) => b.stats.productivityScore - a.stats.productivityScore)
    .map(m => ({
      name: `${m.firstName} ${m.lastName.charAt(0)}.`,
      Productivity: m.stats.productivityScore,
    }))

  const maxH = Math.max(...members.map(m => m.stats.hoursLogged), 1)

  return (
    <div className="space-y-6">

      {/* ── Stats Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Avg Productivity', value: `${avgProd.toFixed(1)}%`, sub: 'Team average', color: '#34C759' },
          { label: 'Total Hours', value: `${totalHours.toFixed(0)}h`, sub: 'All sessions logged', color: 'var(--apple-chart-color)' },
          { label: 'Avg Session', value: `${avgSession.toFixed(1)}h`, sub: 'Per work session', color: '#FF9500' },
          { label: 'Total Tasks', value: String(totalTasks), sub: 'Completed in period', color: 'var(--apple-chart-color)' },
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

        {/* Area — productivity trend (30-day) */}
        <ChartCard title="Productivity Trend" subtitle="Average team productivity over the last 30 days">
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="prod-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34C759" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#34C759" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0]?.payload
                    return (
                      <div className="rounded-[14px] border border-[var(--apple-separator)] bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.18)] p-3 text-[13px] min-w-[148px]">
                        <p className="font-semibold text-[var(--apple-label)] mb-2">{d?.fullDate}</p>
                        {payload.map((item: any, i: number) => (
                          <div key={i} className="flex justify-between gap-4">
                            <span className="text-[var(--apple-secondary-label)]">{item.name}</span>
                            <span className="font-semibold font-apple-mono">{Number(item.value).toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                    )
                  }}
                  cursor={{ stroke: 'var(--apple-separator)', strokeWidth: 1 }}
                />
                <Area type="monotone" dataKey="Productivity" stroke="#34C759" strokeWidth={2} fill="url(#prod-area)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex items-center justify-center">
              <p className="text-[13px] text-[var(--apple-secondary-label)]">No trend data available</p>
            </div>
          )}
        </ChartCard>

        {/* Area — hours logged trend (30-day) */}
        <ChartCard title="Hours Logged Over Time" subtitle="Total team hours logged over the last 30 days">
          {hoursTrendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={hoursTrendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="hours-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--apple-chart-color)" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="var(--apple-chart-color)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${v}h`} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0]?.payload
                    return (
                      <div className="rounded-[14px] border border-[var(--apple-separator)] bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.18)] p-3 text-[13px] min-w-[148px]">
                        <p className="font-semibold text-[var(--apple-label)] mb-2">{d?.fullDate}</p>
                        {payload.map((item: any, i: number) => (
                          <div key={i} className="flex justify-between gap-4">
                            <span className="text-[var(--apple-secondary-label)]">{item.name}</span>
                            <span className="font-semibold font-apple-mono">{Number(item.value).toFixed(1)}h</span>
                          </div>
                        ))}
                      </div>
                    )
                  }}
                  cursor={{ stroke: 'var(--apple-separator)', strokeWidth: 1 }}
                />
                <Area type="monotone" dataKey="Hours" stroke="var(--apple-chart-color)" strokeWidth={2} fill="url(#hours-area)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex items-center justify-center">
              <p className="text-[13px] text-[var(--apple-secondary-label)]">No data available</p>
            </div>
          )}
        </ChartCard>

        {/* Horizontal bar — member productivity (all, scrollable) */}
        <ChartCard title="Member Productivity Ranking" subtitle="Productivity score per member">
          {memberData.length > 0 ? (
            <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
              <div style={{ height: Math.max(240, memberData.length * 28) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={memberData} layout="vertical" barCategoryGap="28%" margin={{ top: 4, right: 16, left: 44, bottom: 0 }}>
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={44} />
                    <Tooltip content={<AppleTooltip formatValue={(v: number) => `${v.toFixed(1)}%`} />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
                    <Bar dataKey="Productivity" fill="#34C759" radius={[0, 5, 5, 0]} maxBarSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="h-[240px] flex items-center justify-center">
              <p className="text-[13px] text-[var(--apple-secondary-label)]">No member data available</p>
            </div>
          )}
        </ChartCard>

        {/* Hours per member inline bars */}
        <ChartCard title="Hours Logged per Member" subtitle="Individual time contribution this period">
          <div className="space-y-3 mt-1 max-h-[240px] overflow-y-auto pr-1">
            {[...members].sort((a, b) => b.stats.hoursLogged - a.stats.hoursLogged).map((m, i) => {
              const pct = (m.stats.hoursLogged / maxH) * 100
              return (
                <div key={m._id} className="flex items-center gap-3">
                  <Avatar className="h-6 w-6 flex-shrink-0">
                    <AvatarImage src={m.avatar} />
                    <AvatarFallback className="text-[9px] font-semibold bg-gradient-to-br from-blue-500 to-purple-500 text-white">
                      {m.firstName.charAt(0)}{m.lastName.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <p className="text-[12px] font-medium w-24 truncate flex-shrink-0">{m.firstName} {m.lastName.charAt(0)}.</p>
                  <div className="flex-1 h-1.5 rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, backgroundColor: 'var(--apple-chart-color)' }}
                    />
                  </div>
                  <span className="text-[12px] font-semibold font-apple-mono text-[var(--apple-secondary-label)] w-12 text-right flex-shrink-0">
                    {m.stats.hoursLogged.toFixed(0)}h
                  </span>
                </div>
              )
            })}
          </div>
        </ChartCard>
      </div>

      {/* ── Productivity Breakdown ── */}
      <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-[var(--apple-separator)]">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-[#FF9500]" />
            <p className="text-[17px] font-semibold">Productivity Breakdown</p>
          </div>
          <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">Score, hours, and session stats per member</p>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {[...members].sort((a, b) => b.stats.productivityScore - a.stats.productivityScore).map((m) => {
              const prodColor = m.stats.productivityScore >= 75 ? '#34C759' : m.stats.productivityScore >= 50 ? '#FF9500' : '#FF453A'
              const prodBg = m.stats.productivityScore >= 75 ? 'rgba(52,199,89,0.10)' : m.stats.productivityScore >= 50 ? 'rgba(255,149,0,0.10)' : 'rgba(255,69,58,0.10)'
              return (
                <div key={m._id} className="rounded-[var(--apple-radius)] border border-[var(--apple-separator)] p-4 flex flex-col gap-3 apple-transition hover:bg-[var(--apple-quaternary-fill)]">
                  {/* Header */}
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9 flex-shrink-0">
                      <AvatarImage src={m.avatar} />
                      <AvatarFallback className="text-[12px] font-semibold bg-gradient-to-br from-blue-500 to-purple-500 text-white">
                        {m.firstName.charAt(0)}{m.lastName.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold truncate">{m.firstName} {m.lastName}</p>
                      <p className="text-[11px] text-[var(--apple-secondary-label)] truncate">{m.role}</p>
                    </div>
                    <div className="flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold font-apple-mono" style={{ backgroundColor: prodBg, color: prodColor }}>
                      {m.stats.productivityScore.toFixed(0)}%
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="h-1.5 rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${m.stats.productivityScore}%`, backgroundColor: prodColor }} />
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2 pt-0.5">
                    {[
                      { label: 'Hours', value: `${m.stats.hoursLogged.toFixed(0)}h` },
                      { label: 'Session', value: `${m.stats.averageSessionLength.toFixed(1)}h` },
                      { label: 'Tasks', value: String(m.stats.tasksCompleted) },
                    ].map(s => (
                      <div key={s.label} className="text-center">
                        <p className="text-[12px] font-semibold font-apple-mono text-[var(--apple-label)]">{s.value}</p>
                        <p className="text-[10px] text-[var(--apple-tertiary-label)]">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
