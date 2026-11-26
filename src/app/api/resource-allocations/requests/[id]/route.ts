import { Permission } from '@/lib/permissions/permission-definitions'
import { ResourceAllocationError } from '@/lib/resource-allocation/errors'
import { getRequestDetail } from '@/lib/resource-allocation/request-service'
import { ok, withRaPermission } from '@/lib/resource-allocation/route-helpers'

export const dynamic = 'force-dynamic'

/** A request with live values. Only approvers and the requester may see it. */
export const GET = withRaPermission({ anyOf: [Permission.RESOURCE_ALLOCATION_VIEW_HISTORY] }, async (_request, ctx) => {
  const detail = await getRequestDetail(ctx.organizationId, ctx.params.id)
  const canApprove = ctx.permissions.has(Permission.RESOURCE_ALLOCATION_APPROVE)
  if (!canApprove && detail.requestedBy._id !== ctx.userId) {
    throw new ResourceAllocationError('NOT_FOUND', 'That request does not exist.')
  }
  return ok(detail)
})
