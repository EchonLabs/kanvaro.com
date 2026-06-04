'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { formatToTitleCase, cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { ArrowRight, FolderOpen } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface RecentProjectsProps {
  projects?: any[]
  isLoading?: boolean
}

/* Apple HIG semantic status styles */
const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  active:    { bg: 'bg-[var(--apple-system-green)]/15',  text: 'text-[var(--apple-system-green)]'  },
  planning:  { bg: 'bg-[var(--apple-system-blue)]/15',   text: 'text-[var(--apple-system-blue)]'   },
  on_hold:   { bg: 'bg-[var(--apple-system-yellow)]/20', text: 'text-[var(--apple-system-yellow)]' },
  completed: { bg: 'bg-[var(--apple-system-gray)]/15',   text: 'text-[var(--apple-system-gray)]'   },
  cancelled: { bg: 'bg-[var(--apple-system-red)]/15',    text: 'text-[var(--apple-system-red)]'    },
  draft:     { bg: 'bg-[var(--apple-system-orange)]/15', text: 'text-[var(--apple-system-orange)]' },
}

/* Cycling colors for progress bars — each project gets a distinct Apple accent */
const PROJECT_BAR_COLORS = [
  'var(--apple-system-blue)',
  'var(--apple-system-purple)',
  'var(--apple-system-green)',
  'var(--apple-system-orange)',
  'var(--apple-system-teal)',
  'var(--apple-system-red)',
]

function getStatusStyle(status: string) {
  return STATUS_STYLES[status] || STATUS_STYLES.draft
}

function formatHoursTracked(minutes?: number) {
  if (!minutes || minutes === 0) return '—'
  const hours = Math.floor(minutes / 60)
  const mins = Math.floor(minutes % 60)
  if (hours === 0) return `${mins}m`
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

export function RecentProjects({ projects, isLoading }: RecentProjectsProps) {
  const router = useRouter()

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="h-4 w-36 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
            <div className="h-4 w-24 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="px-3 py-2 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-4 flex-1 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
                  <div className="h-5 w-16 bg-[var(--apple-tertiary-fill)] rounded-full animate-pulse" />
                  <div className="h-4 w-10 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
                </div>
                <div className="h-2 w-full bg-[var(--apple-tertiary-fill)] rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

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
          <div className="text-center py-10">
            <FolderOpen className="h-8 w-8 text-[var(--apple-tertiary-label)] mx-auto mb-3" />
            <p className="text-sm text-[var(--apple-secondary-label)] mb-4">No projects found</p>
            <Button variant="default" size="sm" onClick={() => router.push('/projects/create')}>
              Create Your First Project
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-x-hidden">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Projects Overview</CardTitle>
          <button
            onClick={() => router.push('/projects')}
            className="text-sm text-[var(--apple-system-blue)] hover:opacity-80 apple-transition flex items-center gap-1"
          >
            View all projects <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-4">
        <div className="space-y-0">
          {projects.map((project, idx) => {
            const style = getStatusStyle(project.status)
            const barColor = PROJECT_BAR_COLORS[idx % PROJECT_BAR_COLORS.length]
            const progress = project.progress || 0
            const hoursText = formatHoursTracked(project.hoursTracked)

            return (
              <div
                key={project._id}
                className="px-3 py-3 hover:bg-[var(--apple-quaternary-fill)] apple-transition rounded-[var(--apple-radius-md)] cursor-pointer border-b border-[var(--apple-separator)] last:border-0"
                onClick={() => router.push(`/projects/${project._id}`)}
              >
                {/* Top row: project name + status badge + hours */}
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="text-sm font-medium text-[var(--apple-label)] truncate flex-1 min-w-0"
                    title={project.name}
                  >
                    {project.name}
                  </span>
                  <span className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded-[var(--apple-radius-pill)] text-[10px] font-medium flex-shrink-0',
                    style.bg, style.text
                  )}>
                    {formatToTitleCase(project.status)}
                  </span>
                  <span className="text-xs font-apple-mono text-[var(--apple-secondary-label)] flex-shrink-0 w-12 text-right">
                    {hoursText}
                  </span>
                </div>

                {/* Bottom row: full-width progress bar + percentage */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${progress}%`, backgroundColor: barColor }}
                    />
                  </div>
                  <span className="text-[10px] text-[var(--apple-tertiary-label)] flex-shrink-0 w-7 text-right">
                    {progress}%
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
