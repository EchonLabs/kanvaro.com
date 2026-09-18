/**
 * The planning screen's step gates (UI-6).
 *
 * Pure, so this is a table rather than a rendered component: the rule that
 * decides whether a poker round may open is worth proving on its own, and
 * driving it through a 1000-line workspace would prove mostly that the
 * workspace renders.
 *
 * The one rule these tests exist to protect: the gates read the *server's*
 * checklist. A second client-side implementation of PC-8 could only drift from
 * the one `completePlanning` enforces, and the drift would appear as a button
 * that looks enabled and then fails.
 */
import {
  completeGate,
  pokerGate,
  stepStates,
  type GateInput
} from '../planning/gates'
import { type ChecklistItemView } from '../PlanningChecklist'

const check = (
  checkId: string,
  passed: boolean,
  message?: string
): ChecklistItemView => ({
  checkId,
  kind: 'mandatory',
  passed,
  ...(message ? { message } : {})
})

/** Everything green: a session open, scope committed, work left to estimate. */
const input = (partial: Partial<GateInput> = {}): GateInput => ({
  hasSession: true,
  scopeCount: 3,
  items: [check('PC-3', true), check('PC-8', true), check('PC-9', true)],
  blockers: [],
  unpokeredCount: 3,
  ...partial
})

describe('pokerGate', () => {
  it('opens once every task has an owner and something is left to estimate', () => {
    const gate = pokerGate(input())

    expect(gate.enabled).toBe(true)
    expect(gate.reason).toMatch(/ready to estimate/i)
  })

  it('asks for a planning session first', () => {
    expect(pokerGate(input({ hasSession: false }))).toMatchObject({
      enabled: false,
      reason: expect.stringMatching(/planning session/i)
    })
  })

  it('asks for scope before assignment', () => {
    // Ordered ahead of PC-8 deliberately: "0 tasks have no assignee" is true
    // and useless, and the actual next action is to pull work in.
    expect(pokerGate(input({ scopeCount: 0 }))).toMatchObject({
      enabled: false,
      reason: expect.stringMatching(/add at least one task/i)
    })
  })

  it("blocks on PC-8 and repeats the server's own wording", () => {
    const message = '2 tasks have no assignee. Assign every task before running planning poker.'
    const gate = pokerGate(
      input({ items: [check('PC-8', false, message)] })
    )

    expect(gate.enabled).toBe(false)
    expect(gate.reason).toBe(message)
  })

  it('says there is nothing left to estimate rather than opening an empty round', () => {
    expect(pokerGate(input({ unpokeredCount: 0 }))).toMatchObject({
      enabled: false,
      reason: expect.stringMatching(/already been through planning poker/i)
    })
  })

  it('does not block when the server has not sent PC-8 at all', () => {
    // An absent check is not a failure: the checklist request may simply not
    // have landed yet, and freezing the screen on a missing field would be a
    // gate nobody could pass.
    expect(pokerGate(input({ items: [] })).enabled).toBe(true)
  })
})

describe('completeGate', () => {
  it('opens when nothing is blocking', () => {
    expect(completeGate(input())).toMatchObject({ enabled: true })
  })

  it('names the first blocker, not a count', () => {
    const gate = completeGate(
      input({
        blockers: [
          check('PC-3', false, '3 tasks have no estimate.'),
          check('PC-9', false, '1 task has not been through planning poker.')
        ]
      })
    )

    expect(gate.enabled).toBe(false)
    expect(gate.reason).toBe('PC-3: 3 tasks have no estimate.')
  })

  it('asks for a session before anything else', () => {
    expect(completeGate(input({ hasSession: false, blockers: [check('PC-1', false)] })))
      .toMatchObject({ enabled: false, reason: expect.stringMatching(/planning session/i) })
  })
})

describe('stepStates', () => {
  it('marks exactly one step current', () => {
    const states = stepStates(input({ items: [check('PC-8', false)] }))

    expect(Object.values(states).filter((state) => state === 'current')).toHaveLength(1)
  })

  it('walks the rail forward as each check passes', () => {
    expect(stepStates(input({ hasSession: false }))).toMatchObject({
      scope: 'current',
      assign: 'locked',
      estimate: 'locked',
      complete: 'locked'
    })

    expect(stepStates(input({ items: [check('PC-8', false)] }))).toMatchObject({
      scope: 'done',
      assign: 'current',
      estimate: 'locked'
    })

    expect(
      stepStates(input({ items: [check('PC-8', true), check('PC-3', false), check('PC-9', false)] }))
    ).toMatchObject({ assign: 'done', estimate: 'current', complete: 'locked' })

    expect(stepStates(input())).toMatchObject({
      scope: 'done',
      assign: 'done',
      estimate: 'done',
      complete: 'done'
    })
  })

  it('holds Complete open while any check still blocks', () => {
    const states = stepStates(input({ blockers: [check('PC-1', false)] }))

    expect(states.estimate).toBe('done')
    expect(states.complete).toBe('current')
  })
})
