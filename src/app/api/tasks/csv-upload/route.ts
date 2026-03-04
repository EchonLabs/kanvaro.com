import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Project } from '@/models/Project'
import { User } from '@/models/User'
import { authenticateUser } from '@/lib/auth-utils'

const MAX_ROWS = 1000

const PRIORITY_MAP: Record<string, string> = {
  low: 'low', medium: 'medium', high: 'high', critical: 'critical',
}
const TYPE_MAP: Record<string, string> = {
  task: 'task', bug: 'bug', feature: 'feature', story: 'feature',
  improvement: 'improvement', subtask: 'subtask',
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

const MAX_DESC_LENGTH = 195000 // safely under the 200 000 model limit

/**
 * Only truncate — base64 images are preserved here and extracted into real
 * files by the bulk-create route when the task ID is known.
 */
function sanitizeDescription(raw: string): string {
  if (!raw) return ''
  if (raw.length > MAX_DESC_LENGTH) {
    return raw.slice(0, MAX_DESC_LENGTH) + '<!-- truncated during import -->'
  }
  return raw
}

/** Parse a date string in multiple formats. Returns a Date or null. */
function parseDate(raw: string): Date | null {
  if (!raw || !raw.trim()) return null
  const s = raw.trim()

  // dd/mm/yyyy
  const dmySlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmySlash) {
    const d = parseInt(dmySlash[1], 10)
    const m = parseInt(dmySlash[2], 10)
    const y = parseInt(dmySlash[3], 10)
    const dt = new Date(y, m - 1, d)
    if (!isNaN(dt.getTime()) && dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) return dt
  }

  // dd-mm-yyyy
  const dmyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dmyDash) {
    const d = parseInt(dmyDash[1], 10)
    const m = parseInt(dmyDash[2], 10)
    const y = parseInt(dmyDash[3], 10)
    const dt = new Date(y, m - 1, d)
    if (!isNaN(dt.getTime()) && dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) return dt
  }

  // yyyy-mm-dd (ISO)
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) {
    const y = parseInt(iso[1], 10)
    const m = parseInt(iso[2], 10)
    const d = parseInt(iso[3], 10)
    const dt = new Date(y, m - 1, d)
    if (!isNaN(dt.getTime()) && dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) return dt
  }

  // mm/dd/yyyy fallback
  const mdySlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdySlash) {
    const m = parseInt(mdySlash[1], 10)
    const d = parseInt(mdySlash[2], 10)
    const y = parseInt(mdySlash[3], 10)
    const dt = new Date(y, m - 1, d)
    if (!isNaN(dt.getTime())) return dt
  }

  // Try native Date parse as last resort
  const native = new Date(s)
  if (!isNaN(native.getTime())) return native
  return null
}

export interface MappedCsvRow {
  rowNumber: number
  title: string
  project: string          // project name (human readable)
  dueDate: string
  assigneeEmail: string
  description?: string
  priority?: string
  type?: string
  estimatedHours?: string
  billable?: string
  labels?: string
  image?: string           // base64 data URI for an image
}

export interface ValidatedRow {
  rowNumber: number
  title: string
  project: { _id: string; name: string }
  dueDate: string           // ISO string
  assignee: { _id: string; firstName: string; lastName: string; email: string }
  description: string
  priority: string
  type: string
  estimatedHours?: number
  billable?: boolean
  labels: string[]
  image?: string            // base64 data URI to embed
}

export interface InvalidRow {
  rowNumber: number
  data: Record<string, string>
  errors: string[]
}

export async function POST(request: NextRequest) {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const organizationId = authResult.user.organization

    let body: { rows: MappedCsvRow[] }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!Array.isArray(body?.rows)) {
      return NextResponse.json({ success: false, error: '`rows` must be an array' }, { status: 400 })
    }

    const rows = body.rows
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: 'No rows provided' }, { status: 400 })
    }

    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { success: false, error: `Maximum ${MAX_ROWS} rows allowed per upload` },
        { status: 400 }
      )
    }

    // ─── Pre-fetch lookups ─────────────────────────────────────────────────────

    // Collect unique project names
    const projectNames = new Set<string>()
    // Separate assignee values into emails vs full names
    // A cell may contain multiple comma-separated names: "Akila Peiris, Thashenu Kularathna"
    const assigneeEmailSet = new Set<string>()
    const assigneeNameSet = new Set<string>()

    const collectAssignee = (raw: string) => {
      // Split by comma but only for name lists — emails won't have commas
      // If the whole string is an email, treat as single email
      if (isEmail(raw)) {
        assigneeEmailSet.add(raw.toLowerCase())
        return
      }
      // Otherwise split by comma to get individual names
      const parts = raw.split(',').map(p => p.trim()).filter(Boolean)
      for (const part of parts) {
        if (isEmail(part)) assigneeEmailSet.add(part.toLowerCase())
        else assigneeNameSet.add(part)
      }
    }

    for (const row of rows) {
      if (row.project?.trim()) projectNames.add(row.project.trim().toLowerCase())
      const av = row.assigneeEmail?.trim() ?? ''
      if (av) collectAssignee(av)
    }

    // Fetch matching projects (case-insensitive by name, within org)
    const projectQuery: Record<string, any> = {
      name: { $in: Array.from(projectNames).map(n => new RegExp(`^${escapeRegex(n)}$`, 'i')) }
    }
    if (organizationId) projectQuery.organization = organizationId

    const projectDocs = await Project.find(projectQuery).select('_id name organization').lean()
    const projectMap = new Map<string, { _id: string; name: string }>()
    for (const p of projectDocs) {
      projectMap.set((p as any).name.toLowerCase(), {
        _id: (p as any)._id.toString(),
        name: (p as any).name,
      })
    }

    // Build unified userMap keyed by lowercase email OR lowercase full name
    const userMap = new Map<string, { _id: string; firstName: string; lastName: string; email: string }>()

    // 1. Lookup by email
    if (assigneeEmailSet.size > 0) {
      const emailQuery: Record<string, any> = {
        email: { $in: Array.from(assigneeEmailSet).map(e => new RegExp(`^${escapeRegex(e)}$`, 'i')) }
      }
      if (organizationId) emailQuery.organization = organizationId
      const emailDocs = await User.find(emailQuery).select('_id firstName lastName email').lean()
      for (const u of emailDocs) {
        userMap.set((u as any).email.toLowerCase(), {
          _id: (u as any)._id.toString(),
          firstName: (u as any).firstName,
          lastName: (u as any).lastName,
          email: (u as any).email,
        })
      }
    }

    // 2. Lookup by full name ("First Last")
    if (assigneeNameSet.size > 0) {
      const nameConditions: any[] = []
      for (const name of Array.from(assigneeNameSet)) {
        const parts = name.trim().split(/\s+/)
        const firstName = parts[0] ?? ''
        const lastName = parts.slice(1).join(' ')
        if (lastName) {
          nameConditions.push({
            firstName: new RegExp(`^${escapeRegex(firstName)}$`, 'i'),
            lastName: new RegExp(`^${escapeRegex(lastName)}$`, 'i'),
          })
        } else {
          nameConditions.push({
            $or: [
              { firstName: new RegExp(`^${escapeRegex(firstName)}$`, 'i') },
              { lastName: new RegExp(`^${escapeRegex(firstName)}$`, 'i') },
            ]
          })
        }
      }
      const nameQuery: Record<string, any> = { $or: nameConditions }
      if (organizationId) nameQuery.organization = organizationId
      const nameDocs = await User.find(nameQuery).select('_id firstName lastName email').lean()
      for (const u of nameDocs) {
        // Key by "firstname lastname" (lowercase) so row lookup works
        const fullNameKey = `${(u as any).firstName} ${(u as any).lastName}`.toLowerCase()
        userMap.set(fullNameKey, {
          _id: (u as any)._id.toString(),
          firstName: (u as any).firstName,
          lastName: (u as any).lastName,
          email: (u as any).email,
        })
        // Also key by email in case of duplicates
        if ((u as any).email) {
          userMap.set((u as any).email.toLowerCase(), {
            _id: (u as any)._id.toString(),
            firstName: (u as any).firstName,
            lastName: (u as any).lastName,
            email: (u as any).email,
          })
        }
      }
    }

    // ─── Validate each row ──────────────────────────────────────────────────────

    const validRows: ValidatedRow[] = []
    const invalidRows: InvalidRow[] = []

    for (const row of rows) {
      const errors: string[] = []

      // ── Title
      const titleRaw = row.title?.trim() ?? ''
      if (!titleRaw) errors.push('Task Title is required')

      // ── Project
      const projectNameRaw = row.project?.trim() ?? ''
      if (!projectNameRaw) {
        errors.push('Project is required')
      }
      const projectDoc = projectNameRaw ? projectMap.get(projectNameRaw.toLowerCase()) : undefined
      if (projectNameRaw && !projectDoc) {
        errors.push(`Project "${projectNameRaw}" not found in system`)
      }

      // ── Due Date
      const dueDateRaw = row.dueDate?.trim() ?? ''
      if (!dueDateRaw) {
        errors.push('Due Date is required')
      }
      let parsedDate: Date | null = null
      if (dueDateRaw) {
        parsedDate = parseDate(dueDateRaw)
        if (!parsedDate) errors.push(`Due Date "${dueDateRaw}" is not a valid date (expected dd/mm/yyyy)`)
      }

      // ── Assignee — accept email OR full name, handles comma-separated list (first valid wins)
      const assigneeRaw = row.assigneeEmail?.trim() ?? ''
      if (!assigneeRaw) {
        errors.push('Assignee is required')
      }
      let assigneeDoc: { _id: string; firstName: string; lastName: string; email: string } | undefined
      if (assigneeRaw) {
        // Try each comma-separated candidate in order
        const candidates = isEmail(assigneeRaw)
          ? [assigneeRaw]
          : assigneeRaw.split(',').map(p => p.trim()).filter(Boolean)
        for (const candidate of candidates) {
          const key = candidate.toLowerCase()
          const found = userMap.get(key)
          if (found) { assigneeDoc = found; break }
        }
        if (!assigneeDoc) {
          const displayNames = candidates.join(', ')
          errors.push(`Assignee "${displayNames}" not found in system (check name matches exactly or use email)`)
        }
      }

      // ── Priority (optional)
      let priority = 'medium'
      if (row.priority?.trim()) {
        const p = row.priority.trim().toLowerCase()
        if (PRIORITY_MAP[p]) {
          priority = PRIORITY_MAP[p]
        } else {
          errors.push(`Priority "${row.priority}" is invalid. Must be Low, Medium, High, or Critical`)
        }
      }

      // ── Type (optional)
      let type = 'task'
      if (row.type?.trim()) {
        const t = row.type.trim().toLowerCase()
        if (TYPE_MAP[t]) {
          type = TYPE_MAP[t]
        } else {
          errors.push(`Type "${row.type}" is invalid. Must be Task, Bug, Feature, Improvement, or Subtask`)
        }
      }

      // ── Estimated Hours (optional)
      let estimatedHours: number | undefined
      if (row.estimatedHours?.trim()) {
        const h = Number(row.estimatedHours.trim())
        if (isNaN(h) || h < 0) {
          errors.push(`Estimated Hours "${row.estimatedHours}" must be a positive number`)
        } else {
          estimatedHours = h
        }
      }

      // ── Billable (optional)
      let billable: boolean | undefined
      if (row.billable?.trim()) {
        const b = row.billable.trim().toLowerCase()
        if (['true', 'yes', '1'].includes(b)) billable = true
        else if (['false', 'no', '0'].includes(b)) billable = false
        else errors.push(`Billable "${row.billable}" must be true/false or yes/no`)
      }

      // ── Labels (optional)
      const labels = row.labels
        ? row.labels.split(',').map(l => l.trim()).filter(Boolean)
        : []

      // ── Image (optional) — accept data:image/…;base64,… URI
      const imageRaw = row.image?.trim() ?? ''
      let imageUri: string | undefined
      if (imageRaw) {
        if (/^data:image\/[^;]+;base64,[A-Za-z0-9+/=\s]+$/.test(imageRaw)) {
          imageUri = imageRaw
        } else {
          errors.push('Image must be a valid data:image/…;base64,… URI')
        }
      }

      if (errors.length > 0) {
        invalidRows.push({
          rowNumber: row.rowNumber,
          data: row as unknown as Record<string, string>,
          errors,
        })
      } else {
        const validated: ValidatedRow = {
          rowNumber: row.rowNumber,
          title: titleRaw,
          project: projectDoc!,
          dueDate: parsedDate!.toISOString(),
          assignee: assigneeDoc!,
          description: sanitizeDescription(row.description?.trim() ?? ''),
          priority,
          type,
          estimatedHours,
          billable,
          labels,
        }
        if (imageUri) validated.image = imageUri
        validRows.push(validated)
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        validRows,
        invalidRows,
        summary: {
          total: rows.length,
          valid: validRows.length,
          invalid: invalidRows.length,
        },
      },
    })
  } catch (error) {
    console.error('CSV upload validation error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Validation failed' },
      { status: 500 }
    )
  }
}
