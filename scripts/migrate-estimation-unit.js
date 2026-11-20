/**
 * Backfills `estimationUnit: 'story_points'` on stand-up settings and poker
 * sessions saved before the field existed.
 *
 * The schema default for new records is `hours`. A record with no stored
 * value would otherwise read as hours too — so a project that has always
 * voted in points would silently switch, and an old session's point votes
 * would be converted to hours as if they were hours. Before the default
 * changed, a missing value meant story points; this writes that down.
 *
 *   node scripts/migrate-estimation-unit.js --dry-run   # count only
 *   node scripts/migrate-estimation-unit.js             # write
 *
 * Idempotent: a second run matches nothing. Run it before deploying the
 * `hours` default.
 *
 * Written against the driver rather than the Mongoose models on purpose (see
 * rebuild-debt-summaries.js): the models' defaults would hide the very
 * records this needs to find.
 */
const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

const COLLECTIONS = ['projectstandupsettings', 'pokersessions']
const MISSING = { estimationUnit: { $exists: false } }

function databaseUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'))
  return config.database.uri
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  await mongoose.connect(databaseUri())
  const db = mongoose.connection.db

  try {
    for (const name of COLLECTIONS) {
      const collection = db.collection(name)
      if (dryRun) {
        const count = await collection.countDocuments(MISSING)
        console.log(`[dry-run] ${name}: ${count} document(s) without estimationUnit`)
        continue
      }
      const result = await collection.updateMany(MISSING, {
        $set: { estimationUnit: 'story_points' }
      })
      console.log(
        `${name}: matched ${result.matchedCount}, set story_points on ${result.modifiedCount}`
      )
    }
  } finally {
    await mongoose.disconnect()
  }
}

main().catch((error) => {
  console.error('Estimation unit migration failed:', error)
  process.exit(1)
})
