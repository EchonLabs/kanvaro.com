'use client'

import { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { FolderOpen, CheckSquare, Users, Clock, TrendingUp, TrendingDown } from 'lucide-react'
import { useOrganization } from '@/hooks/useOrganization'
import { applyRoundingRules } from '@/lib/utils'
import { usePermissions } from '@/lib/permissions/permission-hooks'
import { Permission } from '@/lib/permissions/permission-definitions'
import { ResponsiveContainer, AreaChart, Area } from 'recharts'

interface StatsCardsProps {
  stats?: {
    activeProjects: number
    completedTasks: number
    teamMembers: number
    hoursTracked: number
    projectsCount: number
    tasksCount: number
    timeEntriesCount: number
  }
  changes?: {
    activeProjects: number
    completedTasks: number
    teamMembers: number
    hoursTracked: number
  }
  isLoading?: boolean
}

/* Deterministic sparkline — sin/cos instead of Math.random to avoid SSR hydration mismatch */
function generateSparklineData(currentValue: number, changeType: string, seed: number) {
  const points = 12
  const base = Math.max(currentValue * 0.5, 1)
  const arr: { v: number }[] = []
  for (let i = 0; i < points; i++) {
    const noise = (Math.sin(i * 2.3 + seed) * 0.15 + Math.cos(i * 1.7 + seed) * 0.1) * Math.max(currentValue, 1)
    let v: number
    if (changeType === 'positive') {
      v = base + ((currentValue - base) * i / (points - 1)) + noise
    } else if (changeType === 'negative') {
      v = currentValue + ((base - currentValue) * i / (points - 1)) + noise
    } else {
      v = (currentValue * 0.85) + Math.abs(noise)
    }
    arr.push({ v: Math.max(0, v) })
  }
  arr[points - 1] = { v: currentValue }
  return arr
}

/* Sparkline stroke colors matching the mockup */
const CARD_ACCENTS = [
  { color: '#007AFF', darkColor: '#0A84FF' },
  { color: '#FF3B30', darkColor: '#FF453A' },
  { color: '#007AFF', darkColor: '#0A84FF' },
  { color: '#FF9500', darkColor: '#FF9F0A' },
]

export function StatsCards({ stats, changes, isLoading }: StatsCardsProps) {
  const { organization } = useOrganization()
  const { hasPermission } = usePermissions()

  /* ─── Pure helper functions (no hooks) ─── */

  const formatDuration = (minutes: number) => {
    if (minutes === 0) return '0h'
    let displayMinutes = minutes
    const roundingRules = organization?.settings?.timeTracking?.roundingRules
    if (roundingRules?.enabled) {
      displayMinutes = applyRoundingRules(minutes, {
        enabled: roundingRules.enabled,
        increment: roundingRules.increment || 15,
        roundUp: roundingRules.roundUp ?? true
      })
    }
    const days = Math.floor(displayMinutes / (60 * 8))
    const hours = Math.floor((displayMinutes % (60 * 8)) / 60)
    const mins = Math.floor(displayMinutes % 60)
    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
    return `${mins}m`
  }

  const formatChange = (change: number, isDuration = false) => {
    if (change === 0) return null
    if (isDuration) {
      const h = Math.floor(Math.abs(change) / 60)
      const m = Math.floor(Math.abs(change) % 60)
      const sign = change > 0 ? '+' : '-'
      return h > 0 ? `${sign}${h}h ${m}m` : `${sign}${m}m`
    }
    return change > 0 ? `+${change}` : `${change}`
  }

  const getChangeType = (change: number) => (change === 0 ? 'neutral' : change > 0 ? 'positive' : 'negative')

  const getChangePercentage = (change: number, lastMonth: number) => {
    if (change === 0 || lastMonth === 0 || Math.abs(change) < 0.01) return null
    const pct = Math.round((change / lastMonth) * 100)
    return Math.abs(pct) >= 1 ? `${Math.abs(pct)}%` : null
  }

  /* ─── Compute derived data (safe even when stats/changes are undefined) ─── */

  const lmActiveProjects = (stats?.activeProjects ?? 0) - (changes?.activeProjects ?? 0)
  const lmCompletedTasks = (stats?.completedTasks ?? 0) - (changes?.completedTasks ?? 0)
  const lmTeamMembers    = (stats?.teamMembers ?? 0)    - (changes?.teamMembers ?? 0)
  const lmHoursTracked   = (stats?.hoursTracked ?? 0)   - (changes?.hoursTracked ?? 0)

  const statsData = stats && changes ? [
    {
      title: 'Active Projects',
      value: stats.activeProjects,
      formattedValue: stats.activeProjects.toString(),
      change: formatChange(changes.activeProjects),
      changePercentage: getChangePercentage(changes.activeProjects, lmActiveProjects),
      changeType: getChangeType(changes.activeProjects),
      icon: FolderOpen,
    },
    {
      title: 'Completed Tasks',
      value: stats.completedTasks,
      formattedValue: stats.completedTasks.toString(),
      change: formatChange(changes.completedTasks),
      changePercentage: getChangePercentage(changes.completedTasks, lmCompletedTasks),
      changeType: getChangeType(changes.completedTasks),
      icon: CheckSquare,
    },
    {
      title: 'Team Members',
      value: stats.teamMembers,
      formattedValue: stats.teamMembers.toString(),
      change: formatChange(changes.teamMembers),
      changePercentage: getChangePercentage(changes.teamMembers, lmTeamMembers),
      changeType: getChangeType(changes.teamMembers),
      icon: Users,
    },
    {
      title: 'Hours Tracked',
      value: stats.hoursTracked,
      formattedValue: formatDuration(stats.hoursTracked),
      change: formatChange(changes.hoursTracked, true),
      changePercentage: getChangePercentage(changes.hoursTracked, lmHoursTracked),
      changeType: getChangeType(changes.hoursTracked),
      icon: Clock,
    },
  ] : []

  const filteredStatsData = statsData.filter(stat =>
    stat.title === 'Team Members' ? hasPermission(Permission.TEAM_MEMBER_WIDGET_VIEW) : true
  )

  /* ─── ALL hooks must be called unconditionally ─── */
  const sparklineDataSets = useMemo(
    () => filteredStatsData.map((s, i) => generateSparklineData(s.value, s.changeType, i * 7.3 + 1.1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredStatsData.map(s => `${s.value}-${s.changeType}`).join('|')]
  )

  /* ─── Now it's safe to return early ─── */

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card overflow-hidden">
            <div className="px-4 pt-4 pb-0">
              <div className="flex items-center justify-between mb-3">
                <div className="h-3 w-24 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
                <div className="h-4 w-4 rounded-full border-2 border-[var(--apple-tertiary-fill)] animate-pulse" />
              </div>
              <div className="h-9 w-16 bg-[var(--apple-tertiary-fill)] rounded animate-pulse mb-2" />
              <div className="h-3 w-28 bg-[var(--apple-tertiary-fill)] rounded animate-pulse mb-4" />
            </div>
            <div className="h-14 bg-[var(--apple-quaternary-fill)] animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

  if (!stats || !changes || filteredStatsData.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-[var(--apple-secondary-label)]">No data available</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const gridCols = filteredStatsData.length === 3
    ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
    : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'

  return (
    <div className={`grid ${gridCols} gap-4`}>
      {filteredStatsData.map((stat, index) => {
        const Icon = stat.icon
        const hasChange = stat.change !== null
        const isEmpty = stat.value === 0
        const accent = CARD_ACCENTS[index % 4]
        const ChangeIcon = stat.changeType === 'positive' ? TrendingUp : TrendingDown
        const changeColorClass =
          stat.changeType === 'positive' ? 'text-[var(--apple-system-green)]'
          : stat.changeType === 'negative' ? 'text-[var(--apple-system-red)]'
          : 'text-[var(--apple-system-gray)]'

        return (
          <div
            key={index}
            className={`rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none apple-transition hover:shadow-[0_4px_16px_rgba(0,0,0,0.10)] dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.25)] ${isEmpty ? 'opacity-60' : ''}`}
          >
            {/* Card content */}
            <div className="px-4 pt-4 pb-2">
              {/* Label + circle indicator — matches mockup */}
              <div className="flex items-center justify-between mb-3">
                <span className="apple-section-label">{stat.title}</span>
                <div className={`h-4 w-4 rounded-full border-2 flex-shrink-0 ${isEmpty ? 'border-[var(--apple-system-gray)]/40' : 'border-[var(--apple-separator)]'}`} />
              </div>

              {/* Large value */}
              <div className={`text-[32px] sm:text-[36px] font-bold tracking-tight leading-none mb-2 ${isEmpty ? 'text-[var(--apple-secondary-label)]' : 'text-[var(--apple-label)]'}`}>
                {stat.formattedValue}
              </div>

              {/* Change indicator */}
              {hasChange && (
                <div className="flex items-center gap-1 flex-wrap">
                  <ChangeIcon className={`h-3 w-3 flex-shrink-0 ${changeColorClass}`} />
                  <span className={`text-[11px] font-medium ${changeColorClass}`}>{stat.change}</span>
                  {stat.changePercentage && (
                    <span className={`text-[11px] ${changeColorClass}`}>({stat.changePercentage})</span>
                  )}
                  <span className="text-[11px] text-[var(--apple-tertiary-label)]">vs last mo.</span>
                </div>
              )}
              {!hasChange && stat.value > 0 && (
                <span className="text-[11px] text-[var(--apple-tertiary-label)]">No change from last month</span>
              )}
            </div>

            {/* Sparkline — gradient fill area chart, NO axes, NO labels, NO tooltip */}
            <div className="h-16 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={sparklineDataSets[index]}
                  margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id={`grad-${index}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={isEmpty ? '#8E8E93' : accent.color} stopOpacity={0.28} />
                      <stop offset="95%" stopColor={isEmpty ? '#8E8E93' : accent.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke={isEmpty ? 'var(--apple-system-gray)' : accent.color}
                    strokeWidth={1.5}
                    fill={`url(#grad-${index})`}
                    isAnimationActive={false}
                    dot={(props: any) => {
                      const lastIdx = sparklineDataSets[index].length - 1
                      if (props.index !== lastIdx) return <g key={props.key} />
                      return (
                        <circle
                          key={props.key}
                          cx={props.cx}
                          cy={props.cy}
                          r={3}
                          fill={isEmpty ? '#8E8E93' : accent.color}
                          stroke="var(--apple-system-background)"
                          strokeWidth={1.5}
                        />
                      )
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )
      })}
    </div>
  )
}
