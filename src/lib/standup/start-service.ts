/**
 * Starting a stand-up (spec RUN-2/3, AC-5, §17.6).
 *
 * The single most fundamental action in the module — this is the "PM presses
 * Start" moment §6.4 describes — had no production caller at all before this
 * file existed. `assertStartable` (lifecycle.ts) already covers the timing
 * and single-in-progress rules; this service adds the one thing it deliberately
 * does not do (see that file): the AC-5 planning gate, which needs a sprint
 * and its checklist, not just the stand-up's own timing fields.
 */
import { Standup } from '@/models/Standup'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'

import { isoOfStoredDate } from './calendar-dates'
import { loadCalendarContext } from './calendar-service'
import { recordAudit } from './audit'
import { StandupError, staleStandup } from './errors'
import { assertStartable } from './lifecycle'
import { assertPlanningGate } from './planning-gate'
import { evaluateSprintChecklist, waiverFromSprint } from './planning-service'

const DEFAULT_READY_LEAD_MINUTES = 15

export interface StartStandupInput {
  standupId: string
  startedBy: string
  expectedVersion: number
  now?: Date
}

export interface StartStandupResult {
  standup: InstanceType<typeof Standup>
}

/** RUN-2/3, AC-5: transitions a `Ready` stand-up to `In_Progress`. */
export async function startStandup(input: StartStandupInput): Promise<StartStandupResult> {
  const standup = await Standup.findById(input.standupId)
  if (!standup) throw new StandupError('NOT_FOUND', 'Stand-up not found.')

  if (standup.version !== input.expectedVersion) {
    throw staleStandup(standup.version, { standupId: input.standupId, status: standup.status })
  }

  const now = input.now ?? new Date()

  // RUN-2 allows exactly one in-progress stand-up per sprint; E52 requires
  // the refusal to name the other one.
  const otherInProgress = await Standup.findOne({
    sprint: standup.sprint,
    status: 'In_Progress',
    _id: { $ne: standup._id }
  })
    .select('standupDate')
    .lean<{ standupDate: string } | null>()

  // C1: the lead window and timezone must reflect the project's real
  // settings, not placeholders — otherwise `assertStartable` refuses every
  // start attempt made before the exact scheduled instant, even though the
  // stand-up is already visibly `Ready` (promote-to-ready.ts flips it to
  // `Ready` at `scheduledStartAt - readyLeadMinutes`).
  const settings = await ProjectStandupSettings.findOne({ project: standup.project })
    .select('readyLeadMinutes')
    .lean<{ readyLeadMinutes?: number } | null>()
  const readyLeadMinutes = settings?.readyLeadMinutes ?? DEFAULT_READY_LEAD_MINUTES

  const calendarContext = await loadCalendarContext(
    String(standup.project),
    standup.standupDate,
    standup.standupDate
  )

  assertStartable({
    status: standup.status,
    scheduledStartAt: standup.scheduledStartAt,
    readyLeadMinutes,
    now,
    timezone: calendarContext.timezone,
    otherInProgressDate: otherInProgress?.standupDate
  })

  // AC-5: a stand-up may not start against a sprint that never completed
  // planning. The checklist is re-evaluated server side — a client's stale
  // view of "green" is not evidence.
  const { checklist, sprint } = await evaluateSprintChecklist(String(standup.sprint))

  assertPlanningGate({
    sprintState: sprint.status,
    sprintStartDate: isoOfStoredDate(sprint.startDate),
    today: standup.standupDate,
    blockers: checklist.blockers,
    waiver: waiverFromSprint(sprint),
    now
  })

  standup.status = 'In_Progress'
  standup.startedAt = now
  if (now.getTime() > standup.scheduledStartAt.getTime()) {
    standup.startedLateByMinutes = Math.round(
      (now.getTime() - standup.scheduledStartAt.getTime()) / 60_000
    )
  }
  standup.version += 1
  await standup.save()

  await recordAudit({
    actor: { type: 'user', userId: input.startedBy },
    organizationId: String(standup.organization),
    action: 'standup_started',
    entityType: 'standup',
    entityId: String(standup._id),
    projectId: String(standup.project),
    before: { status: 'Ready' },
    after: { status: 'In_Progress' }
  })

  return { standup }
}
