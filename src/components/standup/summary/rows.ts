import { minutes as toMinutes, type Minutes } from '@/lib/standup/minutes'

import type { LooseRow } from './types'

/**
 * How this screen reads the sections the schema stores as `Mixed` (variance,
 * debt, blockers, carry-forward, overrides — see `StandupSummary.ts`).
 *
 * Mirrors `summary-service.ts`'s own `field` helper so the screen and the
 * markdown export never disagree about what a missing field renders as. Both
 * are deliberately tolerant rather than strict: these are historical
 * documents, and one written under an older shape should render what it has
 * instead of blanking the section.
 */
export function field(row: LooseRow, key: string): string | undefined {
  const value = row[key]
  if (value === undefined || value === null) return undefined
  const text = String(value)
  return text.length > 0 ? text : undefined
}

/**
 * A tolerant `Minutes` cast for this screen only. The rows are historical
 * records, not values this page computed, so this rounds and defaults to zero
 * rather than throwing the way `minutes()` does for live arithmetic.
 */
export function asMinutes(value: unknown): Minutes {
  const n = typeof value === 'number' ? value : Number(value)
  return toMinutes(Number.isFinite(n) ? Math.round(n) : 0)
}
