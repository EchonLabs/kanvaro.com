/**
 * `POST /api/standups/:id/start` — RUN-2/3, AC-5, §17.6.
 *
 * The counterpart to `reopen/route.ts`: thin route, real work in
 * `start-service.ts`. This is the route that was missing entirely before this
 * task — see `start-service.ts`'s docblock for why that mattered.
 */
import { NextResponse } from 'next/server'

import { Permission } from '@/lib/permissions/permission-definitions'
import { toErrorResponse } from '@/lib/standup/errors'
import { startStandup } from '@/lib/standup/start-service'
import {
  ok,
  requireStandupVersion,
  withStandupIdPermission
} from '@/lib/standup/route-helpers'

export const dynamic = 'force-dynamic'

export const POST = withStandupIdPermission(
  { permission: Permission.STANDUP_RUN },
  async (request, { userId, standupId }) => {
    try {
      const expectedVersion = requireStandupVersion(request)
      const result = await startStandup({
        standupId,
        startedBy: userId,
        expectedVersion
      })
      return ok(result)
    } catch (error) {
      const { status, body } = toErrorResponse(error)
      return NextResponse.json(body, { status })
    }
  }
)
