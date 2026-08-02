'use client'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import {
  CheckCircle, Circle, Clock, Play, AlertTriangle, XCircle,
  Target, Zap, ArrowUp, ArrowUpRight, Minus, ArrowDown,
  Bug, Sparkles, Wrench, ListTodo, GitBranch, Layers,
  BookOpen, Loader2, ChevronLeft, ChevronRight,
  LayoutGrid, List, Kanban, SlidersHorizontal
} from 'lucide-react'
import { formatToTitleCase } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// ─── Status Config ─────────────────────────────────────────────────────────────

export const TASK_STATUS_CONFIG: Record<string, {
  bg: string; text: string; dot: string; border: string;
  icon: React.ReactNode; label: string;
}> = {
  backlog:     { bg: 'bg-gray-50 dark:bg-gray-900/40',      text: 'text-gray-500 dark:text-gray-400',    dot: 'bg-gray-400',   border: 'border-gray-200 dark:border-gray-700',  icon: <Circle className="h-3 w-3" />,      label: 'Backlog' },
  todo:        { bg: 'bg-slate-50 dark:bg-slate-900/40',    text: 'text-slate-600 dark:text-slate-400',  dot: 'bg-slate-400',  border: 'border-slate-200 dark:border-slate-700', icon: <Target className="h-3 w-3" />,     label: 'To Do' },
  in_progress: { bg: 'bg-blue-50 dark:bg-blue-950/30',      text: 'text-blue-600 dark:text-blue-400',    dot: 'bg-blue-500',   border: 'border-blue-200 dark:border-blue-800',  icon: <Play className="h-3 w-3" />,       label: 'In Progress' },
  review:      { bg: 'bg-amber-50 dark:bg-amber-950/30',    text: 'text-amber-600 dark:text-amber-400',  dot: 'bg-amber-500',  border: 'border-amber-200 dark:border-amber-800', icon: <AlertTriangle className="h-3 w-3" />, label: 'Review' },
  testing:     { bg: 'bg-purple-50 dark:bg-purple-950/30',  text: 'text-purple-600 dark:text-purple-400', dot: 'bg-purple-500', border: 'border-purple-200 dark:border-purple-800', icon: <Zap className="h-3 w-3" />, label: 'Testing' },
  done:        { bg: 'bg-emerald-50 dark:bg-emerald-950/30',text: 'text-emerald-600 dark:text-emerald-400',dot: 'bg-emerald-500',border: 'border-emerald-200 dark:border-emerald-800', icon: <CheckCircle className="h-3 w-3" />, label: 'Done' },
  cancelled:   { bg: 'bg-red-50 dark:bg-red-950/30',        text: 'text-red-500 dark:text-red-400',      dot: 'bg-red-500',    border: 'border-red-200 dark:border-red-800',    icon: <XCircle className="h-3 w-3" />,    label: 'Cancelled' },
  inprogress:  { bg: 'bg-blue-50 dark:bg-blue-950/30',      text: 'text-blue-600 dark:text-blue-400',    dot: 'bg-blue-500',   border: 'border-blue-200 dark:border-blue-800',  icon: <Play className="h-3 w-3" />,       label: 'In Progress' },
  planning:    { bg: 'bg-sky-50 dark:bg-sky-950/30',        text: 'text-sky-600 dark:text-sky-400',      dot: 'bg-sky-500',    border: 'border-sky-200 dark:border-sky-800',    icon: <Clock className="h-3 w-3" />,      label: 'Planning' },
  active:      { bg: 'bg-emerald-50 dark:bg-emerald-950/30',text: 'text-emerald-600 dark:text-emerald-400',dot: 'bg-emerald-500',border: 'border-emerald-200 dark:border-emerald-800', icon: <Play className="h-3 w-3" />, label: 'Active' },
  completed:   { bg: 'bg-gray-50 dark:bg-gray-900/40',      text: 'text-gray-500 dark:text-gray-400',    dot: 'bg-gray-400',   border: 'border-gray-200 dark:border-gray-700',  icon: <CheckCircle className="h-3 w-3" />, label: 'Completed' },
  scheduled:   { bg: 'bg-sky-50 dark:bg-sky-950/30',        text: 'text-sky-600 dark:text-sky-400',      dot: 'bg-sky-500',    border: 'border-sky-200 dark:border-sky-800',    icon: <Clock className="h-3 w-3" />,      label: 'Scheduled' },
}

// ─── Priority Config ────────────────────────────────────────────────────────────

export const PRIORITY_CONFIG: Record<string, {
  bg: string; text: string; border: string; icon: React.ReactNode; label: string;
}> = {
  low:      { bg: 'bg-gray-50 dark:bg-gray-900/40',     text: 'text-gray-500 dark:text-gray-400',    border: 'border-gray-200 dark:border-gray-700',    icon: <ArrowDown className="h-3 w-3" />,    label: 'Low' },
  medium:   { bg: 'bg-blue-50 dark:bg-blue-950/30',     text: 'text-blue-600 dark:text-blue-400',    border: 'border-blue-200 dark:border-blue-800',    icon: <Minus className="h-3 w-3" />,        label: 'Medium' },
  high:     { bg: 'bg-orange-50 dark:bg-orange-950/30', text: 'text-orange-600 dark:text-orange-400',border: 'border-orange-200 dark:border-orange-800', icon: <ArrowUp className="h-3 w-3" />,      label: 'High' },
  critical: { bg: 'bg-red-50 dark:bg-red-950/30',       text: 'text-red-600 dark:text-red-400',      border: 'border-red-200 dark:border-red-800',       icon: <ArrowUpRight className="h-3 w-3" />, label: 'Critical' },
}

// ─── Type Config ────────────────────────────────────────────────────────────────

export const TYPE_CONFIG: Record<string, {
  bg: string; text: string; border: string; icon: React.ReactNode; label: string;
}> = {
  bug:         { bg: 'bg-red-50 dark:bg-red-950/30',      text: 'text-red-600 dark:text-red-400',        border: 'border-red-200 dark:border-red-800',        icon: <Bug className="h-3 w-3" />,        label: 'Bug' },
  feature:     { bg: 'bg-emerald-50 dark:bg-emerald-950/30',text:'text-emerald-600 dark:text-emerald-400',border:'border-emerald-200 dark:border-emerald-800', icon: <Sparkles className="h-3 w-3" />,   label: 'Feature' },
  improvement: { bg: 'bg-blue-50 dark:bg-blue-950/30',    text: 'text-blue-600 dark:text-blue-400',      border: 'border-blue-200 dark:border-blue-800',      icon: <Wrench className="h-3 w-3" />,     label: 'Improvement' },
  task:        { bg: 'bg-gray-50 dark:bg-gray-900/40',    text: 'text-gray-600 dark:text-gray-400',      border: 'border-gray-200 dark:border-gray-700',      icon: <ListTodo className="h-3 w-3" />,   label: 'Task' },
  subtask:     { bg: 'bg-purple-50 dark:bg-purple-950/30',text: 'text-purple-600 dark:text-purple-400',  border: 'border-purple-200 dark:border-purple-800',  icon: <GitBranch className="h-3 w-3" />,  label: 'Subtask' },
  epic:        { bg: 'bg-purple-50 dark:bg-purple-950/30',text: 'text-purple-600 dark:text-purple-400',  border: 'border-purple-200 dark:border-purple-800',  icon: <Layers className="h-3 w-3" />,     label: 'Epic' },
  story:       { bg: 'bg-sky-50 dark:bg-sky-950/30',      text: 'text-sky-600 dark:text-sky-400',        border: 'border-sky-200 dark:border-sky-800',        icon: <BookOpen className="h-3 w-3" />,   label: 'Story' },
}

// ─── StatusBadge ────────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: string
  size?: 'sm' | 'md'
  animated?: boolean
  className?: string
}

const LIVE_STATUSES = new Set(['in_progress', 'inprogress', 'active'])

export function StatusBadge({ status, size = 'sm', animated = LIVE_STATUSES.has(status), className }: StatusBadgeProps) {
  const cfg = TASK_STATUS_CONFIG[status] ?? TASK_STATUS_CONFIG['backlog']
  const textSize = size === 'sm' ? 'text-[11px]' : 'text-xs'
  const px = size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1'

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border font-medium',
      textSize, px,
      cfg.bg, cfg.text, cfg.border,
      animated && 'badge-border-pulse',
      'transition-all duration-200',
      className
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', cfg.dot, animated && 'status-pulse')} />
      {cfg.label || formatToTitleCase(status)}
    </span>
  )
}

// ─── PriorityBadge ─────────────────────────────────────────────────────────────

interface PriorityBadgeProps {
  priority: string
  size?: 'sm' | 'md'
  className?: string
}

export function PriorityBadge({ priority, size = 'sm', className }: PriorityBadgeProps) {
  const cfg = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG['medium']
  const textSize = size === 'sm' ? 'text-[11px]' : 'text-xs'
  const px = size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1'

  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full border font-medium',
      textSize, px, cfg.bg, cfg.text, cfg.border,
      'transition-all duration-200',
      className
    )}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

// ─── TypeBadge ─────────────────────────────────────────────────────────────────

interface TypeBadgeProps {
  type: string
  size?: 'sm' | 'md'
  className?: string
}

export function TypeBadge({ type, size = 'sm', className }: TypeBadgeProps) {
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG['task']
  const textSize = size === 'sm' ? 'text-[11px]' : 'text-xs'
  const px = size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1'

  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full border font-medium',
      textSize, px, cfg.bg, cfg.text, cfg.border,
      'transition-all duration-200',
      className
    )}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

// ─── GradientProgress ──────────────────────────────────────────────────────────

const PROGRESS_GRADIENTS = [
  { gradient: 'linear-gradient(90deg,#007AFF 0%,#5AC8FA 100%)', glow: 'rgba(0,122,255,0.3)' },
  { gradient: 'linear-gradient(90deg,#34C759 0%,#30D158 100%)', glow: 'rgba(52,199,89,0.3)' },
  { gradient: 'linear-gradient(90deg,#BF5AF2 0%,#FF375F 100%)', glow: 'rgba(191,90,242,0.3)' },
  { gradient: 'linear-gradient(90deg,#FF9500 0%,#FFD60A 100%)', glow: 'rgba(255,149,0,0.3)' },
  { gradient: 'linear-gradient(90deg,#FF453A 0%,#FF9F0A 100%)', glow: 'rgba(255,69,58,0.3)' },
]

interface GradientProgressProps {
  pct: number
  colorIndex?: number
  gradient?: string
  glow?: string
  label?: string
  showPct?: boolean
  className?: string
}

export function GradientProgress({
  pct, colorIndex = 0, gradient: gradientProp, glow: glowProp, label, showPct = true, className
}: GradientProgressProps) {
  const fallback = PROGRESS_GRADIENTS[colorIndex % PROGRESS_GRADIENTS.length]
  const gradient = gradientProp ?? fallback.gradient
  const glow     = glowProp     ?? fallback.glow
  const safePct = Math.min(100, Math.max(0, pct))

  return (
    <div className={cn('space-y-1', className)}>
      {(label || showPct) && (
        <div className="flex items-center justify-between">
          {label && <span className="text-[11px] text-[var(--apple-secondary-label)] font-medium">{label}</span>}
          {showPct && <span className="text-[11px] font-apple-mono tabular-nums text-[var(--apple-secondary-label)]">{safePct}%</span>}
        </div>
      )}
      <div className="h-[5px] w-full rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
        {safePct > 0 && (
          <div
            className="h-full rounded-full relative overflow-hidden apple-transition"
            style={{
              width: `${safePct}%`,
              background: gradient,
              boxShadow: safePct > 2 ? `0 0 6px ${glow}` : 'none',
            }}
          >
            {safePct > 2 && <span className="progress-shimmer absolute inset-0" />}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── PageHeader ────────────────────────────────────────────────────────────────

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  meta?: React.ReactNode
  className?: string
  icon?: React.ElementType
  iconGradient?: string
  iconGlow?: string
}

export function PageHeader({ title, subtitle, actions, meta, className, icon: Icon, iconGradient, iconGlow }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4', className)}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {Icon && (
          iconGradient ? (
            <div
              className="h-11 w-11 rounded-[var(--apple-radius-md)] flex items-center justify-center flex-shrink-0 text-white"
              style={{ background: iconGradient, boxShadow: iconGlow ? `0 2px 12px ${iconGlow}` : undefined }}
            >
              <Icon className="h-6 w-6" strokeWidth={1.5} />
            </div>
          ) : (
            <Icon className="h-8 w-8 flex-shrink-0" strokeWidth={1.5} style={{ color: 'var(--apple-card-gradient)' }} />
          )
        )}
        <div className="min-w-0">
          <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight text-[var(--apple-label)] leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[15px] text-[var(--apple-secondary-label)] mt-0.5">{subtitle}</p>
          )}
          {meta && <div className="mt-1.5">{meta}</div>}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
          {actions}
        </div>
      )}
    </div>
  )
}

// ─── SectionLabel ──────────────────────────────────────────────────────────────

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('apple-section-label', className)}>{children}</span>
  )
}

// ─── TasksEmptyState ───────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function TasksEmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center py-16 px-8 text-center',
      'animate-in fade-in-0 slide-in-from-bottom-4 duration-500',
      className
    )}>
      {icon && (
        <div className="mb-4 p-4 rounded-2xl bg-[var(--apple-quaternary-fill)] text-[var(--apple-tertiary-label)]">
          {icon}
        </div>
      )}
      <h3 className="text-[17px] font-semibold text-[var(--apple-label)] mb-1">{title}</h3>
      {description && (
        <p className="text-[15px] text-[var(--apple-secondary-label)] max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ─── TasksLoadingSkeleton ──────────────────────────────────────────────────────

export function TasksLoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2.5 animate-in fade-in-0 duration-300">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-4 space-y-3"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="flex items-center gap-3">
            <div className="h-4 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse w-48" />
            <div className="ml-auto flex gap-2">
              <div className="h-5 w-16 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse" />
              <div className="h-5 w-14 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse" />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="h-3 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse w-24" />
            <div className="h-3 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse w-20" />
            <div className="h-3 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse w-28" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function CardGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 animate-in fade-in-0 duration-300">
      {Array.from({ length: cards }).map((_, i) => (
        <div
          key={i}
          className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-5 space-y-4"
        >
          <div className="flex items-start justify-between">
            <div className="h-5 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse w-36" />
            <div className="h-6 w-6 rounded-lg bg-[var(--apple-tertiary-fill)] animate-pulse" />
          </div>
          <div className="space-y-2">
            <div className="h-3 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse" />
            <div className="h-3 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse w-4/5" />
          </div>
          <div className="flex gap-2">
            <div className="h-5 w-16 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse" />
            <div className="h-5 w-14 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse" />
          </div>
          <div className="h-[5px] rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse" />
        </div>
      ))}
    </div>
  )
}

// ─── PaginationBar ─────────────────────────────────────────────────────────────

interface PaginationBarProps {
  currentPage: number
  totalPages: number
  totalCount: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  loading?: boolean
  className?: string
}

export function PaginationBar({
  currentPage, totalPages, totalCount, pageSize,
  onPageChange, onPageSizeChange, loading, className
}: PaginationBarProps) {
  const start = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const end = Math.min(currentPage * pageSize, totalCount)

  return (
    <div className={cn(
      'flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-[var(--apple-separator)]',
      className
    )}>
      <div className="flex items-center gap-3 text-[13px] text-[var(--apple-secondary-label)]">
        {onPageSizeChange && (
          <>
            <span>Per page</span>
            <Select value={pageSize.toString()} onValueChange={(v) => onPageSizeChange(parseInt(v))}>
              <SelectTrigger className="h-7 w-16 text-xs border-[var(--apple-separator)] rounded-[var(--apple-radius-sm)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map(n => (
                  <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
        <span className="font-apple-mono">
          {start}–{end} of {totalCount}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1 || loading}
          className="h-8 w-8 p-0 rounded-[var(--apple-radius-sm)] hover:bg-[var(--apple-quaternary-fill)]"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-[13px] font-apple-mono px-2 text-[var(--apple-secondary-label)]">
          {currentPage} / {totalPages || 1}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages || loading}
          className="h-8 w-8 p-0 rounded-[var(--apple-radius-sm)] hover:bg-[var(--apple-quaternary-fill)]"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── ViewSwitcher ──────────────────────────────────────────────────────────────

type ViewMode = 'list' | 'grid' | 'kanban'

interface ViewSwitcherProps {
  value: ViewMode
  onChange: (v: ViewMode) => void
  options?: ViewMode[]
  className?: string
}

const VIEW_ICONS: Record<ViewMode, React.ReactNode> = {
  list: <List className="h-3.5 w-3.5" />,
  grid: <LayoutGrid className="h-3.5 w-3.5" />,
  kanban: <Kanban className="h-3.5 w-3.5" />,
}
const VIEW_LABELS: Record<ViewMode, string> = {
  list: 'List',
  grid: 'Grid',
  kanban: 'Board',
}

export function ViewSwitcher({ value, onChange, options = ['list', 'grid', 'kanban'], className }: ViewSwitcherProps) {
  return (
    <div className={cn(
      'inline-flex items-center p-0.5 rounded-[var(--apple-radius-md)] bg-[var(--apple-tertiary-fill)]',
      className
    )}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-medium apple-transition',
            value === opt
              ? 'bg-background shadow-sm text-[var(--apple-label)]'
              : 'text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]'
          )}
        >
          {VIEW_ICONS[opt]}
          <span className="hidden sm:inline">{VIEW_LABELS[opt]}</span>
        </button>
      ))}
    </div>
  )
}

// ─── MetaInfo chip ─────────────────────────────────────────────────────────────

interface MetaChipProps {
  icon: React.ReactNode
  label: string
  title?: string
  className?: string
}

export function MetaChip({ icon, label, title, className }: MetaChipProps) {
  return (
    <div
      className={cn('flex items-center gap-1 text-[12px] text-[var(--apple-secondary-label)]', className)}
      title={title}
    >
      <span className="flex-shrink-0 text-[var(--apple-tertiary-label)]">{icon}</span>
      <span className="truncate">{label}</span>
    </div>
  )
}

// ─── FilterChip ────────────────────────────────────────────────────────────────

interface FilterChipProps {
  label: string
  active: boolean
  onClear?: () => void
  className?: string
}

export function FilterChip({ label, active, onClear, className }: FilterChipProps) {
  if (!active) return null
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border',
      'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
      'animate-in fade-in-0 zoom-in-95 duration-150',
      className
    )}>
      {label}
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="text-blue-400 hover:text-blue-600 transition-colors ml-0.5"
        >
          <span className="text-[10px] font-bold leading-none">✕</span>
        </button>
      )}
    </span>
  )
}

// ─── InlineLoader ──────────────────────────────────────────────────────────────

export function InlineLoader({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-[var(--apple-secondary-label)] animate-in fade-in-0 duration-300">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-[13px]">{label}</span>
    </div>
  )
}

// ─── FullPageLoader ─────────────────────────────────────────────────────────────

export function FullPageLoader({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 animate-in fade-in-0 duration-300">
      <div className="relative">
        <div className="h-10 w-10 rounded-full border-2 border-[var(--apple-tertiary-fill)]" />
        <Loader2 className="h-10 w-10 animate-spin absolute inset-0 text-[var(--apple-system-blue)]" />
      </div>
      <p className="text-[15px] text-[var(--apple-secondary-label)]">{label}</p>
    </div>
  )
}

// ─── Apple styled card shell ───────────────────────────────────────────────────

export const cardShell = 'rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none'
export const cardHover = 'hover:shadow-[0_8px_28px_rgba(0,0,0,0.10)] dark:hover:shadow-[0_8px_28px_rgba(0,0,0,0.38)] hover:-translate-y-0.5 apple-transition cursor-pointer'
