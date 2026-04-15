/**
 * Cleanup Duplicate Time Entries
 * 
 * This script finds and removes duplicate TimeEntry records that were created
 * by the race condition bug where multiple code paths could stop the same timer
 * simultaneously, each creating their own TimeEntry.
 * 
 * Usage:
 *   DRY RUN (show what would be deleted):
 *     node scripts/cleanup-duplicate-time-entries.js
 * 
 *   ACTUALLY DELETE:
 *     node scripts/cleanup-duplicate-time-entries.js --delete
 * 
 * How it works:
 *   1. Groups all completed TimeEntry records by (user, project, startTime rounded to 2s)
 *   2. For groups with more than 1 entry, keeps the oldest and marks the rest for deletion
 *   3. In dry-run mode, just reports; with --delete flag, actually removes duplicates
 */

const mongoose = require('mongoose')
require('dotenv').config({ path: '.env.local' })

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL

if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI or DATABASE_URL environment variable is required')
  console.error('Make sure you have a .env.local file with your database connection string')
  process.exit(1)
}

const shouldDelete = process.argv.includes('--delete')

async function main() {
  console.log('==========================================')
  console.log('  Duplicate Time Entry Cleanup Script')
  console.log('==========================================')
  console.log(`Mode: ${shouldDelete ? '🔴 DELETE (will remove duplicates)' : '🟡 DRY RUN (report only)'}`)
  console.log('')

  await mongoose.connect(MONGODB_URI)
  console.log('✅ Connected to MongoDB')

  const db = mongoose.connection.db
  const collection = db.collection('timeentries')

  // Find potential duplicates: entries with the same user, project, and startTime within 2 seconds
  // We use an aggregation pipeline to group entries
  console.log('\n🔍 Scanning for duplicate time entries...\n')

  const duplicateGroups = await collection.aggregate([
    {
      $match: {
        status: 'completed'
      }
    },
    {
      // Round startTime to 2-second buckets for grouping
      $addFields: {
        startTimeBucket: {
          $subtract: [
            { $toLong: '$startTime' },
            { $mod: [{ $toLong: '$startTime' }, 2000] }
          ]
        }
      }
    },
    {
      $group: {
        _id: {
          user: '$user',
          project: '$project',
          startTimeBucket: '$startTimeBucket'
        },
        count: { $sum: 1 },
        entries: {
          $push: {
            _id: '$_id',
            startTime: '$startTime',
            endTime: '$endTime',
            duration: '$duration',
            description: '$description',
            createdAt: '$createdAt',
            task: '$task'
          }
        },
        firstUser: { $first: '$user' },
        firstProject: { $first: '$project' }
      }
    },
    {
      $match: {
        count: { $gt: 1 }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]).toArray()

  if (duplicateGroups.length === 0) {
    console.log('✅ No duplicate time entries found! Database is clean.')
    await mongoose.disconnect()
    return
  }

  let totalDuplicates = 0
  let totalToDelete = 0
  const idsToDelete = []

  console.log(`Found ${duplicateGroups.length} groups of duplicate entries:\n`)
  console.log('─'.repeat(80))

  for (const group of duplicateGroups) {
    const { count, entries, firstUser, firstProject } = group

    // Sort by createdAt to keep the oldest entry
    entries.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

    const kept = entries[0]
    const toDelete = entries.slice(1)

    totalDuplicates += count
    totalToDelete += toDelete.length

    console.log(`\n📋 Duplicate Group (${count} entries):`)
    console.log(`   User: ${firstUser}`)
    console.log(`   Project: ${firstProject}`)
    console.log(`   Start Time: ${new Date(kept.startTime).toISOString()}`)
    console.log(`   Duration: ${kept.duration} minutes`)
    console.log(`   Description: "${(kept.description || '').substring(0, 50)}"`)
    console.log(`   ✅ KEEPING:  ${kept._id} (created: ${new Date(kept.createdAt).toISOString()})`)
    
    for (const entry of toDelete) {
      console.log(`   ❌ ${shouldDelete ? 'DELETING' : 'WOULD DELETE'}: ${entry._id} (created: ${new Date(entry.createdAt).toISOString()})`)
      idsToDelete.push(entry._id)
    }
  }

  console.log('\n' + '─'.repeat(80))
  console.log(`\n📊 Summary:`)
  console.log(`   Total duplicate groups: ${duplicateGroups.length}`)
  console.log(`   Total entries in groups: ${totalDuplicates}`)
  console.log(`   Entries to keep: ${duplicateGroups.length}`)
  console.log(`   Entries to delete: ${totalToDelete}`)

  if (shouldDelete && idsToDelete.length > 0) {
    console.log(`\n🔴 Deleting ${idsToDelete.length} duplicate entries...`)
    
    const result = await collection.deleteMany({
      _id: { $in: idsToDelete }
    })

    console.log(`✅ Deleted ${result.deletedCount} duplicate entries.`)
  } else if (idsToDelete.length > 0) {
    console.log(`\n🟡 DRY RUN: No entries were deleted.`)
    console.log(`   Run with --delete flag to actually remove duplicates:`)
    console.log(`   node scripts/cleanup-duplicate-time-entries.js --delete`)
  }

  await mongoose.disconnect()
  console.log('\n✅ Done. Disconnected from MongoDB.')
}

main().catch((err) => {
  console.error('Script failed:', err)
  process.exit(1)
})
