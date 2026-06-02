'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import {
  X, Download, Send, Loader2, Brain, ChevronDown, ChevronUp,
  CheckSquare, Square, User, CheckCircle2, AlertCircle, ArrowLeft,
  FileText, BarChart3, Files
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

type ReportType = 'project' | 'personal' | 'both'
type ModalView = 'report' | 'send'

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
  const [expandedMember, setExpandedMember] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<Set<string>>(new Set(existingReport?.sentTo || []))

  // Send flow state
  const [view, setView] = useState<ModalView>('report')
  const [reportType, setReportType] = useState<ReportType>('both')
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set())
  const [sendCopyToSender, setSendCopyToSender] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ name: string; email: string; success: boolean }[] | null>(null)

  if (!isOpen) return null

  const handleGenerate = async () => {
    setGenerating(true)
    setGenerateError('')
    setSendResult(null)
    setView('report')

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
    setSelectedMembers(
      selectedMembers.size === report.personalReports.length
        ? new Set()
        : new Set(report.personalReports.map((p) => p.memberId))
    )
  }

  const handleSendEmails = async () => {
    if (!report || selectedMembers.size === 0) return
    setSending(true)
    setSendResult(null)

    try {
      const res = await fetch(`/api/projects/${projectId}/ai-tracker/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: report._id,
          memberIds: Array.from(selectedMembers),
          reportType,
          sendCopyToSender
        })
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setSendResult(json.data.map((r: any) => ({ name: r.memberName, email: r.email, success: r.success })))
        const newSentTo = new Set(sentTo)
        json.data.forEach((r: any) => { if (r.success) newSentTo.add(r.memberId) })
        setSentTo(newSentTo)
      } else {
        setSendResult([{ name: 'Error', email: '', success: false }])
      }
    } catch {
      setSendResult([{ name: 'Network error', email: '', success: false }])
    } finally {
      setSending(false)
    }
  }

  const downloadPDF = (content: string, filename: string) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const margin = 18
    const maxWidth = doc.internal.pageSize.getWidth() - margin * 2
    let y = 20

    for (const line of content.split('\n')) {
      const isH2 = line.startsWith('## ')
      const isH1 = line.startsWith('# ')
      const isBullet = line.startsWith('- ')
      const text = line.replace(/^#{1,3} /, '').replace(/\*\*/g, '').replace(/^- /, '• ')
      if (!text.trim()) { y += 4; continue }

      doc.setFontSize(isH1 ? 16 : isH2 ? 13 : 10)
      doc.setFont('helvetica', isH1 || isH2 ? 'bold' : 'normal')
      if (isH2) y += 4

      for (const wrapped of doc.splitTextToSize(text, isBullet ? maxWidth - 4 : maxWidth)) {
        if (y > 275) { doc.addPage(); y = 20 }
        doc.text(wrapped, isBullet ? margin + 4 : margin, y)
        y += isH1 ? 8 : isH2 ? 7 : 5.5
      }
    }
    doc.save(filename)
  }

  const downloadProjectReport = () => {
    if (!report) return
    const header = `AI Project Tracking Report\n${report.projectName}\n${new Date(report.standupDateRange.from).toLocaleDateString()} — ${new Date(report.standupDateRange.to).toLocaleDateString()}\nGenerated: ${new Date(report.generatedAt).toLocaleString()}\n\n`
    downloadPDF(header + report.projectTrackingReport, `${report.projectName}-AI-Report.pdf`)
  }

  const downloadMemberReport = (personal: PersonalReport) => {
    if (!report) return
    const header = `Personal Performance Report\n${personal.memberName}\nProject: ${report.projectName}\n${new Date(report.standupDateRange.from).toLocaleDateString()} — ${new Date(report.standupDateRange.to).toLocaleDateString()}\n\n`
    downloadPDF(header + personal.report, `${personal.memberName.replace(/\s+/g, '-')}-Performance.pdf`)
  }

  const downloadCombinedPDF = () => {
    if (!report) return
    const selected = report.personalReports.filter((p) => selectedMembers.has(p.memberId))
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const margin = 18
    const maxWidth = doc.internal.pageSize.getWidth() - margin * 2

    const addSection = (content: string, firstPage: boolean) => {
      let y = firstPage ? 20 : 20
      for (const line of content.split('\n')) {
        const isH2 = line.startsWith('## ')
        const isH1 = line.startsWith('# ')
        const isBullet = line.startsWith('- ')
        const text = line.replace(/^#{1,3} /, '').replace(/\*\*/g, '').replace(/^- /, '• ')
        if (!text.trim()) { y += 4; continue }
        doc.setFontSize(isH1 ? 16 : isH2 ? 13 : 10)
        doc.setFont('helvetica', isH1 || isH2 ? 'bold' : 'normal')
        if (isH2) y += 4
        for (const wrapped of doc.splitTextToSize(text, isBullet ? maxWidth - 4 : maxWidth)) {
          if (y > 275) { doc.addPage(); y = 20 }
          doc.text(wrapped, isBullet ? margin + 4 : margin, y)
          y += isH1 ? 8 : isH2 ? 7 : 5.5
        }
      }
    }

    addSection(`AI Project Tracking Report\n${report.projectName}\n\n` + report.projectTrackingReport, true)
    for (const p of selected) {
      doc.addPage()
      addSection(`Personal Performance Report\n${p.memberName}\n\n` + p.report, false)
    }
    doc.save(`${report.projectName}-Combined-AI-Report.pdf`)
  }

  const renderMarkdown = (text: string) =>
    text.split('\n').map((line, i) => {
      if (line.startsWith('## ')) return <h3 key={i} className="text-base font-semibold text-foreground mt-5 mb-2 border-b border-border pb-1">{line.slice(3)}</h3>
      if (line.startsWith('# ')) return <h2 key={i} className="text-lg font-bold text-foreground mt-4 mb-2">{line.slice(2)}</h2>
      if (line.startsWith('- ')) return <li key={i} className="text-sm text-muted-foreground ml-4 my-0.5 list-disc">{line.slice(2).replace(/\*\*(.+?)\*\*/g, '$1')}</li>
      if (!line.trim()) return <div key={i} className="h-2" />
      return <p key={i} className="text-sm text-muted-foreground my-1">{line.replace(/\*\*(.+?)\*\*/g, '$1')}</p>
    })

  const reportTypeOptions: { value: ReportType; label: string; desc: string; icon: React.ReactNode }[] = [
    {
      value: 'project',
      label: 'Project Tracking Report',
      desc: 'Full AI project analysis — sprint risk, trends, PM follow-ups',
      icon: <BarChart3 className="h-4 w-4 text-violet-500" />
    },
    {
      value: 'personal',
      label: 'Personal Performance Report',
      desc: 'Individual report per member — compliments & concerns',
      icon: <FileText className="h-4 w-4 text-blue-500" />
    },
    {
      value: 'both',
      label: 'Both Reports',
      desc: 'Project tracking + each member\'s personal report',
      icon: <Files className="h-4 w-4 text-emerald-500" />
    }
  ]

  // ── SEND VIEW ─────────────────────────────────────────────────────────────
  if (view === 'send' && report) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <button onClick={() => { setView('report'); setSendResult(null) }} className="rounded-md p-1.5 hover:bg-accent transition-colors">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div>
                <h2 className="text-base font-semibold">Send Reports</h2>
                <p className="text-xs text-muted-foreground">{report.projectName}</p>
              </div>
            </div>
            <button onClick={onClose} className="rounded-md p-1.5 hover:bg-accent transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Step 1 — Report type */}
            <div className="space-y-3">
              <p className="text-sm font-semibold">Step 1 — Select report type</p>
              <div className="space-y-2">
                {reportTypeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setReportType(opt.value)}
                    className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                      reportType === opt.value
                        ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/40'
                        : 'border-border hover:border-muted-foreground/40'
                    }`}
                  >
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${reportType === opt.value ? 'bg-violet-100 dark:bg-violet-900' : 'bg-muted'}`}>
                      {opt.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.desc}</p>
                    </div>
                    <div className={`h-4 w-4 shrink-0 rounded-full border-2 ${reportType === opt.value ? 'border-violet-500 bg-violet-500' : 'border-muted-foreground/40'}`} />
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2 — Members */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Step 2 — Select team members</p>
                <button onClick={toggleAll} className="text-xs text-violet-600 hover:underline">
                  {selectedMembers.size === report.personalReports.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="space-y-2">
                {report.personalReports.map((personal) => (
                  <button
                    key={personal.memberId}
                    onClick={() => toggleMember(personal.memberId)}
                    className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                      selectedMembers.has(personal.memberId)
                        ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/40'
                        : 'border-border hover:border-muted-foreground/40'
                    }`}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{personal.memberName}</p>
                      <p className="text-xs text-muted-foreground truncate">{personal.memberEmail}</p>
                    </div>
                    <div className="shrink-0">
                      {selectedMembers.has(personal.memberId)
                        ? <CheckSquare className="h-4 w-4 text-violet-600" />
                        : <Square className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    {sentTo.has(personal.memberId) && (
                      <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 dark:bg-green-950 text-xs shrink-0">
                        Sent
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Send copy to sender */}
            <button
              onClick={() => setSendCopyToSender((v) => !v)}
              className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                sendCopyToSender ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/40' : 'border-border hover:border-muted-foreground/40'
              }`}
            >
              <div className="shrink-0">
                {sendCopyToSender
                  ? <CheckSquare className="h-4 w-4 text-violet-600" />
                  : <Square className="h-4 w-4 text-muted-foreground" />}
              </div>
              <div>
                <p className="text-sm font-medium">Send me a copy</p>
                <p className="text-xs text-muted-foreground">A copy of the selected report(s) will be sent to your email</p>
              </div>
            </button>

            {/* Send result */}
            {sendResult && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Send results</p>
                {sendResult.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {r.success
                      ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      : <AlertCircle className="h-4 w-4 text-destructive shrink-0" />}
                    <span className={r.success ? 'text-green-700 dark:text-green-400' : 'text-destructive'}>
                      {r.name}{r.email ? ` (${r.email})` : ''} — {r.success ? 'Sent' : 'Failed'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border shrink-0 bg-muted/30">
            <span className="text-xs text-muted-foreground">
              {selectedMembers.size} member{selectedMembers.size !== 1 ? 's' : ''} selected
              {sendCopyToSender ? ' + copy to you' : ''}
            </span>
            <Button
              onClick={handleSendEmails}
              disabled={sending || selectedMembers.size === 0}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {sending ? 'Sending...' : 'Send'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── REPORT VIEW ───────────────────────────────────────────────────────────
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
                  Analyze all completed standups to generate a project tracking report and individual performance insights.
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
              <div className="flex flex-wrap items-center gap-3 pb-2">
                <Badge variant="outline" className="text-violet-600 border-violet-300 bg-violet-50 dark:bg-violet-950">
                  {report.standupCount} standups analyzed
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(report.standupDateRange.from).toLocaleDateString()} — {new Date(report.standupDateRange.to).toLocaleDateString()}
                </span>
                <span className="text-xs text-muted-foreground">By {report.generatedByName}</span>
              </div>

              <div className="flex gap-1 border-b border-border">
                {(['project', 'personal'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${activeTab === tab ? 'border-violet-600 text-violet-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                  >
                    {tab === 'project' ? 'Project Tracking Report' : 'Personal Reports'}
                    {tab === 'personal' && (
                      <span className="ml-2 text-xs bg-muted rounded-full px-1.5 py-0.5">{report.personalReports.length}</span>
                    )}
                  </button>
                ))}
              </div>

              {activeTab === 'project' && (
                <div className="space-y-1">{renderMarkdown(report.projectTrackingReport)}</div>
              )}

              {activeTab === 'personal' && (
                <div className="space-y-3">
                  {report.personalReports.map((personal) => (
                    <Card key={personal.memberId} className="overflow-hidden">
                      <div
                        className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                        onClick={() => setExpandedMember(expandedMember === personal.memberId ? null : personal.memberId)}
                      >
                        <div className="flex items-center gap-3">
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
                            <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 dark:bg-green-950 text-xs">Sent</Badge>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); downloadMemberReport(personal) }}
                            className="rounded-md p-1.5 hover:bg-accent transition-colors"
                            title="Download PDF"
                          >
                            <Download className="h-4 w-4 text-muted-foreground" />
                          </button>
                          {expandedMember === personal.memberId
                            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </div>
                      {expandedMember === personal.memberId && (
                        <CardContent className="pt-0 px-4 pb-4 border-t border-border">
                          <div className="mt-3 space-y-1">{renderMarkdown(personal.report)}</div>
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {report && !generating && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-border shrink-0 bg-muted/30">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={downloadProjectReport}>
                <Download className="mr-2 h-4 w-4" />
                Project PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setSelectedMembers(new Set(report.personalReports.map(p => p.memberId))); downloadCombinedPDF() }}>
                <Download className="mr-2 h-4 w-4" />
                Combined PDF
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleGenerate}>
                <Brain className="mr-2 h-4 w-4" />
                Regenerate
              </Button>
              <Button size="sm" onClick={() => setView('send')} className="bg-violet-600 hover:bg-violet-700 text-white">
                <Send className="mr-2 h-4 w-4" />
                Send to members
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
