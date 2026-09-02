/**
 * `summary-service.ts` — the §15.13 read path (Task 19).
 *
 * `getSummary` needs a real database because its whole job is the query and
 * the 404 branch when nothing is found — a mock would only prove the
 * function calls `findOne`, not that a missing summary actually 404s.
 * `renderSummaryMarkdown` is pure and tested against a fixture, mirroring
 * `summary.test.ts`'s own approach for `buildSummaryDocument`.
 */
import { StandupSummary } from '@/models/StandupSummary'
import { getSummary, renderSummaryMarkdown, type SummaryDocument } from '@/lib/standup/summary-service'
import { isStandupError } from '@/lib/standup/errors'

import { anyId, ids, syncIndexes, useMongo } from './helpers/mongo'

const baseSummary = (overrides: Record<string, unknown> = {}) => ({
  standup: ids.user,
  sprint: ids.sprint,
  project: ids.project,
  organization: ids.organization,
  headerFacts: {
    standupDate: '2026-08-10',
    dayNumber: 1,
    totalDays: 9,
    facilitatorName: 'Kasun',
    durationMinutes: 15
  },
  attendance: [{ memberId: ids.member, name: 'Kasun', status: 'present' }],
  ...overrides
})

describe('getSummary', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(StandupSummary)
  })

  it('404s (NOT_FOUND) when no summary exists for the stand-up', async () => {
    await expect(getSummary(String(anyId()))).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404
    })
  })

  it('is recognised by the shared error-shape helper', async () => {
    try {
      await getSummary(String(anyId()))
      throw new Error('expected getSummary to throw')
    } catch (error) {
      expect(isStandupError(error)).toBe(true)
    }
  })

  it('returns the persisted summary for the stand-up it belongs to', async () => {
    await StandupSummary.create(baseSummary())

    const result = await getSummary(String(ids.user))

    expect(result.headerFacts.standupDate).toBe('2026-08-10')
    expect(result.attendance).toEqual([
      { memberId: ids.member, name: 'Kasun', status: 'present' }
    ])
  })
})

describe('renderSummaryMarkdown', () => {
  const fixture = {
    headerFacts: {
      standupDate: '2026-08-10',
      dayNumber: 3,
      totalDays: 9,
      facilitatorName: 'Kasun',
      durationMinutes: 15
    },
    attendance: [
      { memberId: 'member-1', name: 'Kasun', status: 'present' },
      { memberId: 'member-2', name: 'Nadeesha', status: 'absent_planned' }
    ],
    completedYesterday: [{ taskId: 'task-1', taskKey: 'KAN-1', title: 'Wire the health job' }],
    varianceTable: [],
    debtMovements: [],
    memberCommitments: [
      {
        memberId: 'member-1',
        name: 'Kasun',
        allocations: [{ taskId: 'task-2', taskKey: 'KAN-2', plannedMinutes: 120 }]
      }
    ],
    blockersRaised: [],
    blockersResolved: [],
    carryForwardState: [],
    overridesIssued: [{ id: 'override-1', type: 'under_allocation', justification: 'On support rota.' }],
    pmNotes: 'Solid day.'
  } as unknown as SummaryDocument

  it('produces the expected header line', () => {
    const output = renderSummaryMarkdown(fixture)
    expect(output).toContain('# Stand-up — 2026-08-10 (Day 3 of 9)')
  })

  it('produces the expected attendance lines', () => {
    const output = renderSummaryMarkdown(fixture)
    expect(output).toContain('## Attendance')
    expect(output).toContain('- Kasun: present')
    expect(output).toContain('- Nadeesha: absent_planned')
  })

  it('renders member commitments with hours', () => {
    const output = renderSummaryMarkdown(fixture)
    expect(output).toContain('**Kasun**')
    expect(output).toContain('- KAN-2 (2.0h)')
  })

  it('keeps override justification text in full, per UI-10', () => {
    const output = renderSummaryMarkdown(fixture)
    expect(output).toContain('On support rota.')
  })

  it('renders pmNotes under its own heading only when present', () => {
    const output = renderSummaryMarkdown(fixture)
    expect(output).toContain('## Notes')
    expect(output).toContain('Solid day.')

    const withoutNotes = renderSummaryMarkdown({ ...fixture, pmNotes: undefined } as SummaryDocument)
    expect(withoutNotes).not.toContain('## Notes')
  })

  it('says "Nothing recorded" for empty sections rather than omitting the heading', () => {
    const output = renderSummaryMarkdown(fixture)
    expect(output).toContain('## Variance')
    expect(output).toContain('## Estimate debt movements')
    expect(output).toContain('## Blockers raised')
    expect(output).toContain('None.')
  })
})
