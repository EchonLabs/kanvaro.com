import type { Minutes } from './minutes'

export interface BlockerFieldsInput {
  description: string
  targetResolutionDate?: string // ISO date
}

export type BlockerFieldValidation =
  | { valid: true }
  | { valid: false; message: string }

/** RUN-14. */
export function validateBlockerFields(input: BlockerFieldsInput): BlockerFieldValidation {
  if (input.description.trim().length < 10) {
    return { valid: false, message: 'A blocker description needs at least 10 characters.' }
  }
  return { valid: true }
}

/** RUN-15's "2h freed by blocker BLK-14" attribution line. */
export function freedCapacityMessage(freedMinutes: Minutes, blockerLabel: string): string {
  const hours = (freedMinutes / 60).toFixed(1)
  return `${hours}h freed by blocker ${blockerLabel}`
}

/** RUN-18. */
export function isOverdue(targetResolutionDate: string | undefined, today: string): boolean {
  if (!targetResolutionDate) return false
  return targetResolutionDate < today
}
