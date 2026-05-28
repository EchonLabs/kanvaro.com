'use client'

import { useEffect, useState } from 'react'
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
                    Intelligent analytical report compiling workload metrics, task progress, and logged activity anomalies.
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
            ) : existingSummary ? (
              <div className="rounded-xl border border-border bg-muted/20 p-5 font-sans leading-relaxed text-sm text-foreground shadow-sm">
                <div className="prose dark:prose-invert max-w-none space-y-1">
                  {existingSummary.split('\n').map((line, index) => {
                    if (line.startsWith('###')) {
                      return <h3 key={index} className="text-base font-bold text-foreground mt-4 mb-2 first:mt-0">{line.replace('###', '').trim()}</h3>
                    }
                    if (line.startsWith('####')) {
                      return <h4 key={index} className="text-sm font-semibold text-foreground mt-3 mb-1.5">{line.replace('####', '').trim()}</h4>
                    }
                    if (line.startsWith('**Date:') || line.startsWith('**Scheduled Date:')) {
                      return <p key={index} className="text-xs text-muted-foreground mb-3">{line.split('|').map((part, pIdx) => <span key={pIdx} className="mr-3">{part.trim()}</span>)}</p>
                    }
                    if (line.trim() === '---') {
                      return <hr key={index} className="my-4 border-border/80" />
                    }
                    if (line.startsWith('-')) {
                      // Parse inline bolding **text**
                      const cleanLine = line.replace(/^-/, '').trim()
                      const parts = cleanLine.split('**')
                      return (
                        <div key={index} className="flex gap-2 text-muted-foreground my-1.5 text-xs sm:text-sm pl-2">
                          <span className="text-primary font-bold shrink-0">•</span>
                          <span>
                            {parts.map((part, pIdx) => pIdx % 2 === 1 ? <strong key={pIdx} className="text-foreground font-semibold">{part}</strong> : part)}
                          </span>
                        </div>
                      )
                    }
                    return <p key={index} className="text-muted-foreground text-xs sm:text-sm my-1">{line}</p>
                  })}
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
