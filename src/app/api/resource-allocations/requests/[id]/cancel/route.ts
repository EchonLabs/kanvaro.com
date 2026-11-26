import { Permission } from '@/lib/permissions/permission-definitions'
import { cancelRequest } from '@/lib/resource-allocation/request-service'
import { ok, withRaPermission } from '@/lib/resource-allocation/route-helpers'

export const dynamic = 'force-dynamic'

/** The requester withdraws their own pending request (the service checks ownership). */
export const POST = withRaPermission(
  { anyOf: [Permission.RESOURCE_ALLOCATION_REQUEST, Permission.RESOURCE_ALLOCATION_MANAGE] },
  async (_request, ctx) => {
    return ok(await cancelRequest({ userId: ctx.userId, organizationId: ctx.organizationId }, ctx.params.id))
  }
)
