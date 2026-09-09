/**
 * `POST /api/standups/:id/complete` — RUN-19..22, §17.6.
 *
 * Assembles a real `CompletionContext` from the database (via
 * `assembleCompletionContext`, promoted to `completion-context.ts` once
 * Task 12's backfill route became a second caller) and hands it to
 * `runCompletionSaga` (Task 16). The saga itself takes fully-loaded data so
 * it stays testable without asserting on every possible loader query.
 *
 * Two things this route must get right that are easy to get quietly wrong —
 * see `completion-context.ts`'s own docblock for the full explanation:
 * `runId` reuse across a resume call, and `checkInput.blockers` /
 * `checkInput.sprintHealth` staying populated.
 */
import { NextResponse } from 'next/server'

import { Permission } from '@/lib/permissions/permission-definitions'

import { assembleCompletionContext } from '@/lib/standup/completion-context'
import { runCompletionSaga } from '@/lib/standup/completion-saga'
import { toErrorResponse } from '@/lib/standup/errors'
import {
  readJson,
  requireStandupVersion,
  withStandupIdPermission
} from '@/lib/standup/route-helpers'

export const dynamic = 'force-dynamic'

interface CompleteBody {
  notes?: string
}

export const POST = withStandupIdPermission(
  { permission: Permission.STANDUP_COMPLETE },
  async (request, { userId, organizationId, projectId, standupId, standup }) => {
    try {
      const expectedVersion = requireStandupVersion(request)
      const body = await readJson<CompleteBody>(request)

      const ctx = await assembleCompletionContext({
        standupId,
        standup,
        projectId: projectId ?? String((standup as any).project),
        organizationId,
        completedBy: userId,
        notes: body.notes,
        expectedVersion
      })

      const result = await runCompletionSaga(ctx)

      return NextResponse.json({ status: result.status, summaryId: result.summaryId, standupId })
    } catch (error) {
      const { status, body: errorBody } = toErrorResponse(error)
      return NextResponse.json(errorBody, { status })
    }
  }
)
