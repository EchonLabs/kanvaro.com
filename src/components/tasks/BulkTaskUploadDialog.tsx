'use client'

import { useState, useCallback, useRef } from 'react'
import { useToast } from '@/components/ui/Toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter
} from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  ArrowRight,
  FileText,
  Copy
} from 'lucide-react'
import {
  parseCSV,
  autoDetectMapping,
  validateRows,
  toBulkCreatePayload,
  generateCSVTemplate,
  exportRowsAsCSV,
  SYSTEM_COLUMNS,
  type SystemColumnKey,
  type ColumnMapping,
  type ValidationSummary,
  type CSVParseResult
} from '@/lib/csv-utils'

interface BulkTaskUploadDialogProps {
  isOpen: boolean
  onClose: () => void
  projectId?: string
  projectName?: string
  onComplete: () => void
}

type Step = 'upload' | 'mapping' | 'preview'

const STEP_LABELS: Record<Step, string> = {
  upload: 'Upload CSV',
  mapping: 'Column Mapping',
  preview: 'Validate & Submit'
}

const STEPS: Step[] = ['upload', 'mapping', 'preview']

export default function BulkTaskUploadDialog({
  isOpen,
  onClose,
  projectId,
  projectName,
  onComplete
}: BulkTaskUploadDialogProps) {
  const [step, setStep] = useState<Step>('upload')
  const [csvData, setCsvData] = useState<CSVParseResult | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [validation, setValidation] = useState<ValidationSummary | null>(null)
  const [isResolving, setIsResolving] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToast()

  const reset = useCallback(() => {
    setStep('upload')
    setCsvData(null)
    setMapping({})
    setValidation(null)
    setIsResolving(false)
    setIsSubmitting(false)
    setSubmitResult(null)
    setError(null)
    setFileName(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleClose = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  // ─── Step 1: File Upload ───
  const processFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      setError('Please select a CSV file')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB')
      return
    }

    setError(null)
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = evt.target?.result as string
      if (!text || text.trim().length === 0) {
        setError('File is empty')
        return
      }

      const parsed = parseCSV(text)
      if (parsed.headers.length === 0) {
        setError('No headers found in CSV file')
        return
      }
      if (parsed.rows.length === 0) {
        setError('No data rows found in CSV file')
        return
      }

      setCsvData(parsed)
      const autoMapping = autoDetectMapping(parsed.headers)
      setMapping(autoMapping)
      setStep('mapping')
    }
    reader.onerror = () => setError('Failed to read file')
    reader.readAsText(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }, [processFile])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }, [processFile])

  const handleDownloadTemplate = useCallback(() => {
    const csv = generateCSVTemplate()
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'task-upload-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  // ─── Step 2: Column Mapping ───
  // Build a reverse lookup: systemColumn → csvHeader
  const reverseMapping = useCallback((): Record<string, string> => {
    const rev: Record<string, string> = {}
    for (const [csvHeader, sysCol] of Object.entries(mapping)) {
      if (sysCol && sysCol !== 'skip') {
        rev[sysCol] = csvHeader
      }
    }
    return rev
  }, [mapping])

  // When user picks a CSV column for a system field, update mapping accordingly
  const handleSystemMappingChange = useCallback((systemKey: string, csvHeader: string) => {
    setMapping(prev => {
      const next = { ...prev }

      // Remove old assignment: if this system column was already mapped to a different CSV header, unmap it
      for (const [h, sys] of Object.entries(next)) {
        if (sys === systemKey) {
          next[h] = 'skip'
        }
      }

      // If user chose "none", we're done (unmap only)
      if (csvHeader === 'none') {
        return next
      }

      // If the selected CSV header was previously mapped to a different system column, unmap it
      if (next[csvHeader] && next[csvHeader] !== 'skip') {
        // clear old
      }

      // Assign the new mapping
      next[csvHeader] = systemKey as SystemColumnKey
      return next
    })
  }, [])

  const requiredColumnsMapped = useCallback(() => {
    const mapped = new Set(Object.values(mapping).filter(v => v !== 'skip'))
    const requiredKeys = Object.entries(SYSTEM_COLUMNS)
      .filter(([, col]) => col.required)
      .map(([key]) => key)

    // If projectId is provided, project mapping is not required
    const needed = projectId
      ? requiredKeys.filter(k => k !== 'project')
      : requiredKeys

    return needed.every(k => mapped.has(k as SystemColumnKey))
  }, [mapping, projectId])

  // System columns sorted: required first, then optional
  const sortedSystemColumns = Object.entries(SYSTEM_COLUMNS).sort(
    ([, a], [, b]) => (a.required === b.required ? 0 : a.required ? -1 : 1)
  )

  // ─── Step 2 → 3: Resolve & Validate ───
  const handleValidate = useCallback(async () => {
    if (!csvData) return
    setIsResolving(true)
    setError(null)

    try {
      // Collect unique project names and assignee identifiers from CSV
      const projectNames: string[] = []
      const assigneeIdentifiers: string[] = []

      const projectColIdx = csvData.headers.findIndex(h => mapping[h] === 'project')
      const assigneeColIdx = csvData.headers.findIndex(h => mapping[h] === 'assignee')
      const assignedByColIdx = csvData.headers.findIndex(h => mapping[h] === 'assignedBy')

      for (const row of csvData.rows) {
        if (projectColIdx >= 0 && row[projectColIdx]) {
          projectNames.push(row[projectColIdx].trim())
        }
        if (assigneeColIdx >= 0 && row[assigneeColIdx]) {
          // Support multiple assignees separated by comma or pipe
          const parts = row[assigneeColIdx].split(/[|,]/).map((a: string) => a.trim()).filter(Boolean)
          assigneeIdentifiers.push(...parts)
        }
        if (assignedByColIdx >= 0 && row[assignedByColIdx]) {
          assigneeIdentifiers.push(row[assignedByColIdx].trim())
        }
      }

      // Resolve names → IDs via API
      const res = await fetch('/api/tasks/bulk-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve', projectNames, assigneeIdentifiers })
      })

      const responseText = await res.text()
      let responseData: any
      try {
        responseData = responseText ? JSON.parse(responseText) : null
      } catch {
        throw new Error(`Server returned invalid response (status ${res.status})`)
      }

      if (!res.ok || !responseData?.success) {
        throw new Error(responseData?.error || `Failed to resolve CSV data (status ${res.status})`)
      }

      const { projectMap, userMap } = responseData.data

      // Validate rows
      const result = validateRows(
        csvData.rows,
        csvData.headers,
        mapping,
        projectMap,
        userMap,
        projectId,
        projectName
      )

      // Check for duplicates against existing tasks in the database
      const tasksToCheck = result.rows
        .filter(r => r.isValid && r.resolved.title && r.resolved.project)
        .map(r => ({ title: r.resolved.title, projectId: r.resolved.project!, rowIndex: r.rowIndex }))

      if (tasksToCheck.length > 0) {
        try {
          const dupRes = await fetch('/api/tasks/bulk-csv', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'check-duplicates', tasks: tasksToCheck })
          })
          const dupData = await dupRes.json()
          if (dupRes.ok && dupData?.success && dupData.data?.duplicates) {
            const dups: Record<number, string> = dupData.data.duplicates
            for (const row of result.rows) {
              const existingId = dups[row.rowIndex]
              if (existingId) {
                row.errors.push(`Duplicate: task "${row.resolved.title}" already exists (${existingId})`)
                row.isValid = false
              }
            }
            // Recalculate counts after marking DB duplicates as invalid
            const newValidCount = result.rows.filter(r => r.isValid).length
            result.validRows = newValidCount
            result.invalidRows = result.totalRows - newValidCount
            result.duplicateRows = result.rows.filter(r => r.errors.some(e => e.includes('Duplicate'))).length
          }
        } catch {
          // Non-fatal: duplicate check failure shouldn't block the upload
        }
      }

      setValidation(result)
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed')
    } finally {
      setIsResolving(false)
    }
  }, [csvData, mapping, projectId, projectName])

  // ─── Step 3: Submit ───
  const handleSubmit = useCallback(async () => {
    if (!validation || validation.validRows === 0) return
    setIsSubmitting(true)
    setError(null)

    try {
      // Resolve user map from validation data
      const userMap: Record<string, { _id: string; firstName: string; lastName: string; email: string; hourlyRate?: number }> = {}
      for (const row of validation.rows) {
        if (row.resolved.assignees) {
          for (const u of row.resolved.assignees) {
            if (u.email) {
              userMap[u.email.toLowerCase()] = u
            }
          }
        } else if (row.resolved.assignee && row.resolved.assigneeEmail) {
          userMap[row.resolved.assigneeEmail.toLowerCase()] = {
            _id: row.resolved.assignee,
            firstName: row.resolved.assigneeName?.split(' ')[0] || '',
            lastName: row.resolved.assigneeName?.split(' ').slice(1).join(' ') || '',
            email: row.resolved.assigneeEmail,
          }
        }
      }

      const payload = toBulkCreatePayload(validation.rows, userMap)

      if (payload.length === 0) {
        throw new Error('No valid tasks to create')
      }

      const res = await fetch('/api/tasks/bulk-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', tasks: payload })
      })

      const responseText = await res.text()
      let data: any
      try {
        data = responseText ? JSON.parse(responseText) : null
      } catch {
        throw new Error(`Server returned invalid response (status ${res.status})`)
      }

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Failed to create tasks (status ${res.status})`)
      }

      const successMsg = `Successfully created ${data.data?.length || validation.validRows} tasks!`
      setSubmitResult({ success: true, message: successMsg })
      showToast({ type: 'success', title: 'Bulk Upload Complete', message: successMsg })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Submission failed'
      setSubmitResult({ success: false, message: errorMsg })
      showToast({ type: 'error', title: 'Bulk Upload Failed', message: errorMsg })
    } finally {
      setIsSubmitting(false)
    }
  }, [validation])

  const currentStepIndex = STEPS.indexOf(step)

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Bulk Task Upload
          </DialogTitle>
          <DialogDescription>
            Upload a CSV file to create multiple tasks at once.
            {projectName && <span className="font-medium"> Project: {projectName}</span>}
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 px-6 py-2">
          {STEPS.map((s, idx) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                idx < currentStepIndex
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : idx === currentStepIndex
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {idx < currentStepIndex ? (
                  <CheckCircle className="h-3 w-3" />
                ) : (
                  <span>{idx + 1}</span>
                )}
                {STEP_LABELS[s]}
              </div>
              {idx < STEPS.length - 1 && (
                <div className={`w-8 h-0.5 ${idx < currentStepIndex ? 'bg-green-400' : 'bg-muted'}`} />
              )}
            </div>
          ))}
        </div>

        <DialogBody>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* ═════ Step 1: Upload ═════ */}
          {step === 'upload' && (
            <div className="space-y-6">
              {/* Upload Zone */}
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-primary bg-primary/10'
                    : 'hover:border-primary/50 hover:bg-muted/30'
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium">
                  {isDragging ? 'Drop your CSV file here' : fileName ? fileName : 'Click or drag & drop a CSV file'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  CSV files up to 5MB
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>

              {/* Template Download */}
              <div className="flex items-center justify-between p-4 bg-muted/40 rounded-lg">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Download CSV Template</p>
                    <p className="text-xs text-muted-foreground">
                      Pre-formatted template with required columns
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                  <Download className="h-4 w-4 mr-1" />
                  Template
                </Button>
              </div>

              {/* Column Info */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Required Columns</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(SYSTEM_COLUMNS)
                    .filter(([, col]) => col.required)
                    .map(([key, col]) => (
                      <Badge key={key} variant="default" className="text-xs">
                        {col.label}
                      </Badge>
                    ))}
                </div>
                <p className="text-sm font-medium mt-3">Optional Columns</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(SYSTEM_COLUMNS)
                    .filter(([, col]) => !col.required)
                    .map(([key, col]) => (
                      <Badge key={key} variant="outline" className="text-xs">
                        {col.label}
                      </Badge>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* ═════ Step 2: Column Mapping ═════ */}
          {step === 'mapping' && csvData && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Map each task field to a column from your CSV. Required fields are marked with <span className="text-red-500 font-medium">*</span>.
              </p>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-1/3">Task Field</TableHead>
                      <TableHead className="w-1/3">Your CSV Column</TableHead>
                      <TableHead className="w-1/3">Sample Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedSystemColumns.map(([sysKey, sysCol]) => {
                      const rev = reverseMapping()
                      const assignedCsvHeader = rev[sysKey] || 'none'
                      const sampleIdx = assignedCsvHeader !== 'none'
                        ? csvData.headers.indexOf(assignedCsvHeader)
                        : -1

                      return (
                        <TableRow key={sysKey}>
                          <TableCell className="font-medium text-sm">
                            {sysCol.label}
                            {sysCol.required && (
                              <span className="text-red-500 ml-1 font-bold">*</span>
                            )}
                            {sysCol.required && (
                              <span className="text-[10px] text-red-500/80 ml-1.5 font-normal">Required</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={assignedCsvHeader}
                              onValueChange={(value) => handleSystemMappingChange(sysKey, value)}
                            >
                              <SelectTrigger className={`h-8 text-xs ${sysCol.required && assignedCsvHeader === 'none' ? 'border-red-400 dark:border-red-600' : ''}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">
                                  <span className="text-muted-foreground">— Select column —</span>
                                </SelectItem>
                                {csvData.headers.filter(h => h.trim().length > 0).map((header) => (
                                  <SelectItem key={header} value={header}>
                                    {header}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {sampleIdx >= 0 ? (csvData.rows[0]?.[sampleIdx] || '—') : '—'}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Missing required columns warning */}
              {!requiredColumnsMapped() && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Please map all required columns
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* ═════ Step 3: Validation & Preview ═════ */}
          {step === 'preview' && validation && !submitResult && (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-muted/40 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{validation.totalRows}</p>
                  <p className="text-xs text-muted-foreground">Total Rows</p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{validation.validRows}</p>
                  <p className="text-xs text-muted-foreground">Valid</p>
                </div>
                <div className={`rounded-lg p-3 text-center ${
                  validation.invalidRows > 0
                    ? 'bg-red-50 dark:bg-red-900/20'
                    : 'bg-muted/40'
                }`}>
                  <p className={`text-2xl font-bold ${
                    validation.invalidRows > 0 ? 'text-red-600 dark:text-red-400' : ''
                  }`}>{validation.invalidRows}</p>
                  <p className="text-xs text-muted-foreground">Invalid</p>
                </div>
                <div className={`rounded-lg p-3 text-center ${
                  validation.duplicateRows > 0
                    ? 'bg-orange-50 dark:bg-orange-900/20'
                    : 'bg-muted/40'
                }`}>
                  <p className={`text-2xl font-bold ${
                    validation.duplicateRows > 0 ? 'text-orange-600 dark:text-orange-400' : ''
                  }`}>{validation.duplicateRows}</p>
                  <p className="text-xs text-muted-foreground">Duplicates</p>
                </div>
              </div>

              {/* Download Buttons */}
              <div className="flex items-center gap-2">
                {validation.validRows > 0 && csvData && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const csv = exportRowsAsCSV(
                        validation.rows.filter(r => r.isValid),
                        csvData.headers,
                        mapping
                      )
                      const blob = new Blob([csv], { type: 'text/csv' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = 'valid-tasks.csv'
                      a.click()
                      URL.revokeObjectURL(url)
                    }}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download Valid ({validation.validRows})
                  </Button>
                )}
                {validation.invalidRows > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const lines = ['Row,Task Title,Error Reason']
                      for (const row of validation.rows.filter(r => !r.isValid)) {
                        const title = row.resolved.title || row.data.title || ''
                        const safeTitle = title.includes(',') || title.includes('"') ? `"${title.replace(/"/g, '""')}"` : title
                        const reason = row.errors.join('; ')
                        const safeReason = reason.includes(',') || reason.includes('"') ? `"${reason.replace(/"/g, '""')}"` : reason
                        lines.push(`${row.rowIndex},${safeTitle},${safeReason}`)
                      }
                      const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = 'invalid-reasons.csv'
                      a.click()
                      URL.revokeObjectURL(url)
                    }}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download Error Report ({validation.invalidRows})
                  </Button>
                )}
              </div>

              {/* Preview Table */}
              <div className="border rounded-lg overflow-auto max-h-[350px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 sticky top-0 bg-background">#</TableHead>
                      <TableHead className="sticky top-0 bg-background">Task Title</TableHead>
                      <TableHead className="sticky top-0 bg-background">Project</TableHead>
                      <TableHead className="sticky top-0 bg-background">Due Date</TableHead>
                      <TableHead className="sticky top-0 bg-background">Assignee(s)</TableHead>
                      <TableHead className="w-20 sticky top-0 bg-background">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validation.rows.map((row) => (
                      <TableRow
                        key={row.rowIndex}
                        className={!row.isValid ? (row.errors.some(e => e.includes('Duplicate')) ? 'bg-orange-50/50 dark:bg-orange-900/10' : 'bg-red-50/50 dark:bg-red-900/10') : row.warnings.length > 0 ? 'bg-yellow-50/50 dark:bg-yellow-900/10' : ''}
                      >
                        <TableCell className="text-xs text-muted-foreground">{row.rowIndex}</TableCell>
                        <TableCell className="text-sm font-medium max-w-[200px] truncate">
                          {row.resolved.title || <span className="text-red-500 italic">Missing</span>}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.resolved.projectName || <span className="text-red-500 italic">Not found</span>}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.resolved.dueDate
                            ? new Date(row.resolved.dueDate).toLocaleDateString()
                            : <span className="text-red-500 italic">Invalid</span>
                          }
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px]">
                          {row.resolved.assigneeName ? (
                            <span className="truncate block" title={row.resolved.assigneeName}>
                              {row.resolved.assigneeName}
                              {row.resolved.assigneeWarnings && row.resolved.assigneeWarnings.length > 0 && (
                                <span className="text-yellow-600 dark:text-yellow-400 text-[10px] ml-1" title={row.resolved.assigneeWarnings.join(', ')}>
                                  (+{row.resolved.assigneeWarnings.length} skipped)
                                </span>
                              )}
                            </span>
                          ) : row.resolved.assigneeEmail ? (
                            row.resolved.assigneeEmail
                          ) : (
                            <span className="text-red-500 italic">Not found</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.isValid ? (
                            row.warnings.length > 0 ? (
                              <Badge variant="outline" className="text-yellow-600 border-yellow-300 dark:text-yellow-400 dark:border-yellow-700 text-xs cursor-help" title={row.warnings.join('\n')}>
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Warning
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-green-600 border-green-300 dark:text-green-400 dark:border-green-700 text-xs">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Valid
                              </Badge>
                            )
                          ) : row.errors.some(e => e.includes('Duplicate')) ? (
                            <Badge variant="outline" className="text-orange-600 border-orange-300 dark:text-orange-400 dark:border-orange-700 text-xs cursor-help" title={row.errors.join('\n')}>
                              <Copy className="h-3 w-3 mr-1" />
                              Duplicate
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-red-600 border-red-300 dark:text-red-400 dark:border-red-700 text-xs cursor-help" title={row.errors.join('\n')}>
                              <XCircle className="h-3 w-3 mr-1" />
                              Error
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Duplicate Details */}
              {validation.duplicateRows > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-orange-600 dark:text-orange-400">
                    Duplicates ({validation.duplicateRows} rows) — will not be uploaded
                  </p>
                  <div className="max-h-[120px] overflow-auto space-y-1">
                    {validation.rows
                      .filter(r => r.errors.some(e => e.includes('Duplicate')))
                      .map(r => (
                        <div key={`dup-${r.rowIndex}`} className="text-xs bg-orange-50 dark:bg-orange-900/20 rounded p-2">
                          <span className="font-medium">Row {r.rowIndex}:</span>{' '}
                          {r.errors.filter(e => e.includes('Duplicate')).join('; ')}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Error Details */}
              {validation.invalidRows > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-red-600 dark:text-red-400">
                    Errors ({validation.invalidRows} rows)
                  </p>
                  <div className="max-h-[120px] overflow-auto space-y-1">
                    {validation.rows
                      .filter(r => !r.isValid)
                      .map(r => (
                        <div key={r.rowIndex} className="text-xs bg-red-50 dark:bg-red-900/20 rounded p-2">
                          <span className="font-medium">Row {r.rowIndex}:</span>{' '}
                          {r.errors.join('; ')}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Warning Details */}
              {validation.rows.some(r => r.warnings.length > 0) && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                    Warnings ({validation.rows.filter(r => r.warnings.length > 0).length} rows)
                  </p>
                  <div className="max-h-[120px] overflow-auto space-y-1">
                    {validation.rows
                      .filter(r => r.warnings.length > 0)
                      .map(r => (
                        <div key={`warn-${r.rowIndex}`} className="text-xs bg-yellow-50 dark:bg-yellow-900/20 rounded p-2">
                          <span className="font-medium">Row {r.rowIndex}:</span>{' '}
                          {r.warnings.join('; ')}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {validation.validRows === 0 && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>
                    No valid rows to submit. Please fix the errors and try again.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* ═════ Submit Result ═════ */}
          {submitResult && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              {submitResult.success ? (
                <>
                  <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                  </div>
                  <p className="text-lg font-medium text-green-600 dark:text-green-400">
                    {submitResult.message}
                  </p>
                </>
              ) : (
                <>
                  <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
                  </div>
                  <p className="text-lg font-medium text-red-600 dark:text-red-400">
                    Upload Failed
                  </p>
                  <p className="text-sm text-muted-foreground">{submitResult.message}</p>
                </>
              )}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          {!submitResult ? (
            <>
              {step === 'upload' && (
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
              )}

              {step === 'mapping' && (
                <>
                  <Button variant="outline" onClick={() => { setStep('upload'); setCsvData(null); setFileName(null) }}>
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Back
                  </Button>
                  <Button
                    onClick={handleValidate}
                    disabled={!requiredColumnsMapped() || isResolving}
                  >
                    {isResolving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        Validating...
                      </>
                    ) : (
                      <>
                        Validate & Preview
                        <ArrowRight className="h-4 w-4 ml-1" />
                      </>
                    )}
                  </Button>
                </>
              )}

              {step === 'preview' && (
                <>
                  <Button variant="outline" onClick={() => setStep('mapping')}>
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Back
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={!validation || validation.validRows === 0 || isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        Creating Tasks...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-1" />
                        Create {validation?.validRows || 0} Tasks
                      </>
                    )}
                  </Button>
                </>
              )}
            </>
          ) : (
            <Button onClick={() => {
              if (submitResult.success) {
                onComplete()
                handleClose()
              } else {
                setSubmitResult(null)
              }
            }}>
              {submitResult.success ? 'Done' : 'Try Again'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
