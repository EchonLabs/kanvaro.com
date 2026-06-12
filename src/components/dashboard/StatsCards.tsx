'use client'

import { useMemo, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Folder, CheckCircle2, UserRound, Clock, TrendingUp, TrendingDown, type LucideIcon } from 'lucide-react'
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


interface StatItem {
  title: string
  value: number
  formattedValue: string
  change: string | null
  changePercentage: string | null
  changeType: string
  icon: LucideIcon
}

interface StatCardItemProps {
  stat: StatItem
  index: number
  sparklineData: { v: number }[]
}

function StatCardItem({ stat, index, sparklineData }: StatCardItemProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), index * 90 + 60)
    return () => clearTimeout(t)
  }, [index])

  const hasChange = stat.change !== null
  const isEmpty = stat.value === 0
  const ChangeIcon = stat.changeType === 'positive' ? TrendingUp : TrendingDown
  const changeColorClass =
    stat.changeType === 'positive' ? 'text-[var(--apple-system-green)]'
    : stat.changeType === 'negative' ? 'text-[var(--apple-system-red)]'
    : 'text-[var(--apple-system-gray)]'

  return (
    <div
      className={`relative rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none hover:shadow-[0_6px_24px_rgba(16,72,209,0.12)] dark:hover:shadow-[0_6px_24px_rgba(61,142,255,0.14)] transition-all duration-500 ease-out ${
        !visible
          ? 'opacity-0 translate-y-2'
          : isEmpty
          ? 'opacity-50 translate-y-0'
          : 'opacity-100 translate-y-0'
      }`}
    >
      {/* Card content */}
      <div className="relative z-10 px-4 pt-4 pb-2">
        {/* Label only — no icon badge */}
        <div className="mb-3">
          <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-secondary-label)]">
            {stat.title}
          </span>
        </div>

        {/* Large value — theme gradient text, fades in */}
        <div
          className={`text-[34px] sm:text-[38px] font-bold tracking-tight leading-none mb-2 transition-all duration-700 ease-out delay-100 ${visible ? 'opacity-100' : 'opacity-0'}`}
          style={
            !isEmpty
              ? {
                  background: 'var(--apple-chart-gradient)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }
              : { color: 'var(--apple-secondary-label)' }
          }
        >
          {stat.formattedValue}
        </div>

        {/* Change indicator */}
        {hasChange && (
          <div className="flex items-center gap-1 flex-wrap">
            <ChangeIcon className={`h-3 w-3 flex-shrink-0 ${changeColorClass}`} />
            <span className={`text-xs font-medium ${changeColorClass}`}>{stat.change}</span>
            {stat.changePercentage && (
              <span className={`text-xs ${changeColorClass}`}>({stat.changePercentage})</span>
            )}
            <span className="text-xs text-[var(--apple-tertiary-label)]">vs last month</span>
          </div>
        )}
        {!hasChange && stat.value > 0 && (
          <span className="text-xs text-[var(--apple-tertiary-label)]">No change from last month</span>
        )}
      </div>

      {/* Sparkline — animated draw-in, CSS-variable-driven gradient fill + stroke */}
      <div className="relative z-10 h-[72px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={sparklineData}
            margin={{ top: 6, right: 0, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id={`fill-${index}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={isEmpty ? '#8E8E93' : 'var(--apple-chart-to)'}   stopOpacity={isEmpty ? 0.15 : 0.42} />
                <stop offset="55%"  stopColor={isEmpty ? '#8E8E93' : 'var(--apple-chart-from)'} stopOpacity={isEmpty ? 0.05 : 0.14} />
                <stop offset="100%" stopColor={isEmpty ? '#8E8E93' : 'var(--apple-chart-from)'} stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`stroke-${index}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stopColor={isEmpty ? '#8E8E93' : 'var(--apple-chart-from)'} />
                <stop offset="100%" stopColor={isEmpty ? '#8E8E93' : 'var(--apple-chart-to)'}   />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={`url(#stroke-${index})`}
              strokeWidth={2}
              fill={`url(#fill-${index})`}
              isAnimationActive={true}
              animationDuration={900}
              animationEasing="ease-out"
              animationBegin={index * 110 + 180}
              dot={(props: any) => {
                const lastIdx = sparklineData.length - 1
                if (props.index !== lastIdx) return <g key={props.key} />
                return (
                  <circle
                    key={props.key}
                    cx={props.cx}
                    cy={props.cy}
                    r={3.5}
                    fill={isEmpty ? '#8E8E93' : 'var(--apple-chart-to)'}
                    stroke="var(--apple-system-background)"
                    strokeWidth={2}
                  />
                )
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function StatsCards({ stats, changes, isLoading }: StatsCardsProps) {
  const { organization } = useOrganization()
  const { hasPermission } = usePermissions()

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

  const lmActiveProjects = (stats?.activeProjects ?? 0) - (changes?.activeProjects ?? 0)
  const lmCompletedTasks = (stats?.completedTasks ?? 0) - (changes?.completedTasks ?? 0)
  const lmTeamMembers    = (stats?.teamMembers ?? 0)    - (changes?.teamMembers ?? 0)
  const lmHoursTracked   = (stats?.hoursTracked ?? 0)   - (changes?.hoursTracked ?? 0)

  const statsData: StatItem[] = stats && changes ? [
    {
      title: 'Active Projects',
      value: stats.activeProjects,
      formattedValue: stats.activeProjects.toString(),
      change: formatChange(changes.activeProjects),
      changePercentage: getChangePercentage(changes.activeProjects, lmActiveProjects),
      changeType: getChangeType(changes.activeProjects),
      icon: Folder,
    },
    {
      title: 'Completed Tasks',
      value: stats.completedTasks,
      formattedValue: stats.completedTasks.toString(),
      change: formatChange(changes.completedTasks),
      changePercentage: getChangePercentage(changes.completedTasks, lmCompletedTasks),
      changeType: getChangeType(changes.completedTasks),
      icon: CheckCircle2,
    },
    {
      title: 'Team Members',
      value: stats.teamMembers,
      formattedValue: stats.teamMembers.toString(),
      change: formatChange(changes.teamMembers),
      changePercentage: getChangePercentage(changes.teamMembers, lmTeamMembers),
      changeType: getChangeType(changes.teamMembers),
      icon: UserRound,
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

  const sparklineDataSets = useMemo(
    () => filteredStatsData.map((s, i) => generateSparklineData(s.value, s.changeType, i * 7.3 + 1.1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredStatsData.map(s => `${s.value}-${s.changeType}`).join('|')]
  )

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card overflow-hidden">
            <div className="px-4 pt-4 pb-0">
              <div className="h-3 w-24 bg-[var(--apple-tertiary-fill)] rounded animate-pulse mb-3" />
              <div className="h-9 w-16 bg-[var(--apple-tertiary-fill)] rounded animate-pulse mb-2" />
              <div className="h-3 w-28 bg-[var(--apple-tertiary-fill)] rounded animate-pulse mb-4" />
            </div>
            <div className="h-[72px] bg-[var(--apple-quaternary-fill)] animate-pulse" />
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
      {filteredStatsData.map((stat, index) => (
        <StatCardItem
          key={stat.title}
          stat={stat}
          index={index}
          sparklineData={sparklineDataSets[index]}
        />
      ))}
    </div>
  )
}
