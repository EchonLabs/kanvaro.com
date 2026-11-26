import { Permission } from '@/lib/permissions/permission-definitions'
import { getThreshold, setThreshold } from '@/lib/resource-allocation/allocation-service'
import { ok, readJson, withRaPermission } from '@/lib/resource-allocation/route-helpers'

export const dynamic = 'force-dynamic'

export const GET = withRaPermission({ anyOf: [Permission.RESOURCE_ALLOCATION_VIEW] }, async (_request, ctx) => {
  return ok({ overAllocationThresholdPercent: await getThreshold(ctx.organizationId) })
})

/** Admin/HR set the over-allocation threshold (50–200%). */
export const PUT = withRaPermission({ anyOf: [Permission.RESOURCE_ALLOCATION_MANAGE] }, async (request, ctx) => {
  const body = await readJson<{ overAllocationThresholdPercent: number }>(request)
  const value = await setThreshold(ctx.organizationId, body.overAllocationThresholdPercent as number)
  return ok({ overAllocationThresholdPercent: value })
})
