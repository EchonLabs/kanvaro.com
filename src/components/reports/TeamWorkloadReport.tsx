'use client'

import {
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar'
import { AlertTriangle, CheckCircle2, Minus } from 'lucide-react'

interface TeamMember {
  _id: string; firstName: string; lastName: string; email: string
  role: string; department: string; avatar?: string
  stats: {
    tasksCompleted: number; totalTasks: number; completionRate: number
    hoursLogged: number; averageSessionLength: number; productivityScore: number; workloadScore: number
  }
}

interface DepartmentBreakdown {
  department: string; members: number; averageProductivity: number; averageWorkload: number
}

interface WorkloadEntry {
  member: string; currentTasks: number; completedTasks: number; hoursLogged: number; workloadScore: number
}

interface TeamWorkloadReportProps {
  members: TeamMember[]
  departmentBreakdown?: DepartmentBreakdown[]
  workloadDistribution?: WorkloadEntry[]
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

const getWorkloadColor = (score: number) => {
  if (score >= 85) return '#FF453A'
  if (score >= 70) return '#FF9500'
  if (score >= 50) return '#34C759'
  return '#30B0C7'
}

const getWorkloadLabel = (score: number) => {
  if (score >= 85) return { text: 'Overloaded', color: '#FF453A', bg: 'rgba(255,69,58,0.12)' }
  if (score >= 70) return { text: 'High',       color: '#FF9500', bg: 'rgba(255,149,0,0.12)' }
  if (score >= 50) return { text: 'Balanced',   color: '#34C759', bg: 'rgba(52,199,89,0.12)' }
  return                  { text: 'Light',      color: '#30B0C7', bg: 'rgba(48,176,199,0.12)' }
}

export function TeamWorkloadReport({ members, departmentBreakdown = [], workloadDistribution = [], filters }: TeamWorkloadReportProps) {
  const avgWorkload = members.length > 0 ? members.reduce((s, m) => s + m.stats.workloadScore, 0) / members.length : 0
  const overloaded = members.filter(m => m.stats.workloadScore >= 85).length
  const balanced = members.filter(m => m.stats.workloadScore >= 50 && m.stats.workloadScore < 70).length
  const light = members.filter(m => m.stats.workloadScore < 50).length

  const deptWorkload = departmentBreakdown.map((d, i) => ({
    name: d.department.length > 10 ? d.department.slice(0, 10) + '…' : d.department,
    Workload: d.averageWorkload,
    Productivity: d.averageProductivity,
    fill: APPLE_COLORS[i % APPLE_COLORS.length],
  }))

  const memberWorkload = [...members].sort((a, b) => b.stats.workloadScore - a.stats.workloadScore).map((m, i) => ({
    name: `${m.firstName} ${m.lastName.charAt(0)}.`,
    Workload: m.stats.workloadScore,
    Tasks: m.stats.totalTasks,
    fill: getWorkloadColor(m.stats.workloadScore),
  }))

  const radarData = departmentBreakdown.map(d => ({
    dept: d.department.length > 8 ? d.department.slice(0, 8) + '…' : d.department,
    Workload: d.averageWorkload,
    Productivity: d.averageProductivity,
  }))

  return (
    <div className="space-y-6">

      {/* ── Stats Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Avg Workload', value: `${avgWorkload.toFixed(1)}%`, sub: 'Team average', color: getWorkloadColor(avgWorkload) },
          { label: 'Overloaded', value: String(overloaded), sub: 'Score ≥ 85%', color: '#FF453A' },
          { label: 'Balanced', value: String(balanced), sub: 'Score 50–70%', color: '#34C759' },
          { label: 'Light Load', value: String(light), sub: 'Score < 50%', color: '#30B0C7' },
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

        {/* Bar — member workload ranking */}
        <ChartCard title="Member Workload" subtitle="Workload scores across all team members">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={memberWorkload.slice(0, 10)} barCategoryGap="35%" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${v}%`} domain={[0, 100]} />
              <Tooltip content={<AppleTooltip formatValue={(v: number) => `${v.toFixed(1)}%`} />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
              <Bar dataKey="Workload" radius={[5, 5, 0, 0]} maxBarSize={40}>
                {memberWorkload.slice(0, 10).map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Bar — dept workload */}
        <ChartCard title="Workload by Department" subtitle="Average workload and productivity per department">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={deptWorkload} barCategoryGap="30%" barGap={4} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="wl-dept" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF453A" stopOpacity={0.85} /><stop offset="100%" stopColor="#FF9500" stopOpacity={0.65} />
                </linearGradient>
                <linearGradient id="prod-dept" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34C759" stopOpacity={0.85} /><stop offset="100%" stopColor="#30D158" stopOpacity={0.65} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${v}%`} domain={[0, 100]} />
              <Tooltip content={<AppleTooltip formatValue={(v: number) => `${v.toFixed(1)}%`} />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
              <Bar dataKey="Workload" fill="url(#wl-dept)" radius={[5, 5, 0, 0]} maxBarSize={28} />
              <Bar dataKey="Productivity" fill="url(#prod-dept)" radius={[5, 5, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Radar — dept balance */}
        {radarData.length >= 3 ? (
          <ChartCard title="Department Balance Radar" subtitle="Workload vs productivity across departments">
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={radarData} margin={{ top: 4, right: 16, left: 16, bottom: 4 }}>
                <PolarGrid stroke="var(--apple-separator)" />
                <PolarAngleAxis dataKey="dept" tick={{ fontSize: 11, fill: 'var(--apple-secondary-label)' }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--apple-tertiary-label)' }} axisLine={false} />
                <Tooltip content={<AppleTooltip formatValue={(v: number) => `${v.toFixed(1)}%`} />} />
                <Radar name="Workload" dataKey="Workload" stroke="#FF453A" fill="#FF453A" fillOpacity={0.15} strokeWidth={2} dot={false} />
                <Radar name="Productivity" dataKey="Productivity" stroke="#34C759" fill="#34C759" fillOpacity={0.15} strokeWidth={2} dot={false} />
              </RadarChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : (
          <ChartCard title="Workload Intensity" subtitle="Members by workload level">
            <div className="space-y-4 mt-1">
              {[
                { label: 'Overloaded (≥85%)', count: overloaded, color: '#FF453A', bg: 'rgba(255,69,58,0.12)' },
                { label: 'High (70–85%)', count: members.filter(m => m.stats.workloadScore >= 70 && m.stats.workloadScore < 85).length, color: '#FF9500', bg: 'rgba(255,149,0,0.12)' },
                { label: 'Balanced (50–70%)', count: balanced, color: '#34C759', bg: 'rgba(52,199,89,0.12)' },
                { label: 'Light (<50%)', count: light, color: '#30B0C7', bg: 'rgba(48,176,199,0.12)' },
              ].map(tier => {
                const pct = members.length > 0 ? (tier.count / members.length) * 100 : 0
                return (
                  <div key={tier.label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: tier.bg, color: tier.color }}>{tier.label}</span>
                      <div className="flex items-center gap-2 font-apple-mono">
                        <span className="font-semibold text-[var(--apple-label)]">{tier.count}</span>
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
        )}

        {/* Inline tasks per member */}
        <ChartCard title="Active Tasks Load" subtitle="Current total tasks per team member">
          <div className="space-y-2.5 mt-1 max-h-[240px] overflow-y-auto pr-1">
            {[...members].sort((a, b) => b.stats.totalTasks - a.stats.totalTasks).map((m, i) => {
              const maxT = Math.max(...members.map(x => x.stats.totalTasks), 1)
              const pct = (m.stats.totalTasks / maxT) * 100
              const wl = getWorkloadLabel(m.stats.workloadScore)
              return (
                <div key={m._id} className="flex items-center gap-3">
                  <Avatar className="h-6 w-6 flex-shrink-0">
                    <AvatarImage src={m.avatar} />
                    <AvatarFallback className="text-[9px] font-semibold bg-gradient-to-br from-blue-500 to-purple-500 text-white">
                      {m.firstName.charAt(0)}{m.lastName.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <p className="text-[12px] font-medium w-22 truncate flex-shrink-0">{m.firstName} {m.lastName.charAt(0)}.</p>
                  <div className="flex-1 h-1.5 rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: getWorkloadColor(m.stats.workloadScore) }} />
                  </div>
                  <span className="text-[11px] font-semibold font-apple-mono w-10 text-right flex-shrink-0" style={{ color: getWorkloadColor(m.stats.workloadScore) }}>
                    {m.stats.totalTasks}
                  </span>
                </div>
              )
            })}
          </div>
        </ChartCard>
      </div>

      {/* ── Member Workload List ── */}
      <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-[var(--apple-separator)]">
          <p className="text-[17px] font-semibold">Workload Detail</p>
          <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">Individual workload and task status per member</p>
        </div>
        <div className="divide-y divide-[var(--apple-separator)]">
          {[...members].sort((a, b) => b.stats.workloadScore - a.stats.workloadScore).map(m => {
            const wl = getWorkloadLabel(m.stats.workloadScore)
            const Icon = m.stats.workloadScore >= 85 ? AlertTriangle : m.stats.workloadScore >= 50 ? Minus : CheckCircle2
            return (
              <div key={m._id} className="px-5 py-4 flex items-center gap-4 apple-transition hover:bg-[var(--apple-quaternary-fill)]">
                <div className="flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0" style={{ backgroundColor: wl.bg }}>
                  <Icon className="h-4 w-4" style={{ color: wl.color }} />
                </div>
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarImage src={m.avatar} />
                  <AvatarFallback className="text-[11px] font-semibold bg-gradient-to-br from-blue-500 to-purple-500 text-white">
                    {m.firstName.charAt(0)}{m.lastName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[14px] font-semibold">{m.firstName} {m.lastName}</p>
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold flex-shrink-0" style={{ backgroundColor: wl.bg, color: wl.color }}>{wl.text}</span>
                  </div>
                  <p className="text-[11px] text-[var(--apple-secondary-label)] truncate">{m.role} · {m.department}</p>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[var(--apple-secondary-label)]">Workload</span>
                      <span className="font-semibold font-apple-mono" style={{ color: wl.color }}>{m.stats.workloadScore.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${m.stats.workloadScore}%`, backgroundColor: getWorkloadColor(m.stats.workloadScore) }} />
                    </div>
                  </div>
                </div>
                <div className="hidden sm:grid grid-cols-3 gap-4 text-center text-[12px] flex-shrink-0">
                  {[
                    { val: String(m.stats.totalTasks), lbl: 'Total' },
                    { val: String(m.stats.tasksCompleted), lbl: 'Done' },
                    { val: `${m.stats.completionRate.toFixed(0)}%`, lbl: 'Rate' },
                  ].map(s => (
                    <div key={s.lbl}>
                      <p className="font-semibold font-apple-mono text-[var(--apple-label)]">{s.val}</p>
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
