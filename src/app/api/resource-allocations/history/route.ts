import { Permission } from '@/lib/permissions/permission-definitions'
import { ok, pageParams, queryParam, withRaPermission } from '@/lib/resource-allocation/route-helpers'
import { loadHistory } from '@/lib/resource-allocation/sheet-service'

export const dynamic = 'force-dynamic'

export const GET = withRaPermission({ anyOf: [Permission.RESOURCE_ALLOCATION_VIEW_HISTORY] }, async (request, ctx) => {
  return ok(await loadHistory(ctx.organizationId, { q: queryParam(request, 'q'), ...pageParams(request) }))
})
