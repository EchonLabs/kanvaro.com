'use client'

import {
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar'
import { Award, Users, TrendingUp, Clock } from 'lucide-react'

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
    averageWorkload: number; totalHoursLogged: number; totalTasksCompleted: number
  }
  departmentBreakdown: {
    department: string; members: number; averageProductivity: number; averageWorkload: number
  }[]
  topPerformers: TeamMember[]
  filters: any
}

const APPLE_COLORS = ['#007AFF','#34C759','#FF9500','#BF5AF2','#FF453A','#30B0C7']

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
      <p className="font-semibold font-apple-mono">{item.value} members</p>
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

export function TeamOverviewReport({ overview, departmentBreakdown, topPerformers, filters }: TeamOverviewReportProps) {
  const deptPieData = departmentBreakdown.map((d, i) => ({
    name: d.department, value: d.members, fill: APPLE_COLORS[i % APPLE_COLORS.length], percent: 0,
  }))

  const deptBarData = departmentBreakdown.map(d => ({
    name: d.department.length > 10 ? d.department.slice(0, 10) + '…' : d.department,
    Productivity: d.averageProductivity,
    Workload: d.averageWorkload,
  }))

  const workloadData = departmentBreakdown.map(d => ({
    name: d.department.length > 10 ? d.department.slice(0, 10) + '…' : d.department,
    Workload: d.averageWorkload,
  }))

  return (
    <div className="space-y-6">

      {/* ── Stats Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Team Size', value: String(overview.totalMembers), sub: `${overview.activeMembers} active`, color: '#007AFF' },
          { label: 'Avg Productivity', value: `${overview.averageProductivity.toFixed(1)}%`, sub: 'Team score', color: '#34C759' },
          { label: 'Total Hours', value: `${overview.totalHoursLogged.toFixed(0)}h`, sub: 'Logged by team', color: '#BF5AF2' },
          { label: 'Tasks Done', value: String(overview.totalTasksCompleted), sub: 'Total completed', color: '#FF9500' },
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

        {/* Donut — dept distribution */}
        <ChartCard title="Team by Department" subtitle="Distribution of members across departments">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={deptPieData} cx="50%" cy="50%"
                innerRadius={55} outerRadius={90}
                paddingAngle={3} dataKey="value"
                strokeWidth={0} animationBegin={0} animationDuration={800}
              >
                {deptPieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip content={<PieTooltip />} />
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[12px] text-[var(--apple-secondary-label)]">{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Bar — productivity + workload by dept */}
        <ChartCard title="Productivity by Department" subtitle="Average productivity and workload per dept">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={deptBarData} barCategoryGap="30%" barGap={4} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="to-prod" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34C759" stopOpacity={0.9} /><stop offset="100%" stopColor="#30D158" stopOpacity={0.7} />
                </linearGradient>
                <linearGradient id="to-work" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF9500" stopOpacity={0.9} /><stop offset="100%" stopColor="#FFD60A" stopOpacity={0.7} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${v}%`} domain={[0,100]} />
              <Tooltip content={<AppleTooltip formatValue={(v: number) => `${v}%`} />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
              <Bar dataKey="Productivity" fill="url(#to-prod)" radius={[5,5,0,0]} maxBarSize={32} />
              <Bar dataKey="Workload" fill="url(#to-work)" radius={[5,5,0,0]} maxBarSize={32} />
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[12px] text-[var(--apple-secondary-label)]">{v}</span>} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Bar — dept size */}
        <ChartCard title="Department Size" subtitle="Number of members per department">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={deptPieData.map(d => ({ name: d.name.length > 10 ? d.name.slice(0, 10) + '…' : d.name, Members: d.value, fill: d.fill }))} barCategoryGap="40%" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={24} allowDecimals={false} />
              <Tooltip content={<AppleTooltip formatValue={(v: number) => `${v} members`} />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
              <Bar dataKey="Members" radius={[5,5,0,0]} maxBarSize={44}>
                {deptPieData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Area — workload */}
        <ChartCard title="Workload Distribution" subtitle="Average workload across departments">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={workloadData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="to-wl-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF453A" stopOpacity={0.25} /><stop offset="100%" stopColor="#FF453A" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${v}%`} domain={[0,100]} />
              <Tooltip content={<AppleTooltip formatValue={(v: number) => `${v}%`} />} cursor={{ stroke: 'var(--apple-separator)', strokeWidth: 1 }} />
              <Area type="monotone" dataKey="Workload" stroke="#FF453A" strokeWidth={2} fill="url(#to-wl-area)" dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
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
                  { val: String(p.stats.tasksCompleted), lbl: 'Tasks' },
                  { val: `${p.stats.hoursLogged.toFixed(0)}h`, lbl: 'Hours' },
                  { val: `${p.stats.completionRate.toFixed(0)}%`, lbl: 'Done' },
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

      {/* ── Dept Performance Table ── */}
      <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-[var(--apple-separator)]">
          <p className="text-[17px] font-semibold">Department Performance</p>
          <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">Metrics broken down by department</p>
        </div>
        <div className="divide-y divide-[var(--apple-separator)]">
          {departmentBreakdown.map((dept, i) => (
            <div key={dept.department} className="px-5 py-4 apple-transition hover:bg-[var(--apple-quaternary-fill)]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: APPLE_COLORS[i % APPLE_COLORS.length] }} />
                  <p className="text-[15px] font-semibold">{dept.department}</p>
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-[var(--apple-tertiary-fill)] text-[var(--apple-secondary-label)]">
                    {dept.members} members
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between text-[12px] mb-1">
                    <span className="text-[var(--apple-secondary-label)]">Productivity</span>
                    <span className="font-semibold font-apple-mono text-[#34C759]">{dept.averageProductivity.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${dept.averageProductivity}%`, backgroundColor: '#34C759' }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-[12px] mb-1">
                    <span className="text-[var(--apple-secondary-label)]">Workload</span>
                    <span className="font-semibold font-apple-mono" style={{ color: dept.averageWorkload > 80 ? '#FF453A' : '#FF9500' }}>{dept.averageWorkload.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${dept.averageWorkload}%`, backgroundColor: dept.averageWorkload > 80 ? '#FF453A' : '#FF9500' }} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
