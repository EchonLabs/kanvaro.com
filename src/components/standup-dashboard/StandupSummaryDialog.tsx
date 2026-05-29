'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Textarea } from '@/components/ui/textarea'
import { useNotify } from '@/lib/notify'
import { Loader2, Sparkles } from 'lucide-react'
import type { StandupScheduleDetail } from './standup-dashboard-types'
import { parseStandupSummary } from './standup-summary-parser'
import { getDelayedTasks } from './standup-delay-reason-utils'
import { formatLoggedHours } from './standup-timelog-utils'

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

  // Fetch existing summary from dedicated backend summaries table
  const fetchSummary = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/standup-schedules/${meetingId}/summary`, {
        cache: 'no-store'
      })
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
      console.error('Failed to load existing standup summary:', error)
    } finally {
      setLoading(false)
    }
  }

  // Trigger load when dialog opens
  useEffect(() => {
    if (open) {
      fetchSummary()
    }
  }, [open, meetingId, projectId])

  const handleGenerate = async () => {
    setSaving(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/standup-schedules/${meetingId}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSummaryRequestBody())
      })

      if (!response.ok) {
        throw new Error('Summary generation failed')
      }

      const payload = await response.json()
      if (payload?.success && payload?.data) {
        const summaryText = payload.data.generatedSummary
        setExistingSummary(summaryText)
        setDelayReasons(payload.data.delayReasons || delayReasons)
        onGenerated?.(summaryText)
        notifySuccess({ 
          title: 'Report Compiled', 
          message: existingSummary ? 'The PM Standup summary was successfully updated.' : 'A new PM Standup summary has been compiled.' 
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
    if (missingDelayReasons) {
      setConfirmDoneOpen(true)
      return
    }

    setOpen(false)
  }

  const renderEstimationEditor = () => {
    if (delayedTasks.length === 0) {
      return (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 p-4 text-sm text-muted-foreground">
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
            <div key={task._id} className="rounded-xl border border-border/70 bg-background/80 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-foreground truncate">{taskLabel}</p>
                    <Badge className="bg-red-500/10 text-red-600 border-red-500/20">overdue</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatLoggedHours(Math.round(task.loggedHours * 60))} logged against {task.estimateHours}h estimate
                  </p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">Reason for delay</span>
              </div>

              <Textarea
                value={reasonValue}
                onChange={(event) => setDelayReasons((current) => ({ ...current, [task._id]: event.target.value }))}
                onInput={(event) => {
                  const target = event.currentTarget
                  target.style.height = 'auto'
                  target.style.height = `${target.scrollHeight}px`
                }}
                placeholder="Add a short reason..."
                rows={1}
                className="mt-3 min-h-[42px] resize-none overflow-hidden border-border bg-background text-sm"
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
        variant={existingSummary ? "outline" : "default"} 
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 shrink-0"
      >
        <Sparkles className="h-4 w-4 text-amber-500" />
        {detail.meeting.summary || existingSummary ? 'Regenerate Summary' : 'Generate Summary'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col pointer-events-auto">
          <DialogHeader className="flex-shrink-0 border-b pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
                  <Sparkles className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <DialogTitle>PM Standup Summary</DialogTitle>
                  <DialogDescription>
                    Operational report compiling real sprint activity, task transitions, comments, and logged work for this standup date.
                  </DialogDescription>
                </div>
              </div>
            </div>
          </DialogHeader>

          <DialogBody className="flex-1 overflow-y-auto space-y-4 py-4 min-h-[300px]">
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                Retrieving standup report...
              </div>
            ) : (
              <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-5 shadow-sm">
                <div className="rounded-xl border border-border/70 bg-background/80 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Standup Summary</p>
                  <h3 className="mt-1 text-xl font-bold tracking-tight text-foreground">{parsedSummary?.title || detail.meeting.title}</h3>
                  {parsedSummary ? (
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {parsedSummary.metaLines.map((line) => {
                        const [label, ...rest] = line.split(':')
                        const value = rest.join(':').trim()
                        return (
                          <div key={line} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label.trim()}</div>
                            <div className="mt-0.5 text-foreground">{value || '—'}</div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-muted-foreground">
                      This is a live preview of the completed standup. Generate the summary to capture it in the database.
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {(parsedSummary?.sections || [
                    { title: 'Sprint Health', lines: [`${detail.project.name} has ${detail.project.teamMembers.length} team members in this standup.`] },
                    { title: 'Team Time', lines: [`${detail.timelogs.length} time log${detail.timelogs.length === 1 ? '' : 's'} were captured for this meeting date.`] },
                    { title: 'Task Changes', lines: ['Task status changes are shown after summary generation.'] },
                    { title: 'Estimation Check', lines: [] },
                    { title: 'Due Date Watch', lines: ['Due-date checks are shown after summary generation.'] },
                    { title: 'Discussion Notes', lines: detail.meeting.notes ? [detail.meeting.notes] : ['No standup notes were recorded.'] }
                  ]).map((section) => (
                    <section key={section.title} className="rounded-xl border border-border/70 bg-background/70 p-4">
                      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2">
                        <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground">{section.title}</h4>
                        <span className="text-[11px] text-muted-foreground">
                          {section.title === 'Estimation Check' ? `${delayedTasks.length} task${delayedTasks.length === 1 ? '' : 's'}` : `${section.lines.length} item${section.lines.length === 1 ? '' : 's'}`}
                        </span>
                      </div>
                      <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
                        {section.title === 'Estimation Check' ? (
                          renderEstimationEditor()
                        ) : (
                          section.lines.map((line, index) => (
                            <p key={`${section.title}-${index}`} className={index === 0 ? 'text-foreground' : ''}>
                              {line}
                            </p>
                          ))
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            )}
          </DialogBody>

          <DialogFooter className="flex-shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Close
            </Button>
            <Button onClick={handleGenerate} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-white font-medium">
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {existingSummary ? 'Regenerating...' : 'Generating...'}
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4 shrink-0" />
                  {existingSummary ? 'Regenerate Summary' : 'Generate Summary'}
                </>
              )}
            </Button>
            <Button variant="outline" onClick={handleDone} disabled={saving}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationModal
        isOpen={confirmDoneOpen}
        onClose={() => setConfirmDoneOpen(false)}
        onConfirm={() => {
          setConfirmDoneOpen(false)
          setOpen(false)
        }}
        title="Are you sure?"
        description="Some delayed tasks do not have a reason yet. You can add reasons later."
        confirmText="Yes, Done"
        cancelText="Keep Editing"
        variant="default"
      />
    </>
  )
}
