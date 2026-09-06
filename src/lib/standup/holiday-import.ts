/**
 * Bulk holiday import (spec CAL-10).
 *
 * The contract is deliberately unforgiving: **the whole file is rejected if any
 * row fails validation**, and the failing row numbers are reported. A partial
 * import would leave a calendar that looks loaded but silently misses dates, and
 * a missing public holiday means a stand-up that should never have existed.
 *
 * The CSV is a human interface, so it speaks hours (`hoursIfPartial`) while
 * everything downstream is integer minutes. That conversion happens here, at the
 * boundary, exactly once.
 */
import { hoursToMinutes } from './minutes'
import { isIsoDate, type IsoDate } from './calendar-dates'
import { HOLIDAY_TYPES, type HolidayType } from '@/models/Holiday'

export const HOLIDAY_CSV_COLUMNS = [
  'name',
  'date',
  'type',
  'isFullDay',
  'hoursIfPartial'
] as const

export interface ParsedHolidayRow {
  /** 1-based row number in the file, counting the header as row 1. */
  rowNumber: number
  name: string
  date: IsoDate
  type: HolidayType
  isFullDay: boolean
  minutesIfPartial?: number
}

export interface HolidayImportError {
  /** 1-based row number, matching what the user sees in a spreadsheet. */
  row: number
  reason: string
}

export type HolidayImportResult =
  | { ok: true; rows: ParsedHolidayRow[] }
  | { ok: false; errors: HolidayImportError[] }

/**
 * Parses and validates a holiday CSV.
 *
 * Returns every error found rather than stopping at the first, so a user fixing
 * a gazette paste gets the whole list in one pass instead of one per attempt.
 */
export function parseHolidayCsv(csv: string): HolidayImportResult {
  const lines = splitLines(csv)

  if (lines.length === 0) {
    return { ok: false, errors: [{ row: 1, reason: 'The file is empty.' }] }
  }

  const header = parseCsvLine(lines[0]).map((cell) => cell.trim())
  const headerError = validateHeader(header)
  if (headerError) {
    return { ok: false, errors: [{ row: 1, reason: headerError }] }
  }

  const errors: HolidayImportError[] = []
  const rows: ParsedHolidayRow[] = []
  const seen = new Set<string>()

  for (let index = 1; index < lines.length; index += 1) {
    const rowNumber = index + 1
    const raw = lines[index]
    if (raw.trim() === '') continue

    const cells = parseCsvLine(raw)
    const record = Object.fromEntries(
      HOLIDAY_CSV_COLUMNS.map((column, columnIndex) => [column, (cells[columnIndex] ?? '').trim()])
    ) as Record<(typeof HOLIDAY_CSV_COLUMNS)[number], string>

    const rowErrors: string[] = []

    if (!record.name) {
      rowErrors.push('name is required')
    } else if (record.name.length > 200) {
      rowErrors.push('name must be 200 characters or fewer')
    }

    if (!record.date) {
      rowErrors.push('date is required')
    } else if (!isIsoDate(record.date)) {
      rowErrors.push(`date "${record.date}" is not a valid ISO date (YYYY-MM-DD)`)
    }

    const type = (record.type || 'public').toLowerCase() as HolidayType
    if (!HOLIDAY_TYPES.includes(type)) {
      rowErrors.push(`type "${record.type}" must be one of ${HOLIDAY_TYPES.join(', ')}`)
    }

    const isFullDay = parseBoolean(record.isFullDay)
    if (isFullDay === undefined) {
      rowErrors.push(`isFullDay "${record.isFullDay}" must be true or false`)
    }

    let minutesIfPartial: number | undefined
    if (isFullDay === false) {
      if (!record.hoursIfPartial) {
        rowErrors.push('hoursIfPartial is required when isFullDay is false')
      } else {
        const hours = Number(record.hoursIfPartial)
        if (!Number.isFinite(hours) || hours <= 0) {
          rowErrors.push(`hoursIfPartial "${record.hoursIfPartial}" must be a positive number`)
        } else {
          minutesIfPartial = hoursToMinutes(hours)
        }
      }
    }

    // A date may legitimately carry two holidays — in 2026 Sri Lanka, 1 May is
    // both May Day and Vesak Poya — so only an identical name+date is a dupe.
    const key = `${record.date}::${record.name.toLowerCase()}`
    if (seen.has(key)) {
      rowErrors.push(`duplicate of an earlier row for ${record.name} on ${record.date}`)
    }
    seen.add(key)

    if (rowErrors.length > 0) {
      errors.push({ row: rowNumber, reason: rowErrors.join('; ') })
      continue
    }

    rows.push({
      rowNumber,
      name: record.name,
      date: record.date,
      type,
      isFullDay: isFullDay as boolean,
      minutesIfPartial
    })
  }

  if (errors.length > 0) return { ok: false, errors }

  if (rows.length === 0) {
    return { ok: false, errors: [{ row: 1, reason: 'The file contains no holiday rows.' }] }
  }

  return { ok: true, rows }
}

/** Human summary of a rejected import, for the error toast. */
export function describeImportFailure(errors: HolidayImportError[]): string {
  const rowList = errors.map((error) => error.row).join(', ')
  return `Nothing was imported. ${errors.length} row${errors.length === 1 ? '' : 's'} failed validation (row${errors.length === 1 ? '' : 's'} ${rowList}).`
}

function validateHeader(header: string[]): string | null {
  const expected = HOLIDAY_CSV_COLUMNS.join(',')
  const actual = header.join(',')
  if (actual !== expected) {
    return `The header row must be exactly "${expected}", received "${actual}".`
  }
  return null
}

function splitLines(csv: string): string[] {
  return csv
    .replace(/^﻿/, '') // strip a BOM from spreadsheet exports
    .split(/\r\n|\n|\r/)
    .filter((line, index, all) => !(index === all.length - 1 && line.trim() === ''))
}

/**
 * Minimal RFC 4180 field splitter: handles quoted fields and escaped quotes,
 * which matter because holiday names can contain commas.
 */
function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]

    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      cells.push(current)
      current = ''
    } else {
      current += char
    }
  }

  cells.push(current)
  return cells
}

function parseBoolean(value: string): boolean | undefined {
  const normalised = value.trim().toLowerCase()
  if (normalised === '' || normalised === 'true' || normalised === 'yes' || normalised === '1') {
    // Empty defaults to a full day, which is what the vast majority of rows are.
    return true
  }
  if (normalised === 'false' || normalised === 'no' || normalised === '0') return false
  return undefined
}
