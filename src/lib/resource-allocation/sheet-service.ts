/**
 * Read models for the Resource Allocation page: the sheet, the history trail
 * and the CSV export.
 *
 * The sheet is built from three queries (resources, live allocations on active
 * projects, pending requests) and assembled in memory. KPIs and the by-role
 * summary always describe the whole organisation; filters only narrow the rows.
 */
import { isProjectTeamMember } from '@/lib/permissions/project-team-membership'
import { AllocationHistory } from '@/models/AllocationHistory'
import { CustomRole } from '@/models/CustomRole'
import { AllocationRequest } from '@/models/AllocationRequest'
import { Project } from '@/models/Project'
import { ResourceAllocation } from '@/models/ResourceAllocation'
import { User } from '@/models/User'

import { type ActiveProject, getActiveProjects, getThreshold } from './allocation-service'
import {
  type Kpis,
  type RoleSummary,
  type WorkloadStatus,
  RESOURCE_ROLES,
  classify,
  computeRemaining,
  roleLabel,
  summarize
} from './workload'

export interface SheetRow {
  memberId: string
  name: string
  email: string
  avatar?: string
  roleLabel: string
  cells: Record<string, { percent: number; onTeam: boolean }>
  total: number
  remaining: number
  status: WorkloadStatus
  pendingRequest?: { id: string; requestedBy: { _id: string; name: string } }
}

export type SheetStatusFilter = WorkloadStatus | 'pending'

export interface SheetQuery {
  q?: string
  role?: string
  project?: string
  status?: SheetStatusFilter
  page: number
  limit: number
}

export interface Sheet {
  projects: ActiveProject[]
  rows: SheetRow[]
  kpis: Kpis
  byRole: RoleSummary[]
  roles: string[]
  threshold: number
  pagination: { page: number; limit: number; total: number; totalPages: number }
  /**
   * Pending requests for people no longer on the sheet (deactivated, or now a
   * client/viewer). Without a row there is no pencil, so they are listed here
   * to stay decidable instead of silently blocking that person's next request.
   */
  orphanedRequests: { id: string; memberName: string; requestedBy: { _id: string; name: string } }[]
}

export interface HistoryEntry {
  id: string
  date: Date
  member: { _id: string; name: string; avatar?: string }
  changedBy: { _id: string; name: string; roleLabel: string; avatar?: string }
  approvedBy?: { _id: string; name: string }
  project: { _id: string; name: string }
  previousPercent: number
  newPercent: number
  reason: string
  /** The approver's note, on rejected entries. */
  note?: string
  status: 'updated' | 'approved' | 'rejected'
}

const fullName = (user: any) => (user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : 'Unknown')

export const STATUS_LABELS: Record<WorkloadStatus, string> = {
  over: 'Overallocated',
  full: 'Fully Allocated',
  partial: 'Partially Allocated',
  unallocated: 'Unallocated'
}

export async function loadSheet(organizationId: string, query: SheetQuery): Promise<Sheet> {
  const [projects, threshold] = await Promise.all([getActiveProjects(organizationId), getThreshold(organizationId)])
  const projectIds = projects.map((project) => project._id)

  const [users, allocations, teams, pending] = await Promise.all([
    User.find({ organization: organizationId, isActive: true, role: { $in: [...RESOURCE_ROLES] } })
      .select('firstName lastName email avatar role customRole')
      .populate('customRole', 'name')
      .lean() as Promise<any[]>,
    ResourceAllocation.find({ organization: organizationId, project: { $in: projectIds } })
      .select('member project percent')
      .lean() as Promise<any[]>,
    Project.find({ _id: { $in: projectIds } }).select('teamMembers').lean() as Promise<any[]>,
    AllocationRequest.find({ organization: organizationId, status: 'pending' })
      .select('member requestedBy')
      .populate('member', 'firstName lastName')
      .populate('requestedBy', 'firstName lastName')
      .lean() as Promise<any[]>
  ])

  const teamById = new Map(teams.map((project) => [String(project._id), project]))
  const cellsByMember = new Map<string, SheetRow['cells']>()
  for (const row of allocations) {
    const memberId = String(row.member)
    const projectId = String(row.project)
    const cells = cellsByMember.get(memberId) ?? {}
    cells[projectId] = { percent: row.percent, onTeam: isProjectTeamMember(teamById.get(projectId), memberId) }
    cellsByMember.set(memberId, cells)
  }
  const pendingByMember = new Map(
    pending.map((request) => [
      String(request.member?._id ?? request.member),
      {
        id: String(request._id),
        requestedBy: { _id: String(request.requestedBy?._id ?? request.requestedBy), name: fullName(request.requestedBy) }
      }
    ])
  )

  const allRows: SheetRow[] = users
    .map((user) => {
      const memberId = String(user._id)
      const cells = cellsByMember.get(memberId) ?? {}
      const total = Object.values(cells).reduce((sum, cell) => sum + cell.percent, 0)
      const pendingRequest = pendingByMember.get(memberId)
      return {
        memberId,
        name: fullName(user),
        email: user.email,
        ...(user.avatar ? { avatar: user.avatar } : {}),
        roleLabel: roleLabel(user),
        cells,
        total,
        remaining: computeRemaining(total),
        status: classify(total, threshold),
        ...(pendingRequest ? { pendingRequest } : {})
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const { kpis, byRole: heldRoles } = summarize(allRows, threshold)

  // Every active custom role gets a card, even before anyone is assigned to it,
  // so HR can see the roles they defined rather than only the ones in use.
  const customRoles = (await CustomRole.find({ organization: organizationId, isActive: { $ne: false } })
    .select('name')
    .lean()) as any[]
  const held = new Set(heldRoles.map((role) => role.roleLabel))
  const byRole = [
    ...heldRoles,
    ...customRoles
      .map((role) => String(role.name ?? '').trim())
      .filter((name) => name && !held.has(name))
      .map((name) => ({ roleLabel: name, resources: 0, allocated: 0, available: 0 }))
  ].sort((a, b) => a.roleLabel.localeCompare(b.roleLabel))
  const onSheet = new Set(allRows.map((row) => row.memberId))
  const orphanedRequests = pending
    .filter((request) => !onSheet.has(String(request.member?._id ?? request.member)))
    .map((request) => ({
      id: String(request._id),
      memberName: fullName(request.member),
      requestedBy: { _id: String(request.requestedBy?._id ?? request.requestedBy), name: fullName(request.requestedBy) }
    }))

  const q = query.q?.trim().toLowerCase()
  const rows = allRows.filter((row) => {
    if (q && !row.name.toLowerCase().includes(q) && !row.email.toLowerCase().includes(q)) return false
    if (query.role && row.roleLabel !== query.role) return false
    if (query.project && !row.cells[query.project]) return false
    if (query.status === 'pending' && !row.pendingRequest) return false
    if (query.status && query.status !== 'pending' && row.status !== query.status) return false
    return true
  })

  const start = (query.page - 1) * query.limit
  return {
    projects,
    rows: rows.slice(start, start + query.limit),
    kpis,
    byRole,
    roles: byRole.map((role) => role.roleLabel),
    threshold,
    pagination: {
      page: query.page,
      limit: query.limit,
      total: rows.length,
      totalPages: Math.max(1, Math.ceil(rows.length / query.limit))
    },
    orphanedRequests
  }
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The audit trail: applied changes merged with rejected requests, newest first.
 *
 * Applied history is paged in the database (the first `page × limit` rows are
 * enough to fill any page once merged); rejected requests are few and expanded
 * in memory, one entry per line.
 */
export async function loadHistory(
  organizationId: string,
  opts: { q?: string; page: number; limit: number }
): Promise<{ items: HistoryEntry[]; total: number }> {
  const q = opts.q?.trim()
  let matchUsers: string[] | undefined
  let matchProjects: string[] | undefined
  const pattern = q ? new RegExp(escapeRegex(q), 'i') : undefined
  if (q && pattern) {
    const [users, projects] = await Promise.all([
      User.find({ organization: organizationId, $or: [{ firstName: pattern }, { lastName: pattern }] })
        .select('_id firstName lastName')
        .lean() as Promise<any[]>,
      Project.find({ organization: organizationId, name: pattern }).select('_id').lean() as Promise<any[]>
    ])
    // Also match "First Last" typed as one phrase.
    const phraseUsers = q.includes(' ')
      ? ((await User.find({ organization: organizationId }).select('_id firstName lastName').lean()) as any[]).filter(
          (user) => pattern.test(fullName(user))
        )
      : []
    matchUsers = Array.from(new Set([...users, ...phraseUsers].map((user) => String(user._id))))
    matchProjects = projects.map((project) => String(project._id))
  }

  const historyFilter: Record<string, unknown> = { organization: organizationId }
  if (q) {
    historyFilter.$or = [
      { member: { $in: matchUsers } },
      { changedBy: { $in: matchUsers } },
      { project: { $in: matchProjects } },
      { reason: pattern }
    ]
  }

  const [historyRows, historyTotal, rejected] = await Promise.all([
    AllocationHistory.find(historyFilter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(opts.page * opts.limit)
      .populate('member', 'firstName lastName avatar')
      .populate({ path: 'changedBy', select: 'firstName lastName role customRole avatar', populate: { path: 'customRole', select: 'name' } })
      .populate('approvedBy', 'firstName lastName')
      .populate('project', 'name')
      .lean() as Promise<any[]>,
    AllocationHistory.countDocuments(historyFilter),
    AllocationRequest.find({ organization: organizationId, status: 'rejected' })
      .populate('member', 'firstName lastName avatar')
      .populate({ path: 'requestedBy', select: 'firstName lastName role customRole avatar', populate: { path: 'customRole', select: 'name' } })
      .populate('lines.project', 'name')
      .lean() as Promise<any[]>
  ])

  const person = (user: any) => ({
    _id: String(user?._id ?? user),
    name: fullName(user),
    ...(user?.avatar ? { avatar: user.avatar as string } : {})
  })
  const changer = (user: any) => ({ ...person(user), roleLabel: user?.role ? roleLabel(user) : '' })

  const applied: HistoryEntry[] = historyRows.map((row) => ({
    id: String(row._id),
    date: row.createdAt,
    member: person(row.member),
    changedBy: changer(row.changedBy),
    ...(row.approvedBy ? { approvedBy: person(row.approvedBy) } : {}),
    project: { _id: String(row.project?._id ?? row.project), name: row.project?.name ?? 'Deleted project' },
    previousPercent: row.previousPercent,
    newPercent: row.newPercent,
    reason: row.reason,
    status: row.kind === 'approved' ? 'approved' : 'updated'
  }))

  const userSet = new Set(matchUsers ?? [])
  const projectSet = new Set(matchProjects ?? [])
  const rejectedEntries: HistoryEntry[] = rejected.flatMap((request) =>
    request.lines
      .map((line: any, index: number) => ({
        id: `${request._id}:${index}`,
        date: request.decidedAt ?? request.updatedAt,
        member: person(request.member),
        changedBy: changer(request.requestedBy),
        project: { _id: String(line.project?._id ?? line.project), name: line.project?.name ?? 'Deleted project' },
        previousPercent: line.previousPercent,
        newPercent: line.newPercent,
        reason: request.reason,
        ...(request.decisionNote ? { note: request.decisionNote as string } : {}),
        status: 'rejected' as const
      }))
      .filter(
        (entry: HistoryEntry) =>
          !pattern ||
          userSet.has(entry.member._id) ||
          userSet.has(entry.changedBy._id) ||
          projectSet.has(entry.project._id) ||
          pattern.test(entry.reason)
      )
  )

  const merged = [...applied, ...rejectedEntries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.id.localeCompare(a.id)
  )
  const start = (opts.page - 1) * opts.limit
  return { items: merged.slice(start, start + opts.limit), total: historyTotal + rejectedEntries.length }
}

/**
 * One CSV cell. Text that a spreadsheet would evaluate as a formula (leading
 * `=`, `+`, `-`, `@`, tab or CR) is prefixed with `'` so names and project
 * titles typed by users can never run when HR opens the export.
 */
function csvCell(value: string | number): string {
  const raw = String(value)
  const text = typeof value === 'string' && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** The sheet's rows as RFC 4180 CSV (CRLF line endings). */
export function sheetToCsv(sheet: Pick<Sheet, 'projects' | 'rows'>): string {
  const header = ['Employee', 'Email', 'Role', ...sheet.projects.map((p) => p.name), 'Total %', 'Remaining %', 'Status']
  const lines = sheet.rows.map((row) => [
    row.name,
    row.email,
    row.roleLabel,
    ...sheet.projects.map((project) => row.cells[project._id]?.percent ?? 0),
    row.total,
    row.remaining,
    STATUS_LABELS[row.status]
  ])
  return [header, ...lines].map((cells) => cells.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
