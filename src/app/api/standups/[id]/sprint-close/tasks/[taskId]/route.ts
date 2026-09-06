/**
 * Sets a task's sprint-close disposition (spec §15.8.11, CC-8, CFW-9).
 * PATCH is gated on `standup:allocate` — only a PM may resolve an open task
 * before sprint close; a member may only view the readiness panel.
 */
import { Permission } from '@/lib/permissions/permission-definitions'
import { setTaskDisposition } from '@/lib/standup/sprint-close-service'
import { loadSprintCloseReadiness } from '@/lib/standup/sprint-close-service'
import { ok, readJson, withStandupIdPermission } from '@/lib/standup/route-helpers'
import type { SprintCloseDispositionType } from '@/models/Task'

export const dynamic = 'force-dynamic'

interface PatchBody {
  type: SprintCloseDispositionType
  note?: string
}

export const PATCH = withStandupIdPermission(
  { permission: Permission.STANDUP_ALLOCATE },
  async (request, { standupId, userId, params }) => {
    const body = await readJson<PatchBody>(request)

    await setTaskDisposition({
      standupId,
      taskId: params.taskId,
      type: body.type as SprintCloseDispositionType,
      note: body.note,
      actor: { userId }
    })

    return ok(await loadSprintCloseReadiness(standupId))
  }
)
