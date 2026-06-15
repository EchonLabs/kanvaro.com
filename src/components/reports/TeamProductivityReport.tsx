'use client'

import {
  BarChart, Bar, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar'
import { Zap, Clock } from 'lucide-react'

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

const APPLE_COLORS = ['var(--apple-chart-color)','#34C759','#FF9500','#BF5AF2','#FF453A','#30B0C7','#FF375F','#FFD60A']

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

  const trendData = productivityTrends.map(t => ({
    period: t.period ?? t.date ?? '',
    'Productivity': t.averageProductivity ?? t.productivity ?? 0,
    'Tasks/Period': t.totalTasksCompleted ?? 0,
  }))

  const hoursTrendData = productivityTrends.map(t => ({
    period: t.period ?? t.date ?? '',
    'Hours': t.totalHoursLogged ?? t.hours ?? 0,
  }))

  const memberData = [...members]
    .sort((a, b) => b.stats.productivityScore - a.stats.productivityScore)
    .slice(0, 10)
    .map((m, i) => ({
      name: `${m.firstName} ${m.lastName.charAt(0)}.`,
      Productivity: m.stats.productivityScore,
      Hours: m.stats.hoursLogged,
      fill: APPLE_COLORS[i % APPLE_COLORS.length],
    }))

  const maxProd = Math.max(...members.map(m => m.stats.productivityScore), 1)

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

        {/* Line — productivity trend */}
        <ChartCard title="Productivity Trend" subtitle="Average team productivity over time">
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="pct" tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                <YAxis yAxisId="tasks" orientation="right" tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={28} />
                <Tooltip content={<AppleTooltip />} cursor={{ stroke: 'var(--apple-separator)', strokeWidth: 1 }} />
                <Line yAxisId="pct" type="monotone" dataKey="Productivity" stroke="#34C759" strokeWidth={2.5} dot={{ r: 3, fill: '#34C759' }} activeDot={{ r: 5 }} />
                <Line yAxisId="tasks" type="monotone" dataKey="Tasks/Period" stroke="var(--apple-chart-color)" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} strokeDasharray="5 3" />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[12px] text-[var(--apple-secondary-label)]">{v}</span>} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex items-center justify-center">
              <p className="text-[13px] text-[var(--apple-secondary-label)]">No trend data available</p>
            </div>
          )}
        </ChartCard>

        {/* Area — hours logged trend */}
        <ChartCard title="Hours Logged Over Time" subtitle="Total team hours per period">
          {hoursTrendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={hoursTrendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${v}h`} />
                <Tooltip content={<AppleTooltip formatValue={(v: number) => `${v}h`} />} cursor={{ stroke: 'var(--apple-separator)', strokeWidth: 1 }} />
                <Area type="monotone" dataKey="Hours" stroke="var(--apple-chart-color)" strokeWidth={2} fill="var(--apple-chart-color)" fillOpacity={0.12} dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex items-center justify-center">
              <p className="text-[13px] text-[var(--apple-secondary-label)]">No data available</p>
            </div>
          )}
        </ChartCard>

        {/* Bar — member productivity comparison */}
        <ChartCard title="Member Productivity" subtitle="Productivity score per team member (top 10)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={memberData} barCategoryGap="35%" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${v}%`} domain={[0, 100]} />
              <Tooltip content={<AppleTooltip formatValue={(v: number) => `${v.toFixed(1)}%`} />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
              <Bar dataKey="Productivity" fill="#34C759" radius={[5, 5, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Hours per member inline bars */}
        <ChartCard title="Hours Logged per Member" subtitle="Individual time contribution">
          <div className="space-y-3 mt-1 max-h-[240px] overflow-y-auto pr-1">
            {[...members].sort((a, b) => b.stats.hoursLogged - a.stats.hoursLogged).map((m, i) => {
              const maxH = Math.max(...members.map(x => x.stats.hoursLogged), 1)
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
                      style={{ width: `${pct}%`, backgroundColor: APPLE_COLORS[i % APPLE_COLORS.length] }}
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

      {/* ── Member Productivity Cards ── */}
      <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-[var(--apple-separator)]">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-[#FF9500]" />
            <p className="text-[17px] font-semibold">Productivity Breakdown</p>
          </div>
          <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">Score, hours, and session length per member</p>
        </div>
        <div className="divide-y divide-[var(--apple-separator)]">
          {[...members].sort((a, b) => b.stats.productivityScore - a.stats.productivityScore).map(m => {
            const prodColor = m.stats.productivityScore >= 75 ? '#34C759' : m.stats.productivityScore >= 50 ? '#FF9500' : '#FF453A'
            return (
              <div key={m._id} className="px-5 py-4 flex items-center gap-4 apple-transition hover:bg-[var(--apple-quaternary-fill)]">
                <Avatar className="h-9 w-9 flex-shrink-0">
                  <AvatarImage src={m.avatar} />
                  <AvatarFallback className="text-[12px] font-semibold bg-gradient-to-br from-blue-500 to-purple-500 text-white">
                    {m.firstName.charAt(0)}{m.lastName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold truncate">{m.firstName} {m.lastName}</p>
                  <p className="text-[11px] text-[var(--apple-secondary-label)] truncate">{m.role}</p>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between text-[11px] mb-0.5">
                      <span className="text-[var(--apple-secondary-label)]">Productivity</span>
                      <span className="font-semibold font-apple-mono" style={{ color: prodColor }}>{m.stats.productivityScore.toFixed(0)}%</span>
                    </div>
                    <div className="h-1 rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${m.stats.productivityScore}%`, backgroundColor: prodColor }} />
                    </div>
                  </div>
                </div>
                <div className="hidden sm:flex flex-col items-end gap-1 flex-shrink-0">
                  <div className="flex items-center gap-1 text-[12px]">
                    <Clock className="h-3 w-3 text-[var(--apple-tertiary-label)]" />
                    <span className="font-semibold font-apple-mono">{m.stats.hoursLogged.toFixed(0)}h</span>
                    <span className="text-[var(--apple-tertiary-label)]">total</span>
                  </div>
                  <div className="text-[11px] text-[var(--apple-tertiary-label)]">
                    ~{m.stats.averageSessionLength.toFixed(1)}h/session
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
