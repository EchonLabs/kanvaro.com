'use client'

import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts'

interface RiskScoreGaugeProps {
  score: number
  level: 'low' | 'medium' | 'high' | 'critical'
}

const levelColors: Record<string, string> = {
  low: '#22c55e',
  medium: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
}

const levelLabels: Record<string, string> = {
  low: 'Low Risk',
  medium: 'Medium Risk',
  high: 'High Risk',
  critical: 'Critical Risk',
}

export function RiskScoreGauge({ score, level }: RiskScoreGaugeProps) {
  const color = levelColors[level]
  const data = [{ value: score, fill: color }]

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-28 w-28">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="65%"
            outerRadius="100%"
            barSize={10}
            data={data}
            startAngle={90}
            endAngle={-270}
          >
            <RadialBar
              background={{ fill: '#f1f5f9' }}
              dataKey="value"
              cornerRadius={5}
              max={100}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold" style={{ color }}>
            {score}
          </span>
          <span className="text-xs text-muted-foreground">/100</span>
        </div>
      </div>
      <span className="text-sm font-medium" style={{ color }}>
        {levelLabels[level]}
      </span>
    </div>
  )
}
