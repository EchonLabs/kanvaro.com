/**
 * Global search filters (`/api/search`).
 *
 * Regression cover for filters that were sent and never read: the search hook
 * has always appended `type`, `status`, `priority`, `assignee` and `project`,
 * and the route parsed none of them. Every chip in the search panel narrowed
 * the UI and changed nothing about the results.
 */
import { applySearchFilters, parseFilterList } from '../filters'

const results = [
  { type: 'task', metadata: { status: 'in_progress', priority: 'high', assignee: 'Ada Lovelace', project: 'Apollo' } },
  { type: 'task', metadata: { status: 'done', priority: 'low', assignee: 'Grace Hopper', project: 'Apollo' } },
  { type: 'story', metadata: { status: 'in_progress', priority: 'high', assignee: 'Ada Lovelace', project: 'Gemini' } },
  { type: 'epic', metadata: { status: 'planned', priority: 'medium', project: 'Gemini' } }
] as any[]

describe('parseFilterList', () => {
  it('splits the comma-joined form the client sends', () => {
    expect(parseFilterList('task,story')).toEqual(['task', 'story'])
  })

  it('trims and drops empties', () => {
    expect(parseFilterList(' task , , story ')).toEqual(['task', 'story'])
  })

  it('returns an empty list for an absent filter', () => {
    expect(parseFilterList('')).toEqual([])
    expect(parseFilterList(null)).toEqual([])
  })
})

describe('applySearchFilters', () => {
  it('returns everything when no filter is set', () => {
    expect(applySearchFilters(results, {})).toHaveLength(4)
  })

  it('filters by type', () => {
    const out = applySearchFilters(results, { type: ['task'] })
    expect(out).toHaveLength(2)
    expect(out.every((r) => r.type === 'task')).toBe(true)
  })

  it('treats multiple values of one filter as OR', () => {
    expect(applySearchFilters(results, { type: ['story', 'epic'] })).toHaveLength(2)
  })

  it('treats different filters as AND', () => {
    const out = applySearchFilters(results, { type: ['task'], status: ['in_progress'] })
    expect(out).toHaveLength(1)
    expect(out[0].metadata.priority).toBe('high')
  })

  it('filters by priority and by project', () => {
    expect(applySearchFilters(results, { priority: ['high'] })).toHaveLength(2)
    expect(applySearchFilters(results, { project: ['Gemini'] })).toHaveLength(2)
  })

  it('matches an assignee inside a comma-joined list of names', () => {
    const many = [
      { type: 'task', metadata: { assignee: 'Ada Lovelace, Grace Hopper' } }
    ] as any[]
    expect(applySearchFilters(many, { assignee: ['Grace Hopper'] })).toHaveLength(1)
    expect(applySearchFilters(many, { assignee: ['Alan Turing'] })).toHaveLength(0)
  })

  it('drops rows missing the field a filter names, rather than passing them through', () => {
    // The epic has no assignee; a filter on assignee must not silently keep it.
    expect(applySearchFilters(results, { assignee: ['Ada Lovelace'] })).toHaveLength(2)
  })

  it('never mutates the input', () => {
    const copy = [...results]
    applySearchFilters(results, { type: ['task'] })
    expect(results).toEqual(copy)
  })
})
