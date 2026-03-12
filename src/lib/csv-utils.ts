/**
 * CSV Parsing utilities for the Bulk Task Upload feature.
 * Handles parsing CSV text, column detection, and data transformation.
 */

export interface CSVParseResult {
  headers: string[]
  rows: string[][]
}

export function parseCSV(text: string): CSVParseResult {
  const rows: string[][] = []
  let current = ''
  let inQuotes = false
  let row: string[] = []

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        current += '"'
        i++ // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        row.push(current.trim())
        current = ''
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        row.push(current.trim())
        current = ''
        if (row.some(cell => cell.length > 0)) {
          rows.push(row)
        }
        row = []
        if (ch === '\r') i++ // skip \n in \r\n
      } else {
        current += ch
      }
    }
  }

  // Handle last field/row
  row.push(current.trim())
  if (row.some(cell => cell.length > 0)) {
    rows.push(row)
  }

  if (rows.length === 0) {
    return { headers: [], rows: [] }
  }

  // Find the maximum number of non-empty columns
  const headers = rows[0]
  const maxColumns = Math.max(
    headers.length,
    ...rows.slice(1).map(r => r.length)
  )

  // Find the rightmost non-empty column across all rows
  let lastNonEmptyColumn = 0
  for (let i = 0; i < maxColumns; i++) {
    for (let j = 0; j < rows.length; j++) {
      if (rows[j][i] && rows[j][i].trim().length > 0) {
        lastNonEmptyColumn = i
      }
    }
  }

  // Trim all rows to remove trailing empty columns
  const trimmedHeaders = headers.slice(0, lastNonEmptyColumn + 1)
  const trimmedRows = rows.slice(1).map(r => r.slice(0, lastNonEmptyColumn + 1))

  // Replace any empty headers with a placeholder name
  const safeHeaders = trimmedHeaders.map((h, i) =>
    h.trim().length > 0 ? h : `Column_${i + 1}`
  )

  return {
    headers: safeHeaders,
    rows: trimmedRows
  }
}

/** Known system columns with their canonical names */
export const SYSTEM_COLUMNS = {
  title: { label: 'Task Title', required: true, aliases: ['task title', 'task name', 'title', 'name', 'task', 'summary', 'subject'] },
  project: { label: 'Project', required: true, aliases: ['project', 'project name'] },
  dueDate: { label: 'Due Date', required: true, aliases: ['due date', 'due', 'deadline', 'target date', 'end date', 'task due date'] },
  assignee: { label: 'Assignee', required: true, aliases: ['assignee', 'assigned to', 'assigned', 'owner', 'responsible', 'assignee email', 'assignee name'] },
  description: { label: 'Description', required: false, aliases: ['description', 'details', 'desc', 'body', 'content', 'notes', 'task description'] },
  status: { label: 'Status', required: false, aliases: ['status', 'task status', 'state', 'workflow status'] },
  priority: { label: 'Priority', required: false, aliases: ['priority', 'prio', 'urgency', 'importance'] },
  type: { label: 'Type', required: false, aliases: ['type', 'task type', 'category', 'kind', 'issue type'] },
  estimatedHours: { label: 'Estimated Hours', required: false, aliases: ['estimated hours', 'hours', 'estimate', 'est hours', 'time estimate', 'estimation'] },
  isBillable: { label: 'Billable', required: false, aliases: ['billable', 'is billable', 'billing'] },
  labels: { label: 'Labels', required: false, aliases: ['labels', 'tags', 'label', 'tag', 'categories'] },
  createdAt: { label: 'Task Created At', required: false, aliases: ['task created at', 'created at', 'created date', 'creation date', 'date created'] },
  assignedBy: { label: 'Assigned By', required: false, aliases: ['assigned by', 'assigner', 'reporter'] },
  attachments: { label: 'Attachment Files', required: false, aliases: ['attachment files', 'attachments', 'files', 'attachment', 'file', 'images'] },
  subtasks: { label: 'Sub Tasks', required: false, aliases: ['sub tasks', 'subtasks', 'sub-tasks', 'checklist', 'sub task', 'subtask'] },
  comments: { label: 'Comments', required: false, aliases: ['comments', 'comment', 'remarks', 'discussion'] },
} as const

export type SystemColumnKey = keyof typeof SYSTEM_COLUMNS

export interface ColumnMapping {
  [csvHeader: string]: SystemColumnKey | 'skip'
}

/**
 * Auto-detect column mapping by matching CSV headers to system columns.
 */
export function autoDetectMapping(csvHeaders: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  const usedSystemCols = new Set<string>()

  for (const header of csvHeaders) {
    const normalized = header.toLowerCase().trim()
    let matched = false

    for (const [key, col] of Object.entries(SYSTEM_COLUMNS)) {
      if (usedSystemCols.has(key)) continue
      if (col.aliases.some(alias => alias === normalized)) {
        mapping[header] = key as SystemColumnKey
        usedSystemCols.add(key)
        matched = true
        break
      }
    }

    if (!matched) {
      mapping[header] = 'skip'
    }
  }

  return mapping
}

export interface ValidatedRow {
  rowIndex: number
  data: Record<string, string>
  errors: string[]
  warnings: string[]
  isValid: boolean
  resolved: {
    title: string
    project?: string      // resolved project ID
    projectName?: string
    dueDate?: string
    assignee?: string      // resolved first user ID
    assigneeName?: string
    assigneeEmail?: string
    assignees?: Array<{ _id: string; firstName: string; lastName: string; email: string; hourlyRate?: number }>
    assigneeWarnings?: string[]
    description?: string
    status?: string
    priority?: string
    type?: string
    estimatedHours?: number
    isBillable?: boolean
    labels?: string[]
    createdAt?: string
    assignedBy?: string
    assignedByName?: string
    attachmentFiles?: Array<{ name: string; url: string }>
    subtaskItems?: Array<{ title: string }>
    commentItems?: Array<{ content: string }>
  }
}

export interface ValidationSummary {
  totalRows: number
  validRows: number
  invalidRows: number
  duplicateRows: number
  rows: ValidatedRow[]
}

/**
 * Parse a date string in common formats. Returns ISO string or null.
 */
function parseDate(value: string): string | null {
  if (!value) return null

  // Try ISO format first (YYYY-MM-DD)
  const isoMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (isoMatch) {
    const d = new Date(value)
    if (!isNaN(d.getTime())) return d.toISOString()
  }

  // MM/DD/YYYY or M/D/YYYY
  const usMatch = value.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (usMatch) {
    const d = new Date(`${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`)
    if (!isNaN(d.getTime())) return d.toISOString()
  }

  // DD/MM/YYYY - try this if month > 12 indicates day/month swap
  const euMatch = value.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (euMatch) {
    const day = parseInt(euMatch[1])
    const month = parseInt(euMatch[2])
    if (day > 12 && month <= 12) {
      const d = new Date(`${euMatch[3]}-${euMatch[2].padStart(2, '0')}-${euMatch[1].padStart(2, '0')}`)
      if (!isNaN(d.getTime())) return d.toISOString()
    }
  }

  // General fallback
  const d = new Date(value)
  if (!isNaN(d.getTime())) return d.toISOString()

  return null
}

function parseBool(value: string): boolean | null {
  const v = value.toLowerCase().trim()
  if (['true', 'yes', '1', 'y'].includes(v)) return true
  if (['false', 'no', '0', 'n'].includes(v)) return false
  return null
}

const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical']
const VALID_TYPES = ['bug', 'feature', 'improvement', 'task', 'subtask']
const VALID_STATUSES = ['backlog', 'todo', 'in_progress', 'review', 'testing', 'done', 'cancelled']

const STATUS_ALIASES: Record<string, string> = {
  'backlog': 'backlog',
  'to do': 'todo', 'to-do': 'todo', 'todo': 'todo', 'new': 'todo', 'open': 'todo',
  'in progress': 'in_progress', 'in-progress': 'in_progress', 'in_progress': 'in_progress',
  'inprogress': 'in_progress', 'wip': 'in_progress', 'doing': 'in_progress', 'active': 'in_progress',
  'review': 'review', 'in review': 'review', 'in-review': 'review', 'code review': 'review', 'peer review': 'review',
  'testing': 'testing', 'qa': 'testing', 'test': 'testing', 'in testing': 'testing', 'in-testing': 'testing',
  'done': 'done', 'complete': 'done', 'completed': 'done', 'closed': 'done', 'resolved': 'done', 'finished': 'done',
  'cancelled': 'cancelled', 'canceled': 'cancelled', 'dropped': 'cancelled', 'archived': 'cancelled',
}

function normalizeStatus(value: string): string | null {
  const normalized = value.toLowerCase().trim()
  return STATUS_ALIASES[normalized] || (VALID_STATUSES.includes(normalized) ? normalized : null)
}

export function detectBase64Image(value: string): { isBase64: boolean; type?: string; sizeKB: number } {
  if (!value) return { isBase64: false, sizeKB: 0 }

  // Match standalone base64 data URI
  const standaloneMatch = value.match(/^data:image\/(\w+);base64,(.+)$/)
  if (standaloneMatch) {
    const imageType = standaloneMatch[1]
    const base64Data = standaloneMatch[2]
    const sizeKB = Math.ceil((base64Data.length * 0.75) / 1024)
    return { isBase64: true, type: imageType, sizeKB }
  }

  // Match base64 images embedded in HTML (e.g. <img src="data:image/png;base64,...">)
  const htmlMatch = value.match(/src=["']data:image\/(\w+);base64,([^"']+)["']/)
  if (htmlMatch) {
    const imageType = htmlMatch[1]
    const base64Data = htmlMatch[2]
    const sizeKB = Math.ceil((base64Data.length * 0.75) / 1024)
    return { isBase64: true, type: imageType, sizeKB }
  }

  return { isBase64: false, sizeKB: 0 }
}


export function validateRows(
  rows: string[][],
  headers: string[],
  mapping: ColumnMapping,
  projectMap: Record<string, { _id: string; name: string }>,
  userMap: Record<string, { _id: string; firstName: string; lastName: string; email: string; hourlyRate?: number }>,
  defaultProjectId?: string,
  defaultProjectName?: string
): ValidationSummary {
  const validatedRows: ValidatedRow[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const data: Record<string, string> = {}
    const errors: string[] = []
    const warnings: string[] = []
    const resolved: ValidatedRow['resolved'] = { title: '' }

    // Build data record from mapping
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j]
      const sysCol = mapping[header]
      if (sysCol && sysCol !== 'skip') {
        data[sysCol] = row[j] || ''
      }
    }

    // Validate title (required)
    if (!data.title || data.title.trim().length === 0) {
      errors.push('Task title is required')
    } else if (data.title.length > 200) {
      errors.push('Task title must be 200 characters or less')
    } else {
      resolved.title = data.title.trim()
    }

    // Validate project (required)
    const projectValue = data.project?.trim()
    if (!projectValue && !defaultProjectId) {
      errors.push('Project is required')
    } else if (projectValue) {
      const projKey = projectValue.toLowerCase()
      const proj = projectMap[projKey]
      if (proj) {
        resolved.project = proj._id
        resolved.projectName = proj.name
      } else {
        errors.push(`Project "${projectValue}" not found`)
      }
    } else if (defaultProjectId) {
      resolved.project = defaultProjectId
      resolved.projectName = defaultProjectName
    }

    // Validate due date (required)
    const dueDateValue = data.dueDate?.trim()
    if (!dueDateValue) {
      errors.push('Due date is required')
    } else {
      const parsed = parseDate(dueDateValue)
      if (parsed) {
        resolved.dueDate = parsed
      } else {
        errors.push(`Invalid date format: "${dueDateValue}"`)
      }
    }

    // Validate assignee (required, supports multiple comma/pipe-separated values)
    const assigneeValue = data.assignee?.trim()
    if (!assigneeValue) {
      errors.push('Assignee is required')
    } else {
      const assigneeIdentifiers = assigneeValue.split(/[|,]/).map(a => a.trim()).filter(Boolean)
      const foundAssignees: Array<{ _id: string; firstName: string; lastName: string; email: string; hourlyRate?: number }> = []
      const notFound: string[] = []

      for (const identifier of assigneeIdentifiers) {
        const key = identifier.toLowerCase()
        const usr = userMap[key]
        if (usr) {
          if (!foundAssignees.some(a => a._id === usr._id)) {
            foundAssignees.push(usr)
          }
        } else {
          notFound.push(identifier)
        }
      }

      if (foundAssignees.length > 0) {
        resolved.assignee = foundAssignees[0]._id
        resolved.assigneeName = foundAssignees.map(u => `${u.firstName} ${u.lastName}`).join(', ')
        resolved.assigneeEmail = foundAssignees[0].email
        resolved.assignees = foundAssignees
        if (notFound.length > 0) {
          warnings.push(...notFound.map(n => `User "${n}" not found in system, skipped`))
          resolved.assigneeWarnings = notFound.map(n => `User "${n}" not found`)
        }
      } else {
        errors.push(`No matching users found for assignee: "${assigneeValue}"`)
      }
    }

    // Optional fields
    if (data.description) {
      resolved.description = data.description.trim()

      // Detect and validate base64 images
      const base64Info = detectBase64Image(resolved.description)
      if (base64Info.isBase64) {
        const MAX_BASE64_SIZE_KB = 5 * 1024 // 5MB
        if (base64Info.sizeKB > MAX_BASE64_SIZE_KB) {
          errors.push(
            `Base64 image in description is too large (${base64Info.sizeKB}KB > ${MAX_BASE64_SIZE_KB}KB max). ` +
            `Consider using the separate file upload feature for large images.`
          )
        }
      }
    }

    if (data.status) {
      const s = normalizeStatus(data.status)
      if (s) {
        resolved.status = s
      } else {
        errors.push(`Invalid status: "${data.status}". Must be: ${VALID_STATUSES.join(', ')}`)
      }
    }

    if (data.priority) {
      const p = data.priority.toLowerCase().trim()
      if (VALID_PRIORITIES.includes(p)) {
        resolved.priority = p
      } else {
        errors.push(`Invalid priority: "${data.priority}". Must be: ${VALID_PRIORITIES.join(', ')}`)
      }
    }

    if (data.type) {
      const t = data.type.toLowerCase().trim()
      if (VALID_TYPES.includes(t)) {
        resolved.type = t
      } else {
        errors.push(`Invalid type: "${data.type}". Must be: ${VALID_TYPES.join(', ')}`)
      }
    }

    if (data.estimatedHours) {
      const hrs = parseFloat(data.estimatedHours)
      if (isNaN(hrs) || hrs < 0) {
        errors.push(`Invalid estimated hours: "${data.estimatedHours}"`)
      } else {
        resolved.estimatedHours = hrs
      }
    }

    if (data.isBillable) {
      const b = parseBool(data.isBillable)
      if (b !== null) {
        resolved.isBillable = b
      } else {
        errors.push(`Invalid billable value: "${data.isBillable}". Use yes/no or true/false`)
      }
    }

    if (data.labels) {
      resolved.labels = data.labels.split(/[,;|]/).map(l => l.trim()).filter(Boolean)
    }

    // Optional: Task Created At
    if (data.createdAt) {
      const parsed = parseDate(data.createdAt)
      if (parsed) {
        resolved.createdAt = parsed
      } else {
        errors.push(`Invalid created-at date format: "${data.createdAt}"`)
      }
    }

    // Optional: Assigned By
    if (data.assignedBy) {
      const key = data.assignedBy.trim().toLowerCase()
      const usr = userMap[key]
      if (usr) {
        resolved.assignedBy = usr._id
        resolved.assignedByName = `${usr.firstName} ${usr.lastName}`
      } else {
        warnings.push(`Assigned-by user "${data.assignedBy}" not found, skipped`)
      }
    }

    // Optional: Attachment Files (pipe-separated URLs/paths)
    if (data.attachments) {
      const files = data.attachments.split(/[|]/).map(f => f.trim()).filter(Boolean)
      if (files.length > 0) {
        resolved.attachmentFiles = files.map(f => {
          const name = f.split('/').pop() || f
          return { name, url: f }
        })
      }
    }

    // Optional: Sub Tasks (pipe-separated titles)
    if (data.subtasks) {
      const items = data.subtasks.split(/[|]/).map(s => s.trim()).filter(Boolean)
      if (items.length > 0) {
        resolved.subtaskItems = items.map(title => ({ title }))
      }
    }

    // Optional: Comments (pipe-separated comment texts)
    if (data.comments) {
      const items = data.comments.split(/[|]/).map(c => c.trim()).filter(Boolean)
      if (items.length > 0) {
        resolved.commentItems = items.map(content => ({ content }))
      }
    }

    validatedRows.push({
      rowIndex: i + 1,
      data,
      errors,
      warnings,
      isValid: errors.length === 0,
      resolved
    })
  }

  // Detect intra-CSV duplicates: rows with same title + project → mark as invalid
  const seen = new Map<string, number>()
  for (const row of validatedRows) {
    if (!row.resolved.title || !row.resolved.project) continue
    const key = `${row.resolved.title.toLowerCase().trim()}::${row.resolved.project}`
    const firstRow = seen.get(key)
    if (firstRow !== undefined) {
      row.errors.push(`Duplicate of row ${firstRow} in CSV (same title & project)`)
      row.isValid = false
    } else {
      seen.set(key, row.rowIndex)
    }
  }

  const validCount = validatedRows.filter(r => r.isValid).length
  const duplicateCount = validatedRows.filter(r => r.errors.some(e => e.includes('Duplicate'))).length
  return {
    totalRows: validatedRows.length,
    validRows: validCount,
    invalidRows: validatedRows.length - validCount,
    duplicateRows: duplicateCount,
    rows: validatedRows
  }
}

/**
 * Convert validated rows to the bulk-create API payload format.
 */
export function toBulkCreatePayload(
  validRows: ValidatedRow[],
  userMap: Record<string, { _id: string; firstName: string; lastName: string; email: string; hourlyRate?: number }>
): Array<Record<string, unknown>> {
  return validRows
    .filter(r => r.isValid)
    .map(r => {
      const task: Record<string, unknown> = {
        title: r.resolved.title,
        project: r.resolved.project,
        dueDate: r.resolved.dueDate,
        status: r.resolved.status || 'backlog'
      }

      if (r.resolved.assignees && r.resolved.assignees.length > 0) {
        task.assignedTo = r.resolved.assignees.map(u => ({
          user: u._id,
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          hourlyRate: u.hourlyRate
        }))
      } else if (r.resolved.assignee) {
        const u = Object.values(userMap).find(u => u._id === r.resolved.assignee)
        if (u) {
          task.assignedTo = [{
            user: u._id,
            firstName: u.firstName,
            lastName: u.lastName,
            email: u.email,
            hourlyRate: u.hourlyRate
          }]
        }
      }

      if (r.resolved.description) task.description = r.resolved.description
      if (r.resolved.priority) task.priority = r.resolved.priority
      if (r.resolved.type) task.type = r.resolved.type
      if (r.resolved.estimatedHours !== undefined) task.estimatedHours = r.resolved.estimatedHours
      if (r.resolved.isBillable !== undefined) task.isBillable = r.resolved.isBillable
      if (r.resolved.labels && r.resolved.labels.length > 0) task.labels = r.resolved.labels
      if (r.resolved.createdAt) task.createdAt = r.resolved.createdAt
      if (r.resolved.assignedBy) task.assignedBy = r.resolved.assignedBy
      if (r.resolved.attachmentFiles && r.resolved.attachmentFiles.length > 0) task.attachments = r.resolved.attachmentFiles
      if (r.resolved.subtaskItems && r.resolved.subtaskItems.length > 0) task.subtasks = r.resolved.subtaskItems
      if (r.resolved.commentItems && r.resolved.commentItems.length > 0) task.comments = r.resolved.commentItems

      return task
    })
}
export function exportRowsAsCSV(
  rows: ValidatedRow[],
  headers: string[],
  mapping: ColumnMapping,
  includeErrorColumn = false
): string {
  function escapeCSV(value: string): string {
    if (!value) return ''
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`
    }
    return value
  }

  const outputHeaders = [...headers]
  if (includeErrorColumn) outputHeaders.push('Errors')

  const csvRows = [outputHeaders.map(escapeCSV).join(',')]

  for (const row of rows) {
    // Reconstruct the original row values from row.data using mapping
    const cells = headers.map(header => {
      const sysCol = mapping[header]
      if (sysCol && sysCol !== 'skip' && row.data[sysCol] !== undefined) {
        return escapeCSV(row.data[sysCol])
      }
      return ''
    })
    if (includeErrorColumn) {
      cells.push(escapeCSV(row.errors.join('; ')))
    }
    csvRows.push(cells.join(','))
  }

  return csvRows.join('\n')
}

export function generateCSVTemplate(): string {
  const headers = ['Task Title', 'Project', 'Due Date', 'Assignee', 'Description', 'Priority', 'Type', 'Estimated Hours', 'Billable', 'Labels', 'Task Created At', 'Assigned By', 'Attachment Files', 'Sub Tasks', 'Comments']
  const sampleRow = ['Design Login Page', 'My Project', '2026-03-10', '"john@company.com, jane@company.com"', 'Create the login page design', 'high', 'task', '8', 'yes', '"ui,design"', '2026-03-01', 'manager@company.com', '/uploads/mockup.png|/uploads/spec.pdf', 'Create wireframe|Review with team', 'Initial task created|Needs design review']
  return [headers.join(','), sampleRow.join(',')].join('\n')
}
