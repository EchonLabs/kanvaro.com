/**
 * `POST /api/standups/:id/reopen` — RUN-4/5, §17.6.
 *
 * Gated on `standup:reopen` (SEC-1) via the shared stand-up-id wrapper. This
 * route owns three lookups `reopen-service.ts`'s `reopenStandup` deliberately
 * does not do itself:
 *
 * - **Is the caller an Org Admin?** RUN-5 waives the reopen window for Org
 *   Admin only. `PermissionService.getUserPermissions` (the same call the
 *   permissions API and the time-tracking approve route already use) reports
 *   `userRole`; `Role.ADMIN`/`Role.SUPER_ADMIN` is the "Org Admin" the
 *   `standup-role-matrix` test suite already treats as holding every stand-up
 *   capability.
 * - **Is the sprint Completed?** RUN-5's other half — nothing reopens once
 *   the sprint itself is Completed, even for an Org Admin. `reopenStandup`
 *   has no sprint lookup of its own (see its docblock), so this route loads
 *   the sprint and refuses here, before the service ever runs.
 * - **The project's configured reopen window.** `reopenWindowHours` on
 *   `ProjectStandupSettings` (§15.3, default 24h), the same
 *   `findOne({ project })` shape every other settings-dependent stand-up
 *   service uses.
 */
import { NextResponse } from 'next/server'

import { Permission, Role } from '@/lib/permissions/permission-definitions'
import { PermissionService } from '@/lib/permissions/permission-service'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Sprint } from '@/models/Sprint'

import { toErrorResponse, StandupError } from '@/lib/standup/errors'
import { reopenStandup } from '@/lib/standup/reopen-service'
import { standupStrings } from '@/lib/standup/strings'
import {
  ok,
  readJson,
  requireStandupVersion,
  withStandupIdPermission
} from '@/lib/standup/route-helpers'

export const dynamic = 'force-dynamic'

interface ReopenBody {
  reason: string
}

export const POST = withStandupIdPermission(
  { permission: Permission.STANDUP_REOPEN },
  async (request, { userId, organizationId, projectId, standupId, standup }) => {
    try {
      const expectedVersion = requireStandupVersion(request)
      const body = await readJson<ReopenBody>(request)

      const resolvedProjectId = projectId ?? String((standup as any).project)
      const sprintId = (standup as any).sprint

      const [userPermissions, sprint, settings] = await Promise.all([
        PermissionService.getUserPermissions(userId),
        Sprint.findById(sprintId).select('status').lean(),
        ProjectStandupSettings.findOne({ project: resolvedProjectId })
          .select('reopenWindowHours')
          .lean()
      ])

      // RUN-5: nothing reopens once the sprint itself is Completed — refused
      // here, before `reopenStandup` runs, since that function has no sprint
      // lookup of its own (see its docblock).
      if ((sprint as any)?.status === 'completed') {
        throw new StandupError('REOPEN_WINDOW_EXPIRED', standupStrings.lifecycle.reopenSprintCompleted())
      }

      const isOrgAdmin =
        userPermissions.userRole === Role.ADMIN || userPermissions.userRole === Role.SUPER_ADMIN

      const result = await reopenStandup({
        standupId,
        reopenedBy: userId,
        isOrgAdmin,
        reason: String(body.reason ?? ''),
        organizationId,
        projectId: resolvedProjectId,
        reopenWindowHours: (settings as any)?.reopenWindowHours ?? 24,
        expectedVersion
      })

      return ok(result)
    } catch (error) {
      const { status, body: errorBody } = toErrorResponse(error)
      return NextResponse.json(errorBody, { status })
    }
  }
)
