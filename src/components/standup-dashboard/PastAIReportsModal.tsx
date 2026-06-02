'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { X, Brain, Loader2, ChevronRight, Clock, Users, Calendar } from 'lucide-react'
import { AITrackerModal } from './AITrackerModal'

interface PastReport {
  _id: string
  projectName: string
  generatedByName: string
  generatedAt: string
  standupDateRange: { from: string; to: string }
  standupCount: number
  sentTo: string[]
}

interface PastAIReportsModalProps {
  projectId: string
  projectName: string
  isOpen: boolean
  onClose: () => void
}

export function PastAIReportsModal({
  projectId,
  projectName,
  isOpen,
  onClose
}: PastAIReportsModalProps) {
  const [reports, setReports] = useState<PastReport[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedReport, setSelectedReport] = useState<any | null>(null)
  const [loadingReportId, setLoadingReportId] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    fetch(`/api/projects/${projectId}/ai-tracker`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setReports(json.data || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isOpen, projectId])

  if (!isOpen) return null

  const openReport = async (reportId: string) => {
    setLoadingReportId(reportId)
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-tracker/${reportId}`)
      const json = await res.json()
      if (json.success) setSelectedReport(json.data)
    } catch {}
    setLoadingReportId(null)
  }

  if (selectedReport) {
    return (
      <AITrackerModal
        projectId={projectId}
        projectName={projectName}
        isOpen
        onClose={() => setSelectedReport(null)}
        existingReport={selectedReport}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900">
              <Brain className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Past AI Reports</h2>
              <p className="text-xs text-muted-foreground">{projectName}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-accent transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading reports...</span>
            </div>
          )}

          {!loading && reports.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Brain className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="font-medium">No AI reports yet</p>
              <p className="text-sm text-muted-foreground">Generate your first AI tracking report from the AI-Project Tracker button.</p>
            </div>
          )}

          {!loading && reports.map((report) => (
            <Card
              key={report._id}
              className="cursor-pointer hover:border-violet-300 dark:hover:border-violet-700 transition-colors"
              onClick={() => openReport(report._id)}
            >
              <CardContent className="flex items-center justify-between gap-4 py-4 px-5">
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {new Date(report.standupDateRange.from).toLocaleDateString()} — {new Date(report.standupDateRange.to).toLocaleDateString()}
                    </span>
                    {report.sentTo.length > 0 && (
                      <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 dark:bg-green-950 text-xs">
                        Sent to {report.sentTo.length}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(report.generatedAt).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {report.standupCount} standups
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      By {report.generatedByName}
                    </span>
                  </div>
                </div>
                <div className="shrink-0">
                  {loadingReportId === report._id
                    ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-border shrink-0 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}
