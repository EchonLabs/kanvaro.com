export interface SprintDateValidationResult {
  isValid: boolean
  startError: string
  endError: string
}

interface ValidateSprintDatesParams {
  startDate?: string
  endDate?: string
  projectStart?: string | Date | null
  projectEnd?: string | Date | null
  requireBoth?: boolean
}

const normalizeDate = (value?: string | Date | null) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(0, 0, 0, 0)
  return date
}

export const validateSprintDates = ({
  startDate,
  endDate,
  projectStart,
  projectEnd,
  requireBoth = false
}: ValidateSprintDatesParams): SprintDateValidationResult => {
  let startError = ''
  let endError = ''

  const start = normalizeDate(startDate)
  const end = normalizeDate(endDate)
  const projectStartDate = normalizeDate(projectStart)
  const projectEndDate = normalizeDate(projectEnd)
  const today = normalizeDate(new Date())

  // Require at least a project start date; end date is optional
  if (!projectStartDate) {
    const msg = 'Select a project that has a start date.'
    startError = msg
    endError = msg
    return { isValid: false, startError, endError }
  }

  // Missing dates handling
  if (!start && requireBoth) {
    startError = 'Enter a sprint start date.'
  }
  if (!end && requireBoth) {
    endError = 'Enter a sprint end date.'
  }
  if (!start || !end) {
    return { isValid: !startError && !endError, startError, endError }
  }

  // Start date checks
  if (today && start < today) {
    startError = 'Start date cannot be in the past.'
  } else if (start < projectStartDate) {
    startError = `Start date must be on or after the project start (${projectStartDate.toLocaleDateString()}).`
  } else if (projectEndDate && start > projectEndDate) {
    startError = `Start date must be on or before the project end (${projectEndDate.toLocaleDateString()}).`
  }

  // End date checks
  if (today && end < today) {
    endError = 'End date cannot be in the past.'
  } else if (end < projectStartDate) {
    endError = `End date must be on or after the project start (${projectStartDate.toLocaleDateString()}).`
  } else if (projectEndDate && end > projectEndDate) {
    endError = `End date must be on or before the project end (${projectEndDate.toLocaleDateString()}).`
  } else if (end <= start) {
    endError = 'End date must be after the start date.'
  }

  const isValid = !startError && !endError
  return { isValid, startError, endError }
}


