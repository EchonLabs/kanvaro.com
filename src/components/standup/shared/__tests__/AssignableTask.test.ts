import {
  fromAssignableMember,
  fromBoardMemberView,
  fromPoolTask,
  fromScopeTask,
  type AssignableTaskView
} from '../AssignableTask'
import type { AssignableMember, ScopeTask } from '../../planning/types'
import type { PoolTask } from '@/lib/standup/allocation'
import type { BoardAllocationView, BoardMemberView } from '../../run/CapacityBoard'
import type { CapacityBreakdown } from '@/lib/standup/capacity'
import { minutes } from '@/lib/standup/minutes'

describe('fromScopeTask', () => {
  it('maps every field when present, deriving assigneeId from assignedTo[0].user', () => {
    const task: ScopeTask = {
      _id: 'task-1',
      displayId: 'KAN-1',
      title: 'Build the thing',
      originalEstimateMinutes: 120,
      assignedTo: [{ user: { _id: 'user-1', firstName: 'Ada' } }]
    }

    expect(fromScopeTask(task)).toEqual<AssignableTaskView>({
      id: 'task-1',
      displayId: 'KAN-1',
      title: 'Build the thing',
      estimateMinutes: 120,
      assigneeId: 'user-1'
    })
  })

  it('falls back to estimatedHours * 60 when originalEstimateMinutes is absent', () => {
    const task: ScopeTask = { _id: 'task-2', title: 'No minutes field', estimatedHours: 2 }

    const result = fromScopeTask(task)

    expect(result.estimateMinutes).toBe(120)
  })

  it('omits optional fields when absent, leaving priority/skills undefined and assigneeId null', () => {
    const task: ScopeTask = { _id: 'task-3', title: 'Bare task' }

    expect(fromScopeTask(task)).toEqual<AssignableTaskView>({
      id: 'task-3',
      displayId: undefined,
      title: 'Bare task',
      estimateMinutes: undefined,
      // Planning tasks have no type, so the split screen offers no type filter.
      type: undefined,
      assigneeId: null
    })
  })

  it('resolves an assignee given as a bare string id, matching assigneeIdOf', () => {
    const task: ScopeTask = {
      _id: 'task-4',
      title: 'String assignee',
      assignedTo: [{ user: 'user-9' }]
    }

    expect(fromScopeTask(task).assigneeId).toBe('user-9')
  })
})

describe('fromPoolTask', () => {
  const base: PoolTask = {
    taskId: 'pool-1',
    key: 'KAN-2',
    title: 'Pool task',
    status: 'todo',
    type: 'task',
    priority: 'high',
    labels: ['backend', 'urgent'],
    remainingEstimateMinutes: minutes(90),
    position: 1,
    assigneeIds: ['user-5']
  }

  it('maps every field when present', () => {
    expect(fromPoolTask(base)).toEqual<AssignableTaskView>({
      id: 'pool-1',
      displayId: 'KAN-2',
      title: 'Pool task',
      priority: 'high',
      estimateMinutes: 90,
      type: 'task',
      skills: ['backend', 'urgent'],
      assigneeId: 'user-5'
    })
  })

  it('carries the task type through, so ALO-15’s type filter has something to filter on', () => {
    expect(fromPoolTask({ ...base, type: 'bug' }).type).toBe('bug')
  })

  it('omits optional fields when absent: no key, no assignees', () => {
    const task: PoolTask = {
      ...base,
      key: undefined,
      labels: ['solo-label'],
      assigneeIds: []
    }

    const result = fromPoolTask(task)

    expect(result.displayId).toBeUndefined()
    expect(result.assigneeId).toBeNull()
  })

  it('maps an empty labels array to undefined skills, not an empty array', () => {
    const task: PoolTask = { ...base, labels: [] }

    expect(fromPoolTask(task).skills).toBeUndefined()
  })
})

describe('fromAssignableMember', () => {
  it('copies fields directly and carries the supplied tasks through, with all optional fields present', () => {
    const member: AssignableMember = {
      memberId: 'member-1',
      name: 'Grace Hopper',
      onSprintTeam: true,
      role: 'developer',
      assignedMinutes: 240,
      capacityMinutes: 480
    }
    const tasks: AssignableTaskView[] = [{ id: 'task-1', title: 'Something', assigneeId: 'member-1' }]

    const result = fromAssignableMember(member, tasks)

    expect(result).toEqual({
      id: 'member-1',
      name: 'Grace Hopper',
      role: 'developer',
      assignedMinutes: 240,
      capacityMinutes: 480,
      onSprintTeam: true,
      tasks
    })
    expect(result.avatarUrl).toBeUndefined()
    expect(result.capacityBreakdown).toBeUndefined()
    // Planning has no per-day allocations, so there is no carried figure to
    // give — absent rather than a faked zero.
    expect(result.carriedMinutes).toBeUndefined()
  })

  it('omits optional fields when absent', () => {
    const member: AssignableMember = {
      memberId: 'member-2',
      name: 'Alan Turing',
      onSprintTeam: false
    }

    const result = fromAssignableMember(member, [])

    expect(result).toEqual({
      id: 'member-2',
      name: 'Alan Turing',
      role: undefined,
      assignedMinutes: undefined,
      capacityMinutes: undefined,
      onSprintTeam: false,
      tasks: []
    })
  })

  it('carries onSprintTeam through, so the picker can group people not yet on the team', () => {
    const onTeam: AssignableMember = { memberId: 'm-on', name: 'On Team', onSprintTeam: true }
    const offTeam: AssignableMember = {
      memberId: 'm-off',
      name: 'Off Team QA',
      onSprintTeam: false,
      role: 'project_qa_lead'
    }

    expect(fromAssignableMember(onTeam, []).onSprintTeam).toBe(true)
    expect(fromAssignableMember(offTeam, []).onSprintTeam).toBe(false)
  })
})

describe('fromBoardMemberView', () => {
  const capacity: CapacityBreakdown = {
    memberId: 'member-3',
    date: '2026-09-18',
    nominalMinutes: minutes(480),
    adjustments: [],
    adjustedMinutes: minutes(480),
    outstandingDebtMinutes: minutes(0),
    overrunPolicy: 'absorb',
    effectiveMinutes: minutes(480),
    allocatedMinutes: minutes(300),
    gapMinutes: minutes(180),
    status: 'under',
    isUnavailable: false,
    strandedMinutes: minutes(0)
  }

  const allocation: BoardAllocationView = {
    allocationId: 'alloc-1',
    taskId: 'task-9',
    taskKey: 'KAN-9',
    title: 'Ship the feature',
    plannedMinutes: minutes(120),
    remainingEstimateMinutes: minutes(60),
    source: 'assigned_in_standup',
    isBlocked: false,
    excludedFromCapacity: false,
    pairedDeliberately: false
  }

  it('maps id/name/capacity fields and allocations to tasks, with all optional fields present', () => {
    const member: BoardMemberView = {
      memberId: 'member-3',
      name: 'Margaret Hamilton',
      capacity,
      allocations: [allocation]
    }

    const result = fromBoardMemberView(member)

    expect(result.id).toBe('member-3')
    expect(result.name).toBe('Margaret Hamilton')
    expect(result.assignedMinutes).toBe(300)
    expect(result.capacityMinutes).toBe(480)
    expect(result.capacityBreakdown).toBe(capacity)
    // The run context has no sprint-team roster concept, so it stays absent
    // rather than being faked as false.
    expect(result.onSprintTeam).toBeUndefined()
    expect(result.tasks).toEqual<AssignableTaskView[]>([
      {
        id: 'task-9',
        displayId: 'KAN-9',
        title: 'Ship the feature',
        estimateMinutes: 60,
        assigneeId: 'member-3'
      }
    ])
  })

  it('produces an empty tasks array when there are no allocations', () => {
    const member: BoardMemberView = {
      memberId: 'member-4',
      name: 'No Allocations',
      capacity: { ...capacity, memberId: 'member-4', allocatedMinutes: minutes(0), gapMinutes: minutes(480) },
      allocations: []
    }

    const result = fromBoardMemberView(member)

    expect(result.tasks).toEqual([])
    expect(result.assignedMinutes).toBe(0)
    expect(result.carriedMinutes).toBe(0)
  })

  /**
   * `CapacityBreakdown` carries no "carried" field — `outstandingDebtMinutes`
   * is VAR-6 estimate debt and `strandedMinutes` is undoable work — so the
   * figure comes off the allocations, exactly as `CapacityBoard`'s own
   * `MemberCard` derives it. A misread here shows the meter's tooltip the
   * wrong hours.
   */
  describe('carriedMinutes', () => {
    const carriedRow: BoardAllocationView = {
      ...allocation,
      allocationId: 'alloc-carried',
      source: 'carried_forward',
      plannedMinutes: minutes(90)
    }

    const memberWith = (allocations: BoardAllocationView[]): BoardMemberView => ({
      memberId: 'member-5',
      name: 'Carrier',
      capacity: { ...capacity, memberId: 'member-5' },
      allocations
    })

    it('sums the planned minutes of carried-forward allocations', () => {
      const result = fromBoardMemberView(
        memberWith([
          allocation,
          carriedRow,
          { ...carriedRow, allocationId: 'alloc-carried-2', plannedMinutes: minutes(30) }
        ])
      )

      expect(result.carriedMinutes).toBe(120)
    })

    it('ignores allocations that are not carried forward', () => {
      expect(fromBoardMemberView(memberWith([allocation])).carriedMinutes).toBe(0)
    })

    it('excludes a detached carried row — that work is waiting to be reassigned', () => {
      const result = fromBoardMemberView(
        memberWith([carriedRow, { ...carriedRow, allocationId: 'alloc-detached', detachedReason: 'absent' }])
      )

      expect(result.carriedMinutes).toBe(90)
    })

    it('is never read off outstandingDebtMinutes, which is a different concept', () => {
      const member: BoardMemberView = {
        ...memberWith([allocation]),
        capacity: { ...capacity, memberId: 'member-5', outstandingDebtMinutes: minutes(240) }
      }

      expect(fromBoardMemberView(member).carriedMinutes).toBe(0)
    })
  })
})
