'use client'

import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useOrgCurrency } from '@/hooks/useOrgCurrency'

interface BudgetAnalysisReportProps {
  budgetBreakdown: {
    category: string; budgeted: number; spent: number; remaining: number; utilizationRate: number
  }[]
  monthlyTrends: {
    month: string; budget: number; spent: number; revenue: number; profit: number
  }[]
  filters: any
}

const APPLE_COLORS = ['var(--apple-chart-color)','#34C759','#FF9500','#BF5AF2','#FF453A','#30B0C7']

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

export function BudgetAnalysisReport({ budgetBreakdown, monthlyTrends, filters }: BudgetAnalysisReportProps) {
  const { formatCurrency } = useOrgCurrency()

  const totalBudgeted = budgetBreakdown.reduce((s, i) => s + i.budgeted, 0)
  const totalSpent = budgetBreakdown.reduce((s, i) => s + i.spent, 0)
  const totalRemaining = budgetBreakdown.reduce((s, i) => s + i.remaining, 0)
  const avgUtilization = budgetBreakdown.length > 0
    ? budgetBreakdown.reduce((s, i) => s + i.utilizationRate, 0) / budgetBreakdown.length
    : 0

  const barData = budgetBreakdown.map((item) => ({
    name: item.category.length > 10 ? item.category.slice(0, 10) + '…' : item.category,
    Budgeted: item.budgeted,
    Spent: item.spent,
  }))

  const utilizationData = budgetBreakdown.map((item) => ({
    name: item.category.length > 10 ? item.category.slice(0, 10) + '…' : item.category,
    Utilization: item.utilizationRate,
  }))

  const monthlyData = monthlyTrends.map(t => ({
    month: t.month,
    Budget: t.budget,
    Spent: t.spent,
    Variance: t.budget - t.spent,
  }))

  return (
    <div className="space-y-6">

      {/* ── Stats Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Budgeted',  value: formatCurrency(totalBudgeted),  sub: 'Across all categories',                                                          color: 'var(--apple-chart-color)' },
          { label: 'Total Spent',     value: formatCurrency(totalSpent),      sub: `${totalBudgeted > 0 ? ((totalSpent/totalBudgeted)*100).toFixed(1) : 0}% of budget`, color: '#FF453A' },
          { label: 'Remaining',       value: formatCurrency(totalRemaining),  sub: 'Available to spend',                                                             color: '#34C759' },
          { label: 'Avg Utilization', value: `${avgUtilization.toFixed(1)}%`, sub: 'Across categories',                                                             color: 'var(--apple-chart-color)' },
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

        {/* Grouped bar: budget vs spent */}
        <ChartCard title="Budget vs Spent" subtitle="Planned allocation against actual spending by category">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={barData} barCategoryGap="30%" barGap={4} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={50} tickFormatter={v => formatCurrency(v).replace(/\.00$/, '')} />
              <Tooltip content={<AppleTooltip formatValue={formatCurrency} />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
              <Bar dataKey="Budgeted" fill="var(--apple-chart-color)"              radius={[6,6,0,0]} maxBarSize={32} />
              <Bar dataKey="Spent"    fill="var(--apple-chart-color)" fillOpacity={0.45} radius={[6,6,0,0]} maxBarSize={32} />
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[12px] text-[var(--apple-secondary-label)]">{v}</span>} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Bar: utilization by category */}
        <ChartCard title="Utilization by Category" subtitle="Percentage of budget used per category">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={utilizationData} barCategoryGap="35%" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${v}%`} domain={[0,100]} />
              <Tooltip content={<AppleTooltip formatValue={(v: number) => `${v}%`} />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
              <Bar dataKey="Utilization" fill="var(--apple-chart-color)" radius={[6,6,0,0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Area: monthly budget trends */}
        <ChartCard title="Monthly Budget Trends" subtitle="Budget and spending over time">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ba-area-budget" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF453A" stopOpacity={0.18} /><stop offset="100%" stopColor="#FF453A" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={50} tickFormatter={v => formatCurrency(v).replace(/\.00$/, '')} />
              <Tooltip content={<AppleTooltip formatValue={formatCurrency} />} cursor={{ stroke: 'var(--apple-separator)', strokeWidth: 1 }} />
              <Area type="monotone" dataKey="Budget" stroke="var(--apple-chart-color)" strokeWidth={2} fill="var(--apple-chart-color)" fillOpacity={0.12} dot={false} activeDot={{ r: 4 }} />
              <Area type="monotone" dataKey="Spent"  stroke="#FF453A"                  strokeWidth={2} fill="url(#ba-area-budget)"        dot={false} activeDot={{ r: 4 }} />
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[12px] text-[var(--apple-secondary-label)]">{v}</span>} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Line: variance — green = under budget (positive) */}
        <ChartCard title="Budget Variance Analysis" subtitle="Monthly budget vs actual variance">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={50} tickFormatter={v => formatCurrency(v).replace(/\.00$/, '')} />
              <Tooltip content={<AppleTooltip formatValue={formatCurrency} />} cursor={{ stroke: 'var(--apple-separator)', strokeWidth: 1 }} />
              <Line type="monotone" dataKey="Variance" stroke="#34C759" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#34C759' }} strokeLinecap="round" />
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[12px] text-[var(--apple-secondary-label)]">{v}</span>} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Category Detail Table ── */}
      <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-[var(--apple-separator)]">
          <p className="text-[17px] font-semibold">Budget Category Analysis</p>
          <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">Detailed performance breakdown by category</p>
        </div>
        <div className="divide-y divide-[var(--apple-separator)]">
          {budgetBreakdown.map((cat, i) => {
            const pct = Math.min(100, cat.utilizationRate)
            const color = pct > 85 ? '#FF453A' : pct > 65 ? '#FF9F0A' : '#34C759'
            const isOver = cat.utilizationRate > 100
            return (
              <div key={cat.category} className="px-5 py-4 apple-transition hover:bg-[var(--apple-quaternary-fill)]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: APPLE_COLORS[i % APPLE_COLORS.length] }} />
                    <p className="text-[15px] font-semibold">{cat.category}</p>
                    {isOver && (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400">
                        Over budget
                      </span>
                    )}
                  </div>
                  <span className="text-[13px] font-semibold font-apple-mono" style={{ color }}>{cat.utilizationRate.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden mb-3">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-[13px]">
                  <div>
                    <p className="text-[11px] text-[var(--apple-tertiary-label)] uppercase tracking-[0.06em] font-semibold">Budgeted</p>
                    <p className="font-semibold font-apple-mono mt-0.5">{formatCurrency(cat.budgeted)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[var(--apple-tertiary-label)] uppercase tracking-[0.06em] font-semibold">Spent</p>
                    <p className="font-semibold font-apple-mono mt-0.5" style={{ color }}>{formatCurrency(cat.spent)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[var(--apple-tertiary-label)] uppercase tracking-[0.06em] font-semibold">Remaining</p>
                    <p className={`font-semibold font-apple-mono mt-0.5 ${cat.remaining < 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                      {formatCurrency(cat.remaining)}
                    </p>
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
