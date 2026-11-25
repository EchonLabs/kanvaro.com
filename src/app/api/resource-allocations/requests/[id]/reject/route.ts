import { Permission } from '@/lib/permissions/permission-definitions'
import { rejectRequest } from '@/lib/resource-allocation/request-service'
import { ok, readJson, withRaPermission } from '@/lib/resource-allocation/route-helpers'

export const dynamic = 'force-dynamic'

export const POST = withRaPermission({ anyOf: [Permission.RESOURCE_ALLOCATION_APPROVE] }, async (request, ctx) => {
  const body = await readJson<{ note: unknown }>(request)
  return ok(await rejectRequest({ userId: ctx.userId, organizationId: ctx.organizationId }, ctx.params.id, body.note))
})
