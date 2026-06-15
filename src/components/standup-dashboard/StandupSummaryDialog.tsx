'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Textarea } from '@/components/ui/textarea'
import { useNotify } from '@/lib/notify'
import { Loader2, Sparkles } from 'lucide-react'
import type { StandupScheduleDetail } from './standup-dashboard-types'
import { parseStandupSummary } from './standup-summary-parser'
import { getDelayedTasks } from './standup-delay-reason-utils'
import { formatLoggedHours } from './standup-timelog-utils'

const THEME_GRADIENT = 'var(--apple-card-gradient)'
const THEME_GLOW = 'var(--apple-chart-glow)'

interface StandupSummaryDialogProps {
  projectId: string
  meetingId: string
  detail: StandupScheduleDetail
  onGenerated?: (summary: string) => void
}

export function StandupSummaryDialog({ projectId, meetingId, detail, onGenerated }: StandupSummaryDialogProps) {
  const { success: notifySuccess, error: notifyError } = useNotify()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDoneOpen, setConfirmDoneOpen] = useState(false)
  const [existingSummary, setExistingSummary] = useState<string | null>(null)
  const [delayReasons, setDelayReasons] = useState<Record<string, string>>({})

  const parsedSummary = useMemo(() => parseStandupSummary(existingSummary), [existingSummary])
  const delayedTasks = useMemo(() => getDelayedTasks(detail.projectTasks, detail.timelogs), [detail.projectTasks, detail.timelogs])
  const missingDelayReasons = delayedTasks.some((task) => !delayReasons[task._id]?.trim())

  const buildSummaryRequestBody = () => ({
    delayReasons: Object.fromEntries(
      delayedTasks.map((task) => [task._id, delayReasons[task._id]?.trim() || ''])
    )
  })

  const fetchSummary = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/standup-schedules/${meetingId}/summary`, { cache: 'no-store' })
      if (response.ok) {
        const payload = await response.json()
        if (payload?.success && payload?.data) {
          setExistingSummary(payload.data.generatedSummary)
          setDelayReasons(payload.data.delayReasons || {})
        } else {
          setExistingSummary(null)
          setDelayReasons({})
        }
      }
    } catch (error) {
      console.error('Failed to load standup summary:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) fetchSummary()
  }, [open, meetingId, projectId])

  const handleGenerate = async () => {
    setSaving(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/standup-schedules/${meetingId}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSummaryRequestBody())
      })
      if (!response.ok) throw new Error('Summary generation failed')
      const payload = await response.json()
      if (payload?.success && payload?.data) {
        const summaryText = payload.data.generatedSummary
        setExistingSummary(summaryText)
        setDelayReasons(payload.data.delayReasons || delayReasons)
        onGenerated?.(summaryText)
        notifySuccess({
          title: 'Report Compiled',
          message: existingSummary ? 'The PM Standup summary was updated.' : 'A new PM Standup summary has been compiled.'
        })
      } else {
        throw new Error('Invalid server response')
      }
    } catch {
      notifyError({ title: 'Unable to compile summary report' })
    } finally {
      setSaving(false)
    }
  }

  const handleDone = () => {
    if (missingDelayReasons) { setConfirmDoneOpen(true); return }
    setOpen(false)
  }

  const renderEstimationEditor = () => {
    if (delayedTasks.length === 0) {
      return (
        <div className="rounded-[var(--apple-radius-sm)] border border-dashed border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-4 py-6 text-[12px] text-center text-[var(--apple-secondary-label)]">
          No delayed tasks were detected for this standup date.
        </div>
      )
    }

    return (
      <div className="space-y-3">
        {delayedTasks.map((task) => {
          const taskLabel = `${task.displayId ? `${task.displayId} · ` : ''}${task.title}`
          const reasonValue = delayReasons[task._id] || ''
          return (
            <div key={task._id} className="rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-semibold truncate">{taskLabel}</p>
                    <span className="shrink-0 rounded-full bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-[var(--apple-system-red)]">
                      overdue
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--apple-secondary-label)] mt-0.5">
                    {formatLoggedHours(Math.round(task.loggedHours * 60))} logged · {task.estimateHours}h estimate
                  </p>
                </div>
                <span className="text-[11px] text-[var(--apple-tertiary-label)] shrink-0">Reason for delay</span>
              </div>
              <Textarea
                value={reasonValue}
                onChange={(e) => setDelayReasons((cur) => ({ ...cur, [task._id]: e.target.value }))}
                onInput={(e) => {
                  const t = e.currentTarget
                  t.style.height = 'auto'
                  t.style.height = `${t.scrollHeight}px`
                }}
                placeholder="Add a short reason…"
                rows={1}
                className="mt-2.5 min-h-[42px] resize-none overflow-hidden rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[12px]"
              />
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="rounded-full px-4 h-9 text-[13.5px] font-medium text-white border-0 flex items-center gap-1.5 shrink-0 apple-transition"
        style={
          existingSummary
            ? { background: 'var(--apple-tertiary-fill)', color: 'var(--apple-label)', boxShadow: 'none' }
            : { background: THEME_GRADIENT, boxShadow: `0 2px 12px ${THEME_GLOW}` }
        }
      >
        <Sparkles className="h-4 w-4" strokeWidth={1.5} style={{ color: existingSummary ? 'var(--apple-card-gradient)' : 'white' }} />
        {detail.meeting.summary || existingSummary ? 'Regenerate Summary' : 'Generate Summary'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col pointer-events-auto rounded-[var(--apple-radius-xl)]">
          <DialogHeader className="flex-shrink-0 border-b border-[var(--apple-separator)] pb-4">
            <div className="flex items-center gap-3">
              <Sparkles className="h-6 w-6 shrink-0 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
              <div>
                <DialogTitle>PM Standup Summary</DialogTitle>
                <DialogDescription className="text-[12px] mt-0.5">
                  Operational report compiling real sprint activity, task transitions, comments, and logged work.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <DialogBody className="flex-1 overflow-y-auto space-y-4 py-4 min-h-[300px]">
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-2.5 py-20 text-[13px] text-[var(--apple-secondary-label)]">
                <Loader2 className="h-6 w-6 animate-spin" strokeWidth={1.5} style={{ color: 'var(--apple-card-gradient)' }} />
                Retrieving standup report…
              </div>
            ) : (
              <div className="space-y-4 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] p-5">

                {/* Title block */}
                <div className="rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-card p-4">
                  <p className="apple-section-label text-[var(--apple-secondary-label)]">Standup Summary</p>
                  <h3 className="mt-1 text-[20px] font-bold tracking-tight">{parsedSummary?.title || detail.meeting.title}</h3>
                  {parsedSummary ? (
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {parsedSummary.metaLines.map((line) => {
                        const [label, ...rest] = line.split(':')
                        const value = rest.join(':').trim()
                        return (
                          <div key={line} className="rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-3 py-2">
                            <p className="apple-section-label text-[var(--apple-secondary-label)]">{label.trim()}</p>
                            <p className="mt-0.5 text-[13px] font-medium">{value || '—'}</p>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="mt-2.5 text-[12px] text-[var(--apple-secondary-label)]">
                      This is a live preview. Generate the summary to capture it in the database.
                    </p>
                  )}
                </div>

                {/* Sections */}
                <div className="space-y-3">
                  {(parsedSummary?.sections || [
                    { title: 'Sprint Health',   lines: [`${detail.project.name} has ${detail.project.teamMembers.length} team members in this standup.`] },
                    { title: 'Team Time',       lines: [`${detail.timelogs.length} time log${detail.timelogs.length === 1 ? '' : 's'} captured for this meeting date.`] },
                    { title: 'Task Changes',    lines: ['Task status changes shown after summary generation.'] },
                    { title: 'Estimation Check',lines: [] },
                    { title: 'Due Date Watch',  lines: ['Due-date checks shown after summary generation.'] },
                    { title: 'Discussion Notes',lines: detail.meeting.notes ? [detail.meeting.notes] : ['No standup notes were recorded.'] }
                  ]).map((section) => (
                    <div
                      key={section.title}
                      className="rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-card p-4"
                    >
                      <div className="flex items-center justify-between gap-3 border-b border-[var(--apple-separator)] pb-2 mb-3">
                        <p className="apple-section-label text-[var(--apple-label)]">{section.title}</p>
                        <span className="text-[10px] text-[var(--apple-secondary-label)]">
                          {section.title === 'Estimation Check'
                            ? `${delayedTasks.length} task${delayedTasks.length === 1 ? '' : 's'}`
                            : `${section.lines.length} item${section.lines.length === 1 ? '' : 's'}`}
                        </span>
                      </div>
                      <div className="space-y-2 text-[12px] leading-relaxed text-[var(--apple-secondary-label)]">
                        {section.title === 'Estimation Check' ? (
                          renderEstimationEditor()
                        ) : (
                          section.lines.map((line, i) => (
                            <p key={`${section.title}-${i}`} className={i === 0 ? 'text-[var(--apple-label)] font-medium' : ''}>
                              {line}
                            </p>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DialogBody>

          <DialogFooter className="flex-shrink-0 border-t border-[var(--apple-separator)] pt-4">
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={saving}
              className="rounded-full px-5 h-9 text-[13.5px] font-medium border-0 text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)] hover:bg-[var(--apple-tertiary-fill)] apple-transition"
            >
              Close
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={saving}
              className="rounded-full px-5 h-9 text-[13.5px] font-medium text-white border-0 flex items-center gap-1.5 apple-transition"
              style={{ background: THEME_GRADIENT, boxShadow: `0 2px 8px ${THEME_GLOW}` }}
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />{existingSummary ? 'Regenerating…' : 'Generating…'}</>
              ) : (
                <><Sparkles className="h-4 w-4 shrink-0" strokeWidth={1.5} />{existingSummary ? 'Regenerate Summary' : 'Generate Summary'}</>
              )}
            </Button>
            <Button
              onClick={handleDone}
              disabled={saving}
              className="rounded-full px-5 h-9 text-[13.5px] font-medium text-white border-0 apple-transition"
              style={{ background: 'var(--apple-system-blue)', boxShadow: '0 2px 10px rgba(0,122,255,0.28)' }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationModal
        isOpen={confirmDoneOpen}
        onClose={() => setConfirmDoneOpen(false)}
        onConfirm={() => { setConfirmDoneOpen(false); setOpen(false) }}
        title="Are you sure?"
        description="Some delayed tasks do not have a reason yet. You can add reasons later."
        confirmText="Yes, Done"
        cancelText="Keep Editing"
        variant="default"
      />
    </>
  )
}
