#!/usr/bin/env node
/**
 * Seeds holiday calendars from the CSVs in `scripts/seed-data/holidays/`.
 *
 *   npm run seed:holidays                    every CSV, into the only organisation
 *   npm run seed:holidays -- --org <id>      pick the organisation explicitly
 *   npm run seed:holidays -- --file sri-lanka-2026.csv
 *   npm run seed:holidays -- --dry-run
 *
 * Idempotent: re-running adds only holidays that are not already present, keyed
 * on (set, date, name) exactly as the unique index is. That matters because the
 * natural way to use this is to re-run it each time a new year's gazette is
 * added to the folder.
 *
 * Set names are derived from the file name — `sri-lanka-2026.csv` and
 * `sri-lanka-2027.csv` both load into "Sri Lanka Public Holidays", because a
 * holiday *set* is perpetual and topped up per year (see the README in the data
 * folder). One set per country, not one per year.
 */
const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')

const DATA_DIR = path.join(__dirname, 'seed-data', 'holidays')

const args = process.argv.slice(2)
const flag = (name) => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? undefined : args[index + 1]
}
const has = (name) => args.includes(`--${name}`)

const DRY_RUN = has('dry-run')

/** `sri-lanka-2026.csv` → `Sri Lanka Public Holidays`, `LK`. */
const COUNTRY_SETS = {
  'sri-lanka': { name: 'Sri Lanka Public Holidays', countryCode: 'LK' }
}

function setForFile(fileName) {
  const stem = path.basename(fileName, '.csv')
  const country = stem.replace(/-\d{4}$/, '')
  return (
    COUNTRY_SETS[country] ?? {
      name: `${country.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} Holidays`,
      countryCode: undefined
    }
  )
}

/**
 * Minimal CSV reader for the seed format.
 *
 * The application path uses `parseHolidayCsv`, which is stricter and reports
 * failing row numbers per CAL-10. This script cannot import that TypeScript
 * module from plain Node, so it re-reads the same format and fails loudly on
 * anything unexpected rather than guessing.
 */
function parseCsv(text) {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')

  const header = lines[0].split(',').map((column) => column.trim())
  const expected = ['name', 'date', 'type', 'isFullDay', 'hoursIfPartial']
  if (expected.some((column, index) => header[index] !== column)) {
    throw new Error(`Unexpected header. Expected: ${expected.join(',')}`)
  }

  return lines.slice(1).map((line, index) => {
    const cells = splitCsvLine(line)
    const [name, date, type, isFullDay, hoursIfPartial] = cells

    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) {
      throw new Error(`Row ${index + 2}: name and an ISO date are required (got "${line}")`)
    }
    if (!['public', 'company', 'optional'].includes(type)) {
      throw new Error(`Row ${index + 2}: unknown type "${type}"`)
    }

    const fullDay = isFullDay === '' || isFullDay === undefined ? true : isFullDay === 'true'

    return {
      name,
      date,
      type,
      isFullDay: fullDay,
      // Hours are the human-facing unit in the CSV; minutes are the contract
      // everywhere inside the module (DAT-2).
      minutesIfPartial: fullDay ? undefined : Math.round(Number(hoursIfPartial) * 60)
    }
  })
}

/** Handles quoted fields containing commas and escaped quotes. */
function splitCsvLine(line) {
  const cells = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (inQuotes) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else if (char === '"') {
        inQuotes = false
      } else {
        current += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current.trim())
  return cells
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/kanvaro'
  await mongoose.connect(uri)
  console.log(`Connected to ${uri.replace(/\/\/[^@]*@/, '//***@')}`)

  const db = mongoose.connection.db

  // Resolve the organisation without loading the app's models: this script runs
  // outside Next, so it talks to collections directly.
  let organizationId = flag('org')
  if (!organizationId) {
    const organizations = await db.collection('organizations').find({}).limit(2).toArray()
    if (organizations.length === 0) {
      throw new Error('No organisation exists yet. Run the setup wizard first.')
    }
    if (organizations.length > 1) {
      throw new Error('More than one organisation exists. Pass --org <id> to choose.')
    }
    organizationId = organizations[0]._id
    console.log(`Using organisation ${organizations[0].name ?? organizationId}`)
  } else {
    organizationId = new mongoose.Types.ObjectId(organizationId)
  }

  const only = flag('file')
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((file) => file.endsWith('.csv'))
    .filter((file) => !only || file === only)
    .sort()

  if (files.length === 0) {
    throw new Error(only ? `No such file: ${only}` : `No CSV files in ${DATA_DIR}`)
  }

  let totalInserted = 0
  let totalSkipped = 0

  for (const file of files) {
    const rows = parseCsv(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'))
    const descriptor = setForFile(file)

    let set = await db.collection('holidaysets').findOne({
      organization: organizationId,
      name: descriptor.name
    })

    if (!set) {
      if (DRY_RUN) {
        console.log(`[dry run] would create holiday set "${descriptor.name}"`)
        set = { _id: null }
      } else {
        const result = await db.collection('holidaysets').insertOne({
          organization: organizationId,
          name: descriptor.name,
          countryCode: descriptor.countryCode,
          description: 'Seeded from scripts/seed-data/holidays',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        set = { _id: result.insertedId }
        console.log(`Created holiday set "${descriptor.name}"`)
      }
    }

    let inserted = 0
    let skipped = 0

    for (const row of rows) {
      const existing = set._id
        ? await db
            .collection('holidays')
            .findOne({ holidaySet: set._id, date: row.date, name: row.name })
        : null

      if (existing) {
        skipped += 1
        continue
      }

      if (!DRY_RUN) {
        await db.collection('holidays').insertOne({
          holidaySet: set._id,
          organization: organizationId,
          name: row.name,
          date: row.date,
          type: row.type,
          isFullDay: row.isFullDay,
          ...(row.minutesIfPartial === undefined
            ? {}
            : { minutesIfPartial: row.minutesIfPartial }),
          createdAt: new Date(),
          updatedAt: new Date()
        })
      }
      inserted += 1
    }

    console.log(
      `${file}: ${inserted} added, ${skipped} already present → "${descriptor.name}"`
    )
    totalInserted += inserted
    totalSkipped += skipped
  }

  console.log(
    `\n${DRY_RUN ? '[dry run] ' : ''}Done. ${totalInserted} holidays added, ${totalSkipped} unchanged.`
  )
  if (!DRY_RUN && totalInserted > 0) {
    console.log('Subscribe a project to the set in Project Settings → Stand-ups → Working Calendar.')
  }
}

main()
  .catch((error) => {
    console.error(`\nFailed: ${error.message}`)
    process.exitCode = 1
  })
  .finally(() => mongoose.disconnect())
