/**
 * Issuing an override (spec OVR-1..7, §14.2, §15.12, §17.6).
 *
 *   POST /api/standups/:id/overrides
 *
 * Gated on `standup:override` — a distinct power from running or completing a
 * stand-up (SEC-1). `issueOverride` does the actual work: it checks §14.2's
 * table for O6-O10 (non-overridable), validates the justification (OVR-5),
 * enforces the acknowledgement gate on `over_allocation` (OVR-6), persists the
 * record, and audits it (SEC-3).
 *
 * Deliberately carries no stand-up version guard. RUN-23's optimistic-
 * concurrency check exists for writes to the `Standup` document's own guarded
 * fields; an override creates a sibling `StandupOverride` record and never
 * touches the stand-up itself. Phase 9's carry-forward note and resolve routes
 * (`/api/carry-forward/:itemId/note`, `.../resolve`) skip the same header for
 * the identical reason.
 */
import { NextResponse } from 'next/server'

import { Permission } from '@/lib/permissions/permission-definitions'
import { issueOverride } from '@/lib/standup/override-service'
import { toErrorResponse } from '@/lib/standup/errors'
import { withStandupIdPermission } from '@/lib/standup/route-helpers'

export const dynamic = 'force-dynamic'

interface OverrideBody {
  type: string
  affectedMemberIds?: string[]
  affectedTaskIds?: string[]
  reasonCode: string
  justification: string
  gapMinutes?: number
  memberAcknowledged?: boolean
}

export const POST = withStandupIdPermission(
  { permission: Permission.STANDUP_OVERRIDE },
  async (request, { userId, organizationId, projectId, standupId, standup }) => {
    try {
      const body = (await request.json()) as OverrideBody

      const override = await issueOverride({
        standupId,
        sprintId: String((standup as any).sprint),
        projectId: projectId ?? String((standup as any).project),
        organizationId,
        type: body.type,
        affectedMemberIds: body.affectedMemberIds ?? [],
        affectedTaskIds: body.affectedTaskIds,
        reasonCode: body.reasonCode,
        justification: body.justification,
        gapMinutes: body.gapMinutes,
        memberAcknowledged: body.memberAcknowledged,
        issuedBy: userId,
        // N7's recipients are looked up and notified from the completion saga
        // (Task 12), not here — this route only issues the record.
        adminRecipientIds: []
      })

      return NextResponse.json(override, { status: 201 })
    } catch (error) {
      const { status, body: errorBody } = toErrorResponse(error)
      return NextResponse.json(errorBody, { status })
    }
  }
)
