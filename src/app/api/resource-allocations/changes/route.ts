import { Permission } from '@/lib/permissions/permission-definitions'
import { directChange } from '@/lib/resource-allocation/allocation-service'
import { createRequest } from '@/lib/resource-allocation/request-service'
import { ok, readJson, withRaPermission } from '@/lib/resource-allocation/route-helpers'

export const dynamic = 'force-dynamic'

interface ChangeBody {
  memberId: unknown
  lines: unknown
  reason: unknown
}

/**
 * Submits a change set for one member. Admin/HR (MANAGE) apply it directly;
 * anyone holding only REQUEST raises it for approval instead.
 */
export const POST = withRaPermission(
  { anyOf: [Permission.RESOURCE_ALLOCATION_MANAGE, Permission.RESOURCE_ALLOCATION_REQUEST] },
  async (request, ctx) => {
    const body = await readJson<ChangeBody>(request)
    const input = { memberId: body.memberId, lines: body.lines, reason: body.reason }
    const actor = { userId: ctx.userId, organizationId: ctx.organizationId }

    if (ctx.permissions.has(Permission.RESOURCE_ALLOCATION_MANAGE)) {
      return ok(await directChange(actor, input), { status: 201 })
    }
    const created = await createRequest(actor, input)
    return ok({ mode: 'requested', requestId: String(created._id) }, { status: 201 })
  }
)
