'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import {
  X,
  Download,
  Send,
  Loader2,
  Brain,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  User,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'
import jsPDF from 'jspdf'

interface PersonalReport {
  memberId: string
  memberName: string
  memberEmail: string
  report: string
}

interface AIReport {
  _id: string
  projectName: string
  generatedByName: string
  generatedAt: string
  standupDateRange: { from: string; to: string }
  standupCount: number
  projectTrackingReport: string
  personalReports: PersonalReport[]
  sentTo: string[]
}

interface AITrackerModalProps {
  projectId: string
  projectName: string
  isOpen: boolean
  onClose: () => void
  existingReport?: AIReport | null
}

export function AITrackerModal({
  projectId,
  projectName,
  isOpen,
  onClose,
  existingReport = null
}: AITrackerModalProps) {
  const [report, setReport] = useState<AIReport | null>(existingReport)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [activeTab, setActiveTab] = useState<'project' | 'personal'>('project')
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set())
  const [expandedMember, setExpandedMember] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ name: string; success: boolean }[] | null>(null)
  const [sentTo, setSentTo] = useState<Set<string>>(new Set(existingReport?.sentTo || []))

  if (!isOpen) return null

  const handleGenerate = async () => {
    setGenerating(true)
    setGenerateError('')
    setSendResult(null)

    try {
      const res = await fetch(`/api/projects/${projectId}/ai-tracker`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setGenerateError(json.error || 'Failed to generate report')
        return
      }
      setReport(json.data)
      setSentTo(new Set(json.data.sentTo || []))
      setSelectedMembers(new Set())
    } catch {
      setGenerateError('Network error. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  const toggleMember = (memberId: string) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev)
      next.has(memberId) ? next.delete(memberId) : next.add(memberId)
      return next
    })
  }

  const toggleAll = () => {
    if (!report) return
    if (selectedMembers.size === report.personalReports.length) {
      setSelectedMembers(new Set())
    } else {
      setSelectedMembers(new Set(report.personalReports.map((p) => p.memberId)))
    }
  }

  const handleSendEmails = async () => {
    if (!report || selectedMembers.size === 0) return
    setSending(true)
    setSendResult(null)

    try {
      const res = await fetch(`/api/projects/${projectId}/ai-tracker/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: report._id, memberIds: Array.from(selectedMembers) })
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setSendResult(json.data.map((r: any) => ({ name: r.memberName, success: r.success })))
        const newSentTo = new Set(sentTo)
        json.data.forEach((r: any) => { if (r.success) newSentTo.add(r.memberId) })
        setSentTo(newSentTo)
      } else {
        setSendResult([{ name: 'Error', success: false }])
      }
    } catch {
      setSendResult([{ name: 'Network error', success: false }])
    } finally {
      setSending(false)
    }
  }

  const downloadPDF = (content: string, filename: string) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 18
    const maxWidth = pageWidth - margin * 2
    let y = 20

    const lines = content.split('\n')

    for (const line of lines) {
      const isH2 = line.startsWith('## ')
      const isH1 = line.startsWith('# ')
      const isBullet = line.startsWith('- ')
      const text = line.replace(/^#{1,3} /, '').replace(/\*\*/g, '').replace(/^- /, '• ')

      if (!text.trim()) { y += 4; continue }

      if (isH1) {
        doc.setFontSize(16)
        doc.setFont('helvetica', 'bold')
      } else if (isH2) {
        doc.setFontSize(13)
        doc.setFont('helvetica', 'bold')
        y += 4
      } else {
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
      }

      const wrapped = doc.splitTextToSize(text, isBullet ? maxWidth - 4 : maxWidth)
      for (const wrappedLine of wrapped) {
        if (y > 275) {
          doc.addPage()
          y = 20
        }
        doc.text(wrappedLine, isBullet ? margin + 4 : margin, y)
        y += isH1 ? 8 : isH2 ? 7 : 5.5
      }
    }

    doc.save(filename)
  }

  const downloadProjectReport = () => {
    if (!report) return
    const header = `AI Project Tracking Report\n${report.projectName}\n${new Date(report.standupDateRange.from).toLocaleDateString()} — ${new Date(report.standupDateRange.to).toLocaleDateString()}\nGenerated: ${new Date(report.generatedAt).toLocaleString()}\nStandups analyzed: ${report.standupCount}\n\n`
    downloadPDF(header + report.projectTrackingReport, `${report.projectName}-AI-Report.pdf`)
  }

  const downloadMemberReport = (personal: PersonalReport) => {
    if (!report) return
    const header = `Personal Performance Report\n${personal.memberName}\nProject: ${report.projectName}\n${new Date(report.standupDateRange.from).toLocaleDateString()} — ${new Date(report.standupDateRange.to).toLocaleDateString()}\n\n`
    downloadPDF(header + personal.report, `${personal.memberName.replace(/\s+/g, '-')}-Performance-Report.pdf`)
  }

  const downloadCombinedPDF = () => {
    if (!report) return
    const selected = report.personalReports.filter((p) => selectedMembers.has(p.memberId))
    if (selected.length === 0) return

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 18
    const maxWidth = pageWidth - margin * 2

    const addContent = (content: string, isFirstPage: boolean) => {
      let y = isFirstPage ? 20 : 20
      const lines = content.split('\n')
      for (const line of lines) {
        const isH2 = line.startsWith('## ')
        const isH1 = line.startsWith('# ')
        const isBullet = line.startsWith('- ')
        const text = line.replace(/^#{1,3} /, '').replace(/\*\*/g, '').replace(/^- /, '• ')
        if (!text.trim()) { y += 4; continue }

        doc.setFontSize(isH1 ? 16 : isH2 ? 13 : 10)
        doc.setFont('helvetica', isH1 || isH2 ? 'bold' : 'normal')
        if (isH2) y += 4

        const wrapped = doc.splitTextToSize(text, isBullet ? maxWidth - 4 : maxWidth)
        for (const wrappedLine of wrapped) {
          if (y > 275) { doc.addPage(); y = 20 }
          doc.text(wrappedLine, isBullet ? margin + 4 : margin, y)
          y += isH1 ? 8 : isH2 ? 7 : 5.5
        }
      }
    }

    const projectHeader = `AI Project Tracking Report\n${report.projectName}\n${new Date(report.standupDateRange.from).toLocaleDateString()} — ${new Date(report.standupDateRange.to).toLocaleDateString()}\n\n`
    addContent(projectHeader + report.projectTrackingReport, true)

    for (const personal of selected) {
      doc.addPage()
      const header = `Personal Performance Report\n${personal.memberName}\n\n`
      addContent(header + personal.report, false)
    }

    doc.save(`${report.projectName}-Combined-AI-Report.pdf`)
  }

  const renderMarkdown = (text: string) => {
    return text
      .split('\n')
      .map((line, i) => {
        if (line.startsWith('## ')) return <h3 key={i} className="text-base font-semibold text-foreground mt-5 mb-2 border-b border-border pb-1">{line.slice(3)}</h3>
        if (line.startsWith('# ')) return <h2 key={i} className="text-lg font-bold text-foreground mt-4 mb-2">{line.slice(2)}</h2>
        if (line.startsWith('- ')) return <li key={i} className="text-sm text-muted-foreground ml-4 my-0.5 list-disc">{line.slice(2).replace(/\*\*(.+?)\*\*/g, '$1')}</li>
        if (!line.trim()) return <div key={i} className="h-2" />
        return <p key={i} className="text-sm text-muted-foreground my-1">{line.replace(/\*\*(.+?)\*\*/g, '$1')}</p>
      })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900">
              <Brain className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold">AI-Project Tracker</h2>
              <p className="text-xs text-muted-foreground">{projectName}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-accent transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {!report && !generating && (
            <div className="flex flex-col items-center justify-center py-16 space-y-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900">
                <Brain className="h-8 w-8 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Generate AI Project Report</h3>
                <p className="text-sm text-muted-foreground max-w-sm mt-1">
                  Analyze all completed standups and generate a comprehensive project tracking report with personal performance insights.
                </p>
              </div>
              {generateError && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-md px-4 py-2">{generateError}</p>
              )}
              <Button onClick={handleGenerate} className="bg-violet-600 hover:bg-violet-700 text-white">
                <Brain className="mr-2 h-4 w-4" />
                Generate Report
              </Button>
            </div>
          )}

          {generating && (
            <div className="flex flex-col items-center justify-center py-16 space-y-4 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-violet-600" />
              <div>
                <p className="font-medium">Generating AI Report...</p>
                <p className="text-sm text-muted-foreground mt-1">Analyzing standups, tasks, and generating insights</p>
              </div>
            </div>
          )}

          {report && !generating && (
            <>
              {/* Report meta */}
              <div className="flex flex-wrap items-center gap-3 pb-2">
                <Badge variant="outline" className="text-violet-600 border-violet-300 bg-violet-50 dark:bg-violet-950">
                  {report.standupCount} standups analyzed
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(report.standupDateRange.from).toLocaleDateString()} — {new Date(report.standupDateRange.to).toLocaleDateString()}
                </span>
                <span className="text-xs text-muted-foreground">Generated by {report.generatedByName}</span>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 border-b border-border">
                <button
                  onClick={() => setActiveTab('project')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'project' ? 'border-violet-600 text-violet-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  Project Tracking Report
                </button>
                <button
                  onClick={() => setActiveTab('personal')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'personal' ? 'border-violet-600 text-violet-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  Personal Reports
                  <span className="ml-2 text-xs bg-muted rounded-full px-1.5 py-0.5">{report.personalReports.length}</span>
                </button>
              </div>

              {activeTab === 'project' && (
                <div className="space-y-1 prose-sm">
                  {renderMarkdown(report.projectTrackingReport)}
                </div>
              )}

              {activeTab === 'personal' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <button onClick={toggleAll} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                      {selectedMembers.size === report.personalReports.length
                        ? <CheckSquare className="h-4 w-4 text-violet-600" />
                        : <Square className="h-4 w-4" />}
                      Select all for email/download
                    </button>
                    <span className="text-xs text-muted-foreground">{selectedMembers.size} selected</span>
                  </div>

                  {report.personalReports.map((personal) => (
                    <Card key={personal.memberId} className="overflow-hidden">
                      <CardHeader className="py-3 px-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <button onClick={() => toggleMember(personal.memberId)} className="shrink-0">
                              {selectedMembers.has(personal.memberId)
                                ? <CheckSquare className="h-4 w-4 text-violet-600" />
                                : <Square className="h-4 w-4 text-muted-foreground" />}
                            </button>
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted shrink-0">
                              <User className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{personal.memberName}</p>
                              <p className="text-xs text-muted-foreground">{personal.memberEmail}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {sentTo.has(personal.memberId) && (
                              <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 dark:bg-green-950 text-xs">
                                Sent
                              </Badge>
                            )}
                            <button
                              onClick={() => downloadMemberReport(personal)}
                              className="rounded-md p-1.5 hover:bg-accent transition-colors"
                              title="Download this report"
                            >
                              <Download className="h-4 w-4 text-muted-foreground" />
                            </button>
                            <button
                              onClick={() => setExpandedMember(expandedMember === personal.memberId ? null : personal.memberId)}
                              className="rounded-md p-1.5 hover:bg-accent transition-colors"
                            >
                              {expandedMember === personal.memberId
                                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                            </button>
                          </div>
                        </div>
                      </CardHeader>
                      {expandedMember === personal.memberId && (
                        <CardContent className="pt-0 px-4 pb-4 border-t border-border">
                          <div className="mt-3 space-y-1">
                            {renderMarkdown(personal.report)}
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </div>
              )}

              {/* Send result */}
              {sendResult && (
                <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
                  {sendResult.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {r.success
                        ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        : <AlertCircle className="h-4 w-4 text-destructive shrink-0" />}
                      <span className={r.success ? 'text-green-700 dark:text-green-400' : 'text-destructive'}>
                        {r.name}: {r.success ? 'Email sent' : 'Failed to send'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        {report && !generating && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-border shrink-0 bg-muted/30">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={downloadProjectReport}>
                <Download className="mr-2 h-4 w-4" />
                Project Report PDF
              </Button>
              {selectedMembers.size > 0 && (
                <Button variant="outline" size="sm" onClick={downloadCombinedPDF}>
                  <Download className="mr-2 h-4 w-4" />
                  Combined PDF ({selectedMembers.size})
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
                <Brain className="mr-2 h-4 w-4" />
                Regenerate
              </Button>
              <Button
                size="sm"
                onClick={handleSendEmails}
                disabled={sending || selectedMembers.size === 0}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Send to {selectedMembers.size > 0 ? `${selectedMembers.size} member${selectedMembers.size > 1 ? 's' : ''}` : 'members'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
