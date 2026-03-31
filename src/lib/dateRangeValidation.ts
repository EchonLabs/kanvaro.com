export interface CorrectedDateRange {
  from?: Date
  to?: Date
}

export interface DateRangeStringRange {
  startDate: string
  endDate: string
}

export const validateAndCorrectDateRange = (
  from?: Date,
  to?: Date
): CorrectedDateRange => {
  // If either date is missing, return as-is
  if (!from || !to) {
    return { from, to }
  }

  // Normalize dates to start of day for comparison
  const startDate = new Date(from)
  startDate.setHours(0, 0, 0, 0)

  const endDate = new Date(to)
  endDate.setHours(0, 0, 0, 0)

  // If end date is before start date, set both to start date
  if (endDate < startDate) {
    return { from: startDate, to: startDate }
  }

  return { from, to }
}

export const validateAndCorrectDateRangeStrings = (
  startDate?: string,
  endDate?: string
): DateRangeStringRange => {
  // If either date is missing, return as-is
  if (!startDate || !endDate) {
    return { startDate: startDate || '', endDate: endDate || '' }
  }

  const start = new Date(startDate)
  const end = new Date(endDate)

  // Validate date parsing
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { startDate, endDate }
  }

  // Normalize to start of day
  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)

  // If end date is before start date, set both to start date
  if (end < start) {
    return { startDate, endDate: startDate }
  }

  return { startDate, endDate }
}
export const isValidDateRange = (from?: Date, to?: Date): boolean => {
  if (!from || !to) return true

  const startDate = new Date(from)
  startDate.setHours(0, 0, 0, 0)

  const endDate = new Date(to)
  endDate.setHours(0, 0, 0, 0)

  return endDate >= startDate
}
export const isValidDateRangeStrings = (
  startDate?: string,
  endDate?: string
): boolean => {
  if (!startDate || !endDate) return true

  const start = new Date(startDate)
  const end = new Date(endDate)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return true

  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)

  return end >= start
}
