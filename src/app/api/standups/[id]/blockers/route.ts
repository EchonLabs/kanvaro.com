/**
 * Raising a blocker (spec RUN-14..17, phase 10).
 *
 *   POST /api/standups/:id/blockers
 *
 * Gated on `standup:blocker_raise` — `raiseBlocker` does the actual work: it
 * validates the description, excludes the linked allocation from capacity
 * unless the caller explicitly kept it allocated (RUN-16), opens the linked
 * `open_blocker` carry-forward register row (RUN-17), and audits it (SEC-3).
 *
 * Deliberately carries no stand-up version guard. RUN-23's optimistic-
 * concurrency check exists for writes to the `Standup` document's own guarded
 * fields; raising a blocker creates a sibling `StandupBlocker` record and
 * never touches the stand-up itself. Task 6's override route and Phase 9's
 * carry-forward note/resolve routes skip the same header for the identical
 * reason.
 */
import { NextResponse } from 'next/server'

import { Permission } from '@/lib/permissions/permission-definitions'
import { raiseBlocker } from '@/lib/standup/blocker-service'
import { toErrorResponse } from '@/lib/standup/errors'
import { withStandupIdPermission } from '@/lib/standup/route-helpers'

export const dynamic = 'force-dynamic'

interface RaiseBlockerBody {
  taskId?: string
  linkedAllocationId?: string
  description: string
  blockerType: string
  severity: string
  allocatedDespiteBlocked?: boolean
  blockedNote?: string
}

export const POST = withStandupIdPermission(
  { permission: Permission.STANDUP_BLOCKER_RAISE },
  async (request, { userId, organizationId, projectId, standupId, standup }) => {
    try {
      const body = (await request.json()) as RaiseBlockerBody

      const blocker = await raiseBlocker({
        standupId,
        sprintId: String((standup as any).sprint),
        projectId: projectId ?? String((standup as any).project),
        organizationId,
        raisedBy: userId,
        taskId: body.taskId,
        linkedAllocationId: body.linkedAllocationId,
        description: body.description,
        blockerType: body.blockerType,
        severity: body.severity,
        allocatedDespiteBlocked: body.allocatedDespiteBlocked,
        blockedNote: body.blockedNote
      })

      return NextResponse.json(blocker, { status: 201 })
    } catch (error) {
      const { status, body: errorBody } = toErrorResponse(error)
      return NextResponse.json(errorBody, { status })
    }
  }
)
