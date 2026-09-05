/**
 * The estimate-debt ledger drawer and the write-off (spec VAR-5, VAR-8, NFR-13).
 *
 *   GET  /api/standups/:id/debt?memberId=…  — one member's ledger, or the team total
 *   POST /api/standups/:id/debt             — write debt off
 *
 * **NFR-13 is enforced here, on the payload, not in the component.** A
 * Stakeholder holds `standup:view_analytics` and deliberately not
 * `standup:view_debt`, so they receive the team aggregate with no member rows
 * and no member ids at all. A team member holding only
 * `standup:view_own_debt` may read their own ledger and is refused anybody
 * else's — the refusal has to live at retrieval, because a UI that merely
 * hides the number still sent it.
 */
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'
import { computeDebtPosition } from '@/lib/standup/debt'
import { loadLedger, writeOffDebt } from '@/lib/standup/debt-service'
import { StandupError } from '@/lib/standup/errors'
import { minutes } from '@/lib/standup/minutes'
import {
  ok,
  readJson,
  requireStandupVersion,
  withStandupIdPermission
} from '@/lib/standup/route-helpers'
import { EstimateDebtLedger } from '@/models/EstimateDebtLedger'

export const dynamic = 'force-dynamic'

export const GET = withStandupIdPermission(
  { permission: Permission.STANDUP_VIEW },
  async (request, { standupId, standup, userId, projectId }) => {
    const sprintId = String((standup as any).sprint)
    const requested = new URL(request.url).searchParams.get('memberId')

    const [canViewAnyone, canViewOwn] = await Promise.all([
      PermissionService.hasPermission(userId, Permission.STANDUP_VIEW_DEBT, projectId),
      PermissionService.hasPermission(userId, Permission.STANDUP_VIEW_OWN_DEBT, projectId)
    ])

    // NFR-13. No individual debt, and no member ids to correlate it with.
    if (!canViewAnyone && !canViewOwn) {
      return ok({ standupId, sprintId, team: await teamAggregate(sprintId) })
    }

    const memberId = requested ?? userId
    if (!canViewAnyone && memberId !== userId) {
      throw new StandupError(
        'OVERRIDE_NOT_PERMITTED',
        "You can only see your own estimate debt.",
        { memberId }
      )
    }

    const ledger = await loadLedger({ sprintId, memberId })
    return ok({ standupId, sprintId, memberId, ...ledger })
  }
)

interface WriteOffBody {
  memberId: string
  minutes: number
  reason: string
}

export const POST = withStandupIdPermission(
  { permission: Permission.STANDUP_WRITE_OFF_DEBT },
  async (request, { standupId, standup, userId }) => {
    const body = await readJson<WriteOffBody>(request)
    // A write-off changes what the board shows, so it carries the version like
    // every other mutation (RUN-23) — and, like every other mutation, that
    // version is checked against the standup's current one, not just parsed.
    const expectedVersion = requireStandupVersion(request)
    const currentVersion = (standup as any).version ?? 0
    if (currentVersion !== expectedVersion) {
      throw new StandupError(
        'STALE_STANDUP',
        'Somebody else changed this stand-up while you were working.',
        { currentVersion, standupId, status: (standup as any).status }
      )
    }

    const position = await writeOffDebt({
      sprintId: String((standup as any).sprint),
      memberId: String(body.memberId),
      standupId,
      minutes: Number(body.minutes),
      reason: String(body.reason ?? ''),
      actor: { userId }
    })

    return ok({ standupId, memberId: body.memberId, position })
  }
)

/**
 * The team's total, with nobody named.
 *
 * VAR-10 and NFR-13 both point the same way: debt is a team signal at this
 * level of access, never a list of who owes what.
 */
async function teamAggregate(sprintId: string) {
  const entries = (await EstimateDebtLedger.find({ sprint: sprintId }).lean()) as any[]
  const position = computeDebtPosition(
    entries.map((entry) => ({ entryType: entry.entryType, minutes: minutes(entry.minutes) }))
  )
  return {
    outstandingMinutes: position.outstandingMinutes,
    surplusMinutes: position.surplusMinutes,
    accruedMinutes: position.accruedMinutes,
    creditedMinutes: position.creditedMinutes
  }
}
