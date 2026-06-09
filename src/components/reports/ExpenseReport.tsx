'use client'

import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useOrgCurrency } from '@/hooks/useOrgCurrency'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { Receipt } from 'lucide-react'

interface ExpenseReportProps {
  topExpenses: {
    description: string; amount: number; category: string; project: string; date: string
  }[]
  budgetBreakdown: {
    category: string; budgeted: number; spent: number; remaining: number; utilizationRate: number
  }[]
  filters: any
}

const APPLE_COLORS = ['#007AFF','#34C759','#FF9500','#BF5AF2','#FF453A','#30B0C7','#FF375F','#FFD60A']

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

export function ExpenseReport({ topExpenses, budgetBreakdown, filters }: ExpenseReportProps) {
  const { formatCurrency } = useOrgCurrency()
  const { formatDate } = useDateTime()

  const totalExpenses = topExpenses.reduce((s, e) => s + e.amount, 0)
  const avgExpense = topExpenses.length > 0 ? totalExpenses / topExpenses.length : 0
  const highestExpense = topExpenses.length > 0 ? Math.max(...topExpenses.map(e => e.amount)) : 0

  const pieData = budgetBreakdown.map((item, i) => ({
    name: item.category,
    value: item.spent,
    fill: APPLE_COLORS[i % APPLE_COLORS.length],
    percent: 0,
  }))

  const barData = budgetBreakdown.map((item, i) => ({
    name: item.category.length > 10 ? item.category.slice(0, 10) + '…' : item.category,
    Budgeted: item.budgeted,
    Spent: item.spent,
  }))

  const topExpenseBar = topExpenses.slice(0, 10).map(e => ({
    name: e.description.length > 16 ? e.description.slice(0, 16) + '…' : e.description,
    Amount: e.amount,
  }))

  return (
    <div className="space-y-6">

      {/* ── Stats Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Expenses', value: formatCurrency(totalExpenses), sub: 'Across all categories', color: '#FF453A' },
          { label: 'Average Expense', value: formatCurrency(avgExpense), sub: 'Per transaction', color: '#FF9500' },
          { label: 'Highest Expense', value: formatCurrency(highestExpense), sub: 'Single transaction', color: '#BF5AF2' },
          { label: 'Total Transactions', value: String(topExpenses.length), sub: 'Expense entries', color: '#007AFF' },
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

        {/* Donut — expenses by category */}
        <ChartCard title="Expenses by Category" subtitle="Distribution of spending across categories">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={pieData} cx="50%" cy="50%"
                innerRadius={55} outerRadius={90}
                paddingAngle={3} dataKey="value"
                strokeWidth={0} animationBegin={0} animationDuration={800}
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip content={<PieTooltip formatValue={formatCurrency} />} />
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[12px] text-[var(--apple-secondary-label)]">{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Bar — spending vs budget */}
        <ChartCard title="Category Spending vs Budget" subtitle="Actual spending compared to budgeted amounts">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={barData} barCategoryGap="30%" barGap={4} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="exp-budgeted" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#007AFF" stopOpacity={0.9} /><stop offset="100%" stopColor="#5AC8FA" stopOpacity={0.7} />
                </linearGradient>
                <linearGradient id="exp-spent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF453A" stopOpacity={0.9} /><stop offset="100%" stopColor="#FF9F0A" stopOpacity={0.7} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={50} tickFormatter={v => formatCurrency(v).replace(/\.00$/, '')} />
              <Tooltip content={<AppleTooltip formatValue={formatCurrency} />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
              <Bar dataKey="Budgeted" fill="url(#exp-budgeted)" radius={[6,6,0,0]} maxBarSize={32} />
              <Bar dataKey="Spent" fill="url(#exp-spent)" radius={[6,6,0,0]} maxBarSize={32} />
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[12px] text-[var(--apple-secondary-label)]">{v}</span>} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Bar — top expenses */}
        <ChartCard title="Top Expense Transactions" subtitle="Highest value individual expenses">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={topExpenseBar} barCategoryGap="35%" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="exp-top" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF9500" stopOpacity={0.9} /><stop offset="100%" stopColor="#FFD60A" stopOpacity={0.7} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" height={48} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--apple-tertiary-label)' }} axisLine={false} tickLine={false} width={50} tickFormatter={v => formatCurrency(v).replace(/\.00$/, '')} />
              <Tooltip content={<AppleTooltip formatValue={formatCurrency} />} cursor={{ fill: 'var(--apple-quaternary-fill)' }} />
              <Bar dataKey="Amount" fill="url(#exp-top)" radius={[6,6,0,0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Utilization heatmap-style bars */}
        <ChartCard title="Budget Utilization" subtitle="Percentage of budget used per category">
          <div className="space-y-3 mt-1">
            {budgetBreakdown.map((cat, i) => {
              const pct = Math.min(100, cat.utilizationRate)
              const color = pct > 85 ? '#FF453A' : pct > 65 ? '#FF9F0A' : '#34C759'
              return (
                <div key={cat.category} className="space-y-1">
                  <div className="flex items-center justify-between text-[13px]">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: APPLE_COLORS[i % APPLE_COLORS.length] }} />
                      <span className="font-medium">{cat.category}</span>
                    </div>
                    <span className="font-semibold font-apple-mono" style={{ color }}>{pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </ChartCard>
      </div>

      {/* ── Transaction List ── */}
      <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-[var(--apple-separator)]">
          <p className="text-[17px] font-semibold">Top Expense Transactions</p>
          <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">Detailed list of highest value expenses</p>
        </div>
        <div className="divide-y divide-[var(--apple-separator)]">
          {topExpenses.map((expense, i) => (
            <div key={i} className="px-5 py-4 flex items-center gap-4 apple-transition hover:bg-[var(--apple-quaternary-fill)]">
              <div className="flex h-9 w-9 items-center justify-center rounded-[var(--apple-radius-sm)] flex-shrink-0 bg-[var(--apple-tertiary-fill)]">
                <Receipt className="h-4 w-4 text-[var(--apple-secondary-label)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold truncate">{expense.description}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-[var(--apple-tertiary-fill)] text-[var(--apple-secondary-label)]">
                    {expense.category}
                  </span>
                  <span className="text-[12px] text-[var(--apple-tertiary-label)]">{expense.project}</span>
                  <span className="text-[12px] text-[var(--apple-tertiary-label)]">·</span>
                  <span className="text-[12px] text-[var(--apple-tertiary-label)]">{formatDate(expense.date)}</span>
                </div>
              </div>
              <p className="text-[17px] font-bold font-apple-mono text-[var(--apple-label)] flex-shrink-0">
                {formatCurrency(expense.amount)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
