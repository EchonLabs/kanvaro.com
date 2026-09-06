/**
 * One stand-up and its pre-stand-up snapshot (spec SCH-9, SCH-10).
 *
 *   GET /api/standups/:id
 *   GET /api/standups/:id?refresh=1
 *
 * SCH-10 requires the snapshot to be rebuilt on demand and automatically once
 * it is more than thirty minutes old, so a PM who opened the screen before
 * breakfast does not run the meeting on breakfast's numbers.
 */
import { Permission } from '@/lib/permissions/permission-definitions'
import { ok, withStandupIdPermission } from '@/lib/standup/route-helpers'
import { buildStandupSnapshot, snapshotIsStale } from '@/lib/standup/snapshot'

export const dynamic = 'force-dynamic'

export const GET = withStandupIdPermission(
  { permission: Permission.STANDUP_VIEW },
  async (request, { standupId, standup }) => {
    const forced = new URL(request.url).searchParams.get('refresh') === '1'
    const stale = snapshotIsStale(standup.snapshotBuiltAt, new Date())

    const snapshot =
      forced || stale
        ? await buildStandupSnapshot(standupId, { persist: true })
        : standup.snapshot

    return ok({
      standup: {
        id: standupId,
        date: standup.standupDate,
        status: standup.status,
        shape: standup.shape,
        sprintDayNumber: standup.sprintDayNumber,
        totalSprintDays: standup.totalSprintDays,
        displayedDayNumber: standup.displayedDayNumber,
        scheduledStartAt: standup.scheduledStartAt,
        durationMinutes: standup.durationMinutes,
        facilitatorId: String(standup.facilitator),
        expectedAttendeeIds: (standup.expectedAttendees ?? []).map(String),
        attendance: standup.attendance ?? [],
        skippedReason: standup.skippedReason,
        cancelledReason: standup.cancelledReason,
        calendarAnomalies: standup.calendarAnomalies ?? [],
        // RUN-23: the client sends this back with every mutation.
        version: standup.version
      },
      snapshot,
      snapshotRebuilt: forced || stale
    })
  }
)
