'use client'

import {
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
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

  // Stacked bar: completed vs remaining tasks per member (top 10 by total tasks)
  const taskBreakdownData = [...members]
    .sort((a, b) => b.stats.totalTasks - a.stats.totalTasks)
    .slice(0, 10)
    .map(m => ({
      name: `${m.firstName} ${m.lastName.charAt(0)}.`,
      Done: m.stats.tasksCompleted,
      Remaining: Math.max(0, m.stats.totalTasks - m.stats.tasksCompleted),
    }))

  const maxTasks = Math.max(...members.map(x => x.stats.totalTasks), 1)

  const memberWorkload = [...members].sort((a, b) => b.stats.workloadScore - a.stats.workloadScore).map(m => ({
    name: `${m.firstName} ${m.lastName.charAt(0)}.`,
    Workload: m.stats.workloadScore,
    Tasks: m.stats.totalTasks,
  }))

  const radarData = departmentBreakdown.map((d) => ({
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

        {/* Bar — member workload ranking (horizontal scroll) */}
        <ChartCard title="Member Workload" subtitle="Workload scores across all team members">
          <div className="overflow-x-auto">
            <div style={{ minWidth: Math.max(400, memberWorkload.length * 56) }}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={memberWorkload} barCategoryGap="35%" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                  <Tooltip content={<AppleTooltip formatValue={(v: number) => `${v.toFixed(1)}%`} />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
                  <Bar dataKey="Workload" fill="var(--apple-chart-color)" radius={[5, 5, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </ChartCard>

        {/* Stacked bar — tasks done vs remaining per member (vertical scroll) */}
        <ChartCard title="Task Completion by Member" subtitle="Completed vs remaining tasks per member">
          {taskBreakdownData.length > 0 ? (
            <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
              <div style={{ height: Math.max(240, taskBreakdownData.length * 28 + 32) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={taskBreakdownData} layout="vertical" barCategoryGap="28%" margin={{ top: 4, right: 16, left: 44, bottom: 20 }}>
                    <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={44} />
                    <Tooltip content={<AppleTooltip formatValue={(v: number) => `${v} tasks`} />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
                    <Bar dataKey="Done"      stackId="tasks" fill="#34C759"                  fillOpacity={0.85} radius={[0, 0, 0, 0]} maxBarSize={14} />
                    <Bar dataKey="Remaining" stackId="tasks" fill="var(--apple-chart-color)" fillOpacity={0.45} radius={[0, 4, 4, 0]} maxBarSize={14} />
                    <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[12px] text-[var(--apple-secondary-label)]">{v}</span>} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="h-[240px] flex items-center justify-center">
              <p className="text-[13px] text-[var(--apple-secondary-label)]">No task data available</p>
            </div>
          )}
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
            <div className="space-y-4 mt-1 max-h-[240px] overflow-y-auto pr-1">
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
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: 'var(--apple-chart-color)' }} />
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
              const pct = (m.stats.totalTasks / maxTasks) * 100
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
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: 'var(--apple-chart-color)' }} />
                  </div>
                  <span className="text-[11px] font-semibold font-apple-mono text-[var(--apple-secondary-label)] w-10 text-right flex-shrink-0">
                    {m.stats.totalTasks}
                  </span>
                </div>
              )
            })}
          </div>
        </ChartCard>
      </div>

      {/* ── Workload Detail — tier groups ── */}
      <div className="space-y-4">
        <div>
          <p className="text-[17px] font-semibold">Workload Detail</p>
          <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">Members grouped by workload tier</p>
        </div>

        {[
          { text: 'Overloaded', color: '#FF453A', bg: 'rgba(255,69,58,0.10)', border: 'rgba(255,69,58,0.25)', test: (s: number) => s >= 85 },
          { text: 'High',       color: '#FF9500', bg: 'rgba(255,149,0,0.10)', border: 'rgba(255,149,0,0.25)',  test: (s: number) => s >= 70 && s < 85 },
          { text: 'Balanced',   color: '#34C759', bg: 'rgba(52,199,89,0.10)', border: 'rgba(52,199,89,0.25)', test: (s: number) => s >= 50 && s < 70 },
          { text: 'Light',      color: '#30B0C7', bg: 'rgba(48,176,199,0.10)', border: 'rgba(48,176,199,0.25)', test: (s: number) => s < 50 },
        ].map(tier => {
          const tierMembers = [...members]
            .filter(m => tier.test(m.stats.workloadScore))
            .sort((a, b) => b.stats.workloadScore - a.stats.workloadScore)
          if (tierMembers.length === 0) return null
          const Icon = tier.text === 'Overloaded' ? AlertTriangle : tier.text === 'High' ? Minus : CheckCircle2
          return (
            <div key={tier.text} className="rounded-[var(--apple-radius-lg)] overflow-hidden border" style={{ borderColor: tier.border }}>
              {/* Tier header */}
              <div className="flex items-center gap-2.5 px-4 py-3" style={{ backgroundColor: tier.bg }}>
                <div className="flex h-6 w-6 items-center justify-center rounded-full" style={{ backgroundColor: tier.color + '25' }}>
                  <Icon className="h-3.5 w-3.5" style={{ color: tier.color }} />
                </div>
                <p className="text-[13px] font-semibold" style={{ color: tier.color }}>{tier.text}</p>
                <span className="ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: tier.color + '20', color: tier.color }}>
                  {tierMembers.length} {tierMembers.length === 1 ? 'member' : 'members'}
                </span>
              </div>

              {/* Member rows */}
              <div className="bg-card divide-y divide-[var(--apple-separator)]">
                {tierMembers.map(m => (
                  <div key={m._id} className="flex items-center gap-3 px-4 py-3 apple-transition hover:bg-[var(--apple-quaternary-fill)]">
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarImage src={m.avatar} />
                      <AvatarFallback className="text-[11px] font-semibold bg-gradient-to-br from-blue-500 to-purple-500 text-white">
                        {m.firstName.charAt(0)}{m.lastName.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold truncate">{m.firstName} {m.lastName}</p>
                      <p className="text-[11px] text-[var(--apple-secondary-label)] truncate">{m.role} · {m.department}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="hidden sm:block text-[11px] text-[var(--apple-tertiary-label)] font-apple-mono">
                        {m.stats.tasksCompleted}/{m.stats.totalTasks} tasks
                      </span>
                      <span className="hidden sm:block text-[11px] font-semibold font-apple-mono text-[var(--apple-secondary-label)]">
                        {m.stats.completionRate.toFixed(0)}% done
                      </span>
                      <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ backgroundColor: tier.bg, color: tier.color }}>
                        {m.stats.workloadScore.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
