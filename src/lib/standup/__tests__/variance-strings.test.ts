/**
 * The plain-language variance copy (Phase 8, Task 14 — §15.8.5, VAR-10..14).
 *
 * §15.8.5 states that this copy "is a requirement, not decoration": the
 * sentence is what turns a row of numbers into a PM understanding *why* two
 * hours are missing. §12.3 fixes the exact wording of two of them, and those
 * two are asserted character for character — a paraphrase is a spec deviation
 * here, not a style choice.
 *
 * Two other properties are enforced by test rather than by review, because
 * they are the ones that quietly rot: no sentence may render a surplus as
 * negative debt (VAR-6, E42), and nothing member-facing may carry blame
 * (VAR-10, NFR-14).
 */
import { VARIANCE_OUTCOMES } from '@/models/AllocationVariance'

import { hoursToMinutes, type Minutes } from '../minutes'
import { standupStrings } from '../strings'

const h = (hours: number): Minutes => hoursToMinutes(hours)

const camel = (outcome: string) =>
  outcome.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase())

describe('the §12.3 sentences, verbatim', () => {
  it('renders the KAN-214 sentence exactly as §12.3 specifies', () => {
    expect(
      standupStrings.variance.openOverConsumed({
        planned: h(6),
        logged: h(8),
        over: h(2),
        totalOnTask: h(8),
        estimate: h(6),
        taskOver: h(2)
      })
    ).toBe(
      'Planned 6.0h, logged 8.0h, over by 2.0h. Still in progress. Total on task 8.0h against a ' +
        '6.0h estimate, task is 2.0h over estimate. Revised remaining estimate required.'
    )
  })

  it('renders the KAN-231 sentence exactly as §12.3 specifies', () => {
    expect(standupStrings.variance.notStarted({ planned: h(2) })).toBe(
      'Planned 2.0h, logged 0.0h, not started. 2.0h of planned work did not happen. Reason required.'
    )
  })

  it('renders the reduce-policy capacity sentence exactly as AC-16 specifies', () => {
    expect(
      standupStrings.variance.capacityReduced({ nominal: h(8), effective: h(6), debt: h(2) })
    ).toBe('Capacity 8.0h reduced to 6.0h by 2.0h of estimate debt.')
  })

  it('renders the absorb-policy banner exactly as §12.3 specifies', () => {
    expect(standupStrings.variance.debtBanner({ minutes: h(2) })).toBe(
      'Carrying 2.0h of estimate debt. Today’s plan assumes estimates hold. If they do not, this debt grows.'
    )
  })
})

describe('coverage of the twelve outcomes', () => {
  it('has an entry for every one of the twelve outcomes', () => {
    for (const outcome of VARIANCE_OUTCOMES) {
      const entry = (standupStrings.variance as Record<string, unknown>)[camel(outcome)]
      expect(typeof entry).toBe('function')
    }
  })

  it('names the hours in every outcome sentence that has them', () => {
    const rendered = [
      standupStrings.variance.deliveredUnder({ planned: h(6), logged: h(4), under: h(2) }),
      standupStrings.variance.deliveredOnEstimate({ planned: h(6), logged: h(6) }),
      standupStrings.variance.deliveredOver({ planned: h(6), logged: h(8), over: h(2) }),
      standupStrings.variance.openUnderConsumed({ planned: h(6), logged: h(3), under: h(3) }),
      standupStrings.variance.openFullyConsumed({ planned: h(6), logged: h(6) })
    ]
    for (const sentence of rendered) {
      expect(sentence).toMatch(/\d\.\dh/)
      expect(sentence.endsWith('.')).toBe(true)
    }
  })

  it('says what the PM has to do on the two rows that block completion', () => {
    expect(
      standupStrings.variance.openOverConsumed({
        planned: h(6),
        logged: h(8),
        over: h(2),
        totalOnTask: h(8),
        estimate: h(6),
        taskOver: h(2)
      })
    ).toMatch(/Revised remaining estimate required/)
    expect(standupStrings.variance.notStarted({ planned: h(2) })).toMatch(/Reason required/)
  })
})

describe('surplus and debt language (VAR-6, VAR-10, E42, NFR-14)', () => {
  it('never phrases a surplus as negative debt', () => {
    const copy = standupStrings.variance.surplus({ minutes: h(2) })
    expect(copy).toBe('Ahead of estimate by 2.0h.')
    expect(copy).not.toMatch(/-|negative|debt/)
  })

  it('uses neutral member-facing language', () => {
    const copy = standupStrings.variance.memberFacingDebt({ minutes: h(2) })
    expect(copy).toBe(
      'You are 2.0 hours over estimate on this sprint’s completed and in-flight work.'
    )
    expect(copy).not.toMatch(/behind|failed|late|owe|fault|should have/i)
  })

  it('states the not-recoverable case without blaming anybody (E43)', () => {
    const copy = standupStrings.variance.notRecoverable()
    expect(copy).toMatch(/descoping or writing debt off/)
    expect(copy).not.toMatch(/behind|failed|fault/i)
  })

  it('counts the chain length on a chronic spill (VAR-14)', () => {
    expect(standupStrings.variance.chronicSpill({ chainLength: 5 })).toBe(
      'Spilled across 5 stand-ups.'
    )
  })
})

describe('the yesterday panel copy (RUN-9, RUN-13, E39)', () => {
  it('names the four buckets in the RUN-9 order', () => {
    expect([
      standupStrings.yesterday.bucketCompleted(),
      standupStrings.yesterday.bucketInProgress(),
      standupStrings.yesterday.bucketNotStarted(),
      standupStrings.yesterday.bucketBlocked()
    ]).toEqual(['Completed since last stand-up', 'In progress', 'Not started', 'Blocked'])
  })

  it('explains a stand-up with no yesterday rather than rendering an empty panel', () => {
    expect(standupStrings.yesterday.noPreviousStandup()).toMatch(/first stand-up/i)
  })

  it('pluralises the age badge', () => {
    expect(standupStrings.yesterday.ageBadge({ standups: 1 })).toBe('Open across 1 stand-up')
    expect(standupStrings.yesterday.ageBadge({ standups: 3 })).toBe('Open across 3 stand-ups')
  })

  it('carries the unplanned badge and the bulk action', () => {
    expect(standupStrings.yesterday.unplannedBadge()).toBe('Unplanned')
    expect(standupStrings.yesterday.markAllConfirmed()).toBe('Mark all confirmed')
  })
})

describe('the debt ledger copy (VAR-8)', () => {
  it('states the twenty-character floor on a write-off justification', () => {
    expect(standupStrings.debt.writeOffReasonTooShort({ minLength: 20 })).toMatch(/20 characters/)
  })

  it('labels the ledger entry types in plain language', () => {
    expect(standupStrings.debt.entryType.accrual()).toBe('Went over estimate')
    expect(standupStrings.debt.entryType.credit()).toBe('Came in under estimate')
    expect(standupStrings.debt.entryType.settlement()).toBe('Worked off against capacity')
    expect(standupStrings.debt.entryType.writeoff()).toBe('Written off')
    expect(standupStrings.debt.entryType.carry_in()).toBe('Carried in from the previous sprint')
  })
})
