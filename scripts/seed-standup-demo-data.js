/**
 * Seeds realistic-looking demo history into the Kanvaro project's Sprint 1
 * for supervisor demos of the stand-up module: a handful of Completed days
 * with attendance, notes, allocations and variance outcomes, plus a blocker,
 * an override, and carry-forward register items. Days 3, 5, 6 and 7 are left
 * as the real "Missed" status the scheduler already recorded — an honest mix
 * of a healthy history and a rough patch is more convincing than a perfect one.
 *
 * Idempotent: running it twice is a no-op the second time.
 *
 *   node scripts/seed-standup-demo-data.js          # create
 *   node scripts/seed-standup-demo-data.js --remove # tear down everything it created
 */
const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')
const { ObjectId } = mongoose.Types

const PROJECT_ID = new ObjectId('6a8af360917b98ed065e606e')
const SPRINT_ID = new ObjectId('6a8af448917b98ed065f0deb')
const ORG_ID = new ObjectId('6a891b3fc7fac0179d60ece7')

const PM = new ObjectId('6a8aeeaf917b98ed065e6009')
const QA = new ObjectId('6a8aee96917b98ed065e5ff4')
const ANESSA = new ObjectId('6a8aee7a917b98ed065e5fe2')

const DAY1 = new ObjectId('6a8c20fe4ae51abb26bd438a') // 2026-08-24 day_one
const DAY2 = new ObjectId('6a8c20fe4ae51abb26bd438b') // 2026-08-25 mid_sprint
const DAY4 = new ObjectId('6a8c20fe4ae51abb26bd438d') // 2026-08-31 mid_sprint
const DAY8 = new ObjectId('6a8c20fe4ae51abb26bd4391') // 2026-09-04 final_day

const T1 = new ObjectId('6a8af497917b98ed065f0ee1') // est 4h
const T2 = new ObjectId('6a8af4ad917b98ed065f0f93') // est 6h
const T3 = new ObjectId('6a8af4cd917b98ed065f1049') // est 3h
const T4 = new ObjectId('6a8af737917b98ed06643c0c') // est 5h

const MARKER = 'standup-demo-seed-2026-09-06'

function timeEntry({ user, task, date, startHour, minutes, description }) {
  const startTime = new Date(`${date}T${String(startHour).padStart(2, '0')}:00:00.000Z`)
  const endTime = new Date(startTime.getTime() + minutes * 60000)
  return {
    user, organization: ORG_ID, project: PROJECT_ID, task,
    description,
    startTime, endTime, duration: minutes,
    isBillable: true, status: 'completed', tags: [], isApproved: false, isReject: false,
    createdAt: startTime, updatedAt: endTime
  }
}

async function main() {
  const remove = process.argv.includes('--remove')
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'))
  await mongoose.connect(config.database.uri)
  const db = mongoose.connection.db

  if (remove) {
    const seededStandups = [DAY1, DAY2, DAY4, DAY8]
    await db.collection('timeentries').deleteMany({
      task: { $in: [T1, T2, T3, T4] },
      user: { $in: [QA, ANESSA] },
      startTime: { $gte: new Date('2026-08-24T00:00:00.000Z'), $lte: new Date('2026-09-04T23:59:59.000Z') }
    })
    await db.collection('allocations').deleteMany({ standup: { $in: seededStandups } })
    await db.collection('allocationvariances').deleteMany({ 'meta.marker': MARKER })
    const cfw = await db.collection('carryforwarditems').deleteMany({
      sprint: SPRINT_ID,
      type: { $in: ['owner_absent', 'unfinished_task', 'open_blocker'] }
    })
    await db.collection('standupblockers').deleteMany({ sprint: SPRINT_ID })
    await db.collection('standupoverrides').deleteMany({ sprint: SPRINT_ID })
    for (const id of [DAY1, DAY2, DAY4, DAY8]) {
      await db.collection('standups').updateOne(
        { _id: id },
        { $set: { status: 'Missed', attendance: [] }, $unset: { startedAt: '', completedAt: '', displayedDayNumber: '' } }
      )
    }
    await db.collection('tasks').updateMany({ _id: { $in: [T1, T4] } }, { $set: { status: 'todo' } })
    console.log(`Removed demo seed data (${cfw.deletedCount} carry-forward items).`)
    return mongoose.disconnect()
  }

  const already = await db.collection('standups').findOne({ _id: DAY1, status: 'Completed' })
  if (already) {
    console.log('Demo data already seeded; leaving it alone. Run with --remove first to reseed.')
    return mongoose.disconnect()
  }

  await db.collection('projectstandupsettings').updateOne(
    { project: PROJECT_ID },
    { $set: { enabled: true } }
  )
  console.log('Restored ProjectStandupSettings.enabled = true')

  // ---- Day 1: 2026-08-24, day_one — clean kickoff ----
  const day1Start = new Date('2026-08-24T09:16:00.000Z')
  const day1End = new Date('2026-08-24T09:31:00.000Z')
  await db.collection('standups').updateOne(
    { _id: DAY1 },
    {
      $set: {
        status: 'Completed',
        startedAt: day1Start,
        completedAt: day1End,
        displayedDayNumber: 1,
        attendance: [
          { user: PM, state: 'present', note: 'Kickoff — walked through the sprint goal and initial task breakdown.' },
          { user: QA, state: 'present', note: 'Starting Task 1 today.' },
          { user: ANESSA, state: 'present', note: 'Picking up Task 4 today.' }
        ]
      },
      $unset: { missedAt: '' }
    }
  )
  const alloc1 = await db.collection('allocations').insertOne({
    standup: DAY1, sprint: SPRINT_ID, project: PROJECT_ID, organization: ORG_ID,
    member: QA, task: T1, plannedMinutes: 240, source: 'pre_assigned',
    isBlocked: false, allocatedDespiteBlocked: false, excludedFromCapacity: false,
    pairedDeliberately: false, addedAfterCompletion: false,
    taskStatusAtAllocation: 'backlog', frozenAt: day1End,
    createdBy: PM, createdAt: day1Start, updatedAt: day1End
  })
  const alloc2 = await db.collection('allocations').insertOne({
    standup: DAY1, sprint: SPRINT_ID, project: PROJECT_ID, organization: ORG_ID,
    member: ANESSA, task: T4, plannedMinutes: 180, source: 'pre_assigned',
    isBlocked: false, allocatedDespiteBlocked: false, excludedFromCapacity: false,
    pairedDeliberately: false, addedAfterCompletion: false,
    taskStatusAtAllocation: 'todo', frozenAt: day1End,
    createdBy: PM, createdAt: day1Start, updatedAt: day1End
  })
  await db.collection('allocationvariances').insertMany([
    {
      allocation: alloc1.insertedId, standup: DAY1, computedAtStandup: DAY2, sprint: SPRINT_ID,
      member: QA, task: T1, project: PROJECT_ID, organization: ORG_ID,
      plannedMinutes: 240, loggedMinutesOnDay: 180, dayVarianceMinutes: -60,
      originalEstimateMinutes: 240, totalLoggedMinutesOnTask: 180, taskVarianceMinutes: -60,
      remainingBeforeMinutes: 240, remainingAfterMinutes: 60,
      taskStatusAtClose: 'backlog', outcome: 'open_under_consumed',
      overrunMinutes: 0, creditMinutes: 0, recomputedAfterCompletion: false, sharedContribution: false,
      computedAt: day1End, meta: { marker: MARKER }
    },
    {
      allocation: alloc2.insertedId, standup: DAY1, computedAtStandup: DAY2, sprint: SPRINT_ID,
      member: ANESSA, task: T4, project: PROJECT_ID, organization: ORG_ID,
      plannedMinutes: 180, loggedMinutesOnDay: 180, dayVarianceMinutes: 0,
      originalEstimateMinutes: 300, totalLoggedMinutesOnTask: 180, taskVarianceMinutes: -120,
      remainingBeforeMinutes: 300, remainingAfterMinutes: 120,
      taskStatusAtClose: 'todo', outcome: 'open_fully_consumed',
      overrunMinutes: 0, creditMinutes: 0, recomputedAfterCompletion: false, sharedContribution: false,
      computedAt: day1End, meta: { marker: MARKER }
    }
  ])
  console.log('Seeded Day 1 (2026-08-24) — Completed')

  // ---- Day 2: 2026-08-25, mid_sprint — Task 1 wraps up ----
  const day2Start = new Date('2026-08-25T09:16:00.000Z')
  const day2End = new Date('2026-08-25T09:31:00.000Z')
  await db.collection('standups').updateOne(
    { _id: DAY2 },
    {
      $set: {
        status: 'Completed',
        startedAt: day2Start,
        completedAt: day2End,
        displayedDayNumber: 2,
        attendance: [
          { user: PM, state: 'present' },
          { user: QA, state: 'present', note: 'Task 1 should wrap up today.' },
          { user: ANESSA, state: 'present', note: 'Helping onboard the QA process this week; will resume Task 4 next week.' }
        ]
      },
      $unset: { missedAt: '' }
    }
  )
  const alloc3 = await db.collection('allocations').insertOne({
    standup: DAY2, sprint: SPRINT_ID, project: PROJECT_ID, organization: ORG_ID,
    member: QA, task: T1, plannedMinutes: 60, source: 'carried_forward',
    carriedFromAllocation: alloc1.insertedId, carryChainRoot: alloc1.insertedId,
    isBlocked: false, allocatedDespiteBlocked: false, excludedFromCapacity: false,
    pairedDeliberately: false, addedAfterCompletion: false,
    taskStatusAtAllocation: 'backlog', frozenAt: day2End,
    createdBy: PM, createdAt: day2Start, updatedAt: day2End
  })
  const alloc4 = await db.collection('allocations').insertOne({
    standup: DAY2, sprint: SPRINT_ID, project: PROJECT_ID, organization: ORG_ID,
    member: ANESSA, task: T4, plannedMinutes: 120, source: 'carried_forward',
    carriedFromAllocation: alloc2.insertedId, carryChainRoot: alloc2.insertedId,
    isBlocked: false, allocatedDespiteBlocked: false, excludedFromCapacity: false,
    pairedDeliberately: false, addedAfterCompletion: false,
    taskStatusAtAllocation: 'todo', frozenAt: day2End,
    createdBy: PM, createdAt: day2Start, updatedAt: day2End
  })
  await db.collection('allocationvariances').insertMany([
    {
      allocation: alloc3.insertedId, standup: DAY2, computedAtStandup: DAY4, sprint: SPRINT_ID,
      member: QA, task: T1, project: PROJECT_ID, organization: ORG_ID,
      plannedMinutes: 60, loggedMinutesOnDay: 60, dayVarianceMinutes: 0,
      originalEstimateMinutes: 240, totalLoggedMinutesOnTask: 240, taskVarianceMinutes: 0,
      remainingBeforeMinutes: 60, remainingAfterMinutes: 0,
      taskStatusAtClose: 'done', outcome: 'delivered_on_estimate',
      overrunMinutes: 0, creditMinutes: 0, recomputedAfterCompletion: false, sharedContribution: false,
      computedAt: day2End, meta: { marker: MARKER }
    },
    {
      allocation: alloc4.insertedId, standup: DAY2, computedAtStandup: DAY4, sprint: SPRINT_ID,
      member: ANESSA, task: T4, project: PROJECT_ID, organization: ORG_ID,
      plannedMinutes: 120, loggedMinutesOnDay: 0, dayVarianceMinutes: -120,
      originalEstimateMinutes: 300, totalLoggedMinutesOnTask: 180, taskVarianceMinutes: -120,
      remainingBeforeMinutes: 120, remainingAfterMinutes: 120,
      taskStatusAtClose: 'todo', outcome: 'not_started',
      notStartedReason: 'Helping onboard the QA process this week; resuming Task 4 next week.',
      overrunMinutes: 0, creditMinutes: 0, recomputedAfterCompletion: false, sharedContribution: false,
      computedAt: day2End, meta: { marker: MARKER }
    }
  ])
  await db.collection('tasks').updateOne({ _id: T1 }, { $set: { status: 'done' } })
  console.log('Seeded Day 2 (2026-08-25) — Completed, Task 1 delivered')

  // ---- Day 4: 2026-08-31, mid_sprint — Anessa absent, Task 2 blocked ----
  const day4Start = new Date('2026-08-31T09:16:00.000Z')
  const day4End = new Date('2026-08-31T09:31:00.000Z')
  await db.collection('standups').updateOne(
    { _id: DAY4 },
    {
      $set: {
        status: 'Completed',
        startedAt: day4Start,
        completedAt: day4End,
        displayedDayNumber: 4,
        attendance: [
          { user: PM, state: 'present', note: 'Will follow up with the client on the credentials today.' },
          { user: QA, state: 'present', note: 'Task 2 blocked on client API credentials; continuing spec work meanwhile.' },
          { user: ANESSA, state: 'absent_unplanned', reason: 'Sick leave', note: 'Notified via Slack this morning.' }
        ]
      },
      $unset: { missedAt: '' }
    }
  )
  const alloc5 = await db.collection('allocations').insertOne({
    standup: DAY4, sprint: SPRINT_ID, project: PROJECT_ID, organization: ORG_ID,
    member: QA, task: T2, plannedMinutes: 300, source: 'assigned_in_standup',
    isBlocked: true, allocatedDespiteBlocked: true,
    blockedNote: 'Client API credentials still pending; continuing spec work meanwhile.',
    excludedFromCapacity: false, pairedDeliberately: false, addedAfterCompletion: false,
    taskStatusAtAllocation: 'in_progress', frozenAt: day4End,
    createdBy: PM, createdAt: day4Start, updatedAt: day4End
  })
  await db.collection('allocationvariances').insertOne({
    allocation: alloc5.insertedId, standup: DAY4, computedAtStandup: DAY8, sprint: SPRINT_ID,
    member: QA, task: T2, project: PROJECT_ID, organization: ORG_ID,
    plannedMinutes: 300, loggedMinutesOnDay: 150, dayVarianceMinutes: -150,
    originalEstimateMinutes: 360, totalLoggedMinutesOnTask: 150, taskVarianceMinutes: -210,
    remainingBeforeMinutes: 360, remainingAfterMinutes: 210,
    taskStatusAtClose: 'in_progress', outcome: 'blocked',
    overrunMinutes: 0, creditMinutes: 0, recomputedAfterCompletion: false, sharedContribution: false,
    computedAt: day4End, meta: { marker: MARKER }
  })

  const cfwOwnerAbsent = await db.collection('carryforwarditems').insertOne({
    sprint: SPRINT_ID, project: PROJECT_ID, organization: ORG_ID,
    type: 'owner_absent', task: T4, member: ANESSA,
    originStandup: DAY4, originDate: '2026-08-31', currentStandup: DAY8,
    ageInStandups: 1, status: 'resolved',
    notes: [{ standup: DAY4, standupDate: '2026-08-31', author: PM, text: 'Anessa out sick; Task 4 paused until she is back.', createdAt: day4End }],
    resolution: {
      resolvedAt: new Date('2026-09-04T09:31:00.000Z'),
      resolvedBy: PM, resolutionType: 'done',
      comment: 'Anessa returned and completed the task on the final day.'
    },
    tags: ['owner_absent'],
    createdAt: day4End, updatedAt: new Date('2026-09-04T09:31:00.000Z')
  })

  const override1 = await db.collection('standupoverrides').insertOne({
    standup: DAY4, sprint: SPRINT_ID, project: PROJECT_ID, organization: ORG_ID,
    type: 'under_allocation',
    affectedMemberIds: [QA], affectedTaskIds: [T2],
    reasonCode: 'CAPACITY_GAP_FROM_ABSENCE',
    justification: `Team capacity dropped after Anessa's unplanned absence today; proceeding with reduced allocation and will rebalance tomorrow.`,
    gapMinutes: 120, memberAcknowledged: true,
    linkedCarryForwardId: cfwOwnerAbsent.insertedId,
    issuedBy: PM, issuedAt: day4End,
    createdAt: day4End, updatedAt: day4End
  })

  const blockerA = await db.collection('standupblockers').insertOne({
    standup: DAY4, sprint: SPRINT_ID, project: PROJECT_ID, organization: ORG_ID,
    task: T2, raisedBy: QA, raisedAt: day4Start,
    description: `Waiting on the client to issue API credentials for the integration.`,
    blockerType: 'dependency', owner: PM,
    targetResolutionDate: new Date('2026-09-02T00:00:00.000Z'),
    severity: 'high', status: 'resolved',
    resolutionNote: 'Client provided API credentials on 2026-09-03; integration unblocked.',
    linkedAllocation: alloc5.insertedId,
    createdAt: day4Start, updatedAt: new Date('2026-09-03T10:00:00.000Z')
  })
  console.log('Seeded Day 4 (2026-08-31) — Completed, absence + blocker + override')

  // ---- Day 8: 2026-09-04, final_day — sprint close ----
  const day8Start = new Date('2026-09-04T09:16:00.000Z')
  const day8End = new Date('2026-09-04T09:31:00.000Z')
  await db.collection('standups').updateOne(
    { _id: DAY8 },
    {
      $set: {
        status: 'Completed',
        startedAt: day8Start,
        completedAt: day8End,
        displayedDayNumber: 8,
        attendance: [
          { user: PM, state: 'present', note: 'Sprint close — reviewing carry-forward items for Sprint 2.' },
          { user: QA, state: 'present', note: 'Task 2 integration ongoing now that credentials arrived. Task 3 deprioritized.' },
          { user: ANESSA, state: 'present', note: 'Task 4 completed and tested — a bit over estimate due to edge cases.' }
        ]
      },
      $unset: { missedAt: '', notificationsSent: '' }
    }
  )
  const alloc7 = await db.collection('allocations').insertOne({
    standup: DAY8, sprint: SPRINT_ID, project: PROJECT_ID, organization: ORG_ID,
    member: QA, task: T2, plannedMinutes: 180, source: 'carried_forward',
    carriedFromAllocation: alloc5.insertedId, carryChainRoot: alloc5.insertedId,
    isBlocked: false, allocatedDespiteBlocked: false, excludedFromCapacity: false,
    pairedDeliberately: false, addedAfterCompletion: false,
    taskStatusAtAllocation: 'in_progress', frozenAt: day8End,
    createdBy: PM, createdAt: day8Start, updatedAt: day8End
  })
  const alloc8 = await db.collection('allocations').insertOne({
    standup: DAY8, sprint: SPRINT_ID, project: PROJECT_ID, organization: ORG_ID,
    member: QA, task: T3, plannedMinutes: 180, source: 'assigned_in_standup',
    isBlocked: false, allocatedDespiteBlocked: false, excludedFromCapacity: false,
    pairedDeliberately: false, addedAfterCompletion: false,
    taskStatusAtAllocation: 'in_progress', frozenAt: day8End,
    createdBy: PM, createdAt: day8Start, updatedAt: day8End
  })
  const alloc9 = await db.collection('allocations').insertOne({
    standup: DAY8, sprint: SPRINT_ID, project: PROJECT_ID, organization: ORG_ID,
    member: ANESSA, task: T4, plannedMinutes: 120, source: 'self_selected',
    isBlocked: false, allocatedDespiteBlocked: false, excludedFromCapacity: false,
    pairedDeliberately: false, addedAfterCompletion: false,
    taskStatusAtAllocation: 'todo', frozenAt: day8End,
    createdBy: ANESSA, createdAt: day8Start, updatedAt: day8End
  })

  const cfwUnfinished = await db.collection('carryforwarditems').insertOne({
    sprint: SPRINT_ID, project: PROJECT_ID, organization: ORG_ID,
    type: 'unfinished_task', task: T2, member: QA,
    originStandup: DAY8, originDate: '2026-09-04', currentStandup: DAY8,
    ageInStandups: 1, status: 'open',
    notes: [{ standup: DAY8, standupDate: '2026-09-04', author: PM, text: 'Task 2 still has ~2h remaining; carrying into Sprint 2.', createdAt: day8End }],
    tags: ['cross_sprint'],
    createdAt: day8End, updatedAt: day8End
  })

  const cfwBlocker = await db.collection('carryforwarditems').insertOne({
    sprint: SPRINT_ID, project: PROJECT_ID, organization: ORG_ID,
    type: 'open_blocker', task: T3, member: QA,
    originStandup: DAY8, originDate: '2026-09-04', currentStandup: DAY8,
    ageInStandups: 1, status: 'escalated',
    notes: [{ standup: DAY8, standupDate: '2026-09-04', author: QA, text: 'Still waiting on product to confirm scope for Task 3.', createdAt: day8End }],
    tags: ['chronic'],
    createdAt: day8End, updatedAt: day8End
  })

  const blockerB = await db.collection('standupblockers').insertOne({
    standup: DAY8, sprint: SPRINT_ID, project: PROJECT_ID, organization: ORG_ID,
    task: T3, raisedBy: QA, raisedAt: day8Start,
    description: `Waiting on a product decision about scope before Task 3 can proceed.`,
    blockerType: 'decision_needed', owner: PM,
    severity: 'medium', status: 'open',
    linkedCarryForwardId: cfwBlocker.insertedId,
    createdAt: day8Start, updatedAt: day8Start
  })

  await db.collection('allocationvariances').insertMany([
    {
      allocation: alloc7.insertedId, standup: DAY8, computedAtStandup: DAY8, sprint: SPRINT_ID,
      member: QA, task: T2, project: PROJECT_ID, organization: ORG_ID,
      plannedMinutes: 180, loggedMinutesOnDay: 90, dayVarianceMinutes: -90,
      originalEstimateMinutes: 360, totalLoggedMinutesOnTask: 240, taskVarianceMinutes: -120,
      remainingBeforeMinutes: 210, remainingAfterMinutes: 120,
      taskStatusAtClose: 'in_progress', outcome: 'open_under_consumed',
      overrunMinutes: 0, creditMinutes: 0, recomputedAfterCompletion: false, sharedContribution: false,
      computedAt: day8End, meta: { marker: MARKER }
    },
    {
      allocation: alloc8.insertedId, standup: DAY8, computedAtStandup: DAY8, sprint: SPRINT_ID,
      member: QA, task: T3, project: PROJECT_ID, organization: ORG_ID,
      plannedMinutes: 180, loggedMinutesOnDay: 0, dayVarianceMinutes: -180,
      originalEstimateMinutes: 180, totalLoggedMinutesOnTask: 0, taskVarianceMinutes: -180,
      remainingBeforeMinutes: 180, remainingAfterMinutes: 180,
      taskStatusAtClose: 'in_progress', outcome: 'not_started',
      notStartedReason: 'Deprioritized in favor of unblocking Task 2 for the client deadline.',
      overrunMinutes: 0, creditMinutes: 0, recomputedAfterCompletion: false, sharedContribution: false,
      computedAt: day8End, meta: { marker: MARKER }
    },
    {
      allocation: alloc9.insertedId, standup: DAY8, computedAtStandup: DAY8, sprint: SPRINT_ID,
      member: ANESSA, task: T4, project: PROJECT_ID, organization: ORG_ID,
      plannedMinutes: 120, loggedMinutesOnDay: 180, dayVarianceMinutes: 60,
      originalEstimateMinutes: 300, totalLoggedMinutesOnTask: 360, taskVarianceMinutes: 60,
      remainingBeforeMinutes: 120, remainingAfterMinutes: 0,
      taskStatusAtClose: 'done', outcome: 'delivered_over',
      overrunMinutes: 60, creditMinutes: 0, recomputedAfterCompletion: false, sharedContribution: false,
      computedAt: day8End, meta: { marker: MARKER }
    }
  ])
  await db.collection('tasks').updateOne({ _id: T4 }, { $set: { status: 'done' } })
  console.log('Seeded Day 8 (2026-09-04) — Completed, sprint close + 2 carry-forward items into Sprint 2')

  // ---- Real logged time backing the variance numbers above ----
  await db.collection('timeentries').insertMany([
    timeEntry({ user: QA, task: T1, date: '2026-08-24', startHour: 10, minutes: 180, description: 'Task 1 work' }),
    timeEntry({ user: ANESSA, task: T4, date: '2026-08-24', startHour: 10, minutes: 180, description: 'Task 4 work' }),
    timeEntry({ user: QA, task: T1, date: '2026-08-25', startHour: 10, minutes: 60, description: 'Task 1 wrap-up' }),
    timeEntry({ user: QA, task: T2, date: '2026-08-31', startHour: 10, minutes: 150, description: 'Task 2 spec work while blocked' }),
    timeEntry({ user: QA, task: T2, date: '2026-09-04', startHour: 10, minutes: 90, description: 'Task 2 integration' }),
    timeEntry({ user: ANESSA, task: T4, date: '2026-09-04', startHour: 10, minutes: 180, description: 'Task 4 completion and testing' })
  ])
  console.log('Seeded matching TimeEntry rows so the live variance panel agrees with the seeded history')

  console.log('\nDone. Summary:')
  console.log('  Completed days: 2026-08-24, 2026-08-25, 2026-08-31, 2026-09-04')
  console.log('  Left as real Missed: 2026-08-28, 2026-09-01, 2026-09-02, 2026-09-03')
  console.log(`  Overrides: 1 (${override1.insertedId})`)
  console.log(`  Blockers: 2 (${blockerA.insertedId} resolved, ${blockerB.insertedId} open)`)
  console.log(`  New carry-forward items: 3 (owner_absent resolved, unfinished_task open, open_blocker escalated)`)
  await mongoose.disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
