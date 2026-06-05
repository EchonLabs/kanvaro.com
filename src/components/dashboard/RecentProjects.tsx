'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { cn, formatToTitleCase } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { ArrowRight, FolderOpen, TrendingUp } from 'lucide-react'
import { useRouter } from 'next/navigation'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface RecentProjectsProps {
  projects?: any[]
  isLoading?: boolean
}

// ─── Status Configuration ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, {
  bg: string; text: string; dot: string; border: string
}> = {
  active:    { bg: 'bg-emerald-50  dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400',  dot: 'bg-emerald-500',  border: 'border-emerald-200 dark:border-emerald-800'  },
  planning:  { bg: 'bg-blue-50     dark:bg-blue-950/30',    text: 'text-blue-600    dark:text-blue-400',     dot: 'bg-blue-500',     border: 'border-blue-200    dark:border-blue-800'     },
  on_hold:   { bg: 'bg-amber-50    dark:bg-amber-950/30',   text: 'text-amber-600   dark:text-amber-400',    dot: 'bg-amber-500',    border: 'border-amber-200   dark:border-amber-800'    },
  completed: { bg: 'bg-gray-50     dark:bg-gray-900/40',    text: 'text-gray-500    dark:text-gray-400',     dot: 'bg-gray-400',     border: 'border-gray-200    dark:border-gray-700'     },
  cancelled: { bg: 'bg-red-50      dark:bg-red-950/30',     text: 'text-red-600     dark:text-red-400',      dot: 'bg-red-500',      border: 'border-red-200     dark:border-red-800'      },
  draft:     { bg: 'bg-orange-50   dark:bg-orange-950/30',  text: 'text-orange-600  dark:text-orange-400',   dot: 'bg-orange-500',   border: 'border-orange-200  dark:border-orange-800'   },
}

// ─── Project Palette ───────────────────────────────────────────────────────────

const PROJECT_PALETTE = [
  { gradient: 'linear-gradient(135deg,#007AFF 0%,#5AC8FA 100%)', glow: 'rgba(0,122,255,0.30)',   text: '#007AFF' },
  { gradient: 'linear-gradient(135deg,#BF5AF2 0%,#FF375F 100%)', glow: 'rgba(191,90,242,0.30)',  text: '#BF5AF2' },
  { gradient: 'linear-gradient(135deg,#34C759 0%,#30D158 100%)', glow: 'rgba(52,199,89,0.30)',   text: '#34C759' },
  { gradient: 'linear-gradient(135deg,#FF9500 0%,#FFD60A 100%)', glow: 'rgba(255,149,0,0.30)',   text: '#FF9500' },
  { gradient: 'linear-gradient(135deg,#30B0C7 0%,#64D2FF 100%)', glow: 'rgba(48,176,199,0.30)',  text: '#30B0C7' },
  { gradient: 'linear-gradient(135deg,#FF453A 0%,#FF9F0A 100%)', glow: 'rgba(255,69,58,0.30)',   text: '#FF453A' },
]

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG.draft
}

/* Format minutes into compact form — no trailing label, just the time */
function formatHoursTracked(minutes?: number): string {
  if (!minutes || minutes === 0) return 'No Time Tracked'
  const hours = Math.floor(minutes / 60)
  const mins  = Math.floor(minutes % 60)
  if (hours === 0) return `${mins}m`
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────
/*
 * Fixed width (w-[104px]) ensures every badge occupies exactly the same column
 * space, so progress bars render at identical widths across all rows.
 *
 * Visual animations:
 *  - Inner dot: "status-pulse" keyframe (scale + opacity) from globals.css
 *  - Border ring: "badge-border-pulse" keyframe (box-shadow glow) from globals.css
 */
function StatusBadge({ status }: { status: string }) {
  const cfg = getStatusConfig(status)
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center gap-1.5 px-2 py-0.5',
        'rounded-full text-xs font-semibold border whitespace-nowrap',
        'w-[104px]',          /* ← fixed width keeps progress bars uniform */
        cfg.bg, cfg.text, cfg.border,
      )}
      style={{ animation: 'badge-border-pulse 2s ease-in-out infinite' }}
    >
      {/* Blinking dot */}
      <span
        className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', cfg.dot)}
        style={{ animation: 'status-pulse 2s ease-in-out infinite' }}
      />
      {formatToTitleCase(status)}
    </span>
  )
}

// ─── GradientProgress ─────────────────────────────────────────────────────────
/* Gradient bar + glow shadow + shimmer sweep. No end-cap dot. */
function GradientProgress({
  value,
  gradient,
  glow,
}: {
  value: number
  gradient: string
  glow: string
}) {
  const pct = Math.min(Math.max(value, 0), 100)
  return (
    <div className="flex items-center gap-2.5 w-full">
      <div className="relative flex-1 h-[7px] rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full overflow-hidden transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background: gradient,
            boxShadow: pct > 2 ? `0 0 10px ${glow}, 0 1px 4px ${glow}` : 'none',
          }}
        >
          {pct > 2 && <span aria-hidden className="progress-shimmer absolute inset-0" />}
        </div>
      </div>
      <span className="text-xs font-apple-mono font-semibold text-[var(--apple-secondary-label)] w-8 text-right flex-shrink-0 tabular-nums">
        {pct}%
      </span>
    </div>
  )
}

// ─── ProjectAvatar ────────────────────────────────────────────────────────────
function ProjectAvatar({ name, gradient }: { name: string; gradient: string }) {
  const initials = name.split(' ').slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join('')
  return (
    <div
      className="h-9 w-9 rounded-[var(--apple-radius-sm)] flex items-center justify-center flex-shrink-0 text-white text-xs font-bold select-none shadow-sm"
      style={{ background: gradient }}
    >
      {initials}
    </div>
  )
}

// ─── Hours cell ───────────────────────────────────────────────────────────────
/*
 * Compact: "{hours}" + a green blinking TrendingUp icon.
 * The icon is hidden when there's no data (shows "No Time Tracked").
 */
function HoursCell({ minutes }: { minutes?: number }) {
  const text = formatHoursTracked(minutes)
  const hasData = !!minutes && minutes > 0
  return (
    <div className="flex items-center justify-end gap-1 flex-shrink-0">
      <span className="text-sm font-apple-mono font-semibold text-[var(--apple-secondary-label)] tabular-nums">
        {text}
      </span>
      {hasData && ( 
        
        <TrendingUp
          className="h-3.5 w-3.5 flex-shrink-0 text-[var(--apple-system-green)]"
          style={{ animation: 'status-pulse 2s ease-in-out infinite' }}
        />
        
      )}
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function ProjectRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3.5 border-b border-[var(--apple-separator)] last:border-0">
      <div className="h-9 w-9 rounded-[var(--apple-radius-sm)] bg-[var(--apple-tertiary-fill)] animate-pulse flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-4 w-36 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
        <div className="h-[7px] w-full bg-[var(--apple-tertiary-fill)] rounded-full animate-pulse" />
      </div>
      <div className="h-6 w-[104px] bg-[var(--apple-tertiary-fill)] rounded-full animate-pulse flex-shrink-0" />
      <div className="h-4 w-14 bg-[var(--apple-tertiary-fill)] rounded animate-pulse flex-shrink-0" />
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function RecentProjects({ projects, isLoading }: RecentProjectsProps) {
  const router = useRouter()

  /* ── Loading ── */
  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="h-5 w-40 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
            <div className="h-4 w-24 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
          </div>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {[1, 2, 3, 4].map((i) => <ProjectRowSkeleton key={i} />)}
        </CardContent>
      </Card>
    )
  }

  /* ── Empty ── */
  if (!projects || projects.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Projects Overview</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => router.push('/projects')}>
              View All <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="h-14 w-14 rounded-[var(--apple-radius-lg)] bg-[var(--apple-tertiary-fill)] flex items-center justify-center">
              <FolderOpen className="h-7 w-7 text-[var(--apple-secondary-label)]" />
            </div>
            <p className="text-[15px] font-medium text-[var(--apple-secondary-label)]">No projects yet</p>
            <Button size="sm" onClick={() => router.push('/projects/create')}>
              Create Your First Project
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  /* ── Main table ── */
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <CardTitle>Projects Overview</CardTitle>
          <button
            onClick={() => router.push('/projects')}
            className="flex items-center gap-1 text-[15px] text-[var(--apple-system-blue)] hover:opacity-75 apple-transition font-medium"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {projects.map((project, idx) => {
          const palette   = PROJECT_PALETTE[idx % PROJECT_PALETTE.length]
          const progress  = project.progress || 0

          return (
            <div
              key={project._id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/projects/${project._id}`)}
              onKeyDown={(e) => e.key === 'Enter' && router.push(`/projects/${project._id}`)}
              className={cn(
                'group cursor-pointer border-b border-[var(--apple-separator)] last:border-0',
                'apple-transition hover:bg-[var(--apple-quaternary-fill)]',
                'focus-visible:outline-none focus-visible:bg-[var(--apple-quaternary-fill)]',
              )}
            >
              {/*
               * Desktop grid — ALL columns are fixed or proportional so every
               * progress bar renders at the SAME pixel width across all rows:
               *
               *   auto      | 1fr      | 2fr          | 104px      | 72px
               *   avatar    | name     | progress bar | status     | hours
               *
               * status = fixed 104px (matches StatusBadge width)
               * hours  = fixed 72px (compact: "3h 47m" + icon)
               */}
              <div className="hidden md:grid grid-cols-[auto_1fr_3fr_1fr_1fr] gap-3 items-center px-4 py-4">
                {/* Avatar */}
                <ProjectAvatar name={project.name} gradient={palette.gradient} />

                {/* Project name */}
                <span
                  className="text-[15px] font-semibold text-[var(--apple-label)] truncate group-hover:text-[var(--apple-system-blue)] apple-transition"
                  title={project.name}
                >
                  {project.name}
                </span>

                {/* Progress bar — always uniform width because column is 2fr */}
                <GradientProgress
                  value={progress}
                  gradient={palette.gradient}
                  glow={palette.glow}
                />

                {/* Status badge — fixed 104px column matches badge width exactly */}
                <StatusBadge status={project.status} />

                {/* Hours + animated trend icon */}
                <HoursCell minutes={project.hoursTracked} />
              </div>

              {/* Mobile stacked layout */}
              <div className="md:hidden px-4 py-3.5 space-y-2.5">
                <div className="flex items-center gap-3">
                  <ProjectAvatar name={project.name} gradient={palette.gradient} />
                  <div className="flex-1 min-w-0">
                    <span
                      className="block text-[15px] font-semibold text-[var(--apple-label)] truncate"
                      title={project.name}
                    >
                      {project.name}
                    </span>
                    <HoursCell minutes={project.hoursTracked} />
                  </div>
                  <StatusBadge status={project.status} />
                </div>
                <GradientProgress
                  value={progress}
                  gradient={palette.gradient}
                  glow={palette.glow}
                />
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
