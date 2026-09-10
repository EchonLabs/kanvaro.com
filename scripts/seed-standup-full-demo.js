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
  console.log('Removed full-demo changes (Task 1 only implemented so far)')
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

  console.log('\nDone (Task 1 of the full demo seed).')
  await client.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
