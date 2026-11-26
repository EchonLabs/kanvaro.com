import { NextResponse } from 'next/server'

import { Permission } from '@/lib/permissions/permission-definitions'
import { queryParam, withRaPermission } from '@/lib/resource-allocation/route-helpers'
import { loadSheet, sheetToCsv, type SheetStatusFilter } from '@/lib/resource-allocation/sheet-service'

export const dynamic = 'force-dynamic'

const STATUSES: SheetStatusFilter[] = ['over', 'full', 'partial', 'unallocated', 'pending']

/** Every row of the sheet (honouring the current filters) as a CSV download. */
export const GET = withRaPermission({ anyOf: [Permission.RESOURCE_ALLOCATION_VIEW_HISTORY] }, async (request, ctx) => {
  const status = queryParam(request, 'status') as SheetStatusFilter | undefined
  const sheet = await loadSheet(ctx.organizationId, {
    q: queryParam(request, 'q'),
    role: queryParam(request, 'role'),
    project: queryParam(request, 'project'),
    status: status && STATUSES.includes(status) ? status : undefined,
    page: 1,
    limit: 100000
  })
  const date = new Date().toISOString().slice(0, 10)
  return new NextResponse(sheetToCsv(sheet), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="resource-allocation-${date}.csv"`
    }
  })
})
