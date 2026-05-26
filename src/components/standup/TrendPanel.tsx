'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface MemberTrend {
  name: string
  fulfillmentRate: number
}

interface TrendPanelProps {
  perMember: MemberTrend[]
  recurringCarryOvers: { taskTitle: string; daysOpen: number }[]
  sessionsAnalyzed: number
  trends: string[]
}

export function TrendPanel({
  perMember,
  recurringCarryOvers,
  sessionsAnalyzed,
  trends,
}: TrendPanelProps) {
  if (sessionsAnalyzed < 2) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Trends appear after 3+ standup sessions</p>
        <p className="text-xs mt-1">
          {sessionsAnalyzed} session{sessionsAnalyzed !== 1 ? 's' : ''} recorded so far
        </p>
      </div>
    )
  }

  const chartData = perMember.map((m) => ({
    name: m.name.split(' ')[0],
    rate: Math.round(m.fulfillmentRate * 100),
  }))

  return (
    <div className="space-y-5">
      {/* Fulfillment rate bar chart */}
      {chartData.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            Commitment Fulfillment Rate ({sessionsAnalyzed} sessions)
          </p>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <Tooltip
                formatter={(v: number) => [`${v}%`, 'Fulfillment']}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      entry.rate >= 80
                        ? '#22c55e'
                        : entry.rate >= 60
                        ? '#eab308'
                        : '#ef4444'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* AI-detected trends */}
      {trends.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            AI-Detected Patterns
          </p>
          <div className="space-y-2">
            {trends.map((t, i) => (
              <div key={i} className="flex gap-2 text-sm">
                <TrendingDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recurring carry-overs */}
      {recurringCarryOvers.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            Stuck Tasks (carried 2+ times)
          </p>
          <div className="space-y-1.5">
            {recurringCarryOvers.map((c, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-1.5"
              >
                <span className="text-sm truncate">{c.taskTitle}</span>
                <span className="text-xs text-muted-foreground shrink-0">{c.daysOpen}× carried</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
