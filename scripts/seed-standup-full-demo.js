/**
 * Full demo dataset for the stand-up module's 5 real accounts:
 *  - Fixes project team membership/roles (this task).
 *  - Backfills StandupSummary documents onto Sprint 1's already-Completed
 *    standups, the confirmed cause of "no summary available" (Task 2).
 *  - Creates a second, currently-active sprint anchored to today so the
 *    Schedule hub / Run screen / My Stand-up have live data (Tasks 3-4).
 *
 * Idempotent: running it twice is a no-op the second time for each section.
 *
 *   node scripts/seed-standup-full-demo.js          # create
 *   node scripts/seed-standup-full-demo.js --remove # tear down everything it created
 */
const { MongoClient, ObjectId } = require('mongodb')
const fs = require('fs')
const path = require('path')

const ORG_ID = new ObjectId('6a891b3fc7fac0179d60ece7')
const PROJECT_ID = new ObjectId('6a8af360917b98ed065e606e')
const SPRINT1_ID = new ObjectId('6a8af448917b98ed065f0deb')
const SPRINT2_ID = new ObjectId('6a8d09a0c9f4a666d779e0db')

const ADMIN = new ObjectId('6a891b3fc7fac0179d60ece8')
const PM = new ObjectId('6a8aeeaf917b98ed065e6009')
const HR = new ObjectId('6a8aecf3917b98ed065e5e59')
const QA = new ObjectId('6a8aee96917b98ed065e5ff4')
const ANESSA = new ObjectId('6a8aee7a917b98ed065e5fe2')

const DAY1 = new ObjectId('6a8c20fe4ae51abb26bd438a')
const DAY2 = new ObjectId('6a8c20fe4ae51abb26bd438b')
const DAY4 = new ObjectId('6a8c20fe4ae51abb26bd438d')
const DAY8 = new ObjectId('6a8c20fe4ae51abb26bd4391')

const MARKER = 'standup-full-demo-2026-09-10'

const isoDate = (d) => d.toISOString().slice(0, 10)
const addDays = (d, n) => {
  const copy = new Date(d)
  copy.setUTCDate(copy.getUTCDate() + n)
  return copy
}

async function fixProjectTeam(db) {
  // Admin: team member, no project role — org admin scope covers the rest.
  // PM: project_manager. QA: project_qa_lead. Anessa: project_member.
  // HR: explicitly NOT on the project team (org-level only).
  await db.collection('projects').updateOne(
    { _id: PROJECT_ID },
    {
      $pull: { teamMembers: { memberId: HR }, projectRoles: { user: HR } }
    }
  )
  await db.collection('projects').updateOne(
    { _id: PROJECT_ID, 'teamMembers.memberId': { $ne: ADMIN } },
    { $push: { teamMembers: { memberId: ADMIN } } }
  )
  for (const [user, role] of [[PM, 'project_manager'], [QA, 'project_qa_lead'], [ANESSA, 'project_member']]) {
    await db.collection('projects').updateOne(
      { _id: PROJECT_ID, 'teamMembers.memberId': { $ne: user } },
      { $push: { teamMembers: { memberId: user } } }
    )
    // Two-step for roles: remove any stale role first, then add the correct one if not present.
    await db.collection('projects').updateOne(
      { _id: PROJECT_ID },
      { $pull: { projectRoles: { user, role: { $ne: role } } } }
    )
    await db.collection('projects').updateOne(
      { _id: PROJECT_ID, 'projectRoles.user': { $ne: user } },
      { $push: { projectRoles: { user, role, assignedBy: PM, assignedAt: new Date() } } }
    )
  }
  // Mirror onto the User side (User.projectRoles), since both are read in
  // different places and must agree.
  for (const [user, role] of [[PM, 'project_manager'], [QA, 'project_qa_lead'], [ANESSA, 'project_member']]) {
    // Two-step for roles: remove any stale role first, then add the correct one if not present.
    await db.collection('users').updateOne(
      { _id: user },
      { $pull: { projectRoles: { project: PROJECT_ID, role: { $ne: role } } } }
    )
    await db.collection('users').updateOne(
      { _id: user, 'projectRoles.project': { $ne: PROJECT_ID } },
      { $push: { projectRoles: { project: PROJECT_ID, role, assignedBy: PM, assignedAt: new Date() } } }
    )
  }
  console.log('Task 1: project team membership and roles fixed (HR removed, QA/PM/Anessa/Admin correct)')
}

async function backfillSprint1Summaries(db) {
  const usersById = new Map(
    (await db.collection('users').find({ _id: { $in: [PM, QA, ANESSA] } }).toArray())
      .map((u) => [u._id.toString(), `${u.firstName} ${u.lastName}`])
  )
  const nameFor = (id) => usersById.get(id.toString()) ?? id.toString()

  const sprint = await db.collection('sprints').findOne({ _id: SPRINT1_ID })

  // §13.3's per-project age thresholds (`ageBandFor` in carry-forward.ts):
  // note/escalation bands come from settings, the chronic band is a fixed
  // constant not stored anywhere.
  const CHRONIC_AGE_THRESHOLD = 8
  const standupSettings = await db.collection('projectstandupsettings').findOne({ project: PROJECT_ID })
  const ageThresholds = {
    noteThreshold: standupSettings?.carryForwardNoteThreshold ?? 3,
    escalationThreshold: standupSettings?.carryForwardEscalationThreshold ?? 5
  }
  const ageBandFor = (ageInStandups) => {
    const age = ageInStandups ?? 0
    if (age >= CHRONIC_AGE_THRESHOLD) return 'chronic'
    if (age >= ageThresholds.escalationThreshold) return 'escalated'
    if (age >= ageThresholds.noteThreshold) return 'note_required'
    return 'normal'
  }

  for (const standupId of [DAY1, DAY2, DAY4, DAY8]) {
    const exists = await db.collection('standupsummaries').findOne({ standup: standupId })
    if (exists) continue

    const standup = await db.collection('standups').findOne({ _id: standupId })
    const allocations = await db.collection('allocations').find({ standup: standupId }).toArray()
    const variances = await db.collection('allocationvariances').find({ standup: standupId }).toArray()
    const blockers = await db.collection('standupblockers').find({ standup: standupId }).toArray()
    const carryForward = await db.collection('carryforwarditems').find({ originStandup: standupId }).toArray()
    const overrides = await db.collection('standupoverrides').find({ standup: standupId }).toArray()

    // Carry-forward items can reference a task that wasn't re-allocated on
    // this particular day, so the id set must cover both sources or
    // taskKeyById/taskTitleById silently come back undefined for those rows.
    const taskIds = [...new Set([
      ...allocations.map((a) => a.task.toString()),
      ...carryForward.map((item) => item.task).filter(Boolean).map((id) => id.toString())
    ])]
    const tasks = await db.collection('tasks').find({ _id: { $in: taskIds.map((id) => new ObjectId(id)) } }).toArray()
    const taskKeyById = new Map(tasks.map((t) => [t._id.toString(), t.displayId]))
    const taskTitleById = new Map(tasks.map((t) => [t._id.toString(), t.title]))

    const memberIds = [...new Set(allocations.map((a) => a.member.toString()))]

    const summary = {
      standup: standupId,
      sprint: SPRINT1_ID,
      project: PROJECT_ID,
      organization: ORG_ID,
      generatedAt: standup.completedAt ?? new Date(),
      headerFacts: {
        standupDate: standup.standupDate,
        dayNumber: standup.displayedDayNumber ?? standup.sprintDayNumber,
        totalDays: standup.totalSprintDays,
        facilitatorName: nameFor(standup.facilitator),
        durationMinutes: standup.durationMinutes
      },
      attendance: (standup.attendance ?? []).map((row) => ({
        memberId: row.user,
        name: nameFor(row.user),
        status: row.state
      })),
      completedYesterday: variances
        .filter((v) => v.outcome && v.outcome.startsWith('delivered'))
        .map((v) => ({ taskId: v.task, taskKey: taskKeyById.get(v.task.toString()), title: taskTitleById.get(v.task.toString()) })),
      varianceTable: variances.map((v) => ({
        allocationId: v.allocation,
        taskKey: taskKeyById.get(v.task.toString()),
        memberId: v.member,
        outcome: v.outcome,
        dayVarianceMinutes: v.dayVarianceMinutes
      })),
      debtMovements: memberIds.map((id) => {
        const memberVariances = variances.filter((v) => v.member.toString() === id)
        const outstandingDebtMinutes = memberVariances.reduce((sum, v) => sum + Math.max(0, -(v.dayVarianceMinutes ?? 0)), 0)
        const surplusMinutes = memberVariances.reduce((sum, v) => sum + Math.max(0, v.overrunMinutes ?? 0), 0)
        return { memberId: new ObjectId(id), outstandingDebtMinutes, surplusMinutes }
      }),
      memberCommitments: memberIds.map((id) => ({
        memberId: new ObjectId(id),
        name: nameFor(id),
        allocations: allocations
          .filter((a) => a.member.toString() === id)
          .map((a) => ({ taskId: a.task, taskKey: taskKeyById.get(a.task.toString()), plannedMinutes: a.plannedMinutes }))
      })),
      blockersRaised: blockers.map((b) => ({
        blockerId: String(b._id),
        description: b.description,
        blockerType: b.blockerType,
        severity: b.severity,
        status: b.status
      })),
      blockersResolved: blockers
        .filter((b) => b.status === 'resolved' || b.status === 'wont_resolve')
        .map((b) => ({ blockerId: String(b._id), resolutionNote: b.resolutionNote })),
      carryForwardState: carryForward.map((item) => ({
        itemId: String(item._id),
        taskKey: item.task ? taskKeyById.get(item.task.toString()) : undefined,
        ageBand: ageBandFor(item.ageInStandups),
        status: item.status
      })),
      overridesIssued: overrides.map((o) => ({
        type: o.type,
        reasonCode: o.reasonCode,
        justification: o.justification
      })),
      createdAt: standup.completedAt ?? new Date(),
      updatedAt: standup.completedAt ?? new Date()
    }

    await db.collection('standupsummaries').insertOne(summary)
    console.log(`  Backfilled StandupSummary for ${standup.standupDate}`)
  }

  if (sprint.status !== 'completed') {
    await db.collection('sprints').updateOne(
      { _id: SPRINT1_ID },
      { $set: { status: 'completed', actualEndDate: new Date('2026-09-04T09:31:00.000Z') } }
    )
    console.log('  Sprint 1 status corrected to completed')
  }
  console.log('Task 2: Sprint 1 StandupSummary documents backfilled')
}

async function createSprint2(db) {
  const sprint = await db.collection('sprints').findOne({ _id: SPRINT2_ID })

  if (sprint && sprint.status === 'active' && sprint.tasks && sprint.tasks.length > 0) {
    return SPRINT2_ID
  }

  const now = new Date()
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const startDate = today
  const endDate = addDays(today, 13)

  const lastTask = await db.collection('tasks')
    .find({ project: PROJECT_ID })
    .sort({ taskNumber: -1 })
    .limit(1)
    .toArray()
  const nextTaskNumber = (lastTask[0]?.taskNumber ?? 4) + 1

  const taskDefs = [
    { title: 'Export invoice as CSV', type: 'feature', priority: 'high', estimateMinutes: 300, owner: QA },
    { title: 'Audit log for invoice edits', type: 'feature', priority: 'medium', estimateMinutes: 480, owner: ANESSA },
    { title: 'Fix rounding error in tax rules engine', type: 'bug', priority: 'critical', estimateMinutes: 180, owner: QA },
    { title: 'Regression pass on PDF render pipeline', type: 'task', priority: 'medium', estimateMinutes: 240, owner: QA },
    { title: 'Reconcile invoice totals against ledger', type: 'feature', priority: 'medium', estimateMinutes: 360, owner: ANESSA }
  ]

  const existingSprintTaskCount = await db.collection('tasks').countDocuments({ sprint: SPRINT2_ID })
  let taskIds = []
  if (existingSprintTaskCount === 0) {
    const taskDocs = taskDefs.map((def, index) => {
      const taskNumber = nextTaskNumber + index
      return {
        _id: new ObjectId(),
        title: def.title,
        description: `${def.title}. Acceptance: verified against the Sprint 2 goal in the invoicing module.`,
        status: 'todo',
        priority: def.priority,
        isBillable: true,
        type: def.type,
        organization: ORG_ID,
        project: PROJECT_ID,
        taskNumber,
        displayId: `1.${taskNumber}`,
        assignedTo: [{ user: def.owner }],
        standupOwner: def.owner,
        createdBy: PM,
        assignedBy: PM,
        estimatedHours: def.estimateMinutes / 60,
        originalEstimateMinutes: def.estimateMinutes,
        remainingEstimateMinutes: def.estimateMinutes,
        estimateUnit: 'hours',
        estimateValue: def.estimateMinutes / 60,
        estimateMethod: 'manual',
        consensusReached: false,
        estimatedAt: now,
        estimatedBy: PM,
        estimateLockedAt: now,
        sprint: SPRINT2_ID,
        labels: [],
        dependencies: [],
        attachments: [],
        subtasks: [],
        archived: false,
        position: index,
        totalLoggedMinutes: 0,
        standupSpillCount: 0,
        actualHours: 0,
        createdAt: now,
        updatedAt: now
      }
    })
    await db.collection('tasks').insertMany(taskDocs)
    taskIds = taskDocs.map((t) => t._id)
  } else {
    taskIds = (await db.collection('tasks').find({ sprint: SPRINT2_ID }).toArray()).map((t) => t._id)
  }

  await db.collection('sprints').updateOne(
    { _id: SPRINT2_ID },
    {
      $set: {
        description: 'Invoicing module hardening: exports, audit trail, tax-rule fixes.',
        status: 'active',
        startDate,
        endDate,
        actualStartDate: startDate,
        goal: 'Ship CSV export, the invoice audit log, and clear the tax-rounding bug before the pilot review.',
        capacity: 240,
        tasks: taskIds,
        plannedAt: now
      },
      $pull: { teamMembers: HR }
    }
  )

  const existingPlanningSession = await db.collection('sprintplanningsessions').findOne({ sprint: SPRINT2_ID, status: 'completed' })
  if (!existingPlanningSession) {
    const PLANNING_SESSION_ID = new ObjectId()
    const totalEstimatedMinutes = taskDefs.reduce((sum, def) => sum + def.estimateMinutes, 0)
    const countByType = taskDefs.reduce((acc, def) => {
      acc[def.type] = (acc[def.type] ?? 0) + 1
      return acc
    }, {})

    await db.collection('sprintplanningsessions').insertOne({
      _id: PLANNING_SESSION_ID,
      organization: ORG_ID,
      project: PROJECT_ID,
      sprint: SPRINT2_ID,
      status: 'completed',
      sprintGoal: 'Ship CSV export, the invoice audit log, and clear the tax-rounding bug before the pilot review.',
      participants: [PM, QA, ANESSA],
      facilitator: PM,
      startedAt: now,
      completedAt: now,
      capacitySnapshot: {
        workingDayCount: 10,
        totalCapacityMinutes: 240 * 60,
        leaveMinutes: 0,
        netCapacityMinutes: 240 * 60,
        perMember: [
          { member: QA, dailyCapacityMinutes: 480, sprintCapacityMinutes: 4800 },
          { member: ANESSA, dailyCapacityMinutes: 480, sprintCapacityMinutes: 4800 }
        ]
      },
      scopeSnapshot: {
        taskCount: 5,
        estimatedTaskCount: 5,
        totalEstimatedMinutes,
        countByType
      },
      checklistResults: [
        { checkId: 'PC-1', kind: 'mandatory', passed: true },
        { checkId: 'PC-2', kind: 'mandatory', passed: true },
        { checkId: 'PC-3', kind: 'mandatory', passed: true },
        { checkId: 'PC-4', kind: 'mandatory', passed: true },
        { checkId: 'PC-5', kind: 'mandatory', passed: true },
        { checkId: 'PC-6', kind: 'mandatory', passed: true },
        { checkId: 'PC-7', kind: 'mandatory', passed: true },
        { checkId: 'PA-1', kind: 'advisory', passed: true },
        { checkId: 'PA-2', kind: 'advisory', passed: true },
        { checkId: 'PA-3', kind: 'advisory', passed: true },
        { checkId: 'PA-4', kind: 'advisory', passed: true },
        { checkId: 'PA-5', kind: 'advisory', passed: true },
        { checkId: 'PA-6', kind: 'advisory', passed: true }
      ],
      createdBy: PM,
      completedBy: PM,
      createdAt: now,
      updatedAt: now
    })

    await db.collection('sprints').updateOne(
      { _id: SPRINT2_ID },
      { $set: { activePlanningSession: PLANNING_SESSION_ID } }
    )
  }

  console.log('Task 3: Sprint 2 (pre-existing placeholder) populated — real goal, 5 tasks, completed planning session, HR removed from team, dates repointed to today')
  return SPRINT2_ID
}

async function removeAll(db) {
  // Undo all changes from fixProjectTeam()
  // Remove team members added for Admin/PM/QA/Anessa
  await db.collection('projects').updateOne(
    { _id: PROJECT_ID },
    { $pull: { teamMembers: { memberId: { $in: [ADMIN, PM, QA, ANESSA] } } } }
  )
  // Remove project roles added for PM/QA/Anessa
  await db.collection('projects').updateOne(
    { _id: PROJECT_ID },
    { $pull: { projectRoles: { user: { $in: [PM, QA, ANESSA] } } } }
  )
  // Restore HR's team membership
  await db.collection('projects').updateOne(
    { _id: PROJECT_ID, 'teamMembers.memberId': { $ne: HR } },
    { $push: { teamMembers: { memberId: HR } } }
  )
  // Remove mirrored projectRoles from users collection for PM/QA/Anessa
  for (const user of [PM, QA, ANESSA]) {
    await db.collection('users').updateOne(
      { _id: user },
      { $pull: { projectRoles: { project: PROJECT_ID } } }
    )
  }
  await db.collection('standupsummaries').deleteMany({ standup: { $in: [DAY1, DAY2, DAY4, DAY8] } })
  await db.collection('sprints').updateOne({ _id: SPRINT1_ID }, { $set: { status: 'planning' } })

  // Undo all changes from createSprint2(): restore the pre-existing placeholder
  // sprint document to its original state rather than deleting it.
  await db.collection('tasks').deleteMany({ sprint: SPRINT2_ID })
  await db.collection('sprintplanningsessions').deleteMany({ sprint: SPRINT2_ID })
  await db.collection('sprints').updateOne(
    { _id: SPRINT2_ID },
    {
      $set: {
        description: 'new sprint',
        status: 'planning',
        startDate: new Date('2026-09-07T00:00:00.000Z'),
        endDate: new Date('2026-09-21T00:00:00.000Z'),
        goal: '',
        capacity: 0,
        tasks: []
      },
      $unset: { activePlanningSession: '', actualStartDate: '', plannedAt: '' },
      $addToSet: { teamMembers: HR }
    }
  )

  console.log('Removed full-demo changes (Tasks 1-3)')
}

async function main() {
  const remove = process.argv.includes('--remove')
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'))
  const client = await MongoClient.connect(config.database.uri)
  const db = client.db()

  if (remove) {
    await removeAll(db)
    return client.close()
  }

  await fixProjectTeam(db)
  await backfillSprint1Summaries(db)
  const sprint2Id = await createSprint2(db)

  console.log(`\nDone (Tasks 1-3 of the full demo seed). Sprint 2: ${sprint2Id}`)
  await client.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
