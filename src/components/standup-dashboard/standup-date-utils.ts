const STANDUP_TIME_ZONE = 'Asia/Colombo'

const formatDateKeyInStandupTimeZone = (value: Date): string | null => {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: STANDUP_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })

    const parts = formatter.formatToParts(value)
    const year = parts.find((part) => part.type === 'year')?.value
    const month = parts.find((part) => part.type === 'month')?.value
    const day = parts.find((part) => part.type === 'day')?.value

    if (!year || !month || !day) return null

    return `${year}-${month}-${day}`
  } catch {
    return null
  }
}

export const getStandupDateKey = (value?: string | Date | null): string | null => {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return formatDateKeyInStandupTimeZone(date)
}

export const getLocalStandupDateKey = (value?: string | Date | null): string | null => {
  return getStandupDateKey(value)
}

export const getStandupDayBounds = (value?: string | Date | null) => {
  const dateKey = getStandupDateKey(value)
  if (!dateKey) return null

  const [year, month, day] = dateKey.split('-').map((part) => Number(part))
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - 330 * 60 * 1000)

  return {
    dateKey,
    start,
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1)
  }
}
