/**
 * Updating a blocker: owner/target-date assignment, severity change, and
 * status moves through to resolution (spec RUN-14..18, phase 10).
 *
 *   PATCH /api/blockers/:id
 *
 * Gated on `standup:blocker_raise` — the same power that raises a blocker
 * also updates and resolves it. `updateBlocker` does the actual work: it
 * requires a resolution note of at least 10 characters when closing
 * (`resolved` or `wont_resolve`), clears the linked allocation's blocked
 * flags and closes the linked `open_blocker` carry-forward register row on
 * close, and audits the mutation (SEC-3).
 *
 * Deliberately carries no stand-up version guard, for the same reason the
 * raise route above does not: this mutates a sibling `StandupBlocker` record
 * (and, through it, an `Allocation`), never the `Standup` document's own
 * optimistic-concurrency-guarded fields.
 */
import { NextResponse } from 'next/server'

import { Permission } from '@/lib/permissions/permission-definitions'
import { updateBlocker } from '@/lib/standup/blocker-service'
import { toErrorResponse } from '@/lib/standup/errors'
import { withBlockerPermission } from '@/lib/standup/route-helpers'

export const dynamic = 'force-dynamic'

interface UpdateBlockerBody {
  owner?: string
  targetResolutionDate?: string
  severity?: string
  status?: 'open' | 'in_progress' | 'resolved' | 'wont_resolve'
  resolutionNote?: string
}

export const PATCH = withBlockerPermission(
  { permission: Permission.STANDUP_BLOCKER_RAISE },
  async (request, { userId, organizationId, projectId, blockerId, blocker: loadedBlocker }) => {
    try {
      const body = (await request.json()) as UpdateBlockerBody

      const blocker = await updateBlocker({
        blockerId,
        // `withBlockerPermission` already loaded and org-scoped this blocker
        // by its own id (unlike `/api/standups/:id/blockers/:blockerId`,
        // which is keyed by a URL stand-up id and needed Critical 1's fix),
        // so its own `standup` field is the correct, already-verified scope
        // to thread through to `updateBlocker`'s new required field.
        standupId: String((loadedBlocker as any).standup),
        updatedBy: userId,
        organizationId,
        projectId: projectId ?? String((loadedBlocker as any).project),
        owner: body.owner,
        targetResolutionDate: body.targetResolutionDate,
        severity: body.severity,
        status: body.status,
        resolutionNote: body.resolutionNote
      })

      return NextResponse.json(blocker)
    } catch (error) {
      const { status, body: errorBody } = toErrorResponse(error)
      return NextResponse.json(errorBody, { status })
    }
  }
)
