/**
 * The planning completion checklist (spec §8.3, AC-6).
 *
 * All twelve checks, each proven to fail for its own reason and to name the
 * offending entities — UI-5 turns `offendingIds` into the inline fix list, so a
 * check that fails without them is only half implemented.
 */
import {
  evaluatePlanningChecklist,
  unacknowledgedAdvisories,
  type ChecklistInput,
  type ChecklistTaskInput
} from '../planning-checklist'

const task = (partial: Partial<ChecklistTaskInput> = {}): ChecklistTaskInput => ({
  id: partial.id ?? 'task-1',
  key: 'KAN-214',
  title: 'Invoice model',
  type: 'feature',
  priority: 'high',
  description: 'Build the invoice model end to end.',
  originalEstimateMinutes: 360,
  estimateMethod: 'poker',
  assigneeIds: ['kasun'],
  ...partial
})

/** A sprint that passes every mandatory check and every advisory one. */
function input(partial: Partial<ChecklistInput> = {}): ChecklistInput {
  return {
    sprintGoal: 'Ship the invoicing module end to end for pilot customers.',
    // 2 members × 10 days × 8h = 9600 minutes of capacity.
    members: [
      { memberId: 'kasun', name: 'Kasun', dailyCapacityMinutes: 480 },
      { memberId: 'amal', name: 'Amal', dailyCapacityMinutes: 480 }
    ],
    workingDayCount: 10,
    startDate: '2026-08-24',
    endDate: '2026-09-04',
    // 15 one-day tasks = 7200 minutes, which is 75% of the 9600 available:
    // inside capacity (PA-1), above the 70% floor (PA-2), and none of them
    // larger than a single day (PA-3).
    tasks: Array.from({ length: 15 }, (_, index) =>
      task({
        id: `task-${index}`,
        originalEstimateMinutes: 480,
        assigneeIds: [index % 2 === 0 ? 'kasun' : 'amal']
      })
    ),
    ...partial
  }
}

const item = (result: ReturnType<typeof evaluatePlanningChecklist>, checkId: string) =>
  result.items.find((entry) => entry.checkId === checkId)!

describe('a well-planned sprint', () => {
  it('passes every check and may complete', () => {
    const result = evaluatePlanningChecklist(input())

    expect(result.canComplete).toBe(true)
    expect(result.blockers).toEqual([])
    expect(result.items.every((entry) => entry.passed)).toBe(true)
  })

  it('produces exactly the twelve spec checks', () => {
    const result = evaluatePlanningChecklist(input())

    expect(result.items.map((entry) => entry.checkId)).toEqual([
      'PC-1', 'PC-2', 'PC-3', 'PC-4', 'PC-5', 'PC-6', 'PC-7',
      'PA-1', 'PA-2', 'PA-3', 'PA-4', 'PA-5', 'PA-6'
    ])
  })

  it('reports the totals the planning header shows', () => {
    const result = evaluatePlanningChecklist(input())

    expect(result.totals).toEqual({
      taskCount: 15,
      estimatedTaskCount: 15,
      totalEstimatedMinutes: 7200,
      totalCapacityMinutes: 9600,
      netCapacityMinutes: 9600
    })
  })

  it('deducts leave from net capacity', () => {
    const result = evaluatePlanningChecklist(input({ capacityAdjustmentMinutes: 960 }))
    expect(result.totals.netCapacityMinutes).toBe(8640)
  })
})

describe('PC-1 — sprint goal', () => {
  it('fails when absent', () => {
    const result = evaluatePlanningChecklist(input({ sprintGoal: undefined }))
    expect(item(result, 'PC-1').passed).toBe(false)
    expect(item(result, 'PC-1').message).toBe('Write a sprint goal before completing planning.')
  })

  it('fails a goal under 10 characters', () => {
    expect(item(evaluatePlanningChecklist(input({ sprintGoal: 'Ship it' })), 'PC-1').passed).toBe(
      false
    )
  })

  it('does not count padding as a goal', () => {
    expect(
      item(evaluatePlanningChecklist(input({ sprintGoal: '          ' })), 'PC-1').passed
    ).toBe(false)
  })
})

describe('PC-2 — the sprint has tasks', () => {
  it('fails an empty sprint', () => {
    const result = evaluatePlanningChecklist(input({ tasks: [] }))
    expect(item(result, 'PC-2').passed).toBe(false)
    expect(result.canComplete).toBe(false)
  })
})

describe('PC-3 — every task estimated', () => {
  it('AC-6 — names the specific unestimated tasks', () => {
    const result = evaluatePlanningChecklist(
      input({
        tasks: [
          task({ id: 'a' }),
          task({ id: 'b', originalEstimateMinutes: undefined }),
          task({ id: 'c', originalEstimateMinutes: 0 }),
          task({ id: 'd', originalEstimateMinutes: null })
        ]
      })
    )

    const pc3 = item(result, 'PC-3')
    expect(pc3.passed).toBe(false)
    expect(pc3.message).toBe('3 tasks have no estimate. Estimate them or remove them from the sprint.')
    expect(pc3.offendingIds).toEqual(['b', 'c', 'd'])
  })

  it('E15 — a zero estimate is not an estimate', () => {
    const result = evaluatePlanningChecklist(
      input({ tasks: [task({ id: 'a', originalEstimateMinutes: 0 })] })
    )
    expect(item(result, 'PC-3').passed).toBe(false)
  })

  it('uses the singular for one task', () => {
    const result = evaluatePlanningChecklist(
      input({ tasks: [task({ id: 'a', originalEstimateMinutes: 0 })] })
    )
    expect(item(result, 'PC-3').message).toContain('1 task has no estimate')
  })
})

describe('PC-4 — what done means', () => {
  it('fails tasks with no description', () => {
    const result = evaluatePlanningChecklist(
      input({ tasks: [task({ id: 'a', description: '' }), task({ id: 'b' })] })
    )
    expect(item(result, 'PC-4').offendingIds).toEqual(['a'])
  })

  it('fails a description under 10 characters', () => {
    const result = evaluatePlanningChecklist(
      input({ tasks: [task({ id: 'a', description: 'do it' })] })
    )
    expect(item(result, 'PC-4').passed).toBe(false)
  })
})

describe('PC-5 — type and priority', () => {
  it('fails a task missing either', () => {
    const result = evaluatePlanningChecklist(
      input({
        tasks: [
          task({ id: 'a', type: null }),
          task({ id: 'b', priority: null }),
          task({ id: 'c' })
        ]
      })
    )
    expect(item(result, 'PC-5').offendingIds).toEqual(['a', 'b'])
  })
})

describe('PC-6 — the sprint has a team', () => {
  it('fails with no members', () => {
    const result = evaluatePlanningChecklist(input({ members: [] }))
    expect(item(result, 'PC-6').passed).toBe(false)
  })
})

describe('PC-7 — a usable date range', () => {
  it('E2 — fails when the range contains no working days', () => {
    const result = evaluatePlanningChecklist(input({ workingDayCount: 0 }))
    expect(item(result, 'PC-7').passed).toBe(false)
    expect(item(result, 'PC-7').message).toBe('This sprint contains no working days.')
  })

  it('distinguishes an inverted range from an empty one', () => {
    const result = evaluatePlanningChecklist(
      input({ startDate: '2026-09-04', endDate: '2026-08-24' })
    )
    expect(item(result, 'PC-7').message).toBe(
      'The sprint start date must be on or before its end date.'
    )
  })

  it('passes a single-working-day sprint', () => {
    const result = evaluatePlanningChecklist(input({ workingDayCount: 1 }))
    expect(item(result, 'PC-7').passed).toBe(true)
  })
})

describe('PA-1 — scope over capacity', () => {
  it('E19 — states the overage in hours', () => {
    // Capacity 9600 minutes; scope 10800.
    const result = evaluatePlanningChecklist(
      input({
        tasks: [
          task({ id: 'a', originalEstimateMinutes: 5400, assigneeIds: ['kasun'] }),
          task({ id: 'b', originalEstimateMinutes: 5400, assigneeIds: ['amal'] })
        ]
      })
    )

    expect(item(result, 'PA-1').passed).toBe(false)
    expect(item(result, 'PA-1').message).toContain('20.0h over capacity')
  })

  it('never blocks completion', () => {
    const result = evaluatePlanningChecklist(
      input({ tasks: [task({ id: 'a', originalEstimateMinutes: 99999 })] })
    )
    expect(result.canComplete).toBe(true)
  })

  it('passes when scope exactly equals capacity', () => {
    const result = evaluatePlanningChecklist(
      input({
        tasks: [
          task({ id: 'a', originalEstimateMinutes: 4800, assigneeIds: ['kasun'] }),
          task({ id: 'b', originalEstimateMinutes: 4800, assigneeIds: ['amal'] })
        ]
      })
    )
    expect(item(result, 'PA-1').passed).toBe(true)
  })
})

describe('PA-2 — scope well under capacity', () => {
  it('warns below 70 percent', () => {
    const result = evaluatePlanningChecklist(
      input({
        tasks: [
          task({ id: 'a', originalEstimateMinutes: 2400, assigneeIds: ['kasun'] }),
          task({ id: 'b', originalEstimateMinutes: 2400, assigneeIds: ['amal'] })
        ]
      })
    )
    expect(item(result, 'PA-2').passed).toBe(false)
    expect(item(result, 'PA-2').message).toContain('50 percent')
  })

  it('passes at exactly 70 percent', () => {
    const result = evaluatePlanningChecklist(
      input({
        tasks: [
          task({ id: 'a', originalEstimateMinutes: 3360, assigneeIds: ['kasun'] }),
          task({ id: 'b', originalEstimateMinutes: 3360, assigneeIds: ['amal'] })
        ]
      })
    )
    expect(item(result, 'PA-2').passed).toBe(true)
  })

  it('stays quiet when there is no capacity to compare against', () => {
    // PC-6 already reports the real problem; two warnings for one cause is noise.
    const result = evaluatePlanningChecklist(input({ members: [] }))
    expect(item(result, 'PA-2').passed).toBe(true)
  })
})

describe('PA-3 — tasks larger than a day', () => {
  it('flags a task bigger than the largest working day on the team', () => {
    const result = evaluatePlanningChecklist(
      input({ tasks: [task({ id: 'a', originalEstimateMinutes: 600 }), task({ id: 'b' })] })
    )
    expect(item(result, 'PA-3').offendingIds).toEqual(['a'])
  })

  it('measures against the largest day, not the smallest', () => {
    // A 6h task is not oversized just because a 4h part-timer is on the team.
    const result = evaluatePlanningChecklist(
      input({
        members: [
          { memberId: 'kasun', name: 'Kasun', dailyCapacityMinutes: 480 },
          { memberId: 'nuwan', name: 'Nuwan', dailyCapacityMinutes: 240 }
        ],
        tasks: [task({ id: 'a', originalEstimateMinutes: 360, assigneeIds: ['kasun', 'nuwan'] })]
      })
    )
    expect(item(result, 'PA-3').passed).toBe(true)
  })

  it('passes a task exactly one day long', () => {
    const result = evaluatePlanningChecklist(
      input({ tasks: [task({ id: 'a', originalEstimateMinutes: 480 })] })
    )
    expect(item(result, 'PA-3').passed).toBe(true)
  })
})

describe('PA-4 — estimated without a vote', () => {
  it('E16 — flags manually estimated tasks but allows them', () => {
    const result = evaluatePlanningChecklist(
      input({
        tasks: [task({ id: 'a', estimateMethod: 'manual' }), task({ id: 'b', assigneeIds: ['amal'] })]
      })
    )

    expect(item(result, 'PA-4').passed).toBe(false)
    expect(item(result, 'PA-4').offendingIds).toEqual(['a'])
    expect(result.canComplete).toBe(true)
  })

  it('ignores an unestimated task — PC-3 owns that failure', () => {
    const result = evaluatePlanningChecklist(
      input({
        tasks: [task({ id: 'a', estimateMethod: 'manual', originalEstimateMinutes: 0 })]
      })
    )
    expect(item(result, 'PA-4').passed).toBe(true)
  })
})

describe('PA-5 / PA-6 — per-member pre-assignment', () => {
  it('PA-5 names the member and both numbers', () => {
    const result = evaluatePlanningChecklist(
      input({
        tasks: [task({ id: 'a', originalEstimateMinutes: 5400, assigneeIds: ['kasun'] })]
      })
    )

    const pa5 = item(result, 'PA-5')
    expect(pa5.passed).toBe(false)
    expect(pa5.message).toContain('Kasun is pre-assigned 90.0h against 80.0h of capacity.')
    expect(pa5.offendingIds).toEqual(['kasun'])
  })

  it('PA-6 names members with nothing assigned', () => {
    const result = evaluatePlanningChecklist(
      input({ tasks: [task({ id: 'a', assigneeIds: ['kasun'] })] })
    )

    const pa6 = item(result, 'PA-6')
    expect(pa6.passed).toBe(false)
    expect(pa6.offendingIds).toEqual(['amal'])
    expect(pa6.message).toContain('Amal has nothing assigned')
  })

  it('counts a task assigned to two people against both', () => {
    const result = evaluatePlanningChecklist(
      input({
        tasks: [task({ id: 'a', originalEstimateMinutes: 4800, assigneeIds: ['kasun', 'amal'] })]
      })
    )
    expect(item(result, 'PA-6').passed).toBe(true)
    expect(item(result, 'PA-5').passed).toBe(true)
  })

  it('treats an unassigned task as day-one pool, not a failure', () => {
    const result = evaluatePlanningChecklist(
      input({
        tasks: [
          task({ id: 'a', assigneeIds: [] }),
          task({ id: 'b', assigneeIds: ['kasun'] }),
          task({ id: 'c', assigneeIds: ['amal'] })
        ]
      })
    )
    expect(result.canComplete).toBe(true)
    expect(item(result, 'PA-6').passed).toBe(true)
  })
})

describe('mandatory versus advisory', () => {
  it('only mandatory failures block completion', () => {
    const result = evaluatePlanningChecklist(
      input({
        // Every advisory fails; every mandatory passes.
        tasks: [
          task({ id: 'a', originalEstimateMinutes: 99999, estimateMethod: 'manual', assigneeIds: ['kasun'] })
        ]
      })
    )

    expect(result.advisory.some((entry) => !entry.passed)).toBe(true)
    expect(result.canComplete).toBe(true)
  })

  it('reports every mandatory failure at once, not the first', () => {
    const result = evaluatePlanningChecklist(
      input({ sprintGoal: '', tasks: [], members: [] })
    )

    expect(result.blockers.map((entry) => entry.checkId).sort()).toEqual([
      'PC-1', 'PC-2', 'PC-6'
    ])
  })
})

describe('unacknowledgedAdvisories — PLN-7', () => {
  const failing = () =>
    evaluatePlanningChecklist(
      input({ tasks: [task({ id: 'a', estimateMethod: 'manual', assigneeIds: ['kasun'] })] })
    )

  it('lists advisories still needing a tick', () => {
    const outstanding = unacknowledgedAdvisories(failing(), [])
    expect(outstanding.map((entry) => entry.checkId)).toContain('PA-4')
  })

  it('drops the ones already acknowledged', () => {
    const result = failing()
    const all = result.advisory.filter((entry) => !entry.passed).map((entry) => entry.checkId)

    expect(unacknowledgedAdvisories(result, all)).toEqual([])
  })

  it('never asks for a tick on an advisory that passed', () => {
    const outstanding = unacknowledgedAdvisories(evaluatePlanningChecklist(input()), [])
    expect(outstanding).toEqual([])
  })
})
