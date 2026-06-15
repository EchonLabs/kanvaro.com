'use client'

import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { Activity, ArrowRight, CheckCircle2, FilePlus2, Play, MessageCircle, Timer, PencilLine, Clock } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface TeamActivityProps {
  activities?: any[]
  isLoading?: boolean
}

const ACTION_CONFIG: Record<string, { Icon: any; color: string; label: string }> = {
  completed: { Icon: CheckCircle2,   color: 'var(--apple-system-green)',  label: 'completed' },
  created:   { Icon: FilePlus2,      color: 'var(--apple-chart-to)',      label: 'created' },
  started:   { Icon: Play,           color: 'var(--apple-system-green)',  label: 'started' },
  commented: { Icon: MessageCircle,  color: 'var(--apple-system-orange)', label: 'commented on' },
  logged:    { Icon: Timer,          color: 'var(--apple-system-purple)', label: 'logged time for' },
  updated:   { Icon: PencilLine,     color: 'var(--apple-system-teal)',   label: 'updated' },
}
const DEFAULT_ACTION = { Icon: Clock, color: 'var(--apple-system-gray)', label: '' }

const formatTimestamp = (timestamp: string) => {
  const now = new Date()
  const t = new Date(timestamp)
  const mins = Math.floor((now.getTime() - t.getTime()) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return t.toLocaleDateString()
}

export function TeamActivity({ activities, isLoading }: TeamActivityProps) {
  const router = useRouter()

  if (isLoading) {
    return (
      <div className="rounded-[var(--apple-radius-xl)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--apple-separator)]">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-[var(--apple-radius-sm)] bg-[var(--apple-tertiary-fill)] animate-pulse" />
            <div className="h-4 w-28 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
          </div>
          <div className="h-3.5 w-16 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
        </div>
        <div className="divide-y divide-[var(--apple-separator)]">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-start gap-3 px-5 py-3.5">
              <div className="h-8 w-8 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse shrink-0" />
              <div className="flex-1 space-y-2 pt-0.5">
                <div className="h-3 w-3/4 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
                <div className="h-2.5 w-1/2 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
              </div>
              <div className="h-2.5 w-10 bg-[var(--apple-tertiary-fill)] rounded animate-pulse shrink-0 mt-1" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const HeaderBlock = (
    <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--apple-separator)]">
      <div className="flex items-center gap-3">
        <Activity className="h-5 w-5 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
        <p className="text-[15px] font-semibold text-[var(--apple-label)]">Recent Activity</p>
      </div>
      <button
        onClick={() => router.push('/activity')}
        className="flex items-center gap-1 text-[12px] font-medium apple-transition hover:opacity-70"
        style={{ color: 'var(--apple-chart-to)' }}
      >
        View all <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
      </button>
    </div>
  )

  if (!activities || activities.length === 0) {
    return (
      <div className="rounded-[var(--apple-radius-xl)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
        {HeaderBlock}
        <div className="flex flex-col items-center gap-3 py-12 px-6 text-center">
          <Activity className="h-6 w-6 text-[var(--apple-tertiary-label)]" strokeWidth={1.5} />
          <div className="space-y-0.5">
            <p className="text-[14px] font-semibold text-[var(--apple-label)]">No recent activity</p>
            <p className="text-[12px] text-[var(--apple-secondary-label)]">
              Team activity will appear here as members work on projects and tasks.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[var(--apple-radius-xl)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
      {HeaderBlock}

      <div className="divide-y divide-[var(--apple-separator)] max-h-[420px] overflow-y-auto">
        {activities.map((activity, index) => {
          const cfg = ACTION_CONFIG[activity.action] ?? { ...DEFAULT_ACTION, label: activity.action }
          const ActionIcon = cfg.Icon

          return (
            <div
              key={activity.id || index}
              className="flex items-start gap-3 px-5 py-3.5 apple-transition hover:bg-[var(--apple-quaternary-fill)]"
            >
              {/* Avatar with action badge */}
              <div className="relative shrink-0 mt-0.5">
                <GravatarAvatar user={activity.user} size={32} className="rounded-full" />
                <ActionIcon
                  className="absolute -bottom-0.5 -right-0.5 h-[9px] w-[9px]"
                  style={{ color: cfg.color }}
                  strokeWidth={1.5}
                />
              </div>

              {/* Activity text */}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-[var(--apple-label)] leading-snug">
                  <span className="font-semibold">
                    {activity.user?.firstName} {activity.user?.lastName}
                  </span>
                  {' '}
                  <span className="text-[var(--apple-secondary-label)]">{cfg.label}</span>
                  {activity.target && (
                    <> <span className="font-medium">"{activity.target}"</span></>
                  )}
                </p>
                {activity.project && (
                  <p className="text-[11px] text-[var(--apple-tertiary-label)] mt-0.5 truncate">
                    {activity.project}
                  </p>
                )}
              </div>

              {/* Timestamp */}
              <span className="text-[11px] text-[var(--apple-tertiary-label)] whitespace-nowrap shrink-0 mt-0.5">
                {formatTimestamp(activity.timestamp)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
