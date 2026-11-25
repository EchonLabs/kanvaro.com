import { Permission } from '@/lib/permissions/permission-definitions'
import { ok, pageParams, queryParam, withRaPermission } from '@/lib/resource-allocation/route-helpers'
import { loadSheet, type SheetStatusFilter } from '@/lib/resource-allocation/sheet-service'

export const dynamic = 'force-dynamic'

const STATUSES: SheetStatusFilter[] = ['over', 'full', 'partial', 'unallocated', 'pending']

/** The allocation sheet: rows, project columns, KPIs and the by-role summary. */
export const GET = withRaPermission({ anyOf: [Permission.RESOURCE_ALLOCATION_VIEW] }, async (request, ctx) => {
  const status = queryParam(request, 'status') as SheetStatusFilter | undefined
  const sheet = await loadSheet(ctx.organizationId, {
    q: queryParam(request, 'q'),
    role: queryParam(request, 'role'),
    project: queryParam(request, 'project'),
    status: status && STATUSES.includes(status) ? status : undefined,
    ...pageParams(request)
  })
  return ok(sheet)
})
