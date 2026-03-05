'use client'

import React, { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Upload,
  Download,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  FileText,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
} from 'lucide-react'
import { useNotify } from '@/lib/notify'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ValidatedRow {
  rowNumber: number
  title: string
  project: { _id: string; name: string }
  dueDate: string
  assignee: { _id: string; firstName: string; lastName: string; email: string }
  description: string
  priority: string
  type: string
  estimatedHours?: number
  billable?: boolean
  labels: string[]
  image?: string
}

interface InvalidRow {
  rowNumber: number
  data: Record<string, string>
  errors: string[]
}

// ─── System field definitions ─────────────────────────────────────────────────

const SYSTEM_FIELDS = [
  { key: 'title',          label: 'Task Title',             required: true },
  { key: 'project',        label: 'Project',                required: true },
  { key: 'dueDate',        label: 'Due Date',               required: true },
  { key: 'assigneeEmail',  label: 'Assignee (Name or Email)', required: true },
  { key: 'description',    label: 'Description',            required: false },
  { key: 'priority',       label: 'Priority',               required: false },
  { key: 'type',           label: 'Type',                   required: false },
  { key: 'estimatedHours', label: 'Estimated Hours',        required: false },
  { key: 'billable',       label: 'Billable',               required: false },
  { key: 'labels',         label: 'Labels',                 required: false },
  { key: 'image',          label: 'Image (Base64)',         required: false },
] as const

type SystemFieldKey = (typeof SYSTEM_FIELDS)[number]['key']

// ─── Template CSV ─────────────────────────────────────────────────────────────

const TEMPLATE_HEADERS = SYSTEM_FIELDS.map(f => f.key).join(',')

const TEMPLATE_EXAMPLE_ROWS = [
  [
    'Fix login bug',
    'My Project',
    '31/12/2025',
    'John Smith',
    'Users cannot login with SSO',
    'high',
    'bug',
    '4',
    'true',
    'auth,sso',
    '',
  ].join(','),
  [
    'Design homepage',
    'My Project',
    '15/01/2026',
    'jane@example.com',
    'Redesign the landing page',
    'medium',
    'task',
    '8',
    'false',
    'design,ui',
    '',
  ].join(','),
]

const TEMPLATE_CSV = [TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLE_ROWS].join('\n')

// ─── CSV parser (handles multi-line quoted fields & embedded newlines) ────────

function parseCsv(raw: string): { headers: string[]; rows: Record<string, string>[] } {
  // Remove BOM if present
  const text = raw.startsWith('\uFEFF') ? raw.slice(1) : raw

  // Parse the entire text character by character so quoted multi-line fields
  // (e.g. HTML descriptions that contain real newlines) are handled correctly.
  const parseAllRows = (src: string): string[][] => {
    const rows: string[][] = []
    let row: string[] = []
    let cell = ''
    let inQuotes = false
    let i = 0

    while (i < src.length) {
      const ch = src[i]

      if (ch === '"') {
        if (inQuotes && src[i + 1] === '"') {
          // Escaped quote inside quoted field
          cell += '"'
          i += 2
          continue
        }
        inQuotes = !inQuotes
        i++
        continue
      }

      if (ch === ',' && !inQuotes) {
        row.push(cell)
        cell = ''
        i++
        continue
      }

      // Newline handling
      if (!inQuotes && (ch === '\r' || ch === '\n')) {
        // Skip \r\n as a single newline
        if (ch === '\r' && src[i + 1] === '\n') i++
        row.push(cell)
        cell = ''
        // Only emit the row if it has at least one non-empty cell (skip blank lines)
        if (row.some(c => c.trim())) rows.push(row)
        row = []
        i++
        continue
      }

      // Inside a quoted field, preserve newlines literally
      cell += ch
      i++
    }

    // Flush last cell / row
    if (cell || row.length > 0) {
      row.push(cell)
      if (row.some(c => c.trim())) rows.push(row)
    }

    return rows
  }

  const allRows = parseAllRows(text)
  if (allRows.length < 2) return { headers: [], rows: [] }

  const headers = allRows[0].map(h => h.trim())
  const rows: Record<string, string>[] = []
  for (let i = 1; i < allRows.length; i++) {
    const values = allRows[i]
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      // .trim() for all fields EXCEPT description-like ones that may contain HTML
      row[h] = values[idx] ?? ''
    })
    rows.push(row)
  }
  return { headers, rows }
}

// ─── Auto-mapping helper ──────────────────────────────────────────────────────

function buildAutoMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {}
  const lowerHeaders = headers.map(h => h.toLowerCase().replace(/\s+/g, '').replace(/[^a-z]/g, ''))

  // More specific aliases listed FIRST so exact match wins over loose partial match.
  // Order matters: exact slug match is tried first, then starts-with, then includes.
  const ALIASES: Record<string, string[]> = {
    title:          ['tasktitle', 'taskname', 'title', 'name'],
    project:        ['projectname', 'project', 'proj'],
    dueDate:        ['taskduedate', 'duedate', 'due', 'deadline'],
    assigneeEmail:  ['assignedto', 'assignee', 'assigneeemail', 'email', 'usemail'],
    description:    ['taskdescription', 'description', 'desc', 'details'],
    priority:       ['priority', 'prio'],
    type:           ['tasktype', 'issuetype', 'type'],
    estimatedHours: ['estimatedhours', 'hours', 'estimate'],
    billable:       ['isbillable', 'billable', 'billed'],
    labels:         ['labels', 'tags', 'label'],
    image:          ['image', 'img', 'picture', 'screenshot', 'attachmentimage'],
  }

  for (const field of SYSTEM_FIELDS) {
    const aliases = ALIASES[field.key] ?? [field.key.toLowerCase()]

    // 1. Exact match
    let matchIdx = lowerHeaders.findIndex(lh => aliases.includes(lh))

    // 2. Header starts with any alias
    if (matchIdx === -1) {
      matchIdx = lowerHeaders.findIndex(lh => aliases.some(a => lh.startsWith(a)))
    }

    // 3. Any alias starts with header (only if header >= 4 chars to avoid false positives)
    if (matchIdx === -1) {
      matchIdx = lowerHeaders.findIndex(lh => lh.length >= 4 && aliases.some(a => a.startsWith(lh)))
    }

    // 4. Partial includes (only if header >= 5 chars)
    if (matchIdx === -1) {
      matchIdx = lowerHeaders.findIndex(lh => lh.length >= 5 && aliases.some(a => lh.includes(a)))
    }

    if (matchIdx !== -1) mapping[field.key] = headers[matchIdx]
  }
  return mapping
}

// ─── Download invalid rows as CSV ────────────────────────────────────────────

function downloadInvalidCsv(invalidRows: InvalidRow[]) {
  if (invalidRows.length === 0) return
  const headers = ['Row', ...SYSTEM_FIELDS.map(f => f.label), 'Errors']
  const csvRows = invalidRows.map(r => {
    const data = r.data as Record<string, string>
    const values = SYSTEM_FIELDS.map(f => {
      const v = data[f.key] ?? ''
      return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v
    })
    const errors = r.errors.join('; ')
    return [r.rowNumber, ...values, `"${errors.replace(/"/g, '""')}"`].join(',')
  })
  const csv = [headers.join(','), ...csvRows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'invalid_tasks.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: 'Upload & Map' },
    { n: 2, label: 'Validate' },
    { n: 3, label: 'Summary' },
  ]
  return (
    <div className="flex items-center justify-center gap-0 mb-6">
      {steps.map((s, idx) => (
        <React.Fragment key={s.n}>
          <div className="flex flex-col items-center gap-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors ${
                step > s.n
                  ? 'bg-primary border-primary text-primary-foreground'
                  : step === s.n
                  ? 'border-primary text-primary bg-background'
                  : 'border-muted-foreground/30 text-muted-foreground bg-background'
              }`}
            >
              {step > s.n ? <CheckCircle2 className="h-4 w-4" /> : s.n}
            </div>
            <span
              className={`text-xs font-medium ${
                step === s.n ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              {s.label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div
              className={`h-0.5 w-16 mx-1 mb-5 transition-colors ${
                step > s.n ? 'bg-primary' : 'bg-muted-foreground/20'
              }`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface BulkUploadModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  /** When provided, the project field is pre-filled and locked to this project */
  defaultProject?: { id: string; name: string }
}

export default function BulkUploadModal({ open, onClose, onSuccess, defaultProject }: BulkUploadModalProps) {
  const router = useRouter()
  const { success: notifySuccess, error: notifyError } = useNotify()

  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 1
  const [file, setFile] = useState<File | null>(null)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Step 2
  const [validating, setValidating] = useState(false)
  const [validRows, setValidRows] = useState<ValidatedRow[]>([])
  const [invalidRows, setInvalidRows] = useState<InvalidRow[]>([])

  // Step 3
  const [submitting, setSubmitting] = useState(false)

  // ── Template download ──────────────────────────────────────────────────────
  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'task_bulk_upload_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── File handling ──────────────────────────────────────────────────────────
  const handleFile = useCallback((f: File) => {
    if (!f.name.endsWith('.csv') && f.type !== 'text/csv') {
      notifyError({ title: 'Invalid File', message: 'Please upload a CSV file.' })
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const { headers, rows } = parseCsv(text)
      if (headers.length === 0) {
        notifyError({ title: 'Empty File', message: 'CSV has no headers or data.' })
        return
      }
      setFile(f)
      setCsvHeaders(headers)
      setCsvRows(rows.map((r, i) => ({ ...r, __rowNumber: String(i + 2) })))
      setMapping(buildAutoMapping(headers))
    }
    reader.readAsText(f)
  }, [notifyError])

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  // ── Validate (Step 1 → 2) ──────────────────────────────────────────────────
  const handleValidate = async () => {
    // If defaultProject is set, project mapping is not required
    const unmapped = SYSTEM_FIELDS.filter(f =>
      f.required &&
      !mapping[f.key] &&
      !(f.key === 'project' && defaultProject)
    )
    if (unmapped.length > 0) {
      notifyError({
        title: 'Missing Mappings',
        message: `Please map: ${unmapped.map(f => f.label).join(', ')}`,
      })
      return
    }

    if (csvRows.length > 1000) {
      notifyError({ title: 'Too Many Rows', message: 'Maximum 1000 rows allowed.' })
      return
    }

    // Transform CSV rows using mapping.
    // If defaultProject is provided, always override the project field.
    const mappedRows = csvRows.map((row, idx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: any = { rowNumber: idx + 2 }
      for (const field of SYSTEM_FIELDS) {
        if (field.key === 'project' && defaultProject) {
          mapped[field.key] = defaultProject.name
        } else {
          const csvCol = mapping[field.key]
          mapped[field.key] = csvCol ? (row[csvCol] ?? '') : ''
        }
      }
      return mapped as { rowNumber: number } & Record<string, string>
    })

    setValidating(true)
    try {
      const csvUploadUrl = '/api/tasks/csv-upload'
      console.log('[BulkUpload] ── csv-upload START ──')
      console.log('[BulkUpload] Origin:', window.location.origin)
      console.log('[BulkUpload] Full URL:', window.location.origin + csvUploadUrl)
      console.log('[BulkUpload] Row count:', mappedRows.length)
      console.log('[BulkUpload] Payload preview:', JSON.stringify({ rows: mappedRows }).slice(0, 500))
      const res = await fetch(csvUploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: mappedRows }),
      })
      console.log('[BulkUpload] csv-upload response status:', res.status, res.statusText)
      console.log('[BulkUpload] csv-upload response headers content-type:', res.headers.get('content-type'))
      console.log('[BulkUpload] csv-upload response headers server:', res.headers.get('server'))
      const responseText = await res.text()
      console.log('[BulkUpload] csv-upload raw response body:', responseText.slice(0, 1000))
      if (!res.ok) {
        console.error('[BulkUpload] csv-upload HTTP error:', res.status, res.statusText, '| Body:', responseText.slice(0, 500))
        notifyError({ title: `Validation Error (${res.status})`, message: `Server returned ${res.status} ${res.statusText}. Check console for details.` })
        return
      }
      let data: any
      try {
        data = JSON.parse(responseText)
      } catch (parseErr) {
        console.error('[BulkUpload] csv-upload JSON parse error:', parseErr, '| Raw:', responseText.slice(0, 500))
        notifyError({ title: 'Parse Error', message: 'Server returned non-JSON response. Check console.' })
        return
      }
      console.log('[BulkUpload] csv-upload parsed data:', JSON.stringify(data).slice(0, 500))
      if (!data.success) {
        console.error('[BulkUpload] csv-upload API error:', data.error)
        notifyError({ title: 'Validation Error', message: data.error ?? 'Validation failed' })
        return
      }
      setValidRows(data.data.validRows)
      setInvalidRows(data.data.invalidRows)
      setStep(2)
    } catch (err) {
      console.error('[BulkUpload] csv-upload network/fetch error:', err)
      notifyError({ title: 'Network Error', message: String(err) })
    } finally {
      setValidating(false)
    }
  }

  // ── Submit (Step 3) ────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (validRows.length === 0) return

    const payload = validRows.map(r => {
      // If an image data URI is present, embed it as an <img> tag at the end
      // of the description. The bulk-create API will extract it, save to disk,
      // and replace the data URI with a server URL.
      let description = r.description || ''
      if (r.image && r.image.startsWith('data:image/')) {
        description = description
          ? `${description}<p><img src="${r.image}" /></p>`
          : `<p><img src="${r.image}" /></p>`
      }
      return {
        title: r.title,
        description,
        project: r.project._id,
        dueDate: r.dueDate,
        assignedTo: [{ user: r.assignee._id }],
        priority: r.priority,
        type: r.type,
        estimatedHours: r.estimatedHours,
        isBillable: r.billable,
        labels: r.labels,
      }
    })

    setSubmitting(true)
    try {
      const bulkCreateUrl = '/api/tasks/bulk-create'
      console.log('[BulkUpload] ── bulk-create START ──')
      console.log('[BulkUpload] Origin:', window.location.origin)
      console.log('[BulkUpload] Full URL:', window.location.origin + bulkCreateUrl)
      console.log('[BulkUpload] Task count:', payload.length)
      console.log('[BulkUpload] Payload size (bytes):', JSON.stringify(payload).length)
      console.log('[BulkUpload] Payload preview:', JSON.stringify(payload).slice(0, 500))
      const res = await fetch(bulkCreateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      console.log('[BulkUpload] bulk-create response status:', res.status, res.statusText)
      console.log('[BulkUpload] bulk-create response headers content-type:', res.headers.get('content-type'))
      console.log('[BulkUpload] bulk-create response headers server:', res.headers.get('server'))
      const responseText = await res.text()
      console.log('[BulkUpload] bulk-create raw response body:', responseText.slice(0, 1000))
      if (!res.ok) {
        console.error('[BulkUpload] bulk-create HTTP error:', res.status, res.statusText, '| Body:', responseText.slice(0, 500))
        notifyError({ title: `Submit Failed (${res.status})`, message: `Server returned ${res.status} ${res.statusText}. Check console for details.` })
        return
      }
      let data: any
      try {
        data = JSON.parse(responseText)
      } catch (parseErr) {
        console.error('[BulkUpload] bulk-create JSON parse error:', parseErr, '| Raw:', responseText.slice(0, 500))
        notifyError({ title: 'Parse Error', message: 'Server returned non-JSON response. Check console.' })
        return
      }
      console.log('[BulkUpload] bulk-create parsed data:', JSON.stringify(data).slice(0, 500))
      if (!data.success) {
        console.error('[BulkUpload] bulk-create API error:', data.error)
        notifyError({ title: 'Submit Failed', message: data.error ?? 'Failed to create tasks' })
        return
      }
      notifySuccess({
        title: 'Tasks Created',
        message: `Successfully created ${data.data?.length ?? validRows.length} tasks.`,
      })
      handleClose()
      onSuccess?.()
      router.refresh()
    } catch (err) {
      console.error('[BulkUpload] bulk-create network/fetch error:', err)
      notifyError({ title: 'Network Error', message: String(err) })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Close / reset ──────────────────────────────────────────────────────────
  const handleClose = () => {
    setStep(1)
    setFile(null)
    setCsvHeaders([])
    setCsvRows([])
    setMapping({})
    setValidRows([])
    setInvalidRows([])
    onClose()
  }

  // ── Summary stats ──────────────────────────────────────────────────────────
  const uniqueProjects = new Set(validRows.map(r => r.project._id)).size
  const totalEstHours = validRows.reduce((sum, r) => sum + (r.estimatedHours ?? 0), 0)

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={open => { if (!open) handleClose() }}>
      <DialogContent className="max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8">
        <DialogHeader className="mb-2">
          <DialogTitle className="text-xl font-semibold">Bulk Upload Tasks</DialogTitle>
        </DialogHeader>

        <StepIndicator step={step} />

        {/* ─ Step 1: Upload + Mapping ─────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-6">
            {/* Pre-filled project badge when opened from project page */}
            {defaultProject && (
              <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                <p className="text-sm">
                  Tasks will be created in project{' '}
                  <span className="font-semibold">{defaultProject.name}</span>.
                  You don&apos;t need to map the Project column.
                </p>
              </div>
            )}

            {/* Template download */}
            <div className="flex items-center justify-between rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4">
              <div>
                <p className="font-medium text-sm">Download CSV Template</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Use our template with pre-filled column headers. Required: Title,{defaultProject ? '' : ' Project,'} Due Date (dd/mm/yyyy), Assignee Email.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplate} className="flex-shrink-0 ml-4">
                <Download className="h-4 w-4 mr-1.5" />
                Template
              </Button>
            </div>

            {/* Drop zone */}
            <div
              className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors cursor-pointer ${
                dragOver ? 'border-primary bg-primary/10' : 'border-muted-foreground/30 hover:border-primary/50'
              }`}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onInputChange} />
              {file ? (
                <>
                  <FileText className="h-10 w-10 text-primary" />
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">{csvRows.length} data rows detected</p>
                  <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); setFile(null); setCsvHeaders([]); setCsvRows([]); setMapping({}) }}>
                    Remove file
                  </Button>
                </>
              ) : (
                <>
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  <p className="font-medium">Drop your CSV file here</p>
                  <p className="text-sm text-muted-foreground">or click to browse</p>
                </>
              )}
            </div>

            {/* Column Mapping */}
            {csvHeaders.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-sm">Column Mapping</h3>
                  <p className="text-xs text-muted-foreground">Map your CSV columns to system fields</p>
                </div>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">System Field</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Your CSV Column</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-20">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {SYSTEM_FIELDS.map(field => {
                        const mapped = mapping[field.key]
                        return (
                          <tr key={field.key} className="hover:bg-muted/20">
                            <td className="px-4 py-2.5">
                              <span className="font-medium">{field.label}</span>
                              {field.required && (
                                <Badge variant="destructive" className="ml-2 px-1 py-0 text-[10px]">Required</Badge>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              <Select
                                value={mapped ?? '__none__'}
                                onValueChange={v =>
                                  setMapping(prev => ({
                                    ...prev,
                                    [field.key]: v === '__none__' ? '' : v,
                                  }))
                                }
                              >
                                <SelectTrigger className="h-8 text-sm w-full max-w-xs">
                                  <SelectValue placeholder="— not mapped —" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">— not mapped —</SelectItem>
                                  {csvHeaders.map(h => (
                                    <SelectItem key={h} value={h}>{h}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-4 py-2.5">
                              {mapped ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              ) : field.required ? (
                                <AlertCircle className="h-4 w-4 text-destructive" />
                              ) : (
                                <span className="text-muted-foreground text-xs">Optional</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4 mt-2">
              <Button onClick={handleValidate} disabled={!file || validating}>
                {validating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Validating…
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ─ Step 2: Validation & Preview ─────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5">
            {/* Summary badges */}
            <div className="flex gap-3 flex-wrap mb-1">
              <Badge variant="outline" className="gap-1.5 py-1 px-3 text-sm">
                <FileText className="h-4 w-4" />
                {validRows.length + invalidRows.length} Total
              </Badge>
              <Badge className="gap-1.5 py-1 px-3 text-sm bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
                <CheckCircle2 className="h-4 w-4" />
                {validRows.length} Valid
              </Badge>
              {invalidRows.length > 0 && (
                <Badge className="gap-1.5 py-1 px-3 text-sm bg-red-100 text-red-800 border-red-200 hover:bg-red-100">
                  <XCircle className="h-4 w-4" />
                  {invalidRows.length} Invalid
                </Badge>
              )}
            </div>

            {/* Valid Tasks */}
            {validRows.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-medium text-sm flex items-center gap-1.5 text-green-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Valid Tasks ({validRows.length})
                </h3>
                <div className="rounded-lg border max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-green-50 dark:bg-green-950/20 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">#</th>
                        <th className="text-left px-3 py-2 font-medium">Title</th>
                        <th className="text-left px-3 py-2 font-medium">Project</th>
                        <th className="text-left px-3 py-2 font-medium">Assignee</th>
                        <th className="text-left px-3 py-2 font-medium">Due Date</th>
                        <th className="text-left px-3 py-2 font-medium">Priority</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {validRows.map(r => (
                        <tr key={r.rowNumber} className="hover:bg-muted/30">
                          <td className="px-3 py-2 text-muted-foreground">{r.rowNumber}</td>
                          <td className="px-3 py-2 font-medium max-w-[160px] truncate">{r.title}</td>
                          <td className="px-3 py-2">{r.project.name}</td>
                          <td className="px-3 py-2">{r.assignee.firstName} {r.assignee.lastName}</td>
                          <td className="px-3 py-2">{new Date(r.dueDate).toLocaleDateString()}</td>
                          <td className="px-3 py-2 capitalize">{r.priority}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Invalid Tasks */}
            {invalidRows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-sm flex items-center gap-1.5 text-destructive">
                    <XCircle className="h-4 w-4" />
                    Invalid Tasks ({invalidRows.length})
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => downloadInvalidCsv(invalidRows)}
                  >
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Download Errors
                  </Button>
                </div>
                <div className="rounded-lg border border-destructive/30 max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-red-50 dark:bg-red-950/20 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">#</th>
                        <th className="text-left px-3 py-2 font-medium">Title</th>
                        <th className="text-left px-3 py-2 font-medium">Project</th>
                        <th className="text-left px-3 py-2 font-medium">Errors</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {invalidRows.map(r => (
                        <tr key={r.rowNumber} className="hover:bg-red-50/50 dark:hover:bg-red-950/10">
                          <td className="px-3 py-2 text-muted-foreground">{r.rowNumber}</td>
                          <td className="px-3 py-2 max-w-[120px] truncate">{(r.data as any).title || '—'}</td>
                          <td className="px-3 py-2 max-w-[100px] truncate">{(r.data as any).project || '—'}</td>
                          <td className="px-3 py-2">
                            <ul className="list-disc list-inside space-y-0.5">
                              {r.errors.map((e, i) => (
                                <li key={i} className="text-destructive">{e}</li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {validRows.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground gap-2">
                <XCircle className="h-10 w-10 text-destructive/60" />
                <p className="font-medium">No valid tasks found</p>
                <p className="text-sm">Please fix the errors and re-upload your CSV.</p>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 mt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={validRows.length === 0}
              >
                Continue
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ─ Step 3: Summary + Submit ──────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Total Rows', value: validRows.length + invalidRows.length },
                { label: 'Valid Tasks', value: validRows.length, color: 'text-green-600' },
                { label: 'Invalid Rows', value: invalidRows.length, color: 'text-destructive' },
                { label: 'Projects', value: uniqueProjects },
              ].map(stat => (
                <div
                  key={stat.label}
                  className="rounded-xl border bg-muted/20 p-5 flex flex-col gap-1.5"
                >
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{stat.label}</span>
                  <span className={`text-2xl font-bold ${stat.color ?? ''}`}>{stat.value}</span>
                </div>
              ))}
            </div>

            {totalEstHours > 0 && (
              <div className="rounded-xl border bg-muted/20 p-5">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Estimated Hours</span>
                <p className="text-2xl font-bold mt-1.5">{totalEstHours.toFixed(1)} h</p>
              </div>
            )}

            {/* Project breakdown */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Projects Included</h3>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Map(validRows.map(r => [r.project._id, r.project.name]))).map(([id, name]) => (
                  <Badge key={id} variant="outline" className="gap-1">
                    {name}
                    <span className="text-muted-foreground">
                      ({validRows.filter(r => r.project._id === id).length})
                    </span>
                  </Badge>
                ))}
              </div>
            </div>

            <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 border-amber-200/60 p-4 mt-1 text-sm text-amber-800 dark:text-amber-300">
              <strong>{validRows.length} task{validRows.length !== 1 ? 's' : ''}</strong> will be created immediately.
              {invalidRows.length > 0 && (
                <> <strong>{invalidRows.length} invalid row{invalidRows.length !== 1 ? 's' : ''}</strong> will be skipped.</>
              )}
            </div>

            <div className="flex items-center justify-between pt-4 mt-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={submitting || validRows.length === 0} className="gap-2">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating Tasks…
                  </>
                ) : (
                  <>
                    Submit {validRows.length} Task{validRows.length !== 1 ? 's' : ''}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
