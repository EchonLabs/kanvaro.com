/**
 * Updating or resolving one blocker (spec RUN-14..18, §15.8.8).
 *
 *   PATCH /api/standups/:id/blockers/:blockerId
 *
 * Thin route, real work in `updateBlocker` (`blocker-service.ts`) — same
 * split as `blockers/route.ts`'s own POST. No stand-up version guard, for the
 * same reason that route's docblock gives: a blocker is a sibling record, not
 * a write to the `Standup` document itself.
 *
 * Gated on `standup:blocker_raise` — the permission table has no separate
 * resolve/update permission, and the spec's role matrix (§3.2, "Raise a
 * blocker": Org Admin/Project Admin/PM/Team Member all "Yes") is the same set
 * that should be able to resolve one, so reusing it is correct rather than a
 * shortcut.
 */
import { NextResponse } from 'next/server'

import { Permission } from '@/lib/permissions/permission-definitions'
import { updateBlocker } from '@/lib/standup/blocker-service'
import { toErrorResponse } from '@/lib/standup/errors'
import { ok, withStandupIdPermission } from '@/lib/standup/route-helpers'

export const dynamic = 'force-dynamic'

interface UpdateBlockerBody {
  owner?: string
  targetResolutionDate?: string
  severity?: string
  status?: 'open' | 'in_progress' | 'resolved' | 'wont_resolve'
  resolutionNote?: string
}

export const PATCH = withStandupIdPermission(
  { permission: Permission.STANDUP_BLOCKER_RAISE },
  async (request, { userId, organizationId, projectId, standupId, standup, params }) => {
    try {
      const body = (await request.json()) as UpdateBlockerBody
      const blocker = await updateBlocker({
        blockerId: params.blockerId,
        standupId,
        updatedBy: userId,
        organizationId,
        projectId: projectId ?? String((standup as any).project),
        owner: body.owner,
        targetResolutionDate: body.targetResolutionDate,
        severity: body.severity,
        status: body.status,
        resolutionNote: body.resolutionNote
      })
      return ok(blocker)
    } catch (error) {
      const { status, body: errorBody } = toErrorResponse(error)
      return NextResponse.json(errorBody, { status })
    }
  }
)
