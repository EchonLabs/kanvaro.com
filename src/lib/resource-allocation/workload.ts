/**
 * Pure rules for resource allocation — no database, no framework.
 *
 * 100% is always one person's full capacity. The organisation threshold is the
 * line nobody may be pushed over; it can sit above 100 (to allow planned
 * overtime) or below it (to keep slack). Everything that totals, classifies or
 * validates allocations goes through here so the sheet, the editors and the
 * server checks can never disagree.
 */
import { formatToTitleCase } from '@/lib/utils'

import { ResourceAllocationError } from './errors'

export const ACTIVE_PROJECT_STATUSES = ['planning', 'active', 'on_hold'] as const

/** Roles whose members appear on the sheet. Clients, viewers and account managers do not. */
export const RESOURCE_ROLES = [
  'admin',
  'human_resource',
  'project_manager',
  'team_member',
  'qa_engineer',
  'tester'
] as const

export const DEFAULT_THRESHOLD = 100
export const THRESHOLD_MIN = 50
export const THRESHOLD_MAX = 200
export const REASON_MAX_LENGTH = 500

export type WorkloadStatus = 'over' | 'full' | 'partial' | 'unallocated'

export interface ChangeLine {
  projectId: string
  newPercent: number
}

export interface Kpis {
  totalResources: number
  fullyAllocated: number
  partiallyAllocated: number
  unallocated: number
  overallocated: number
  availableCapacity: number
}

export interface RoleSummary {
  roleLabel: string
  resources: number
  allocated: number
  available: number
}

const OBJECT_ID = /^[0-9a-f]{24}$/i

export function computeTotal(percents: number[]): number {
  return percents.reduce((sum, percent) => sum + percent, 0)
}

export function computeRemaining(total: number): number {
  return Math.max(0, 100 - total)
}

/** Precedence: over the threshold, then full, then partial, then nothing. */
export function classify(total: number, threshold: number): WorkloadStatus {
  if (total > threshold) return 'over'
  if (total >= 100) return 'full'
  if (total > 0) return 'partial'
  return 'unallocated'
}

/**
 * Whether a change must be refused for breaching the threshold.
 *
 * Only a change that *raises* the total above the line is refused. A member
 * who is already over (because the threshold was lowered later) can always be
 * brought down, even if one step does not get them all the way back under.
 */
export function exceedsThreshold(totalBefore: number, totalAfter: number, threshold: number): boolean {
  return totalAfter > threshold && totalAfter > totalBefore
}

/** The most one project can take given what the member holds elsewhere. */
export function maxAllowedFor(currentOtherTotal: number, threshold: number): number {
  return Math.min(100, Math.max(0, threshold - currentOtherTotal))
}

export function roleLabel(user: { role: string; customRole?: { name?: string } | null }): string {
  const custom = user.customRole?.name?.trim()
  return custom ? custom : formatToTitleCase(user.role)
}

function invalid(message: string, details?: unknown): never {
  throw new ResourceAllocationError('VALIDATION_FAILED', message, details)
}

/** Validates a change set's lines: whole numbers 0–100, real project ids, no duplicates. */
export function parseChangeLines(raw: unknown): ChangeLine[] {
  if (!Array.isArray(raw)) invalid('Allocation changes must be a list.')
  if (raw.length === 0) invalid('Choose at least one project to change.')

  const seen = new Set<string>()
  return raw.map((entry, index) => {
    const projectId = (entry as { projectId?: unknown })?.projectId
    const newPercent = (entry as { newPercent?: unknown })?.newPercent

    if (typeof projectId !== 'string' || !OBJECT_ID.test(projectId)) {
      invalid('That is not a project id.', { fields: [{ path: `lines.${index}.projectId` }] })
    }
    if (typeof newPercent !== 'number' || !Number.isInteger(newPercent) || newPercent < 0 || newPercent > 100) {
      invalid('Allocation must be a whole number between 0 and 100.', {
        fields: [{ path: `lines.${index}.newPercent` }]
      })
    }
    if (seen.has(projectId)) {
      invalid('Each project can appear only once in a change.', {
        fields: [{ path: `lines.${index}.projectId` }]
      })
    }
    seen.add(projectId)
    return { projectId, newPercent }
  })
}

export function parseReason(raw: unknown): string {
  if (typeof raw !== 'string') invalid('A reason for the change is required.')
  const reason = raw.trim()
  if (!reason) invalid('A reason for the change is required.')
  if (reason.length > REASON_MAX_LENGTH) {
    invalid(`The reason must be ${REASON_MAX_LENGTH} characters or fewer.`)
  }
  return reason
}

/** Applies lines to a project→percent map, returning a new map without 0% entries. */
export function applyLines(current: Map<string, number>, lines: ChangeLine[]): Map<string, number> {
  const next = new Map(current)
  for (const { projectId, newPercent } of lines) {
    if (newPercent === 0) next.delete(projectId)
    else next.set(projectId, newPercent)
  }
  return next
}

/** KPIs and per-role totals, over every resource passed in. */
export function summarize(
  rows: { total: number; roleLabel: string }[],
  threshold: number
): { kpis: Kpis; byRole: RoleSummary[] } {
  const kpis: Kpis = {
    totalResources: rows.length,
    fullyAllocated: 0,
    partiallyAllocated: 0,
    unallocated: 0,
    overallocated: 0,
    availableCapacity: 0
  }
  const roles = new Map<string, RoleSummary>()

  for (const { total, roleLabel: label } of rows) {
    if (total >= 100) kpis.fullyAllocated += 1
    else if (total > 0) kpis.partiallyAllocated += 1
    else kpis.unallocated += 1
    if (total > threshold) kpis.overallocated += 1
    const remaining = computeRemaining(total)
    kpis.availableCapacity += remaining

    const summary = roles.get(label) ?? { roleLabel: label, resources: 0, allocated: 0, available: 0 }
    summary.resources += 1
    summary.allocated += total
    summary.available += remaining
    roles.set(label, summary)
  }

  return {
    kpis,
    byRole: Array.from(roles.values()).sort((a, b) => a.roleLabel.localeCompare(b.roleLabel))
  }
}
