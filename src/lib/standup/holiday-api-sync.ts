/**
 * Syncs a dedicated "Sri Lanka Public Holidays (API)" set from the
 * induwara.lk public holidays API.
 *
 * This is a manual, admin-triggered refresh — not a background job. Kanvaro's
 * self-hosted Docker deployment has no external cron, and the user
 * deliberately asked for a button rather than a periodic sync, so this module
 * has no scheduling concerns at all: it is called once, synchronously, from
 * the refresh route.
 *
 * This is deliberately its own set, never merged into any manually-managed
 * one — even one that happens to share the country. An org may already have a
 * hand-seeded "Sri Lanka Public Holidays" calendar it wants to keep exactly as
 * curated (`HolidaySet` has a unique `{organization, name}` index, which is
 * also why the names must differ). The admin chooses which set is the
 * organisation's actual default via the `/holiday-sets/default` route — this
 * module never decides that on the org's behalf except once, the very first
 * time it runs, when nothing has been chosen yet at all.
 *
 * The one rule every other decision here serves: **a refresh must never
 * resurrect a holiday an admin has withdrawn.** `Holiday.status` is only ever
 * written via `$setOnInsert` in the bulk upsert below — an existing row's
 * status (active or revoked) is never touched by `$set` — so a revoked row is
 * simply left alone forever, exactly like the CSV import and manual paths
 * already treat history.
 */
import { Holiday, type HolidayType } from '@/models/Holiday'
import { HolidaySet } from '@/models/HolidaySet'
import { WorkingCalendar } from '@/models/WorkingCalendar'

import { isIsoDate } from './calendar-dates'
import { StandupError } from './errors'

const API_BASE = 'https://induwara.lk/api/v1/holidays'
/** Distinct from any hand-seeded "Sri Lanka Public Holidays" set, so the two can coexist. */
const API_SET_NAME = 'Sri Lanka Public Holidays (API)'

interface ApiHolidayRow {
  date: string
  name: string
  public?: boolean
  bank?: boolean
  mercantile?: boolean
}

interface ApiResponse {
  ok: boolean
  data?: {
    year: number
    holidays: ApiHolidayRow[]
  }
}

interface MappedRow {
  date: string
  name: string
  type: HolidayType
}

export interface ApiSyncSummary {
  setId: string
  fetched: number
  inserted: number
  updated: number
  skippedRevoked: number
  lastRefreshedAt: string
}

async function fetchYear(year: number, apiKey?: string): Promise<ApiHolidayRow[]> {
  const response = await fetch(`${API_BASE}?year=${year}`, {
    headers: apiKey ? { 'X-API-Key': apiKey } : undefined
  })

  if (!response.ok) {
    throw new Error(`induwara.lk returned ${response.status} for year ${year}`)
  }

  const body = (await response.json()) as ApiResponse
  if (!body.ok || !body.data) {
    throw new Error(`induwara.lk returned an unsuccessful response for year ${year}`)
  }

  return body.data.holidays ?? []
}

/**
 * Fetches every requested year, tolerating a single year's failure. Throws
 * only when every year failed, since a client with a stale key or a
 * temporarily unpublished year should not lose the years that did work.
 */
async function fetchAllYears(years: number[], apiKey?: string): Promise<ApiHolidayRow[]> {
  const results = await Promise.allSettled(years.map((year) => fetchYear(year, apiKey)))

  const rows: ApiHolidayRow[] = []
  const failures: string[] = []

  for (const result of results) {
    if (result.status === 'fulfilled') {
      rows.push(...result.value)
    } else {
      failures.push(result.reason instanceof Error ? result.reason.message : String(result.reason))
    }
  }

  if (rows.length === 0 && failures.length > 0) {
    throw new StandupError(
      'EXTERNAL_SERVICE_ERROR',
      `Could not reach the holiday API: ${failures.join('; ')}`
    )
  }

  return rows
}

/** Maps the API's boolean flags onto the working-day-affecting Holiday.type. */
function mapRows(rows: ApiHolidayRow[]): MappedRow[] {
  const byKey = new Map<string, MappedRow>()

  for (const row of rows) {
    if (!row.date || !row.name || !isIsoDate(row.date)) continue

    const key = `${row.date}|${row.name}`
    if (byKey.has(key)) continue

    byKey.set(key, {
      date: row.date,
      name: row.name,
      type: row.public ? 'public' : 'optional'
    })
  }

  return Array.from(byKey.values())
}

/**
 * Finds or creates the API-backed set. Never touches any other set — in
 * particular never a manually-managed one of a similar name — so this is a
 * plain find-or-create keyed on provider, not name.
 */
async function findOrCreateApiSet(organizationId: string, userId: string) {
  const existing = await HolidaySet.findOne({
    organization: organizationId,
    source: 'api',
    apiProvider: 'induwara'
  })
  if (existing) return existing

  return HolidaySet.create({
    organization: organizationId,
    name: API_SET_NAME,
    countryCode: 'LK',
    createdBy: userId,
    source: 'api',
    apiProvider: 'induwara'
  })
}

/**
 * The very first time any org-level calendar exists to configure, defaults it
 * to the freshly-created API set — this is "the default calendar" the user
 * asked for. Never touches it again once an admin has chosen anything
 * (including this same set), so a later refresh cannot silently override a
 * deliberate switch back to a manually-managed calendar.
 */
async function defaultIfNothingChosenYet(organizationId: string, setId: string): Promise<void> {
  const orgCalendar = await WorkingCalendar.findOne({
    organization: organizationId,
    scope: 'organization'
  }).select('subscribedHolidaySets')

  if (orgCalendar && (orgCalendar.subscribedHolidaySets?.length ?? 0) > 0) return

  await WorkingCalendar.updateOne(
    { organization: organizationId, scope: 'organization' },
    { $set: { subscribedHolidaySets: [setId] } },
    { upsert: true }
  )
}

export interface SyncHolidaysFromApiParams {
  organizationId: string
  userId: string
  apiKey?: string
  years: number[]
}

export async function syncHolidaysFromApi(
  params: SyncHolidaysFromApiParams
): Promise<ApiSyncSummary> {
  const rows = mapRows(await fetchAllYears(params.years, params.apiKey))

  const set = await findOrCreateApiSet(params.organizationId, params.userId)
  const setId = set._id.toString()

  let inserted = 0
  let updated = 0
  let skippedRevoked = 0

  if (rows.length > 0) {
    const existing = (await Holiday.find(
      {
        holidaySet: set._id,
        $or: rows.map((row) => ({ date: row.date, name: row.name }))
      },
      { date: 1, name: 1, status: 1 }
    ).lean()) as unknown as Array<{ date: string; name: string; status: string }>

    const revokedKeys = new Set(
      existing.filter((row) => row.status === 'revoked').map((row) => `${row.date}|${row.name}`)
    )

    const ops = rows
      .filter((row) => !revokedKeys.has(`${row.date}|${row.name}`))
      .map((row) => ({
        updateOne: {
          filter: { holidaySet: set._id, date: row.date, name: row.name },
          update: {
            $set: {
              organization: params.organizationId,
              type: row.type,
              isFullDay: true,
              createdBy: params.userId
            },
            $setOnInsert: {
              holidaySet: set._id,
              date: row.date,
              name: row.name,
              status: 'active'
            }
          },
          upsert: true
        }
      }))

    skippedRevoked = rows.length - ops.length

    if (ops.length > 0) {
      const result = await Holiday.bulkWrite(ops, { ordered: false })
      inserted = result.upsertedCount ?? 0
      updated = result.modifiedCount ?? 0
    }
  }

  await defaultIfNothingChosenYet(params.organizationId, setId)

  const lastRefreshedAt = new Date()
  // A plain field update, not a full-document `.save()` — this set may have
  // been created by an older version of this module or found alongside
  // documents this module does not otherwise touch, and a full save would
  // re-validate every path rather than just the one being changed.
  await HolidaySet.updateOne({ _id: set._id }, { $set: { lastRefreshedAt } })

  return {
    setId,
    fetched: rows.length,
    inserted,
    updated,
    skippedRevoked,
    lastRefreshedAt: lastRefreshedAt.toISOString()
  }
}
