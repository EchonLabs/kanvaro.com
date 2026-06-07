'use client'

import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { cn, formatToTitleCase } from '@/lib/utils'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { ArrowRightLeft, Bell, MessageSquare, Plus, TrendingUp } from 'lucide-react'
import type { StandupTimelineItem } from './standup-dashboard-types'

interface StandupTimelineProps {
  items: StandupTimelineItem[]
}

const TONE_MAP: Record<StandupTimelineItem['type'], { gradient: string; glow: string; badge: string; text: string }> = {
  update:     { gradient: 'linear-gradient(135deg,#007AFF 0%,#5AC8FA 100%)', glow: 'rgba(0,122,255,0.2)',   badge: 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',   text: 'Update' },
  assignment: { gradient: 'linear-gradient(135deg,#BF5AF2 0%,#FF375F 100%)', glow: 'rgba(191,90,242,0.2)',  badge: 'bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800', text: 'Assignment' },
  blocker:    { gradient: 'linear-gradient(135deg,#FF453A 0%,#FF9F0A 100%)', glow: 'rgba(255,69,58,0.2)',   badge: 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800',       text: 'Blocker' },
  progress:   { gradient: 'linear-gradient(135deg,#34C759 0%,#30D158 100%)', glow: 'rgba(52,199,89,0.2)',   badge: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800', text: 'Progress' },
  note:       { gradient: 'linear-gradient(135deg,#FF9500 0%,#FFD60A 100%)', glow: 'rgba(255,149,0,0.2)',   badge: 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800', text: 'Note' },
}

const ICON_MAP = {
  update: MessageSquare,
  assignment: Plus,
  blocker: Bell,
  progress: TrendingUp,
  note: ArrowRightLeft
}

export function StandupTimeline({ items }: StandupTimelineProps) {
  const { formatDateTimeSafe } = useDateTime()

  return (
    <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] overflow-hidden">
      {/* Header */}
      <div className="border-b border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-5 py-4">
        <p className="apple-section-label text-[var(--apple-secondary-label)] mb-0.5">Activity</p>
        <p className="text-[17px] font-semibold">Daily Updates Timeline</p>
      </div>

      {items.length === 0 ? (
        <div className="px-5 py-12 text-center text-[13px] text-[var(--apple-secondary-label)]">
          No timeline activity recorded yet.
        </div>
      ) : (
        <div className="relative p-5">
          {/* Vertical line */}
          <div className="absolute left-[34px] top-5 bottom-5 w-px bg-[var(--apple-separator)]" />

          <div className="space-y-4">
            {items.map((item) => {
              const tone = TONE_MAP[item.type]
              const Icon = ICON_MAP[item.type]

              return (
                <div key={item._id} className="flex gap-4 apple-transition group">
                  {/* Icon badge */}
                  <div
                    className="relative z-10 flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[var(--apple-radius-sm)] shadow-sm"
                    style={{ background: tone.gradient, boxShadow: `0 4px 12px ${tone.glow}` }}
                  >
                    <Icon className="h-4 w-4 text-white" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-card px-4 py-3 apple-transition group-hover:shadow-[0_4px_16px_rgba(0,0,0,0.07)] dark:group-hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-[var(--apple-label)]">{item.title}</p>
                        <p className="text-[12px] text-[var(--apple-secondary-label)] mt-0.5">{item.description}</p>
                      </div>
                      <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold', tone.badge)}>
                        {tone.text}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <GravatarAvatar user={item.author} size={20} className="h-5 w-5 rounded-full border border-[var(--apple-separator)]" />
                        <span className="text-[11px] text-[var(--apple-secondary-label)]">
                          {item.author.firstName} {item.author.lastName}
                        </span>
                      </div>
                      <span className="text-[10px] text-[var(--apple-tertiary-label)]">
                        {formatDateTimeSafe(item.createdAt)}
                      </span>
                      {item.projectTask && (
                        <span className="rounded-full bg-[var(--apple-tertiary-fill)] px-2 py-0.5 text-[10px] font-medium text-[var(--apple-secondary-label)]">
                          {item.projectTask}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
