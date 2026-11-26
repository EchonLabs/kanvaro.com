/**
 * Typed client for /api/resource-allocations.
 *
 * Types come from the server modules with `import type`, so nothing server
 * side is bundled into the browser. Failures throw {@link ApiError} carrying
 * the module's error code, which the screens switch on (e.g. OVER_THRESHOLD,
 * STALE_REQUEST_UNACKNOWLEDGED).
 */
import type { ActiveProject, MemberAllocations } from '@/lib/resource-allocation/allocation-service'
import type { RequestDetail, RequestListItem } from '@/lib/resource-allocation/request-service'
import type { HistoryEntry, Sheet, SheetRow, SheetStatusFilter } from '@/lib/resource-allocation/sheet-service'
import type { Kpis, RoleSummary, WorkloadStatus } from '@/lib/resource-allocation/workload'

export type {
  ActiveProject,
  HistoryEntry,
  Kpis,
  MemberAllocations,
  RequestDetail,
  RequestListItem,
  RoleSummary,
  Sheet,
  SheetRow,
  SheetStatusFilter,
  WorkloadStatus
}

export const BASE = '/api/resource-allocations'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: any

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
  })
  let body: any = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  if (!response.ok) {
    const error = body?.error
    if (error && typeof error === 'object') {
      throw new ApiError(response.status, error.code ?? 'ERROR', error.message ?? 'Request failed.', error.details)
    }
    throw new ApiError(response.status, 'ERROR', typeof error === 'string' ? error : 'Request failed.')
  }
  return body?.data as T
}

const query = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export interface SheetParams {
  q?: string
  role?: string
  project?: string
  status?: SheetStatusFilter
  page?: number
  limit?: number
}

export const fetchSheet = (params: SheetParams = {}) =>
  request<Sheet>(`${BASE}${query(params as Record<string, string | number | undefined>)}`)

export const exportUrl = (params: SheetParams = {}) =>
  `${BASE}/export${query({ q: params.q, role: params.role, project: params.project, status: params.status })}`

export const fetchMember = (memberId: string) => request<MemberAllocations>(`${BASE}/members/${memberId}`)

export interface ChangeInput {
  memberId: string
  lines: { projectId: string; newPercent: number }[]
  reason: string
}

export type ChangeResult =
  | { mode: 'applied'; totalAfter: number; addedToProjects: string[] }
  | { mode: 'requested'; requestId: string }

export const submitChange = (input: ChangeInput) =>
  request<ChangeResult>(`${BASE}/changes`, { method: 'POST', body: JSON.stringify(input) })

export const fetchRequest = (requestId: string) => request<RequestDetail>(`${BASE}/requests/${requestId}`)

export const approveRequest = (requestId: string, acknowledgeStale: boolean) =>
  request<{ status: 'approved'; totalAfter: number }>(`${BASE}/requests/${requestId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ acknowledgeStale })
  })

export const rejectRequest = (requestId: string, note?: string) =>
  request<{ status: 'rejected' }>(`${BASE}/requests/${requestId}/reject`, {
    method: 'POST',
    body: JSON.stringify(note ? { note } : {})
  })

export const cancelRequest = (requestId: string) =>
  request<{ status: 'cancelled' }>(`${BASE}/requests/${requestId}/cancel`, { method: 'POST', body: '{}' })

export const fetchHistory = (params: { q?: string; page?: number; limit?: number } = {}) =>
  request<{ items: HistoryEntry[]; total: number }>(`${BASE}/history${query(params)}`)

export const fetchThreshold = () =>
  request<{ overAllocationThresholdPercent: number }>(`${BASE}/settings`)

export const saveThreshold = (overAllocationThresholdPercent: number) =>
  request<{ overAllocationThresholdPercent: number }>(`${BASE}/settings`, {
    method: 'PUT',
    body: JSON.stringify({ overAllocationThresholdPercent })
  })
