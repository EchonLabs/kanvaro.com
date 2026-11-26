import { Permission } from '@/lib/permissions/permission-definitions'
import { listRequests } from '@/lib/resource-allocation/request-service'
import { ok, pageParams, queryParam, withRaPermission } from '@/lib/resource-allocation/route-helpers'

export const dynamic = 'force-dynamic'

const STATUSES = ['pending', 'approved', 'rejected', 'cancelled']

/** Approvers see every request; everyone else sees only the requests they made. */
export const GET = withRaPermission({ anyOf: [Permission.RESOURCE_ALLOCATION_VIEW_HISTORY] }, async (request, ctx) => {
  const status = queryParam(request, 'status')
  const canApprove = ctx.permissions.has(Permission.RESOURCE_ALLOCATION_APPROVE)
  return ok(
    await listRequests(ctx.organizationId, {
      status: status && STATUSES.includes(status) ? status : undefined,
      requestedBy: canApprove ? undefined : ctx.userId,
      ...pageParams(request)
    })
  )
})
