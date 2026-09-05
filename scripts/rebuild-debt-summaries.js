/**
 * Rebuilds `memberSprintDebtSummary` from the estimate-debt ledger (NFR-9).
 *
 * The ledger is the source of truth (DAT-5); the summary is a cache. NFR-9
 * requires that the cache can be discarded and rebuilt with no data loss, and
 * this is the command that proves it — drop the collection, run this, and the
 * numbers come back identical.
 *
 *   node scripts/rebuild-debt-summaries.js                 # every sprint
 *   node scripts/rebuild-debt-summaries.js --sprint <id>   # one sprint
 *
 * Written against the driver rather than the Mongoose models on purpose: a
 * maintenance command has to run when the application does not, including
 * against a database whose documents a current model would refuse to validate.
 */
const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

function balanceOf(entries) {
  const totals = {
    accrual: 0,
    credit: 0,
    settlement: 0,
    writeoff: 0,
    carry_in: 0
  }
  for (const entry of entries) {
    if (totals[entry.entryType] === undefined) continue
    totals[entry.entryType] += entry.minutes
  }

  // VAR-6, and the display floor: a negative balance is surplus, never debt.
  const raw = totals.accrual + totals.carry_in - totals.credit - totals.settlement - totals.writeoff

  return {
    outstandingMinutes: Math.max(0, raw),
    accruedMinutes: totals.accrual,
    creditedMinutes: totals.credit,
    settledMinutes: totals.settlement,
    writtenOffMinutes: totals.writeoff,
    carriedInMinutes: totals.carry_in
  }
}

async function main() {
  const sprintArg = process.argv.indexOf('--sprint')
  const sprintId = sprintArg === -1 ? null : process.argv[sprintArg + 1]

  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'))
  await mongoose.connect(config.database.uri)
  const db = mongoose.connection.db

  const match = sprintId ? { sprint: new mongoose.Types.ObjectId(sprintId) } : {}
  const entries = await db.collection('estimatedebtledgers').find(match).toArray()

  if (entries.length === 0) {
    console.log('No ledger entries found. Nothing to rebuild.')
    return mongoose.disconnect()
  }

  const groups = new Map()
  for (const entry of entries) {
    const key = `${entry.sprint}:${entry.member}`
    const group = groups.get(key) ?? {
      sprint: entry.sprint,
      member: entry.member,
      project: entry.project,
      organization: entry.organization,
      entries: []
    }
    group.entries.push(entry)
    groups.set(key, group)
  }

  let rebuilt = 0
  for (const group of groups.values()) {
    const balance = balanceOf(group.entries)
    await db.collection('membersprintdebtsummaries').updateOne(
      { sprint: group.sprint, member: group.member },
      {
        $set: {
          project: group.project,
          organization: group.organization,
          ...balance,
          lastRebuiltAt: new Date(),
          // DAT-9: how many entries this row was built from, so a reader can
          // tell it is behind the ledger.
          sourceVersion: group.entries.length
        }
      },
      { upsert: true }
    )
    rebuilt += 1
  }

  console.log(
    `Rebuilt ${rebuilt} summar${rebuilt === 1 ? 'y' : 'ies'} from ${entries.length} ledger entries` +
      (sprintId ? ` on sprint ${sprintId}.` : ' across every sprint.')
  )

  await mongoose.disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
