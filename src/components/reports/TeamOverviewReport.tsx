'use client'

import {
  ScatterChart, Scatter, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar'
import { Award } from 'lucide-react'

interface TeamMember {
  _id: string; firstName: string; lastName: string; email: string
  role: string; department: string; avatar?: string
  stats: {
    tasksCompleted: number; totalTasks: number; completionRate: number
    hoursLogged: number; averageSessionLength: number; productivityScore: number; workloadScore: number
  }
}

interface TeamOverviewReportProps {
  overview: {
    totalMembers: number; activeMembers: number; averageProductivity: number
    averageWorkload: number; totalHoursLogged: number; totalTasksCompleted: number; totalTasks?: number
  }
  departmentBreakdown: {
    department: string; members: number; averageProductivity: number; averageWorkload: number
  }[]
  topPerformers: TeamMember[]
  filters: any
  members?: TeamMember[]
}

const APPLE_COLORS = ['var(--apple-chart-color)', '#34C759', '#FF9500', '#BF5AF2', '#FF453A', '#30B0C7']

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

const ScatterTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="rounded-[14px] border border-[var(--apple-separator)] bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.18)] p-3 text-[13px] min-w-[160px]">
      <p className="font-semibold text-[var(--apple-label)] mb-2">{d.name}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-[var(--apple-secondary-label)]">Productivity</span>
          <span className="font-semibold font-apple-mono">{d.x.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[var(--apple-secondary-label)]">Completion</span>
          <span className="font-semibold font-apple-mono">{d.y.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[var(--apple-secondary-label)]">Hours</span>
          <span className="font-semibold font-apple-mono">{d.z.toFixed(0)}h</span>
        </div>
      </div>
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

export function TeamOverviewReport({ overview, departmentBreakdown, topPerformers, filters, members = [] }: TeamOverviewReportProps) {
  // Use topPerformers as fallback if members not passed (backward compat)
  const allMembers = members.length > 0 ? members : topPerformers

  // Chart 1: Scatter — Productivity vs Completion Rate (bubble size = hours logged)
  const scatterData = allMembers.map(m => ({
    name: `${m.firstName} ${m.lastName}`,
    x: m.stats.productivityScore,
    y: m.stats.completionRate,
    z: Math.max(m.stats.hoursLogged, 1),
  }))

  // Chart 2: Donut — use deduplicated overview counts to avoid double-counting shared tasks
  const totalDone = overview.totalTasksCompleted
  const totalTasksAll = overview.totalTasks ?? (totalDone + allMembers.reduce((s, m) => s + Math.max(0, m.stats.totalTasks - m.stats.tasksCompleted), 0))
  const totalActive = Math.max(0, totalTasksAll - totalDone)
  const taskStatusData = [
    { name: 'Completed', value: totalDone,   fill: '#34C759' },
    { name: 'Remaining', value: totalActive, fill: 'var(--apple-chart-color)' },
  ].filter(d => d.value > 0)

  // Chart 3: Bar — Top 6 performers vs team avg (productivity + completion side-by-side)
  const avgProd = overview.averageProductivity
  const avgComp = allMembers.length > 0
    ? allMembers.reduce((s, m) => s + m.stats.completionRate, 0) / allMembers.length : 0
  const topBarData = [
    { name: 'Team Avg', Productivity: avgProd, Completion: avgComp, isAvg: true },
    ...[...allMembers]
      .sort((a, b) => b.stats.productivityScore - a.stats.productivityScore)
      .slice(0, 6)
      .map(m => ({
        name: `${m.firstName} ${m.lastName.charAt(0)}.`,
        Productivity: m.stats.productivityScore,
        Completion: m.stats.completionRate,
        isAvg: false,
      })),
  ]

  // Chart 4: Horizontal bar — all members hours logged (engagement view)
  const hoursBarData = [...allMembers]
    .sort((a, b) => b.stats.hoursLogged - a.stats.hoursLogged)
    .slice(0, 10)
    .map(m => ({
      name: `${m.firstName} ${m.lastName.charAt(0)}.`,
      Hours: parseFloat(m.stats.hoursLogged.toFixed(1)),
    }))
  const avgHours = allMembers.length > 0
    ? allMembers.reduce((s, m) => s + m.stats.hoursLogged, 0) / allMembers.length : 0

  const completionPct = (totalDone + totalActive) > 0
    ? (totalDone / (totalDone + totalActive)) * 100 : 0

  return (
    <div className="space-y-6">

      {/* ── Stats Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Team Size',        value: String(overview.totalMembers),                 sub: `${overview.activeMembers} active`,    color: 'var(--apple-chart-color)' },
          { label: 'Avg Productivity', value: `${overview.averageProductivity.toFixed(1)}%`, sub: 'Team productivity score',              color: '#34C759' },
          { label: 'Total Hours',      value: `${overview.totalHoursLogged.toFixed(0)}h`,    sub: 'Logged by team',                      color: 'var(--apple-chart-color)' },
          { label: 'Tasks Done',       value: String(totalDone),                             sub: `${completionPct.toFixed(0)}% completion rate`, color: '#FF9500' },
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

        {/* Chart 1: Scatter — Productivity vs Completion Rate */}
        <ChartCard title="Productivity vs Completion Rate" subtitle="Each dot is a team member — size reflects hours logged">
          {scatterData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <ScatterChart margin={{ top: 12, right: 20, left: 0, bottom: 20 }}>
                <XAxis
                  type="number" dataKey="x" name="Productivity" domain={[0, 100]}
                  tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${v}%`}
                  label={{ value: 'Productivity →', position: 'insideBottomRight', offset: 0, fontSize: 10, fill: 'var(--apple-tertiary-label)' }}
                />
                <YAxis
                  type="number" dataKey="y" name="Completion" domain={[0, 100]}
                  tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${v}%`} width={36}
                />
                <ZAxis type="number" dataKey="z" range={[40, 200]} name="Hours" />
                <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                <ReferenceLine x={avgProd} stroke="var(--apple-separator)" strokeDasharray="4 3" />
                <ReferenceLine y={avgComp} stroke="var(--apple-separator)" strokeDasharray="4 3" />
                <Scatter data={scatterData} fill="var(--apple-chart-color)" fillOpacity={0.85} />
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex items-center justify-center">
              <p className="text-[13px] text-[var(--apple-secondary-label)]">No member data available</p>
            </div>
          )}
        </ChartCard>

        {/* Chart 2: Donut — Task completion status */}
        <ChartCard title="Task Completion Status" subtitle="Overall completed vs remaining tasks across the team">
          {taskStatusData.length > 0 ? (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="55%" height={240}>
                <PieChart>
                  <Pie
                    data={taskStatusData} cx="50%" cy="50%"
                    innerRadius={60} outerRadius={90}
                    paddingAngle={3} dataKey="value"
                    strokeWidth={0} animationBegin={0} animationDuration={800}
                  >
                    {taskStatusData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const item = payload[0]
                    return (
                      <div className="rounded-[14px] border border-[var(--apple-separator)] bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.18)] p-3 text-[13px]">
                        <div className="flex items-center gap-1.5 mb-1">
                          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.payload.fill }} />
                          <span className="font-semibold">{item.name}</span>
                        </div>
                        <p className="font-semibold font-apple-mono">{item.value} tasks</p>
                      </div>
                    )
                  }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-4">
                {taskStatusData.map(d => {
                  const total = totalDone + totalActive
                  const pct = total > 0 ? (d.value / total) * 100 : 0
                  return (
                    <div key={d.name}>
                      <div className="flex items-center justify-between text-[13px] mb-1">
                        <div className="flex items-center gap-1.5">
                          <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.fill }} />
                          <span className="text-[var(--apple-secondary-label)]">{d.name}</span>
                        </div>
                        <span className="font-semibold font-apple-mono text-[var(--apple-label)]">{d.value}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: d.fill }} />
                      </div>
                      <p className="text-[11px] text-[var(--apple-tertiary-label)] mt-0.5">{pct.toFixed(0)}% of total</p>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="h-[240px] flex items-center justify-center">
              <p className="text-[13px] text-[var(--apple-secondary-label)]">No task data available</p>
            </div>
          )}
        </ChartCard>

        {/* Chart 3: Grouped bar — Top performers vs team avg */}
        <ChartCard title="Top Performers vs Team Average" subtitle="Productivity and completion rate for top 6 members">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={topBarData} barCategoryGap="25%" barGap={3} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${v}%`} domain={[0, 100]} />
              <Tooltip content={<AppleTooltip formatValue={(v: number) => `${v.toFixed(1)}%`} />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
              <Bar dataKey="Productivity" fill="var(--apple-chart-color)" radius={[4, 4, 0, 0]} maxBarSize={20} />
              <Bar dataKey="Completion"   fill="#34C759" radius={[4, 4, 0, 0]} maxBarSize={20} />
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[12px] text-[var(--apple-secondary-label)]">{v}</span>} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Chart 4: Horizontal bar — Hours logged per member with avg reference */}
        <ChartCard title="Hours Logged per Member" subtitle="Members by time contribution this period">
          {hoursBarData.length > 0 ? (
            <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
              <div style={{ height: Math.max(240, hoursBarData.length * 28) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hoursBarData} layout="vertical" barCategoryGap="30%" margin={{ top: 4, right: 16, left: 40, bottom: 0 }}>
                    <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}h`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip content={<AppleTooltip formatValue={(v: number) => `${v.toFixed(1)}h`} />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
                    <ReferenceLine x={avgHours} stroke="#FF9500" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: 'avg', position: 'top', fontSize: 9, fill: '#FF9500' }} />
                    <Bar dataKey="Hours" fill="var(--apple-chart-color)" radius={[0, 5, 5, 0]} maxBarSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="h-[240px] flex items-center justify-center">
              <p className="text-[13px] text-[var(--apple-secondary-label)]">No hours data available</p>
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Top Performers ── */}
      <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-[var(--apple-separator)]">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-[#FF9500]" />
            <p className="text-[17px] font-semibold">Top Performers</p>
          </div>
          <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">Members with highest productivity scores</p>
        </div>
        <div className="divide-y divide-[var(--apple-separator)]">
          {topPerformers.map((p, i) => (
            <div key={p._id} className="px-5 py-4 flex items-center gap-4 apple-transition hover:bg-[var(--apple-quaternary-fill)]">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--apple-tertiary-fill)] text-[13px] font-bold text-[var(--apple-secondary-label)] flex-shrink-0">
                {i + 1}
              </div>
              <Avatar className="h-9 w-9 flex-shrink-0">
                <AvatarImage src={p.avatar} />
                <AvatarFallback className="text-[12px] font-semibold bg-gradient-to-br from-blue-500 to-purple-500 text-white">
                  {p.firstName.charAt(0)}{p.lastName.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold truncate">{p.firstName} {p.lastName}</p>
                <p className="text-[12px] text-[var(--apple-secondary-label)] truncate">{p.role} · {p.department}</p>
              </div>
              <div className="hidden sm:grid grid-cols-4 gap-4 text-center text-[12px] flex-shrink-0">
                {[
                  { val: `${p.stats.productivityScore.toFixed(0)}%`, lbl: 'Score' },
                  { val: String(p.stats.tasksCompleted),             lbl: 'Tasks' },
                  { val: `${p.stats.hoursLogged.toFixed(0)}h`,       lbl: 'Hours' },
                  { val: `${p.stats.completionRate.toFixed(0)}%`,    lbl: 'Done'  },
                ].map(s => (
                  <div key={s.lbl}>
                    <p className="font-semibold font-apple-mono text-[var(--apple-label)]">{s.val}</p>
                    <p className="text-[11px] text-[var(--apple-tertiary-label)]">{s.lbl}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
