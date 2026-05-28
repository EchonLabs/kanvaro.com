'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { useNotify } from '@/lib/notify'
import { formatToTitleCase } from '@/lib/utils'
import { updateStandupSchedule } from './standup-schedule-storage'
import type { StandupScheduleDetail } from './standup-dashboard-types'

interface StandupSummaryDialogProps {
  projectId: string
  meetingId: string
  detail: StandupScheduleDetail
  onGenerated?: (summary: string) => void
}

const escapePdfText = (value: string) => value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

const wrapText = (text: string, maxLength: number) => {
  if (!text) return ['']
  const words = text.split(/\s+/)
  const lines: string[] = []
  let currentLine = ''

  words.forEach((word) => {
    const candidate = currentLine ? `${currentLine} ${word}` : word
    if (candidate.length > maxLength && currentLine) {
      lines.push(currentLine)
      currentLine = word
      return
    }
    currentLine = candidate
  })

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines.length > 0 ? lines : ['']
}

const buildProcessedSummary = (detail: StandupScheduleDetail) => {
  const completedCount = detail.memberSummaries.filter((member) => member.completedTasks > 0).length
  const blockedCount = detail.memberSummaries.filter((member) => member.blockedTasks > 0).length
  const totalLoggedMinutes = detail.timelogs.reduce((sum, log) => sum + log.duration, 0)
  const notableMembers = detail.memberSummaries
    .filter((member) => member.completedTasks > 0 || member.timeLoggedMinutes > 0 || member.notes.length > 0)
    .slice(0, 6)

  const lines: string[] = []
  lines.push(`${detail.project.name} - ${detail.meeting.title}`)
  lines.push(`Date: ${new Date(detail.meeting.date).toLocaleDateString()}`)
  lines.push(`Status: ${formatToTitleCase(detail.meeting.status)}`)
  lines.push('')
  lines.push('Executive summary')
  lines.push(`This standup captured ${detail.meeting.participants.length} participants, ${completedCount} members with completed work, ${blockedCount} blocked members, and ${Math.round(totalLoggedMinutes / 60 * 10) / 10} total logged hours.`)
  lines.push(detail.meeting.notes || 'No separate standup notes were recorded for this meeting.')
  lines.push('')
  lines.push('Key highlights')
  if (notableMembers.length > 0) {
    notableMembers.forEach((member) => {
      const noteSummary = member.notes.slice(0, 2).join('; ')
      const highlight = [
        `${member.firstName} ${member.lastName}`,
        member.completedTasks > 0 ? `${member.completedTasks} completed tasks` : null,
        member.timeLoggedMinutes > 0 ? `${Math.round(member.timeLoggedMinutes / 60 * 10) / 10}h logged` : null,
        noteSummary || null
      ].filter(Boolean).join(' · ')

      lines.push(`- ${highlight}`)
    })
  } else {
    lines.push('- No member-specific highlights were captured.')
  }
  lines.push('')
  lines.push('Task recap')
  detail.projectTasks.slice(0, 8).forEach((task) => {
    lines.push(`- ${task.displayId ? `${task.displayId} ` : ''}${task.title} (${task.status || 'open'})`)
  })
  if (detail.projectTasks.length > 8) {
    lines.push(`- ${detail.projectTasks.length - 8} additional tasks omitted from the processed summary.`)
  }
  return lines.join('\n')
}

const buildPdfBlob = (title: string, summary: string) => {
  const pageWidth = 612
  const pageHeight = 792
  const marginLeft = 54
  const marginTop = 72
  const lineHeight = 14
  const maxLinesPerPage = Math.floor((pageHeight - marginTop * 2) / lineHeight)
  const wrappedLines = summary
    .split('\n')
    .flatMap((line) => (line.trim().length === 0 ? [''] : wrapText(line, 88)))

  const pages: string[][] = []
  for (let index = 0; index < wrappedLines.length; index += maxLinesPerPage) {
    pages.push(wrappedLines.slice(index, index + maxLinesPerPage))
  }

  const objects: string[] = []
  const pageObjectIds: number[] = []
  const contentObjectIds: number[] = []
  const totalPages = Math.max(pages.length, 1)

  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj')

  const pageKids: string[] = []
  let objectId = 3
  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    const pageObjectId = objectId
    const contentObjectId = objectId + 1
    pageObjectIds.push(pageObjectId)
    contentObjectIds.push(contentObjectId)
    pageKids.push(`${pageObjectId} 0 R`)
    objectId += 2
  }

  objects.push(`2 0 obj << /Type /Pages /Kids [ ${pageKids.join(' ')} ] /Count ${totalPages} >> endobj`)

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    const pageObjectId = pageObjectIds[pageIndex]
    const contentObjectId = contentObjectIds[pageIndex]
    const pageLines = pages[pageIndex] || []
    const lines: string[] = []
    lines.push('BT')
    lines.push('/F1 11 Tf')
    lines.push(`${marginLeft} ${pageHeight - marginTop} Td`)
    pageLines.forEach((line, lineIndex) => {
      if (lineIndex === 0) {
        lines.push(`(${escapePdfText(line)}) Tj`)
      } else {
        lines.push('T*')
        lines.push(`(${escapePdfText(line)}) Tj`)
      }
    })
    lines.push('ET')

    const content = lines.join('\n')
    objects.push(`${pageObjectId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R >> >> /Contents ${contentObjectId} 0 R >> endobj`)
    objects.push(`${contentObjectId} 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`)
  }

  objects.push('4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj')

  const header = '%PDF-1.4\n'
  let body = ''
  const offsets: number[] = []
  let byteLength = header.length

  objects.forEach((object) => {
    offsets.push(byteLength)
    body += `${object}\n`
    byteLength += `${object}\n`.length
  })

  const xrefOffset = byteLength
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.forEach((offset) => {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`
  })

  const trailer = `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  const pdf = `${header}${body}${xref}${trailer}`
  return new Blob([pdf], { type: 'application/pdf' })
}

const downloadPdf = (title: string, summary: string) => {
  const blob = buildPdfBlob(title, summary)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${title.replace(/[^a-z0-9\-]+/gi, '_').replace(/^_+|_+$/g, '') || 'standup_summary'}.pdf`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function StandupSummaryDialog({ projectId, meetingId, detail, onGenerated }: StandupSummaryDialogProps) {
  const { success: notifySuccess, error: notifyError } = useNotify()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const summaryPreview = useMemo(() => buildProcessedSummary(detail), [detail])

  const handleGenerate = async () => {
    setSaving(true)
    try {
      const summary = buildProcessedSummary(detail)
      await updateStandupSchedule(projectId, meetingId, {
        summary,
        status: 'completed'
      })

      onGenerated?.(summary)

      downloadPdf(`${detail.project.name} - ${detail.meeting.title}`, summary)

      notifySuccess({ title: 'Summary generated', message: 'The standup summary was saved and downloaded as a PDF.' })
      setOpen(false)
    } catch {
      notifyError({ title: 'Unable to generate summary' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" onClick={() => setOpen(true)}>Generate Summary</Button>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Generate Standup Summary</DialogTitle>
          <DialogDescription>Generate a processed summary for this completed standup and download it as a PDF.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Preview</p>
            <pre className="mt-2 whitespace-pre-wrap text-xs leading-6">{summaryPreview}</pre>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={saving}>
            {saving ? 'Generating...' : 'Generate and Export'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
