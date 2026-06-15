'use client'

import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useOrgCurrency } from '@/hooks/useOrgCurrency'
import { TrendingUp } from 'lucide-react'

interface RevenueReportProps {
  revenueSources: { source: string; amount: number; percentage: number }[]
  monthlyTrends: {
    month: string; budget: number; spent: number; revenue: number; profit: number
  }[]
  filters: any
}

const APPLE_COLORS = ['#34C759','var(--apple-chart-color)','#FF9500','#BF5AF2','#30B0C7','#FF453A']

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
            {formatValue ? formatValue(item.value) : `${typeof item.value === 'number' ? item.value.toFixed(1) : item.value}`}
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

function calculateRevenueGrowth(trends: any[]): number {
  if (trends.length < 2) return 0
  const cur = trends[trends.length - 1]
  const prev = trends[trends.length - 2]
  if (prev.revenue === 0) return 0
  return ((cur.revenue - prev.revenue) / prev.revenue) * 100
}

export function RevenueReport({ revenueSources, monthlyTrends, filters }: RevenueReportProps) {
  const { formatCurrency } = useOrgCurrency()

  const totalRevenue = revenueSources.reduce((s, r) => s + r.amount, 0)
  const avgRevenue = revenueSources.length > 0 ? totalRevenue / revenueSources.length : 0
  const topSource = revenueSources.length > 0
    ? revenueSources.reduce((max, r) => r.amount > max.amount ? r : max)
    : null
  const revenueGrowth = calculateRevenueGrowth(monthlyTrends)

  const pieData = revenueSources.map((s, i) => ({
    name: s.source, value: s.amount, percentage: s.percentage,
    fill: APPLE_COLORS[i % APPLE_COLORS.length], percent: 0,
  }))

  const barData = revenueSources.map((s, i) => ({
    name: s.source.length > 12 ? s.source.slice(0, 12) + '…' : s.source,
    Revenue: s.amount,
    fill: APPLE_COLORS[i % APPLE_COLORS.length],
  }))

  const monthlyData = monthlyTrends.map(t => ({
    month: t.month,
    Revenue: t.revenue,
    Profit: t.profit,
    'Margin %': t.revenue > 0 ? (t.profit / t.revenue) * 100 : 0,
  }))

  return (
    <div className="space-y-6">

      {/* ── Stats Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Revenue',  value: formatCurrency(totalRevenue),  sub: 'Generated revenue',                                                                            color: '#34C759' },
          { label: 'Average/Source', value: formatCurrency(avgRevenue),    sub: 'Per revenue source',                                                                           color: 'var(--apple-chart-color)' },
          { label: 'Top Source',     value: topSource ? topSource.source : 'N/A', sub: topSource ? `${topSource.percentage.toFixed(1)}% of total` : '—',                       color: '#FF9500' },
          { label: 'Revenue Growth', value: `${revenueGrowth >= 0 ? '+' : ''}${revenueGrowth.toFixed(1)}%`, sub: 'Month over month', color: revenueGrowth >= 0 ? '#34C759' : '#FF453A' },
        ].map(s => (
          <div key={s.label} className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none p-4">
            <p className="apple-section-label text-[var(--apple-secondary-label)] mb-1.5">{s.label}</p>
            <p className="text-[18px] font-bold font-apple-mono tracking-tight truncate" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[12px] text-[var(--apple-tertiary-label)] mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Donut — revenue by source */}
        <ChartCard title="Revenue by Source" subtitle="Distribution across revenue sources">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={pieData} cx="50%" cy="50%"
                innerRadius={55} outerRadius={90}
                paddingAngle={3} dataKey="value"
                strokeWidth={0} animationBegin={0} animationDuration={800}
              >
                {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip content={<PieTooltip formatValue={formatCurrency} />} />
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[12px] text-[var(--apple-secondary-label)]">{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Area — monthly revenue (green=semantic) + profit (theme) */}
        <ChartCard title="Monthly Revenue Trends" subtitle="Revenue and profit over time">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="rev-revenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34C759" stopOpacity={0.25} /><stop offset="100%" stopColor="#34C759" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={50} tickFormatter={v => formatCurrency(v).replace(/\.00$/, '')} />
              <Tooltip content={<AppleTooltip formatValue={formatCurrency} />} cursor={{ stroke: 'var(--apple-separator)', strokeWidth: 1 }} />
              <Area type="monotone" dataKey="Revenue" stroke="#34C759"                   strokeWidth={2} fill="url(#rev-revenue)"        dot={false} activeDot={{ r: 4 }} />
              <Area type="monotone" dataKey="Profit"  stroke="var(--apple-chart-color)"  strokeWidth={2} fill="var(--apple-chart-color)" fillOpacity={0.12} dot={false} activeDot={{ r: 4 }} />
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[12px] text-[var(--apple-secondary-label)]">{v}</span>} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Bar — revenue sources comparison (green = revenue = positive) */}
        <ChartCard title="Revenue Sources Comparison" subtitle="Revenue amount per source">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={barData} barCategoryGap="35%" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="rev-bar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34C759" stopOpacity={0.9} /><stop offset="100%" stopColor="#30D158" stopOpacity={0.7} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={50} tickFormatter={v => formatCurrency(v).replace(/\.00$/, '')} />
              <Tooltip content={<AppleTooltip formatValue={formatCurrency} />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
              <Bar dataKey="Revenue" fill="url(#rev-bar)" radius={[6,6,0,0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Line — profit margin % */}
        <ChartCard title="Profit Margin Trends" subtitle="Profit margin percentage month-over-month">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${v.toFixed(0)}%`} />
              <Tooltip content={<AppleTooltip formatValue={(v: number) => `${Number(v).toFixed(1)}%`} />} cursor={{ stroke: 'var(--apple-separator)', strokeWidth: 1 }} />
              <Line type="monotone" dataKey="Margin %" stroke="var(--apple-chart-color)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: 'var(--apple-chart-color)' }} strokeLinecap="round" />
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[12px] text-[var(--apple-secondary-label)]">{v}</span>} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Revenue Sources Detail ── */}
      <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-[var(--apple-separator)]">
          <p className="text-[17px] font-semibold">Revenue Sources Analysis</p>
          <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">Detailed breakdown of revenue by source</p>
        </div>
        <div className="divide-y divide-[var(--apple-separator)]">
          {revenueSources.map((source, i) => (
            <div key={source.source} className="px-5 py-4 flex items-center gap-4 apple-transition hover:bg-[var(--apple-quaternary-fill)]">
              <div className="flex h-9 w-9 items-center justify-center rounded-[var(--apple-radius-sm)] flex-shrink-0" style={{ backgroundColor: `${APPLE_COLORS[i % APPLE_COLORS.length]}22` }}>
                <TrendingUp className="h-4 w-4" style={{ color: APPLE_COLORS[i % APPLE_COLORS.length] }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold">{source.source}</p>
                <div className="mt-1.5 h-1.5 rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${source.percentage}%`, backgroundColor: APPLE_COLORS[i % APPLE_COLORS.length] }} />
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[17px] font-bold font-apple-mono text-emerald-500">{formatCurrency(source.amount)}</p>
                <p className="text-[12px] text-[var(--apple-tertiary-label)]">{source.percentage.toFixed(1)}% of total</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
