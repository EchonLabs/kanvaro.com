'use client'

import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'

/**
 * What the current user may do on the Resource Allocation screens.
 * The server enforces every one of these; this only decides what to show.
 */
export function useResourceAllocationAccess() {
  const { hasPermission, loading } = usePermissions()
  const canManage = hasPermission(Permission.RESOURCE_ALLOCATION_MANAGE)
  const canRequest = hasPermission(Permission.RESOURCE_ALLOCATION_REQUEST)

  return {
    loading,
    canView: hasPermission(Permission.RESOURCE_ALLOCATION_VIEW),
    canManage,
    canRequest,
    canApprove: hasPermission(Permission.RESOURCE_ALLOCATION_APPROVE),
    canViewHistory: hasPermission(Permission.RESOURCE_ALLOCATION_VIEW_HISTORY),
    /** Can open the editors at all. MANAGE applies directly; REQUEST-only shares to approvals. */
    canEdit: canManage || canRequest
  }
}
