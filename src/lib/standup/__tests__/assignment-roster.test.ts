/**
 * The sprint-roster rule behind planning assignment (PC-8).
 *
 * Pure half of `assignment-service`: who may be given sprint work, and which
 * of those assignments are new. The database half is covered by the route
 * suite; this is the rule itself.
 *
 * Why the roster rule exists at all: capacity, the workload board and
 * PA-5/PA-6 are all computed from `Sprint.teamMembers`. Work assigned to
 * somebody outside it does not merely look untidy — its minutes vanish from
 * every capacity figure on the planning screen, so the PM balances scope
 * against a total that is quietly wrong.
 */
import {
  assertAssignableRoster,
  assigneeIdsOf,
  diffAssignees
} from '../assignment-service'

describe('assertAssignableRoster', () => {
  it('adds nobody when every assignee is already on the sprint team', () => {
    expect(assertAssignableRoster(['kasun', 'amal'], ['kasun'])).toEqual([])
  })

  it('refuses an outsider when admission was not asked for', () => {
    expect(() => assertAssignableRoster(['kasun'], ['nimal'])).toThrow(
      /not on this sprint's team/i
    )
  })

  it('names the outsiders on the error, so the UI can say who', () => {
    expect(() => assertAssignableRoster(['kasun'], ['nimal', 'ravi'])).toThrow(
      expect.objectContaining({
        code: 'VALIDATION_FAILED',
        details: { outsiders: ['nimal', 'ravi'] }
      })
    )
  })

  it('admits a QA the project already trusts, and reports who to add', () => {
    expect(
      assertAssignableRoster(['kasun'], ['nimal'], {
        addToSprintTeam: true,
        admissibleIds: ['nimal']
      })
    ).toEqual(['nimal'])
  })

  it('still refuses somebody who is not on the project at all', () => {
    // `addToSprintTeam` widens the sprint roster, never the project's.
    expect(() =>
      assertAssignableRoster(['kasun'], ['stranger'], {
        addToSprintTeam: true,
        admissibleIds: ['nimal']
      })
    ).toThrow(/only project members/i)
  })

  it('deduplicates an outsider assigned several tasks', () => {
    expect(
      assertAssignableRoster(['kasun'], ['nimal', 'nimal', 'nimal'], {
        addToSprintTeam: true,
        admissibleIds: ['nimal']
      })
    ).toEqual(['nimal'])
  })

  it('accepts an empty assignment list', () => {
    expect(assertAssignableRoster(['kasun'], [])).toEqual([])
  })
})

describe('diffAssignees', () => {
  it('reports a genuinely new assignee', () => {
    expect(diffAssignees([], ['kasun'])).toEqual({ added: ['kasun'], removed: [] })
  })

  it('reports nothing for an idempotent re-assign', () => {
    // This is what keeps a PM nudging the board from mailing somebody the same
    // "you have been assigned" notification twice.
    expect(diffAssignees(['kasun'], ['kasun'])).toEqual({ added: [], removed: [] })
  })

  it('reports a handover as one addition and one removal', () => {
    expect(diffAssignees(['kasun'], ['amal'])).toEqual({
      added: ['amal'],
      removed: ['kasun']
    })
  })

  it('reports an unassignment', () => {
    expect(diffAssignees(['kasun'], [])).toEqual({ added: [], removed: ['kasun'] })
  })
})

describe('assigneeIdsOf', () => {
  it('reads the stored `{ user }` shape', () => {
    expect(assigneeIdsOf({ assignedTo: [{ user: 'kasun' }] })).toEqual(['kasun'])
  })

  it('reads a populated user document', () => {
    expect(
      assigneeIdsOf({ assignedTo: [{ user: { _id: 'kasun', firstName: 'Kasun' } }] })
    ).toEqual(['kasun'])
  })

  it('is empty for an unassigned task', () => {
    expect(assigneeIdsOf({ assignedTo: [] })).toEqual([])
    expect(assigneeIdsOf({})).toEqual([])
  })
})
