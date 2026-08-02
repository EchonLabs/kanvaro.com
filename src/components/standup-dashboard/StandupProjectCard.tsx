'use client'

import { useDateTime } from '@/components/providers/DateTimeProvider'
import { ArrowRight, Calendar, Users } from 'lucide-react'
import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import type { StandupProjectSummary } from './standup-dashboard-types'

const PROJECT_PALETTE = [
  { gradient: 'var(--apple-card-gradient)', glow: 'var(--apple-chart-glow)' },
  { gradient: 'var(--apple-card-gradient)', glow: 'var(--apple-chart-glow)' },
  { gradient: 'var(--apple-card-gradient)', glow: 'var(--apple-chart-glow)' },
  { gradient: 'var(--apple-card-gradient)', glow: 'var(--apple-chart-glow)' },
  { gradient: 'var(--apple-card-gradient)', glow: 'var(--apple-chart-glow)' },
  { gradient: 'var(--apple-card-gradient)', glow: 'var(--apple-chart-glow)' },
]

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; border: string; label: string }> = {
  active:    { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', border: 'border-emerald-200 dark:border-emerald-800', label: 'Active' },
  planning:  { bg: 'bg-blue-50 dark:bg-blue-950/30',       text: 'text-blue-600 dark:text-blue-400',       dot: 'bg-blue-500',   border: 'border-blue-200 dark:border-blue-800',   label: 'Planning' },
  on_hold:   { bg: 'bg-amber-50 dark:bg-amber-950/30',     text: 'text-amber-600 dark:text-amber-400',     dot: 'bg-amber-500',  border: 'border-amber-200 dark:border-amber-800', label: 'On Hold' },
  completed: { bg: 'bg-gray-50 dark:bg-gray-900/40',       text: 'text-gray-500 dark:text-gray-400',       dot: 'bg-gray-400',   border: 'border-gray-200 dark:border-gray-700',   label: 'Completed' },
}

interface StandupProjectCardProps {
  project: StandupProjectSummary
  index: number
  onOpen: (projectId: string) => void
}

export function StandupProjectCard({ project, index, onOpen }: StandupProjectCardProps) {
  const { formatDate } = useDateTime()
  const palette = PROJECT_PALETTE[index % PROJECT_PALETTE.length]
  const statusCfg = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.active
  const isLive = project.status === 'active'

  return (
    <div className="group relative overflow-hidden rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] apple-transition hover:shadow-[0_8px_28px_rgba(0,0,0,0.11)] dark:hover:shadow-[0_8px_28px_rgba(0,0,0,0.40)] hover:-translate-y-0.5">
      {/* Gradient accent bar */}
      <div className="h-1 w-full" style={{ background: palette.gradient }} />

      <div className="p-5 space-y-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-[17px] font-semibold truncate">{project.name}</h3>
            <p className="mt-0.5 text-[13px] text-[var(--apple-secondary-label)] line-clamp-2">
              {project.summary}
            </p>
          </div>
          {/* Status badge — pulse reserved for actively-running projects */}
          <div
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold shrink-0 ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border} ${isLive ? 'badge-border-pulse' : ''}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot} ${isLive ? 'status-pulse' : ''}`}
            />
            {statusCfg.label}
          </div>
        </div>

        {/* Gradient progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-[var(--apple-secondary-label)]">Standup progress</span>
            <span className="font-apple-mono tabular-nums font-semibold">{project.progressPercent}%</span>
          </div>
          <div className="relative h-[6px] overflow-hidden rounded-full bg-[var(--apple-tertiary-fill)]">
            {project.progressPercent > 2 && (
              <div
                className="absolute inset-y-0 left-0 overflow-hidden rounded-full"
                style={{
                  width: `${project.progressPercent}%`,
                  background: palette.gradient,
                  boxShadow: `0 0 8px ${palette.glow}`,
                }}
              >
                <span className="progress-shimmer absolute inset-0" />
              </div>
            )}
          </div>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-3 text-[12px] text-[var(--apple-secondary-label)]">
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" strokeWidth={1.5} />
            {project.teamMembers.length} member{project.teamMembers.length !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" strokeWidth={1.5} />
            {formatDate(project.lastStandupAt)}
          </span>
        </div>

        {/* Team avatar strip — real Gravatar avatars */}
        {project.teamMembers.length > 0 && (
          <div className="flex -space-x-2">
            {project.teamMembers.slice(0, 6).map((member: any) => (
              <GravatarAvatar
                key={member._id}
                user={member}
                size={28}
                className="border-2 border-card rounded-full"
              />
            ))}
            {project.teamMembers.length > 6 && (
              <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-[var(--apple-tertiary-fill)] text-[10px] font-semibold text-[var(--apple-secondary-label)]">
                +{project.teamMembers.length - 6}
              </div>
            )}
          </div>
        )}

        {/* CTA button */}
        <button
          onClick={() => onOpen(project._id)}
          className="apple-transition flex w-full items-center justify-center gap-2 rounded-[var(--apple-radius-sm)] py-2.5 text-[13px] font-semibold text-white shadow-sm hover:opacity-90 active:scale-[0.98]"
          style={{ background: palette.gradient, boxShadow: `0 2px 12px ${palette.glow}` }}
        >
          Open Dashboard
          <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}
