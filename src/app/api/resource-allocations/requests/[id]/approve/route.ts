import { Permission } from '@/lib/permissions/permission-definitions'
import { approveRequest } from '@/lib/resource-allocation/request-service'
import { ok, readJson, withRaPermission } from '@/lib/resource-allocation/route-helpers'

export const dynamic = 'force-dynamic'

export const POST = withRaPermission({ anyOf: [Permission.RESOURCE_ALLOCATION_APPROVE] }, async (request, ctx) => {
  const body = await readJson<{ acknowledgeStale: unknown }>(request)
  return ok(
    await approveRequest({ userId: ctx.userId, organizationId: ctx.organizationId }, ctx.params.id, {
      acknowledgeStale: body.acknowledgeStale
    })
  )
})
