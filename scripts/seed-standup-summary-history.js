/**
 * Adds a second, fully completed sprint ("Sprint 0") of past stand-up history
 * so the redesigned Summary page has real volume and variety to browse and
 * test against — `seed-standup-full-demo.js`'s Sprint 1 only has 4 summarized
 * days; this adds 10 more, each a deliberately different scenario (a clean
 * day, an unplanned absence, an open blocker, a resolved blocker, carry-forward
 * aging through every band, an override, a descoped task, a sprint-close
 * wrap-up) so every tone/state the summary screen can render actually has a
 * real page behind it.
 *
 * Sits chronologically *before* Sprint 1 (2026-08-10 to 2026-08-21, Sprint 1
 * starts 2026-08-23) rather than after — it never touches or reorders Sprint 1
 * or the currently-active Sprint 2.
 *
 * `StandupSummary` is a denormalised snapshot the summary screen reads
 * directly (`summary-service.ts#getSummary` — one `findOne`, no joins), so
 * unlike `seed-standup-full-demo.js`'s Sprint 1 backfill (which derives
 * summaries from real Allocation/Variance/Blocker rows) this writes summary
 * content directly. No Task/TimeEntry/Allocation documents are created —
 * they would add engine-consistency work this page's render never checks.
 * A real `Standup` document per day still is required: the summary route's
 * permission gate (`withStandupIdPermission`) loads `Standup.findById` first
 * to resolve org/project scope before it ever reaches `getSummary`.
 *
 * Idempotent: skips any day whose `StandupSummary` already exists.
 *
 *   node scripts/seed-standup-summary-history.js          # create
 *   node scripts/seed-standup-summary-history.js --remove # remove only this script's Sprint 0 + its standups/summaries
 */
const { MongoClient, ObjectId } = require('mongodb')
const fs = require('fs')
const path = require('path')

const ORG_ID = new ObjectId('6a891b3fc7fac0179d60ece7')
const PROJECT_ID = new ObjectId('6a8af360917b98ed065e606e')

// Built rather than hand-counted: an ObjectId needs exactly 24 hex chars, and
// a fixed prefix plus a zero-padded suffix is easy to get one digit wrong by
// hand (an early version of this script did exactly that and collided every
// generated id down to one document).
const hexId = (suffix) => new ObjectId(`6ab0${suffix.padStart(20, '0')}`)
const SPRINT0_ID = hexId('1')

const PM = new ObjectId('6a8aeeaf917b98ed065e6009')
const QA = new ObjectId('6a8aee96917b98ed065e5ff4')
const ANESSA = new ObjectId('6a8aee7a917b98ed065e5fe2')

const MARKER = 'standup-summary-history-2026-09-13'

// 10 working weekdays, two full Mon-Fri weeks.
const DATES = [
  '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14',
  '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21'
]

const NAMES = { [PM.toString()]: 'PM RUTH', [QA.toString()]: 'QA Bashith', [ANESSA.toString()]: 'Anessa Doe' }
const nameFor = (id) => NAMES[id.toString()] ?? id.toString()

const present = (id, note) => ({ user: id, state: 'present', note })
const absent = (id, planned, note) => ({ user: id, state: planned ? 'absent_planned' : 'absent_unplanned', note })

/**
 * One entry per day. Deliberately hand-varied rather than generated from a
 * formula — a demo needs each day to look like a different real day, not ten
 * repeats of the same shape with different numbers.
 */
const DAYS = [
  {
    // Day 1 — a clean day-one kickoff. Nothing wrong; everything neutral.
    attendance: [present(PM, 'Kicked off the sprint goal.'), present(QA, 'Starting the CSV export spike.'), present(ANESSA, 'Picking up the audit log task.')],
    completedYesterday: [],
    varianceTable: [],
    debtMovements: [],
    memberCommitments: [
      { memberId: QA, allocations: [{ taskId: new ObjectId(), taskKey: '0.1', plannedMinutes: 240 }] },
      { memberId: ANESSA, allocations: [{ taskId: new ObjectId(), taskKey: '0.2', plannedMinutes: 360 }] }
    ],
    blockersRaised: [], blockersResolved: [], carryForwardState: [], overridesIssued: [], pmNotes: undefined
  },
  {
    // Day 2 — an unplanned absence, and a task lands over estimate.
    attendance: [present(PM, 'Reviewing yesterday.'), present(QA, 'Continuing the export work.'), absent(ANESSA, false, 'Called in sick this morning.')],
    completedYesterday: [],
    varianceTable: [{ allocationId: new ObjectId(), taskKey: '0.1', memberId: QA, outcome: 'over_estimate', dayVarianceMinutes: 90 }],
    debtMovements: [{ memberId: QA, outstandingDebtMinutes: 90, surplusMinutes: 0 }],
    memberCommitments: [{ memberId: QA, allocations: [{ taskId: new ObjectId(), taskKey: '0.1', plannedMinutes: 240 }] }],
    blockersRaised: [{ blockerId: new ObjectId().toString(), description: 'CSV export needs a sample file from finance to validate column mapping.', blockerType: 'dependency', severity: 'medium', status: 'open' }],
    blockersResolved: [], carryForwardState: [], overridesIssued: [], pmNotes: undefined
  },
  {
    // Day 3 — the blocker is still open and now stalls the task outright.
    attendance: [present(PM), present(QA, 'Still stuck on the finance sample file.'), present(ANESSA, 'Back today.')],
    completedYesterday: [],
    varianceTable: [{ allocationId: new ObjectId(), taskKey: '0.1', memberId: QA, outcome: 'blocked', dayVarianceMinutes: -180 }],
    debtMovements: [{ memberId: QA, outstandingDebtMinutes: 90, surplusMinutes: 0 }],
    memberCommitments: [{ memberId: ANESSA, allocations: [{ taskId: new ObjectId(), taskKey: '0.2', plannedMinutes: 300 }] }],
    blockersRaised: [{ blockerId: new ObjectId().toString(), description: 'CSV export needs a sample file from finance to validate column mapping.', blockerType: 'dependency', severity: 'medium', status: 'open' }],
    blockersResolved: [],
    carryForwardState: [{ itemId: new ObjectId().toString(), taskKey: '0.1', ageBand: 'normal', status: 'open' }],
    overridesIssued: [], pmNotes: undefined
  },
  {
    // Day 4 — finance sent the file; blocker resolved, work catches up under estimate.
    attendance: [present(PM), present(QA, 'Finance sent the file — unblocked.'), present(ANESSA)],
    completedYesterday: [{ taskId: new ObjectId(), taskKey: '0.2', title: 'Audit log for invoice edits — first pass' }],
    varianceTable: [{ allocationId: new ObjectId(), taskKey: '0.1', memberId: QA, outcome: 'delivered_under_estimate', dayVarianceMinutes: -30 }],
    debtMovements: [{ memberId: QA, outstandingDebtMinutes: 60, surplusMinutes: 30 }],
    memberCommitments: [{ memberId: QA, allocations: [{ taskId: new ObjectId(), taskKey: '0.1', plannedMinutes: 180 }] }],
    blockersRaised: [{ blockerId: new ObjectId().toString(), description: 'CSV export needs a sample file from finance to validate column mapping.', blockerType: 'dependency', severity: 'medium', status: 'resolved' }],
    blockersResolved: [{ blockerId: new ObjectId().toString(), resolutionNote: 'Finance provided a real export sample on 2026-08-13; column mapping confirmed.' }],
    carryForwardState: [{ itemId: new ObjectId().toString(), taskKey: '0.1', ageBand: 'normal', status: 'resolved' }],
    overridesIssued: [], pmNotes: undefined
  },
  {
    // Day 5 — end of week one. A separate item has now carried three days.
    attendance: [present(PM), present(QA), present(ANESSA, 'Audit log task is taking longer than planned.')],
    completedYesterday: [{ taskId: new ObjectId(), taskKey: '0.1', title: 'Export invoice as CSV' }],
    varianceTable: [{ allocationId: new ObjectId(), taskKey: '0.2', memberId: ANESSA, outcome: 'over_estimate', dayVarianceMinutes: 45 }],
    debtMovements: [{ memberId: ANESSA, outstandingDebtMinutes: 45, surplusMinutes: 0 }],
    memberCommitments: [{ memberId: ANESSA, allocations: [{ taskId: new ObjectId(), taskKey: '0.2', plannedMinutes: 300 }] }],
    blockersRaised: [], blockersResolved: [],
    carryForwardState: [{ itemId: new ObjectId().toString(), taskKey: '0.2', ageBand: 'note_required', status: 'open' }],
    overridesIssued: [],
    pmNotes: 'Good recovery after the finance blocker. Task 0.2 has now carried three days — worth checking in with Anessa Monday.'
  },
  {
    // Day 6 — start of week two. QA takes planned leave; an override covers the capacity gap.
    attendance: [present(PM), absent(QA, true, 'Pre-approved day off.'), present(ANESSA, 'Splitting 0.2 into two smaller tasks.')],
    completedYesterday: [],
    varianceTable: [],
    debtMovements: [{ memberId: ANESSA, outstandingDebtMinutes: 45, surplusMinutes: 0 }],
    memberCommitments: [{ memberId: ANESSA, allocations: [{ taskId: new ObjectId(), taskKey: '0.2a', plannedMinutes: 240 }] }],
    blockersRaised: [], blockersResolved: [],
    carryForwardState: [{ itemId: new ObjectId().toString(), taskKey: '0.2', ageBand: 'note_required', status: 'open' }],
    overridesIssued: [{ type: 'under_allocation', reasonCode: 'CAPACITY_GAP_FROM_ABSENCE', justification: 'QA is on pre-approved leave today; proceeding with reduced allocation, will rebalance tomorrow.' }],
    pmNotes: undefined
  },
  {
    // Day 7 — a new, more severe blocker; the old carry-forward item escalates.
    attendance: [present(PM), present(QA, 'Back from leave.'), present(ANESSA)],
    completedYesterday: [],
    varianceTable: [{ allocationId: new ObjectId(), taskKey: '0.2a', memberId: ANESSA, outcome: 'blocked', dayVarianceMinutes: -120 }],
    debtMovements: [{ memberId: ANESSA, outstandingDebtMinutes: 165, surplusMinutes: 0 }],
    memberCommitments: [{ memberId: QA, allocations: [{ taskId: new ObjectId(), taskKey: '0.3', plannedMinutes: 180 }] }],
    blockersRaised: [{ blockerId: new ObjectId().toString(), description: 'Audit log schema conflicts with a migration already in staging.', blockerType: 'technical', severity: 'critical', status: 'open' }],
    blockersResolved: [],
    carryForwardState: [{ itemId: new ObjectId().toString(), taskKey: '0.2', ageBand: 'escalated', status: 'open' }],
    overridesIssued: [], pmNotes: undefined
  },
  {
    // Day 8 — the critical blocker gets resolved; debt starts coming down.
    attendance: [present(PM), present(QA), present(ANESSA, 'Migration conflict resolved with DBA help.')],
    completedYesterday: [{ taskId: new ObjectId(), taskKey: '0.3', title: 'Fix rounding error in tax rules engine' }],
    varianceTable: [{ allocationId: new ObjectId(), taskKey: '0.2a', memberId: ANESSA, outcome: 'delivered_on_estimate', dayVarianceMinutes: 0 }],
    debtMovements: [{ memberId: ANESSA, outstandingDebtMinutes: 90, surplusMinutes: 75 }],
    memberCommitments: [{ memberId: ANESSA, allocations: [{ taskId: new ObjectId(), taskKey: '0.2a', plannedMinutes: 240 }] }],
    blockersRaised: [{ blockerId: new ObjectId().toString(), description: 'Audit log schema conflicts with a migration already in staging.', blockerType: 'technical', severity: 'critical', status: 'resolved' }],
    blockersResolved: [{ blockerId: new ObjectId().toString(), resolutionNote: 'DBA re-sequenced the migration; audit log schema applied cleanly on 2026-08-19.' }],
    carryForwardState: [{ itemId: new ObjectId().toString(), taskKey: '0.2', ageBand: 'escalated', status: 'open' }],
    overridesIssued: [], pmNotes: undefined
  },
  {
    // Day 9 — the oldest carry-forward item goes chronic; one partial day.
    attendance: [present(PM), { user: QA, state: 'partial_day', note: 'Half day — dentist appointment.' }, present(ANESSA)],
    completedYesterday: [],
    varianceTable: [{ allocationId: new ObjectId(), taskKey: '0.4', memberId: QA, outcome: 'descoped', dayVarianceMinutes: 0 }],
    debtMovements: [{ memberId: ANESSA, outstandingDebtMinutes: 90, surplusMinutes: 75 }],
    memberCommitments: [{ memberId: QA, allocations: [{ taskId: new ObjectId(), taskKey: '0.4', plannedMinutes: 120 }] }],
    blockersRaised: [], blockersResolved: [],
    carryForwardState: [{ itemId: new ObjectId().toString(), taskKey: '0.2', ageBand: 'chronic', status: 'open' }],
    overridesIssued: [],
    pmNotes: 'Task 0.2 has now carried eight days — recommend descoping it from this sprint at tomorrow’s close.'
  },
  {
    // Day 10 — final day. Sprint wrap-up: everything closed out, one item genuinely carries into Sprint 1.
    attendance: [present(PM, 'Sprint close.'), present(QA), present(ANESSA)],
    completedYesterday: [
      { taskId: new ObjectId(), taskKey: '0.2a', title: 'Audit log for invoice edits' },
      { taskId: new ObjectId(), taskKey: '0.4', title: 'Regression pass on PDF render pipeline' }
    ],
    varianceTable: [{ allocationId: new ObjectId(), taskKey: '0.2', memberId: ANESSA, outcome: 'delivered_under_estimate', dayVarianceMinutes: -60 }],
    debtMovements: [{ memberId: ANESSA, outstandingDebtMinutes: 0, surplusMinutes: 135 }, { memberId: QA, outstandingDebtMinutes: 0, surplusMinutes: 90 }],
    memberCommitments: [
      { memberId: QA, allocations: [{ taskId: new ObjectId(), taskKey: '0.3', plannedMinutes: 180 }] },
      { memberId: ANESSA, allocations: [{ taskId: new ObjectId(), taskKey: '0.2', plannedMinutes: 360 }] }
    ],
    blockersRaised: [], blockersResolved: [],
    carryForwardState: [{ itemId: new ObjectId().toString(), taskKey: '0.2', ageBand: 'chronic', status: 'carried' }],
    overridesIssued: [],
    pmNotes: 'Sprint 0 closed with 9 of 10 tasks delivered. Task 0.2 (audit log follow-up) carries into Sprint 1 — already flagged there on day one.'
  }
]

async function main() {
  const remove = process.argv.includes('--remove')
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'))
  const client = new MongoClient(config.database.uri)
  await client.connect()
  const db = client.db()

  if (remove) {
    const standups = await db.collection('standups').find({ sprint: SPRINT0_ID }).project({ _id: 1 }).toArray()
    const standupIds = standups.map((s) => s._id)
    await db.collection('standupsummaries').deleteMany({ standup: { $in: standupIds } })
    await db.collection('standups').deleteMany({ sprint: SPRINT0_ID })
    await db.collection('sprints').deleteOne({ _id: SPRINT0_ID, seedMarker: MARKER })
    await client.close()
    console.log('Removed Sprint 0 and its standups/summaries.')
    return
  }

  const existingSprint = await db.collection('sprints').findOne({ _id: SPRINT0_ID })
  if (!existingSprint) {
    await db.collection('sprints').insertOne({
      _id: SPRINT0_ID,
      name: 'Sprint 0',
      description: 'Invoicing module foundations: CSV export, audit log, tax rounding fix.',
      organization: ORG_ID,
      project: PROJECT_ID,
      createdBy: PM,
      status: 'completed',
      startDate: new Date('2026-08-10T00:00:00.000Z'),
      endDate: new Date('2026-08-21T00:00:00.000Z'),
      actualEndDate: new Date('2026-08-21T09:31:00.000Z'),
      goal: 'Lay the groundwork for invoicing exports and the audit trail.',
      velocity: 0,
      capacity: 240,
      teamMembers: [PM, QA, ANESSA],
      stories: [],
      tasks: [],
      archived: false,
      attachments: [],
      healthWarnings: [],
      seedMarker: MARKER,
      createdAt: new Date('2026-08-10T00:00:00.000Z'),
      updatedAt: new Date('2026-08-21T09:31:00.000Z')
    })
    console.log('Created Sprint 0 (completed, 2026-08-10 to 2026-08-21)')
  }

  let created = 0
  for (let i = 0; i < DATES.length; i += 1) {
    const date = DATES[i]
    const dayNumber = i + 1
    const day = DAYS[i]
    const standupId = hexId(`d${i}`)

    const existingSummary = await db.collection('standupsummaries').findOne({ standup: standupId })
    if (existingSummary) continue

    const completedAt = new Date(`${date}T09:31:00.000Z`)
    const shape = dayNumber === 1 ? 'day_one' : dayNumber === DATES.length ? 'final_day' : 'mid_sprint'

    await db.collection('standups').updateOne(
      { _id: standupId },
      {
        $set: {
          project: PROJECT_ID,
          sprint: SPRINT0_ID,
          organization: ORG_ID,
          standupDate: date,
          scheduledStartAt: new Date(`${date}T09:15:00.000Z`),
          durationMinutes: 15,
          sprintDayNumber: dayNumber,
          totalSprintDays: DATES.length,
          displayedDayNumber: dayNumber,
          shape,
          status: 'Completed',
          facilitator: PM,
          expectedAttendees: [PM, QA, ANESSA],
          attendance: day.attendance,
          calendarAnomalies: [],
          wasBackfilled: false,
          completedAt,
          startedAt: new Date(`${date}T09:16:00.000Z`),
          seedMarker: MARKER,
          createdAt: completedAt,
          updatedAt: completedAt
        }
      },
      { upsert: true }
    )

    await db.collection('standupsummaries').insertOne({
      standup: standupId,
      sprint: SPRINT0_ID,
      project: PROJECT_ID,
      organization: ORG_ID,
      generatedAt: completedAt,
      headerFacts: {
        standupDate: date,
        dayNumber,
        totalDays: DATES.length,
        facilitatorName: nameFor(PM),
        durationMinutes: 15
      },
      attendance: day.attendance.map((row) => ({ memberId: row.user, name: nameFor(row.user), status: row.state })),
      completedYesterday: day.completedYesterday,
      varianceTable: day.varianceTable,
      debtMovements: day.debtMovements,
      memberCommitments: day.memberCommitments.map((c) => ({ ...c, name: nameFor(c.memberId) })),
      blockersRaised: day.blockersRaised,
      blockersResolved: day.blockersResolved,
      carryForwardState: day.carryForwardState,
      overridesIssued: day.overridesIssued,
      pmNotes: day.pmNotes,
      seedMarker: MARKER,
      createdAt: completedAt,
      updatedAt: completedAt
    })

    console.log(`  Seeded Sprint 0 day ${dayNumber} (${date}) — standup ${standupId}`)
    created += 1
  }

  await client.close()
  console.log(`Done — ${created} new day(s) seeded onto Sprint 0 (${DATES.length - created} already existed).`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
