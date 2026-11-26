import { Permission } from '@/lib/permissions/permission-definitions'
import { getMemberAllocations } from '@/lib/resource-allocation/allocation-service'
import { ok, withRaPermission } from '@/lib/resource-allocation/route-helpers'

export const dynamic = 'force-dynamic'

/** One member's allocation on every active project — feeds the Manage modal and member cards. */
export const GET = withRaPermission({ anyOf: [Permission.RESOURCE_ALLOCATION_VIEW] }, async (_request, ctx) => {
  return ok(await getMemberAllocations(ctx.organizationId, ctx.params.userId))
})
