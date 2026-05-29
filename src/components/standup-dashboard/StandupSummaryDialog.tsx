'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { useNotify } from '@/lib/notify'
import { Loader2, Sparkles } from 'lucide-react'
import type { StandupScheduleDetail } from './standup-dashboard-types'

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
  const [existingSummary, setExistingSummary] = useState<string | null>(null)

  const parsedSummary = useMemo(() => {
    if (!existingSummary) return null

    const sectionTitles = new Set([
      'Sprint Health',
      'Team Time',
      'Task Changes',
      'Estimation Check',
      'Due Date Watch',
      'Discussion Notes'
    ])

    const lines = existingSummary.split(/\r?\n/)
    const metaLines: string[] = []
    const sections: Array<{ title: string; lines: string[] }> = []
    let title = 'Standup Summary'
    let currentSection: { title: string; lines: string[] } | null = null

    lines.forEach((rawLine) => {
      const line = rawLine
        .replace(/^#{1,6}\s*/, '')
        .replace(/^\*\*(.*)\*\*$/, '$1')
        .replace(/^[-•]\s*/, '')
        .trim()

      if (!line || line === '---' || line.startsWith('This report is compiled')) {
        return
      }

      if (/^Standup Summary:/i.test(line)) {
        title = line.replace(/^Standup Summary:\s*/i, '').trim() || title
        return
      }

      if (sectionTitles.has(line)) {
        currentSection = { title: line, lines: [] }
        sections.push(currentSection)
        return
      }

      if (!currentSection) {
        metaLines.push(line)
        return
      }

      currentSection.lines.push(line)
    })

    return { title, metaLines, sections }
  }, [existingSummary])

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
        } else {
          setExistingSummary(null)
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
        headers: { 'Content-Type': 'application/json' }
      })

      if (!response.ok) {
        throw new Error('Summary generation failed')
      }

      const payload = await response.json()
      if (payload?.success && payload?.data) {
        const summaryText = payload.data.generatedSummary
        setExistingSummary(summaryText)
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
            ) : parsedSummary ? (
              <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-5 shadow-sm">
                <div className="rounded-xl border border-border/70 bg-background/80 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Standup Summary</p>
                  <h3 className="mt-1 text-xl font-bold tracking-tight text-foreground">{parsedSummary.title}</h3>
                  {parsedSummary.metaLines.length > 0 && (
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
                  )}
                </div>

                <div className="space-y-4">
                  {parsedSummary.sections.map((section) => (
                    <section key={section.title} className="rounded-xl border border-border/70 bg-background/70 p-4">
                      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2">
                        <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground">{section.title}</h4>
                        <span className="text-[11px] text-muted-foreground">{section.lines.length} item{section.lines.length === 1 ? '' : 's'}</span>
                      </div>
                      <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
                        {section.lines.map((line, index) => (
                          <p key={`${section.title}-${index}`} className={index === 0 ? 'text-foreground' : ''}>
                            {line}
                          </p>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center p-8 py-16 rounded-xl border border-dashed bg-muted/10 border-border/70 max-w-lg mx-auto">
                <Sparkles className="h-10 w-10 text-amber-500/80 mb-4 animate-bounce" />
                <h4 className="font-semibold text-foreground text-base">Compile PM Standup Summary</h4>
                <p className="text-sm text-muted-foreground mt-2 max-w-sm">
                  Run a lightweight logical PM analysis over participant workloads, stalled tasks, and actual time logs tracked for this meeting date.
                </p>
                <Button 
                  onClick={handleGenerate} 
                  disabled={saving} 
                  className="mt-6"
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : 'Compile Summary Report'}
                </Button>
              </div>
            )}
          </DialogBody>

          <DialogFooter className="flex-shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Close
            </Button>
            {existingSummary && (
              <Button onClick={handleGenerate} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-white font-medium">
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4 shrink-0" />
                    Regenerate Report
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
