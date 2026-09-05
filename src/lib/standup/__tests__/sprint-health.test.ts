import { computeSprintHealth } from '../sprint-health'

it('reports no overage when remaining estimate fits remaining capacity', () => {
  const result = computeSprintHealth({ remainingEstimateMinutes: 100 as any, remainingCapacityMinutes: 200 as any })
  expect(result.exceedsCapacity).toBe(false)
  expect(result.overageMinutes).toBe(0)
})

it('reports the overage when remaining estimate exceeds remaining capacity', () => {
  const result = computeSprintHealth({ remainingEstimateMinutes: 300 as any, remainingCapacityMinutes: 200 as any })
  expect(result.exceedsCapacity).toBe(true)
  expect(result.overageMinutes).toBe(100)
})

it('treats an exact match as not exceeding', () => {
  const result = computeSprintHealth({ remainingEstimateMinutes: 200 as any, remainingCapacityMinutes: 200 as any })
  expect(result.exceedsCapacity).toBe(false)
})
