'use client'

import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useOrgCurrency } from '@/hooks/useOrgCurrency'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

interface FinancialOverviewReportProps {
  overview: {
    totalBudget: number; totalSpent: number; totalRevenue: number; netProfit: number
    budgetUtilization: number; profitMargin: number
  }
  budgetBreakdown: {
    category: string; budgeted: number; spent: number; remaining: number; utilizationRate: number
  }[]
  monthlyTrends: {
    month: string; budget: number; spent: number; revenue: number; profit: number
  }[]
  filters: any
}

const PIE_COLORS = [
  'var(--apple-chart-color)', '#34C759', '#FF9500', '#BF5AF2',
  '#FF453A', '#30B0C7', '#FFD60A', '#FF375F',
]

const AppleTooltip = ({ active, payload, label, formatValue }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-[14px] border border-[var(--apple-separator)] bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.18)] p-3 text-[13px] min-w-[140px]">
      {label && <p className="font-semibold text-[var(--apple-label)] mb-2">{label}</p>}
      {payload.map((item: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
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
      <p className="font-semibold font-apple-mono text-[var(--apple-label)]">{formatValue ? formatValue(item.value) : item.value}</p>
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

export function FinancialOverviewReport({ overview, budgetBreakdown, monthlyTrends }: FinancialOverviewReportProps) {
  const { formatCurrency } = useOrgCurrency()

  const pieData = budgetBreakdown.map((item, i) => ({
    name: item.category,
    value: item.budgeted,
    spent: item.spent,
    fill: PIE_COLORS[i % PIE_COLORS.length],
    percent: 0,
  }))

  const trendData = monthlyTrends.map(t => ({
    month: t.month,
    Revenue: t.revenue,
    Spent: t.spent,
    Profit: t.profit,
  }))

  const barData = budgetBreakdown.map(item => ({
    name: item.category.length > 10 ? item.category.slice(0, 10) + '…' : item.category,
    Budgeted: item.budgeted,
    Spent: item.spent,
  }))

  const utilizationData = budgetBreakdown.map(item => ({
    name: item.category.length > 10 ? item.category.slice(0, 10) + '…' : item.category,
    Utilization: item.utilizationRate,
  }))

  const budgetHealth = overview.budgetUtilization > 100
    ? { label: 'Over budget',       icon: AlertCircle,  color: '#FF453A' }
    : overview.budgetUtilization > 85
    ? { label: 'High utilization',  icon: AlertCircle,  color: '#FF9F0A' }
    : overview.budgetUtilization > 65
    ? { label: 'Approaching limit', icon: AlertCircle,  color: '#FF9F0A' }
    : { label: 'Healthy',           icon: CheckCircle2, color: '#34C759' }

  return (
    <div className="space-y-6">

      {/* ── Health Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Budget Health',
            value: `${overview.budgetUtilization.toFixed(1)}%`,
            sub: budgetHealth.label,
            color: budgetHealth.color,
            bar: overview.budgetUtilization,
            barColor: budgetHealth.color,
          },
          {
            label: 'Profit Margin',
            value: `${overview.profitMargin.toFixed(1)}%`,
            sub: overview.netProfit >= 0 ? 'Profitable' : 'Net loss',
            color: overview.netProfit >= 0 ? '#34C759' : '#FF453A',
            bar: Math.max(0, Math.min(100, overview.profitMargin)),
            barColor: overview.netProfit >= 0 ? '#34C759' : '#FF453A',
          },
          {
            label: 'Revenue',
            value: formatCurrency(overview.totalRevenue),
            sub: 'Total generated',
            color: 'var(--apple-chart-color)',
            bar: null,
            barColor: null,
          },
          {
            label: 'Remaining Budget',
            value: formatCurrency(overview.totalBudget - overview.totalSpent),
            sub: overview.totalBudget > 0 ? `${(100 - overview.budgetUtilization).toFixed(1)}% available` : 'No budget set',
            color: 'var(--apple-chart-color)',
            bar: null,
            barColor: null,
          },
        ].map(item => (
          <div key={item.label} className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none p-4">
            <p className="apple-section-label text-[var(--apple-secondary-label)] mb-2">{item.label}</p>
            <p className="text-[20px] font-bold font-apple-mono tracking-tight" style={{ color: item.color }}>{item.value}</p>
            <p className="text-[12px] text-[var(--apple-tertiary-label)] mt-0.5">{item.sub}</p>
            {item.bar !== null && item.barColor && (
              <div className="mt-2.5 h-1.5 rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100, item.bar)}%`, background: item.barColor }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Charts Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Donut — budget by category */}
        <ChartCard title="Budget by Category" subtitle="Budget allocation across categories">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={pieData} cx="50%" cy="50%"
                innerRadius={60} outerRadius={95}
                paddingAngle={3} dataKey="value"
                strokeWidth={0}
                animationBegin={0} animationDuration={800}
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip content={<PieTooltip formatValue={formatCurrency} />} />
              <Legend
                iconType="circle" iconSize={8}
                formatter={(v) => <span className="text-[12px] text-[var(--apple-secondary-label)]">{v}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Monthly Area — revenue (green), spent (red), profit (theme) */}
        <ChartCard title="Monthly Financial Trends" subtitle="Revenue, spending, and profit over time">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="grad-revenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#34C759" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#34C759" stopOpacity={0}    />
                </linearGradient>
                <linearGradient id="grad-spent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#FF453A" stopOpacity={0.20} />
                  <stop offset="100%" stopColor="#FF453A" stopOpacity={0}    />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={50}
                tickFormatter={v => formatCurrency(v).replace(/\.00$/, '')} />
              <Tooltip content={<AppleTooltip formatValue={formatCurrency} />} cursor={{ stroke: 'var(--apple-separator)', strokeWidth: 1 }} />
              <Area type="monotone" dataKey="Revenue" stroke="#34C759"                    strokeWidth={2} fill="url(#grad-revenue)" dot={false} activeDot={{ r: 4, fill: '#34C759' }} />
              <Area type="monotone" dataKey="Spent"   stroke="#FF453A"                    strokeWidth={2} fill="url(#grad-spent)"   dot={false} activeDot={{ r: 4, fill: '#FF453A' }} />
              <Area type="monotone" dataKey="Profit"  stroke="var(--apple-chart-color)"   strokeWidth={2} fill="var(--apple-chart-color)" fillOpacity={0.12} dot={false} activeDot={{ r: 4, fill: 'var(--apple-chart-color)' }} />
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[12px] text-[var(--apple-secondary-label)]">{v}</span>} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Grouped Bar — budgeted vs spent */}
        <ChartCard title="Budget vs Spent by Category" subtitle="Planned allocation against actual spending">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData} barCategoryGap="30%" barGap={4} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={50}
                tickFormatter={v => formatCurrency(v).replace(/\.00$/, '')} />
              <Tooltip content={<AppleTooltip formatValue={formatCurrency} />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
              <Bar dataKey="Budgeted" fill="var(--apple-chart-color)" radius={[6,6,0,0]} maxBarSize={32} />
              <Bar dataKey="Spent"    fill="#FF453A"                  radius={[6,6,0,0]} maxBarSize={32} />
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[12px] text-[var(--apple-secondary-label)]">{v}</span>} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Utilization Bar */}
        <ChartCard title="Budget Utilization Rate" subtitle="Percentage used per category">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={utilizationData} barCategoryGap="35%" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${v}%`} domain={[0, (dataMax: number) => Math.max(100, Math.ceil(dataMax / 10) * 10)]} />
              <Tooltip content={<AppleTooltip formatValue={(v: number) => `${Number(v).toFixed(1)}%`} />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
              <Bar dataKey="Utilization" fill="var(--apple-chart-color)" radius={[6,6,0,0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Budget Breakdown Table ── */}
      <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-[var(--apple-separator)]">
          <p className="text-[17px] font-semibold">Detailed Budget Breakdown</p>
          <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">Comprehensive view of budget allocation and spending</p>
        </div>
        <div className="divide-y divide-[var(--apple-separator)]">
          {budgetBreakdown.map((cat, i) => {
            const pct = Math.min(100, cat.utilizationRate)
            const healthColor = pct > 85 ? '#FF453A' : pct > 65 ? '#FF9F0A' : '#34C759'
            return (
              <div key={cat.category} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 apple-transition hover:bg-[var(--apple-quaternary-fill)]">
                <div className="flex items-center gap-2.5 flex-shrink-0 w-36">
                  <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <p className="text-[15px] font-semibold truncate">{cat.category}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="h-1.5 rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, backgroundColor: healthColor }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[13px] flex-shrink-0 font-apple-mono">
                  <div className="text-right">
                    <p className="font-semibold">{formatCurrency(cat.spent)}</p>
                    <p className="text-[11px] text-[var(--apple-tertiary-label)]">spent</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-[var(--apple-secondary-label)]">{formatCurrency(cat.budgeted)}</p>
                    <p className="text-[11px] text-[var(--apple-tertiary-label)]">budgeted</p>
                  </div>
                  <div className="min-w-[52px] text-right">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                      style={{ backgroundColor: `${healthColor}20`, color: healthColor }}
                    >
                      {pct.toFixed(0)}%
                    </span>
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
