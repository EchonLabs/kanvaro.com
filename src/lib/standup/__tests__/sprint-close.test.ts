import {
  computeProjectedOutcome,
  evaluateTaskDispositions,
  evaluateFinalDayCarryForwardDisposition,
  type OpenTaskReadiness,
  type CarryForwardDispositionRow
} from '../sprint-close'
import { minutes, ZERO_MINUTES } from '../minutes'

describe('computeProjectedOutcome', () => {
  it('is will_finish when remaining fits inside today', () => {
    expect(
      computeProjectedOutcome({
        remainingEstimateMinutes: minutes(120),
        hoursAvailableTodayMinutes: minutes(240)
      })
    ).toBe('will_finish')
  })

  it('is at_risk when remaining exceeds today but is within double', () => {
    expect(
      computeProjectedOutcome({
        remainingEstimateMinutes: minutes(300),
        hoursAvailableTodayMinutes: minutes(240)
      })
    ).toBe('at_risk')
  })

  it('is cannot_finish when remaining is more than double what is left today', () => {
    expect(
      computeProjectedOutcome({
        remainingEstimateMinutes: minutes(600),
        hoursAvailableTodayMinutes: minutes(240)
      })
    ).toBe('cannot_finish')
  })

  it('is cannot_finish when nothing is available today and work remains', () => {
    expect(
      computeProjectedOutcome({
        remainingEstimateMinutes: minutes(60),
        hoursAvailableTodayMinutes: ZERO_MINUTES
      })
    ).toBe('cannot_finish')
  })

  it('is will_finish when nothing remains regardless of hours today', () => {
    expect(
      computeProjectedOutcome({
        remainingEstimateMinutes: ZERO_MINUTES,
        hoursAvailableTodayMinutes: ZERO_MINUTES
      })
    ).toBe('will_finish')
  })
})

describe('evaluateTaskDispositions', () => {
  const base: OpenTaskReadiness = {
    taskId: 't1',
    taskKey: 'KAN-1',
    remainingEstimateMinutes: minutes(60),
    hoursAvailableTodayMinutes: minutes(60),
    projectedOutcome: 'will_finish'
  }

  it('flags every open task with no disposition', () => {
    const result = evaluateTaskDispositions([base, { ...base, taskId: 't2', disposition: 'descope' }])
    expect(result.offenders.map((t) => t.taskId)).toEqual(['t1'])
  })

  it('passes when every task has a disposition', () => {
    const result = evaluateTaskDispositions([{ ...base, disposition: 'finish_today' }])
    expect(result.offenders).toEqual([])
  })

  it('passes trivially on an empty sprint', () => {
    expect(evaluateTaskDispositions([]).offenders).toEqual([])
  })
})

describe('evaluateFinalDayCarryForwardDisposition', () => {
  const base: CarryForwardDispositionRow = {
    itemId: 'c1',
    taskKey: 'KAN-1',
    status: 'open',
    hasResolution: false
  }

  it('flags an open item with no resolution', () => {
    const result = evaluateFinalDayCarryForwardDisposition([base])
    expect(result.offenders.map((i) => i.itemId)).toEqual(['c1'])
  })

  it('does not flag a resolved item even if status has not caught up yet', () => {
    const result = evaluateFinalDayCarryForwardDisposition([{ ...base, hasResolution: true }])
    expect(result.offenders).toEqual([])
  })

  it('does not flag an item already closed', () => {
    const result = evaluateFinalDayCarryForwardDisposition([
      { ...base, status: 'closed_descoped', hasResolution: false }
    ])
    expect(result.offenders).toEqual([])
  })
})
