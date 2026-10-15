/**
 * Seeds (or removes) a SprintEvent that triggers the DN-4 unattended-ceremony
 * warning on the Stand-up Configuration screen.
 *
 * The warning only renders for an event that is in the future, not a
 * daily_standup, not cancelled, and has an EMPTY attendee list — so without a
 * fixture that check passes by rendering nothing, which looks identical to it
 * working. Phase 6's manual pass needs it to actually fire.
 *
 *   node scripts/seed-unattended-ceremony.js          # create
 *   node scripts/seed-unattended-ceremony.js --remove # clean up
 */
const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

const TITLE = 'Quarterly architecture review (fixture)'

async function main() {
  const remove = process.argv.includes('--remove')
  const config = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8')
  )

  await mongoose.connect(config.database.uri)
  const db = mongoose.connection.db

  if (remove) {
    const { deletedCount } = await db.collection('sprintevents').deleteMany({ title: TITLE })
    console.log(`Removed ${deletedCount} fixture event(s).`)
    return mongoose.disconnect()
  }

  const project = await db.collection('projects').findOne({ name: 'Kanvaro' })
  if (!project) throw new Error('No project named "Kanvaro" found.')

  const sprint = await db.collection('sprints').findOne({ project: project._id })
  if (!sprint) throw new Error(`No sprint found on project ${project.name}.`)

  const facilitator = await db.collection('users').findOne({ role: 'admin' })
  if (!facilitator) throw new Error('No admin user found to act as facilitator.')

  const scheduledDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)

  const existing = await db.collection('sprintevents').findOne({ title: TITLE })
  if (existing) {
    console.log('Fixture already present; leaving it alone.')
    return mongoose.disconnect()
  }

  await db.collection('sprintevents').insertOne({
    sprint: sprint._id,
    project: project._id,
    eventType: 'review',
    title: TITLE,
    description: 'Fixture for the Phase 6 manual pass. Safe to delete.',
    scheduledDate,
    duration: 120,
    attendees: [], // the whole point — an empty list is what makes it "unattended"
    facilitator: facilitator._id,
    status: 'scheduled',
    createdAt: new Date(),
    updatedAt: new Date()
  })

  console.log(`Created "${TITLE}"`)
  console.log(`  project:  ${project.name} (${project._id})`)
  console.log(`  sprint:   ${sprint.name || sprint._id}`)
  console.log(`  date:     ${scheduledDate.toISOString().slice(0, 10)} (3 days out)`)
  console.log(`  duration: 120 minutes, attendees: []`)
  await mongoose.disconnect()
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
