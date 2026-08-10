'use client'

import { useState, useRef, useMemo } from 'react'
import { Button } from '@/components/ui/Button'
import { ZoomIn, ZoomOut, Calendar, User, AlertTriangle, Layers, ArrowRight } from 'lucide-react'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { cn } from '@/lib/utils'
import { GanttTask } from '@/lib/gantt'

interface GanttChartProps {
  tasks: GanttTask[]
  startDate: Date
  endDate: Date
  onTaskClick?: (task: GanttTask) => void
  className?: string
}

// Sprint phase bar status styles
const SPRINT_STYLES: Record<string, { gradient: string; glow: string; label: string; chip: string }> = {
  completed: { gradient: 'linear-gradient(90deg,#8E8E93 0%,#AEAEB2 100%)', glow: 'rgba(142,142,147,0.20)', label: 'Past',    chip: 'bg-[var(--apple-tertiary-fill)] text-[var(--apple-secondary-label)]' },
  active:    { gradient: 'linear-gradient(90deg,#34C759 0%,#30D158 100%)', glow: 'rgba(52,199,89,0.30)',  label: 'Active',  chip: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' },
  planned:   { gradient: 'var(--apple-chart-color)',                        glow: 'var(--apple-chart-glow)', label: 'Planned', chip: 'bg-[var(--apple-tertiary-fill)] text-[var(--apple-chart-color)]' },
}

// Task bar status styles
const TASK_STYLES: Record<string, { gradient: string; glow: string }> = {
  done:        { gradient: 'linear-gradient(90deg,#34C759,#30D158)', glow: 'rgba(52,199,89,0.35)'  },
  in_progress: { gradient: 'var(--apple-chart-color)',               glow: 'var(--apple-chart-glow)' },
  review:      { gradient: 'linear-gradient(90deg,#FF9500,#FFD60A)', glow: 'rgba(255,149,0,0.35)'  },
  testing:     { gradient: 'linear-gradient(90deg,#BF5AF2,#FF375F)', glow: 'rgba(191,90,242,0.35)' },
  cancelled:   { gradient: 'linear-gradient(90deg,#FF453A,#FF6961)', glow: 'rgba(255,69,58,0.30)'  },
  todo:        { gradient: 'linear-gradient(90deg,#8E8E93,#AEAEB2)', glow: 'rgba(142,142,147,0.25)'},
}

const PRIORITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  high:     'bg-orange-500',
  medium:   'bg-yellow-400',
  low:      'bg-green-500',
}

const ROW_HEIGHT       = 52
const SECTION_H        = 30  // section header rows in both panels
const SPRINT_ROW_H     = 44  // sprint phase bars are slightly shorter rows

export function GanttChart({ tasks, startDate, endDate, onTaskClick, className }: GanttChartProps) {
  const [zoom, setZoom]           = useState(1)
  const [selectedTask, setSelected] = useState<string | null>(null)
  const containerRef              = useRef<HTMLDivElement>(null)
  const { formatDate }            = useDateTime()

  const safeStart = startDate instanceof Date ? startDate : new Date(startDate)
  const safeEnd   = endDate   instanceof Date ? endDate   : new Date(endDate)
  const totalDays = Math.max(1, Math.ceil((safeEnd.getTime() - safeStart.getTime()) / 86400000))
  const dayWidth  = 30 * zoom

  const now = new Date()

  // Separate sprints from tasks (page already sorted past sprints first)
  const { sprintRows, taskRows } = useMemo(() => ({
    sprintRows: tasks.filter(t => t.type === 'sprint'),
    taskRows:   tasks.filter(t => t.type !== 'sprint'),
  }), [tasks])

  const hasSprints = sprintRows.length > 0
  const hasTasks   = taskRows.length > 0

  // Vertical offset helpers
  const sprintSectionTop = 0
  const sprintAreaH      = hasSprints ? SECTION_H + sprintRows.length * SPRINT_ROW_H : 0
  const taskSectionTop   = sprintAreaH
  const taskAreaH        = hasTasks ? SECTION_H + taskRows.length * ROW_HEIGHT : 0
  const totalBodyH       = sprintAreaH + taskAreaH

  const sprintRowTop  = (i: number) => SECTION_H + i * SPRINT_ROW_H
  const taskRowTop    = (i: number) => sprintAreaH + SECTION_H + i * ROW_HEIGHT

  const getBarPosition = (task: GanttTask) => {
    const start = task.start instanceof Date ? task.start : new Date(task.start)
    const end   = task.end   instanceof Date ? task.end   : new Date(task.end)
    const left  = Math.max(0, Math.floor((start.getTime() - safeStart.getTime()) / 86400000)) * dayWidth
    const width = Math.max(task.type === 'sprint' ? 80 : 64,
      Math.ceil((end.getTime() - start.getTime()) / 86400000) * dayWidth)
    return { left, width }
  }

  // Month / day header
  const timelineDates: Date[] = []
  const cur = new Date(safeStart)
  while (cur <= safeEnd) { timelineDates.push(new Date(cur)); cur.setDate(cur.getDate() + 1) }

  const months: { label: string; count: number }[] = []
  for (const d of timelineDates) {
    const label = d.toLocaleString('default', { month: 'short', year: 'numeric' })
    if (months.length && months[months.length - 1].label === label) {
      months[months.length - 1].count++
    } else {
      months.push({ label, count: 1 })
    }
  }

  const todayOffset = Math.floor((now.getTime() - safeStart.getTime()) / 86400000)
  const showTodayLine = todayOffset >= 0 && todayOffset <= totalDays

  const LEFT_PANEL_W = 220

  return (
    <div className={cn('w-full', className)}>

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--apple-separator)]">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[var(--apple-secondary-label)]" />
          <span className="text-[13px] font-semibold text-[var(--apple-label)]">Timeline</span>
          <span className="text-[12px] text-[var(--apple-tertiary-label)] ml-0.5">
            {hasSprints && `${sprintRows.length} sprint${sprintRows.length !== 1 ? 's' : ''}`}
            {hasSprints && hasTasks && ' · '}
            {hasTasks && `${taskRows.length} task${taskRows.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {/* Legend */}
        <div className="hidden md:flex items-center gap-3 mr-3">
          {(['done','in_progress','review','cancelled'] as const).map(s => (
            <div key={s} className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full" style={{ background: TASK_STYLES[s]?.gradient }} />
              <span className="text-[11px] text-[var(--apple-tertiary-label)] capitalize">{s.replace('_',' ')}</span>
            </div>
          ))}
        </div>

        {/* Zoom control */}
        <div className="flex items-center gap-1 rounded-full border border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)] p-0.5 px-1">
          <Button
            variant="ghost" size="sm"
            onClick={() => setZoom(z => Math.max(z / 1.25, 0.4))}
            disabled={zoom <= 0.4}
            className="h-6 w-6 p-0 rounded-full hover:bg-white dark:hover:bg-white/10 apple-transition"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-[11px] font-apple-mono tabular-nums text-[var(--apple-secondary-label)] w-9 text-center select-none">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost" size="sm"
            onClick={() => setZoom(z => Math.min(z * 1.25, 3))}
            disabled={zoom >= 3}
            className="h-6 w-6 p-0 rounded-full hover:bg-white dark:hover:bg-white/10 apple-transition"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Chart body ── */}
      <div ref={containerRef} className="overflow-auto" style={{ maxHeight: 'calc(100vh - 360px)', minHeight: 220 }}>
        <div className="flex" style={{ minWidth: LEFT_PANEL_W + totalDays * dayWidth }}>

          {/* ── Left panel ── */}
          <div
            className="flex-shrink-0 border-r border-[var(--apple-separator)] sticky left-0 z-20 bg-card"
            style={{ width: LEFT_PANEL_W }}
          >
            {/* Timeline header placeholder (aligns with the month+day rows) */}
            <div className="sticky top-0 z-20 border-b border-[var(--apple-separator)] bg-card" style={{ height: 52 }}>
              <div className="flex items-end h-full px-4 pb-1.5">
                <span className="apple-section-label text-[var(--apple-secondary-label)]">Name</span>
              </div>
            </div>

            {/* Sprint section */}
            {hasSprints && (
              <>
                {/* Sprint section header */}
                <div
                  className="flex items-center gap-1.5 px-4 bg-[var(--apple-quaternary-fill)] border-b border-[var(--apple-separator)]"
                  style={{ height: SECTION_H }}
                >
                  <Layers className="h-3 w-3 text-[var(--apple-secondary-label)]" />
                  <span className="apple-section-label text-[var(--apple-secondary-label)]">Sprints</span>
                </div>

                {/* Sprint rows */}
                {sprintRows.map((sprint) => {
                  const isSelected  = selectedTask === sprint.id
                  const sprintEnd   = sprint.end instanceof Date ? sprint.end : new Date(sprint.end)
                  const isPast      = sprintEnd < now && sprint.status !== 'active'
                  const sprintStyle = SPRINT_STYLES[sprint.status] ?? SPRINT_STYLES.planned
                  return (
                    <div
                      key={sprint.id}
                      className={cn(
                        'flex items-center gap-2 px-3 border-b border-[var(--apple-separator)] cursor-pointer apple-transition select-none group',
                        isSelected
                          ? 'bg-[var(--apple-tertiary-fill)]'
                          : 'hover:bg-[var(--apple-tertiary-fill)]'
                      )}
                      style={{ height: SPRINT_ROW_H }}
                      onClick={() => { setSelected(sprint.id); onTaskClick?.(sprint) }}
                    >
                      {/* Accent line */}
                      <div className="w-0.5 self-stretch rounded-full my-2 flex-shrink-0" style={{ background: sprintStyle.gradient }} />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className={cn(
                            'text-[12px] font-semibold leading-tight truncate',
                            isSelected ? 'text-[var(--apple-chart-color)]' : 'text-[var(--apple-label)]'
                          )}>
                            {sprint.title}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-full', sprintStyle.chip)}>
                            {sprintStyle.label}
                          </span>
                        </div>
                      </div>

                      <ArrowRight className="h-3 w-3 text-[var(--apple-tertiary-label)] opacity-0 group-hover:opacity-100 flex-shrink-0 apple-transition" />
                    </div>
                  )
                })}
              </>
            )}

            {/* Tasks section */}
            {hasTasks && (
              <>
                {/* Tasks section header */}
                <div
                  className="flex items-center gap-1.5 px-4 bg-[var(--apple-quaternary-fill)] border-b border-[var(--apple-separator)]"
                  style={{ height: SECTION_H }}
                >
                  <span className="apple-section-label text-[var(--apple-secondary-label)]">Tasks</span>
                </div>

                {/* Task rows */}
                {taskRows.map((task) => {
                  const isSelected = selectedTask === task.id
                  const taskEnd    = task.end instanceof Date ? task.end : new Date(task.end)
                  const isOverdue  = taskEnd < now && task.status !== 'done'
                  return (
                    <div
                      key={task.id}
                      className={cn(
                        'flex items-center gap-2 px-3 border-b border-[var(--apple-separator)] cursor-pointer apple-transition select-none',
                        isSelected
                          ? 'bg-[var(--apple-tertiary-fill)]'
                          : 'hover:bg-[var(--apple-tertiary-fill)]'
                      )}
                      style={{ height: ROW_HEIGHT }}
                      onClick={() => { setSelected(task.id); onTaskClick?.(task) }}
                    >
                      {/* Priority dot */}
                      <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', PRIORITY_DOT[task.priority] ?? 'bg-gray-400')} />

                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          'text-[12px] font-medium leading-tight truncate',
                          isSelected ? 'text-[var(--apple-chart-color)]' : 'text-[var(--apple-label)]'
                        )}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {task.assignee && (
                            <span className="flex items-center gap-0.5 text-[10px] text-[var(--apple-tertiary-label)] truncate">
                              <User className="h-2.5 w-2.5 flex-shrink-0" />
                              {task.assignee}
                            </span>
                          )}
                          {isOverdue && <AlertTriangle className="h-2.5 w-2.5 text-red-500 flex-shrink-0" />}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>

          {/* ── Timeline area ── */}
          <div className="relative flex-1" style={{ width: totalDays * dayWidth }}>

            {/* Month + day header (sticky) */}
            <div className="sticky top-0 z-10 border-b border-[var(--apple-separator)] bg-card" style={{ height: 52 }}>
              {/* Month row */}
              <div className="flex border-b border-[var(--apple-separator)]" style={{ height: 24 }}>
                {months.map((m, i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 border-r border-[var(--apple-separator)] flex items-center px-2"
                    style={{ width: m.count * dayWidth }}
                  >
                    <span className="text-[10px] font-semibold text-[var(--apple-secondary-label)] tracking-[0.04em] uppercase truncate">
                      {m.label}
                    </span>
                  </div>
                ))}
              </div>
              {/* Day row */}
              <div className="flex" style={{ height: 28 }}>
                {timelineDates.map((date, i) => {
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6
                  const isToday   = date.toDateString() === now.toDateString()
                  return (
                    <div
                      key={i}
                      className={cn(
                        'flex-shrink-0 border-r border-[var(--apple-separator)] flex items-center justify-center',
                        isWeekend && 'bg-[var(--apple-tertiary-fill)]',
                        isToday   && 'bg-[var(--apple-chart-color)] bg-opacity-10'
                      )}
                      style={{ width: dayWidth }}
                    >
                      {dayWidth >= 22 && (
                        <span className={cn(
                          'text-[9px] font-apple-mono tabular-nums',
                          isToday ? 'text-[var(--apple-chart-color)] font-bold' : 'text-[var(--apple-tertiary-label)]'
                        )}>
                          {date.getDate()}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Chart body */}
            <div className="relative" style={{ height: totalBodyH }}>

              {/* Weekend column tints */}
              {timelineDates.map((date, i) =>
                (date.getDay() === 0 || date.getDay() === 6) ? (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 bg-[var(--apple-quaternary-fill)] pointer-events-none"
                    style={{ left: i * dayWidth, width: dayWidth }}
                  />
                ) : null
              )}

              {/* Today line */}
              {showTodayLine && (
                <div
                  className="absolute top-0 bottom-0 z-10 pointer-events-none"
                  style={{ left: todayOffset * dayWidth }}
                >
                  <div className="w-px h-full opacity-50" style={{ backgroundColor: 'var(--apple-chart-color)' }} />
                  <div className="absolute -top-0.5 -left-[3px] h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--apple-chart-color)' }} />
                </div>
              )}

              {/* ── Sprint section header spacer + row dividers ── */}
              {hasSprints && (
                <>
                  <div
                    className="absolute left-0 right-0 border-b border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)]"
                    style={{ top: sprintSectionTop, height: SECTION_H }}
                  />
                  {sprintRows.map((_, i) => (
                    <div
                      key={i}
                      className="absolute left-0 right-0 border-b border-[var(--apple-separator)]"
                      style={{ top: SECTION_H + (i + 1) * SPRINT_ROW_H - 1 }}
                    />
                  ))}
                </>
              )}

              {/* ── Task section header spacer + row dividers ── */}
              {hasTasks && (
                <>
                  <div
                    className="absolute left-0 right-0 border-b border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)]"
                    style={{ top: taskSectionTop, height: SECTION_H }}
                  />
                  {taskRows.map((_, i) => (
                    <div
                      key={i}
                      className="absolute left-0 right-0 border-b border-[var(--apple-separator)]"
                      style={{ top: taskSectionTop + SECTION_H + (i + 1) * ROW_HEIGHT - 1 }}
                    />
                  ))}
                </>
              )}

              {/* ── Sprint phase bars ── */}
              {sprintRows.map((sprint, i) => {
                const { left, width } = getBarPosition(sprint)
                const sprintEnd   = sprint.end instanceof Date ? sprint.end : new Date(sprint.end)
                const isPast      = sprintEnd < now && sprint.status !== 'active'
                const sprintStyle = SPRINT_STYLES[sprint.status] ?? SPRINT_STYLES.planned
                const isSelected  = selectedTask === sprint.id
                const BAR_H = SPRINT_ROW_H - 14
                const barTop = SECTION_H + i * SPRINT_ROW_H + (SPRINT_ROW_H - BAR_H) / 2

                return (
                  <div
                    key={sprint.id}
                    className="absolute flex items-center cursor-pointer group"
                    style={{ top: barTop, left, width, height: BAR_H }}
                    onClick={() => { setSelected(sprint.id); onTaskClick?.(sprint) }}
                  >
                    {/* Full sprint band bar */}
                    <div
                      className={cn(
                        'relative h-full w-full rounded-[6px] overflow-hidden apple-transition group-hover:brightness-105',
                        isPast && 'opacity-70',
                        isSelected && 'ring-2 ring-[var(--apple-chart-color)] ring-offset-1'
                      )}
                      style={{
                        background: sprintStyle.gradient,
                        boxShadow: `0 2px 10px ${sprintStyle.glow}`,
                      }}
                    >
                      {/* Bottom completion stripe */}
                      <div
                        className="absolute bottom-0 left-0 h-1 rounded-bl-[6px]"
                        style={{ width: `${sprint.progress}%`, background: 'rgba(255,255,255,0.40)' }}
                      />
                      {/* Label */}
                      <div className="relative z-10 h-full flex items-center px-2.5 gap-1.5">
                        <span className="text-[11px] font-semibold text-white truncate leading-none drop-shadow-sm">
                          {sprint.title}
                        </span>
                        <span className="text-[10px] text-white/70 flex-shrink-0 font-apple-mono ml-auto">
                          {sprint.progress}%
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* ── Task bars ── */}
              {taskRows.map((task, i) => {
                const { left, width } = getBarPosition(task)
                const style      = TASK_STYLES[task.status] ?? TASK_STYLES.todo
                const isSelected = selectedTask === task.id
                const taskEnd    = task.end instanceof Date ? task.end : new Date(task.end)
                const isOverdue  = taskEnd < now && task.status !== 'done'
                const progress   = Math.max(0, Math.min(100, task.progress ?? 0))
                const BAR_H      = ROW_HEIGHT - 18
                const barTop     = taskSectionTop + SECTION_H + i * ROW_HEIGHT + (ROW_HEIGHT - BAR_H) / 2

                return (
                  <div
                    key={task.id}
                    className="absolute flex items-center cursor-pointer"
                    style={{ top: barTop, left, width, height: BAR_H }}
                    onClick={() => { setSelected(task.id); onTaskClick?.(task) }}
                  >
                    <div
                      className={cn(
                        'relative h-full w-full rounded-[6px] overflow-hidden apple-transition hover:brightness-105',
                        isSelected && 'ring-2 ring-[var(--apple-chart-color)] ring-offset-1',
                        isOverdue && !isSelected && 'ring-2 ring-red-400 ring-offset-1'
                      )}
                      style={{
                        background: style.gradient,
                        boxShadow: isSelected
                          ? `0 0 0 2px var(--apple-chart-color), 0 4px 16px ${style.glow}`
                          : `0 2px 10px ${style.glow}`,
                      }}
                    >
                      {/* Remaining work overlay */}
                      {progress > 0 && progress < 100 && (
                        <div
                          className="absolute top-0 bottom-0 right-0 bg-black/20 rounded-r-[6px]"
                          style={{ left: `${progress}%` }}
                        />
                      )}
                      {/* Shimmer for active tasks */}
                      {task.status === 'in_progress' && (
                        <span className="progress-shimmer absolute inset-0 rounded-[6px]" />
                      )}
                      {/* Label */}
                      <div className="relative z-10 h-full flex items-center px-2 gap-1.5">
                        {isOverdue && <AlertTriangle className="h-3 w-3 text-white/90 flex-shrink-0" />}
                        <span className="text-[11px] font-semibold text-white truncate leading-none drop-shadow-sm">
                          {task.title}
                        </span>
                        {progress > 0 && (
                          <span className="text-[10px] font-apple-mono text-white/70 flex-shrink-0 ml-auto">
                            {progress}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
