
'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Button } from '@/components/ui/Button'
import { cn, formatToTitleCase } from '@/lib/utils'
import { useOrganization } from '@/hooks/useOrganization'
import { useOrgCurrency } from '@/hooks/useOrgCurrency'
import { useNotify } from '@/lib/notify'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PermissionGate } from '@/lib/permissions/permission-components'
import { Permission } from '@/lib/permissions/permission-definitions'
import { PageContent } from '@/components/ui/PageContent'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { useAuthContext } from '@/contexts/AuthContext'
import {
  Plus,
  Search,
  MoreHorizontal,
  Calendar,
  Users,
  DollarSign,
  Settings,
  Edit,
  Trash2,
  Eye,
  FolderOpen,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  _id: string
  name: string
  description: string
  status: 'draft' | 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  isDraft: boolean
  startDate: string
  endDate?: string
  projectNumber?: number
  budget?: {
    total: number
    spent: number
    currency: string
  }
  createdBy: {
    firstName: string
    lastName: string
    email: string
  }
  teamMembers: Array<{
    firstName: string
    lastName: string
    email: string
  }>
  client?: {
    firstName: string
    lastName: string
    email: string
  }
  progress: {
    completionPercentage: number
    tasksCompleted: number
    totalTasks: number
  }
  createdAt: string
}

// ─── Design Tokens ────────────────────────────────────────────────────────────

const PROJECT_PALETTE = [
  { gradient: 'var(--apple-card-gradient)', glow: 'var(--apple-chart-glow)' },
  { gradient: 'var(--apple-card-gradient)', glow: 'var(--apple-chart-glow)' },
  { gradient: 'var(--apple-card-gradient)', glow: 'var(--apple-chart-glow)' },
  { gradient: 'var(--apple-card-gradient)', glow: 'var(--apple-chart-glow)' },
  { gradient: 'var(--apple-card-gradient)', glow: 'var(--apple-chart-glow)' },
  { gradient: 'var(--apple-card-gradient)', glow: 'var(--apple-chart-glow)' },
]

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  draft:     { bg: 'bg-orange-50 dark:bg-orange-950/30',   text: 'text-orange-600 dark:text-orange-400',   dot: 'bg-orange-500',   border: 'border-orange-200 dark:border-orange-800' },
  planning:  { bg: 'bg-blue-50 dark:bg-blue-950/30',       text: 'text-blue-600 dark:text-blue-400',       dot: 'bg-blue-500',     border: 'border-blue-200 dark:border-blue-800' },
  active:    { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500',  border: 'border-emerald-200 dark:border-emerald-800' },
  on_hold:   { bg: 'bg-amber-50 dark:bg-amber-950/30',     text: 'text-amber-600 dark:text-amber-400',     dot: 'bg-amber-500',    border: 'border-amber-200 dark:border-amber-800' },
  completed: { bg: 'bg-gray-50 dark:bg-gray-900/40',       text: 'text-gray-500 dark:text-gray-400',       dot: 'bg-gray-400',     border: 'border-gray-200 dark:border-gray-700' },
  cancelled: { bg: 'bg-red-50 dark:bg-red-950/30',         text: 'text-red-600 dark:text-red-400',         dot: 'bg-red-500',      border: 'border-red-200 dark:border-red-800' },
}

const PRIORITY_CONFIG: Record<string, { bg: string; text: string; border: string }> = {
  low:      { bg: 'bg-gray-50 dark:bg-gray-900/40',      text: 'text-gray-500 dark:text-gray-400',     border: 'border-gray-200 dark:border-gray-700' },
  medium:   { bg: 'bg-blue-50 dark:bg-blue-950/30',      text: 'text-blue-600 dark:text-blue-400',     border: 'border-blue-200 dark:border-blue-800' },
  high:     { bg: 'bg-orange-50 dark:bg-orange-950/30',  text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-800' },
  critical: { bg: 'bg-red-50 dark:bg-red-950/30',        text: 'text-red-600 dark:text-red-400',       border: 'border-red-200 dark:border-red-800' },
}

// ─── Atoms ────────────────────────────────────────────────────────────────────

function ProjectAvatar({
  name,
  gradient,
  size = 'md',
}: {
  name: string
  gradient: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() ?? '')
    .join('')
  const sizeClasses = {
    sm: 'h-8 w-8 text-xs rounded-[var(--apple-radius-sm)]',
    md: 'h-10 w-10 text-sm rounded-[var(--apple-radius-sm)]',
    lg: 'h-12 w-12 text-base rounded-[var(--apple-radius-md)]',
  }
  return (
    <div
      className={cn(
        'flex items-center justify-center flex-shrink-0 text-white font-bold select-none',
        sizeClasses[size],
      )}
      style={{ background: gradient }}
    >
      {initials}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center gap-1.5 px-2 py-0.5',
        'rounded-full text-xs font-semibold border whitespace-nowrap',
        'w-[104px]', 
        cfg.bg, cfg.text, cfg.border,
      )}
      style={{ animation: 'badge-border-pulse 2s ease-in-out infinite' }}
    >
      <span
        className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', cfg.dot)}
        style={{ animation: 'status-pulse 2s ease-in-out infinite' }}
      />
      {formatToTitleCase(status)}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const cfg = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.low
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5',
        'rounded-full text-xs font-medium border whitespace-nowrap',
        cfg.bg, cfg.text, cfg.border,
      )}
    >
      {formatToTitleCase(priority)}
    </span>
  )
}

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
    <div className="flex items-center gap-2 w-full">
      <div className="relative flex-1 h-[6px] rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full overflow-hidden progress-bar-animated"
          style={{
            width: `${pct}%`,
            background: gradient,
            boxShadow: pct > 2 ? `0 0 8px ${glow}, 0 1px 3px ${glow}` : 'none',
            transformOrigin: 'left',
          }}
        >
          {pct > 2 && <span aria-hidden className="progress-shimmer absolute inset-0" />}
        </div>
      </div>
      <span className="text-xs font-apple-mono font-semibold text-[var(--apple-secondary-label)] w-7 text-right flex-shrink-0 tabular-nums">
        {pct}%
      </span>
    </div>
  )
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function GridCardSkeleton() {
  return (
    <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none">
      <div className="h-0.5 bg-[var(--apple-tertiary-fill)]" />
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div className="h-10 w-10 rounded-[var(--apple-radius-sm)] bg-[var(--apple-tertiary-fill)] animate-pulse" />
          <div className="h-4 w-16 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
        </div>
        <div className="space-y-1.5">
          <div className="h-5 w-3/4 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
          <div className="flex gap-2">
            <div className="h-5 w-20 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse" />
            <div className="h-5 w-16 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse" />
          </div>
        </div>
        <div className="space-y-1">
          <div className="h-[6px] w-full rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse" />
          <div className="h-3 w-28 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
        </div>
        <div className="pt-3 border-t border-[var(--apple-separator)] flex justify-between">
          <div className="h-3 w-16 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
          <div className="h-3 w-20 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
        </div>
      </div>
    </div>
  )
}

function ListRowSkeleton() {
  return (
    <div
      className={cn(
        'grid gap-x-4 items-center px-5 py-3.5',
        'border-b border-[var(--apple-separator)] last:border-0',
        LIST_COLS,
      )}
    >
      <div className="h-10 w-10 rounded-[var(--apple-radius-sm)] bg-[var(--apple-tertiary-fill)] animate-pulse" />
      <div className="h-4 w-36 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
      <div className="h-[6px] w-full rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse" />
      <div className="h-5 w-20 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse" />
      <div className="h-5 w-16 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse" />
      <div className="h-4 w-8 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
      <div className="h-7 w-7 rounded-lg bg-[var(--apple-tertiary-fill)] animate-pulse" />
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({
  hasFilters,
  onClearFilters,
  onCreateProject,
}: {
  hasFilters: boolean
  onClearFilters: () => void
  onCreateProject: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5 text-center">
      <div
        className="h-16 w-16 rounded-[var(--apple-radius-lg)] flex items-center justify-center shadow-sm"
        style={{ background: 'var(--apple-card-gradient)' }}
      >
        <FolderOpen className="h-8 w-8 text-white" />
      </div>
      <div className="space-y-1.5">
        <p className="text-[17px] font-semibold text-[var(--apple-label)]">
          {hasFilters ? 'No matching projects' : 'No projects yet'}
        </p>
        <p className="text-[15px] text-[var(--apple-secondary-label)] max-w-[280px]">
          {hasFilters
            ? 'Try adjusting your search or filters to find what you\'re looking for.'
            : 'Create your first project to start tracking work with your team.'}
        </p>
      </div>
      {hasFilters ? (
        <Button variant="outline" size="sm" onClick={onClearFilters} className="apple-transition">
          Clear filters
        </Button>
      ) : (
        <PermissionGate permission={Permission.PROJECT_CREATE}>
          <Button size="sm" onClick={onCreateProject} className="apple-transition">
            <Plus className="h-4 w-4 mr-1.5" />
            Create Project
          </Button>
        </PermissionGate>
      )}
    </div>
  )
}

// ─── Context Menu ─────────────────────────────────────────────────────────────

function ProjectContextMenu({
  project,
  isAdmin,
  onDelete,
  onNavigate,
}: {
  project: Project
  isAdmin: boolean
  onDelete: (id: string) => void
  onNavigate: (path: string) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 flex-shrink-0 text-[var(--apple-tertiary-label)] hover:text-[var(--apple-label)] hover:bg-[var(--apple-tertiary-fill)] apple-transition"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">More options</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation()
            onNavigate(`/projects/${project._id}`)
          }}
        >
          <Eye className="h-4 w-4 mr-2" />
          View Project
        </DropdownMenuItem>
        <PermissionGate permission={Permission.PROJECT_UPDATE} projectId={project._id}>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation()
              onNavigate(`/projects/${project._id}?tab=settings`)
            }}
          >
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation()
              onNavigate(`/projects/create?edit=${project._id}`)
            }}
          >
            <Edit className="h-4 w-4 mr-2" />
            Edit Project
          </DropdownMenuItem>
        </PermissionGate>
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation()
              if (!isAdmin) return
              onDelete(project._id)
            }}
            disabled={!isAdmin}
            title={!isAdmin ? 'Only admins can delete projects' : undefined}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Project
          </DropdownMenuItem>
        </>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Grid Card ────────────────────────────────────────────────────────────────

function ProjectGridCard({
  project,
  index,
  isAdmin,
  onDelete,
  onNavigate,
  formatDate,
  formatCurrency,
  orgCurrency,
}: {
  project: Project
  index: number
  isAdmin: boolean
  onDelete: (id: string) => void
  onNavigate: (path: string) => void
  formatDate: (d: string) => string
  formatCurrency: (amount: number, currency: string) => string
  orgCurrency: string
}) {
  const palette = PROJECT_PALETTE[index % PROJECT_PALETTE.length]
  const pct = project.progress?.completionPercentage || 0

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(`/projects/${project._id}`)}
      onKeyDown={(e) => e.key === 'Enter' && onNavigate(`/projects/${project._id}`)}
      className={cn(
        'card-fade-in group rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card',
        'shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none',
        'apple-transition cursor-pointer overflow-hidden flex flex-col',
        'hover:shadow-[0_8px_28px_rgba(0,0,0,0.11)] dark:hover:shadow-[0_8px_28px_rgba(0,0,0,0.40)]',
        'hover:-translate-y-0.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--apple-system-blue)] focus-visible:ring-offset-2',
      )}
    >
      {/* Gradient accent bar */}
      <div className="h-[3px] w-full flex-shrink-0" style={{ background: palette.gradient }} />

      <div className="p-4 flex flex-col gap-3">
        {/* Row 1: Avatar + Name + Badges + Actions side-by-side */}
        <div className="flex items-start gap-3">
          <ProjectAvatar name={project.name} gradient={palette.gradient} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3
                className="text-[15px] font-semibold leading-tight text-[var(--apple-label)] group-hover:text-[var(--apple-system-blue)] apple-transition truncate"
                title={project.name}
              >
                {project.name}
              </h3>
              <div className="flex items-center gap-1 flex-shrink-0">
                {typeof project.projectNumber !== 'undefined' && (
                  <span className="text-[11px] font-apple-mono text-[var(--apple-tertiary-label)]">
                    #{project.projectNumber}
                  </span>
                )}
                {project.isDraft && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--apple-tertiary-fill)] text-[var(--apple-secondary-label)] font-medium">
                    Draft
                  </span>
                )}
                <ProjectContextMenu
                  project={project}
                  isAdmin={isAdmin}
                  onDelete={onDelete}
                  onNavigate={onNavigate}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <StatusBadge status={project.status} />
              <PriorityBadge priority={project.priority} />
            </div>
          </div>
        </div>

        {/* Row 2: Progress bar */}
        <GradientProgress value={pct} gradient={palette.gradient} glow={palette.glow} />

        {/* Row 3: Meta — tasks + team + date + budget (no border separator) */}
        <div className="flex items-center gap-3 flex-wrap text-[13px] text-[var(--apple-secondary-label)]">
          {project.progress?.totalTasks > 0 && (
            <span className="flex items-center gap-1">
              <CheckSquare className="h-3 w-3 flex-shrink-0" />
              <span className="font-apple-mono tabular-nums">
                {project.progress.tasksCompleted}/{project.progress.totalTasks}
              </span>
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3 flex-shrink-0" />
            <span className="font-apple-mono tabular-nums">{project.teamMembers.length}</span>
          </span>
          {project.budget && (
            <span className="flex items-center gap-0.5 font-apple-mono tabular-nums">
              <DollarSign className="h-3 w-3 flex-shrink-0" />
              {formatCurrency(project.budget.total, project.budget.currency || orgCurrency)}
            </span>
          )}
          {project.endDate && (
            <span className="flex items-center gap-1 ml-auto text-[var(--apple-tertiary-label)] flex-shrink-0">
              <Calendar className="h-3 w-3 flex-shrink-0" />
              <span className="whitespace-nowrap">{formatDate(project.endDate)}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── List Header + Row ────────────────────────────────────────────────────────
//
// Both use the same 7-column grid template so every data cell sits directly
// below its heading with zero extra layout work:
//
//   40px   |  1fr        |  160px    |  auto   |  auto    |  auto  |  32px
//   avatar |  name       |  progress |  status |  priority|  team  |  menu
//

const LIST_COLS = 'grid-cols-[auto_1fr_3fr_1fr_1fr_auto_32px]'

function ListHeader() {
  return (
    <div
      className={cn(
        'grid gap-x-4 items-center px-5 py-2.5',
        'border-b border-[var(--apple-separator)]',
        'bg-[var(--apple-tertiary-fill)]',
        LIST_COLS,
      )}
    >
      {/* spacer — avatar column */}
      <div />
      <span className="apple-section-label">Project</span>
      <span className="apple-section-label">Progress</span>
      <span className="apple-section-label">Status</span>
      <span className="apple-section-label">Priority</span>
      <span className="apple-section-label">Team</span>
      {/* spacer — menu column */}
      <div />
    </div>
  )
}

function ProjectListRow({
  project,
  index,
  isAdmin,
  onDelete,
  onNavigate,
}: {
  project: Project
  index: number
  isAdmin: boolean
  onDelete: (id: string) => void
  onNavigate: (path: string) => void
}) {
  const palette = PROJECT_PALETTE[index % PROJECT_PALETTE.length]
  const pct = project.progress?.completionPercentage || 0

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(`/projects/${project._id}`)}
      onKeyDown={(e) => e.key === 'Enter' && onNavigate(`/projects/${project._id}`)}
      className={cn(
        'group grid gap-x-4 items-center px-5 py-3.5',
        'border-b border-[var(--apple-separator)] last:border-0',
        'cursor-pointer apple-transition',
        'hover:bg-[var(--apple-quaternary-fill)]',
        'focus-visible:outline-none focus-visible:bg-[var(--apple-quaternary-fill)]',
        LIST_COLS,
      )}
    >
      {/* 1 — Avatar */}
      <ProjectAvatar name={project.name} gradient={palette.gradient} size="md" />

      {/* 2 — Name */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="text-[15px] font-semibold text-[var(--apple-label)] group-hover:text-[var(--apple-system-blue)] apple-transition truncate"
            title={project.name}
          >
            {project.name}
          </span>
          {typeof project.projectNumber !== 'undefined' && (
            <span className="text-[11px] font-apple-mono text-[var(--apple-tertiary-label)] flex-shrink-0">
              #{project.projectNumber}
            </span>
          )}
          {project.isDraft && (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--apple-tertiary-fill)] text-[var(--apple-secondary-label)] font-medium flex-shrink-0">
              Draft
            </span>
          )}
        </div>
      </div>

      {/* 3 — Progress */}
      <GradientProgress value={pct} gradient={palette.gradient} glow={palette.glow} />

      {/* 4 — Status */}
      <div className="flex-shrink-0">
        <StatusBadge status={project.status} />
      </div>

      {/* 5 — Priority */}
      <div className="flex-shrink-0">
        <PriorityBadge priority={project.priority} />
      </div>

      {/* 6 — Team count */}
      <div className="flex items-center gap-1 text-[13px] text-[var(--apple-secondary-label)] flex-shrink-0">
        <Users className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="font-apple-mono tabular-nums">{project.teamMembers.length}</span>
      </div>

      {/* 7 — Context menu */}
      <ProjectContextMenu
        project={project}
        isAdmin={isAdmin}
        onDelete={onDelete}
        onNavigate={onNavigate}
      />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuthContext()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { organization } = useOrganization()
  const { formatCurrency } = useOrgCurrency()
  const { success: notifySuccess, error: notifyError } = useNotify()
  const { formatDate } = useDateTime()
  const orgCurrency = organization?.currency || 'USD'
  const isAdmin =
    typeof user?.role === 'string' &&
    ['admin', 'super_admin', 'superadmin'].includes(user.role.toLowerCase())

  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [totalCount, setTotalCount] = useState(0)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      setLoading(false)
      fetchProjects()
    } else if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated])

  useEffect(() => {
    const q = searchParams.get('search') || ''
    const s = searchParams.get('status') || 'all'
    const p = searchParams.get('priority') || 'all'
    setSearchQuery(q)
    setDebouncedSearchQuery(q)
    setStatusFilter(s)
    setPriorityFilter(p)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!loading) fetchProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchQuery, statusFilter, priorityFilter, currentPage, pageSize])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    const handleFocus = () => { if (!loading) fetchProjects() }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !loading) fetchProjects()
    }
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  // Force grid view on mobile — list view is desktop-only
  useEffect(() => {
    const syncViewMode = () => {
      if (window.innerWidth < 640) setViewMode('grid')
    }
    syncViewMode()
    window.addEventListener('resize', syncViewMode)
    return () => window.removeEventListener('resize', syncViewMode)
  }, [])

  const fetchProjects = async () => {
    try {
      if (isInitialLoad) setLoading(true)
      else setSearching(true)
      const params = new URLSearchParams()
      if (debouncedSearchQuery) params.set('search', debouncedSearchQuery)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (priorityFilter !== 'all') params.set('priority', priorityFilter)
      params.set('page', currentPage.toString())
      params.set('limit', pageSize.toString())
      const response = await fetch(`/api/projects?${params.toString()}`)
      const data = await response.json()
      if (data.success) {
        setProjects(data.data)
        setTotalCount(data.pagination?.total || data.data.length)
      } else {
        notifyError({ title: 'Error', message: data.error || 'Failed to fetch projects' })
      }
    } catch {
      notifyError({ title: 'Error', message: 'Failed to fetch projects' })
    } finally {
      if (isInitialLoad) {
        setLoading(false)
        setIsInitialLoad(false)
      } else {
        setSearching(false)
      }
    }
  }

  const handleDeleteClick = (projectId: string) => {
    setProjectToDelete(projectId)
    setDeleteModalOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!projectToDelete) return
    try {
      setIsDeleting(true)
      const response = await fetch(`/api/projects/${projectToDelete}`, { method: 'DELETE' })
      const data = await response.json()
      if (data.success) {
        setProjects(projects.filter((p) => p._id !== projectToDelete))
        setDeleteModalOpen(false)
        setProjectToDelete(null)
        notifySuccess({ title: 'Success', message: 'Project deleted successfully.' })
      } else {
        notifyError({ title: 'Error', message: data.error || 'Failed to delete project' })
      }
    } catch (err) {
      console.error('Delete error:', err)
      notifyError({ title: 'Error', message: 'Failed to delete project' })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false)
    setProjectToDelete(null)
  }

  const hasFilters =
    searchQuery !== '' || statusFilter !== 'all' || priorityFilter !== 'all'

  const clearFilters = () => {
    setSearchQuery('')
    setDebouncedSearchQuery('')
    setStatusFilter('all')
    setPriorityFilter('all')
    setCurrentPage(1)
  }

  const navigate = (path: string) => router.push(path)

  // ─── Loading skeleton ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <MainLayout>
        <PageContent>
          <div className="space-y-6">
            {/* Header skeleton */}
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-8 w-28 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
                <div className="h-4 w-44 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
              </div>
              <div className="h-9 w-32 bg-[var(--apple-tertiary-fill)] rounded-[var(--apple-radius-md)] animate-pulse" />
            </div>
            {/* Toolbar skeleton */}
            <div className="flex gap-2.5">
              <div className="flex-1 h-10 bg-[var(--apple-tertiary-fill)] rounded-[var(--apple-radius-md)] animate-pulse" />
              <div className="h-10 w-32 bg-[var(--apple-tertiary-fill)] rounded-[var(--apple-radius-md)] animate-pulse" />
              <div className="h-10 w-32 bg-[var(--apple-tertiary-fill)] rounded-[var(--apple-radius-md)] animate-pulse" />
              <div className="h-10 w-20 bg-[var(--apple-tertiary-fill)] rounded-[var(--apple-radius-md)] animate-pulse" />
            </div>
            {/* Grid skeleton */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <GridCardSkeleton key={i} />
              ))}
            </div>
          </div>
        </PageContent>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <PageContent>
        <div className="space-y-6">

          {/* ─── Page Header ─────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight leading-tight text-[var(--apple-label)]">
                Projects
              </h1>
              <p className="text-[15px] text-[var(--apple-secondary-label)] mt-0.5">
                {searching ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--apple-system-blue)] animate-pulse" />
                    Searching...
                  </span>
                ) : totalCount > 0 ? (
                  `${totalCount} project${totalCount !== 1 ? 's' : ''}`
                ) : (
                  'Manage and track your projects'
                )}
              </p>
            </div>
            <PermissionGate permission={Permission.PROJECT_CREATE}>
              <Button
                onClick={() => router.push('/projects/create')}
                className="flex items-center gap-2 text-sm font-medium apple-transition w-full sm:w-auto text-white hover:opacity-90"
                style={{ background: 'var(--apple-card-gradient)' }}
              >
                <Plus className="h-4 w-4" />
                New Project
              </Button>
            </PermissionGate>
          </div>

          {/* ─── Toolbar ─────────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--apple-tertiary-label)] pointer-events-none" />
              <input
                ref={searchInputRef}
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(
                  'w-full pl-9 pr-4 h-10 rounded-[var(--apple-radius-md)]',
                  'bg-[var(--apple-tertiary-fill)] border border-transparent',
                  'text-[15px] text-[var(--apple-label)] placeholder:text-[var(--apple-tertiary-label)]',
                  'focus:outline-none focus:ring-2 focus:ring-[var(--apple-system-blue)] focus:ring-offset-0 focus:border-transparent',
                  'apple-transition',
                )}
              />
            </div>

            {/* Status filter */}
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v)
                setCurrentPage(1)
              }}
            >
              <SelectTrigger className="w-full sm:w-[140px] h-10 text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="planning">Planning</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            {/* Priority filter */}
            <Select
              value={priorityFilter}
              onValueChange={(v) => {
                setPriorityFilter(v)
                setCurrentPage(1)
              }}
            >
              <SelectTrigger className="w-full sm:w-[140px] h-10 text-sm">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>

            {/* View toggle — hidden on mobile, list view is desktop-only */}
            <div className="hidden sm:flex items-center rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] overflow-hidden bg-[var(--apple-tertiary-fill)] flex-shrink-0">
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  'flex items-center justify-center h-10 w-10 apple-transition',
                  viewMode === 'grid'
                    ? 'bg-card text-[var(--apple-label)] shadow-sm'
                    : 'text-[var(--apple-tertiary-label)] hover:text-[var(--apple-secondary-label)]',
                )}
                aria-label="Grid view"
                aria-pressed={viewMode === 'grid'}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  'flex items-center justify-center h-10 w-10 apple-transition',
                  viewMode === 'list'
                    ? 'bg-card text-[var(--apple-label)] shadow-sm'
                    : 'text-[var(--apple-tertiary-label)] hover:text-[var(--apple-secondary-label)]',
                )}
                aria-label="List view"
                aria-pressed={viewMode === 'list'}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ─── Content ─────────────────────────────────────────────────── */}
          {searching ? (
            /* Searching skeleton */
            viewMode === 'grid' ? (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <GridCardSkeleton key={i} />
                ))}
              </div>
            ) : (
              <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none">
                <ListHeader />
                {[1, 2, 3, 4, 5].map((i) => (
                  <ListRowSkeleton key={i} />
                ))}
              </div>
            )
          ) : projects.length === 0 ? (
            <EmptyState
              hasFilters={hasFilters}
              onClearFilters={clearFilters}
              onCreateProject={() => router.push('/projects/create')}
            />
          ) : viewMode === 'grid' ? (
            /* ─── Grid View ─── */
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project, i) => (
                <ProjectGridCard
                  key={project._id}
                  project={project}
                  index={i}
                  isAdmin={isAdmin}
                  onDelete={handleDeleteClick}
                  onNavigate={navigate}
                  formatDate={formatDate}
                  formatCurrency={formatCurrency}
                  orgCurrency={orgCurrency}
                />
              ))}
            </div>
          ) : (
            /* ─── List View ─── */
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none">
              <ListHeader />
              {projects.map((project, i) => (
                <ProjectListRow
                  key={project._id}
                  project={project}
                  index={i}
                  isAdmin={isAdmin}
                  onDelete={handleDeleteClick}
                  onNavigate={navigate}
                />
              ))}
            </div>
          )}

          {/* ─── Pagination ──────────────────────────────────────────────── */}
          {projects.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <div className="flex items-center gap-2 text-[13px] text-[var(--apple-secondary-label)]">
                <span>Per page:</span>
                <Select
                  value={pageSize.toString()}
                  onValueChange={(v) => {
                    setPageSize(parseInt(v))
                    setCurrentPage(1)
                  }}
                >
                  <SelectTrigger className="w-16 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-[var(--apple-tertiary-label)] tabular-nums font-apple-mono text-xs">
                  {totalCount === 0
                    ? '0'
                    : `${((currentPage - 1) * pageSize) + 1}–${Math.min(currentPage * pageSize, totalCount)}`}{' '}
                  of {totalCount}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1 || loading}
                  className={cn(
                    'flex items-center justify-center h-8 w-8 rounded-[var(--apple-radius-sm)]',
                    'border border-[var(--apple-separator)] bg-card',
                    'text-[var(--apple-label)] apple-transition',
                    'hover:bg-[var(--apple-quaternary-fill)]',
                    'disabled:opacity-40 disabled:cursor-not-allowed',
                  )}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-3 text-[13px] text-[var(--apple-secondary-label)] font-apple-mono tabular-nums">
                  {currentPage} / {Math.ceil(totalCount / pageSize) || 1}
                </span>
                <button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage >= Math.ceil(totalCount / pageSize) || loading}
                  className={cn(
                    'flex items-center justify-center h-8 w-8 rounded-[var(--apple-radius-sm)]',
                    'border border-[var(--apple-separator)] bg-card',
                    'text-[var(--apple-label)] apple-transition',
                    'hover:bg-[var(--apple-quaternary-fill)]',
                    'disabled:opacity-40 disabled:cursor-not-allowed',
                  )}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ─── Delete Confirmation ──────────────────────────────────────── */}
        <ConfirmationModal
          isOpen={deleteModalOpen}
          onClose={handleDeleteCancel}
          onConfirm={handleDeleteConfirm}
          title="Delete Project"
          description={`Are you sure you want to delete "${projects.find((p) => p._id === projectToDelete)?.name || 'this project'}"? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          variant="destructive"
          isLoading={isDeleting}
        />
      </PageContent>
    </MainLayout>
  )
}
