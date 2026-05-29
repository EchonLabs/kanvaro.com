export const getStandupDateKey = (value?: string | Date | null): string | null => {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return date.toISOString().slice(0, 10)
}

export const getLocalStandupDateKey = (value?: string | Date | null): string | null => {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export const getStandupDayBounds = (value?: string | Date | null) => {
  const dateKey = getStandupDateKey(value)
  if (!dateKey) return null

  return {
    dateKey,
    start: new Date(`${dateKey}T00:00:00.000Z`),
    end: new Date(`${dateKey}T23:59:59.999Z`)
  }
}
