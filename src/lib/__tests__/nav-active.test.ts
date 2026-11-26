import { isNavPathActive, isTopLevelNavActive } from '@/lib/nav-active'

describe('isNavPathActive', () => {
  it('matches an item on its own path and on anything nested under it', () => {
    expect(isNavPathActive('/sprints', '/sprints')).toBe(true)
    expect(isNavPathActive('/sprints/abc123/planning', '/sprints')).toBe(true)
    expect(isNavPathActive('/tasks', '/sprints')).toBe(false)
  })

  it('keeps the stand-up screens under My Stand-up', () => {
    expect(isNavPathActive('/projects/p1/sprints/s1/standups/x', '/my/standup')).toBe(true)
    expect(isNavPathActive('/projects/p1/sprints/s1/standups/x', '/projects')).toBe(false)
  })

  describe('stand-up analytics', () => {
    const ANALYTICS = '/sprints/analytics'

    it('lights the Analytics item on the picker and on any sprint\'s analytics page', () => {
      expect(isNavPathActive('/sprints/analytics', ANALYTICS)).toBe(true)
      expect(isNavPathActive('/sprints/0123456789abcdef01234567/analytics', ANALYTICS)).toBe(true)
    })

    it('does not also light the Sprints item, so only one entry is highlighted', () => {
      expect(isNavPathActive('/sprints/analytics', '/sprints')).toBe(false)
      expect(isNavPathActive('/sprints/0123456789abcdef01234567/analytics', '/sprints')).toBe(false)
    })

    it('leaves the rest of a sprint\'s pages on the Sprints item', () => {
      expect(isNavPathActive('/sprints/0123456789abcdef01234567', '/sprints')).toBe(true)
      expect(isNavPathActive('/sprints/0123456789abcdef01234567/planning', '/sprints')).toBe(true)
      expect(isNavPathActive('/sprints/0123456789abcdef01234567/planning', ANALYTICS)).toBe(false)
    })
  })
})

describe('isTopLevelNavActive', () => {
  it('keeps a top-level item lit on its sub-pages, e.g. Resource Allocation on its Allocate page', () => {
    const item = { path: '/resource-allocation' }
    expect(isTopLevelNavActive('/resource-allocation', item)).toBe(true)
    expect(isTopLevelNavActive('/resource-allocation/allocate', item)).toBe(true)
    expect(isTopLevelNavActive('/resource-allocation-other', item)).toBe(false)
  })

  it('leaves items with children to their own child highlighting, as before', () => {
    const item = { path: '/projects', children: [{ path: '/projects' }] }
    expect(isTopLevelNavActive('/projects', item)).toBe(true)
    expect(isTopLevelNavActive('/projects/abc', item)).toBe(false)
  })
})
