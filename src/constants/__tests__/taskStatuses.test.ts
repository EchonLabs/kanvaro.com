/**
 * Status categories are what the stand-up module's "done set", "in progress
 * set" and "blocked set" (RUN-9) are built on. Projects can rename statuses and
 * invent their own, so the resolution rules are pinned here.
 */
import {
  DEFAULT_TASK_STATUS_CATEGORIES,
  DEFAULT_TASK_STATUS_KEYS,
  FALLBACK_TASK_STATUS_CATEGORY,
  isClosedStatusCategory,
  isDoneStatusCategory,
  resolveTaskStatusCategory
} from '../taskStatuses'

describe('resolveTaskStatusCategory', () => {
  it('categorises every built-in status, so existing projects need no migration', () => {
    for (const key of DEFAULT_TASK_STATUS_KEYS) {
      expect(DEFAULT_TASK_STATUS_CATEGORIES[key]).toBeDefined()
    }
  })

  it('maps the built-in workflow onto the spec\'s sets', () => {
    expect(resolveTaskStatusCategory('backlog')).toBe('todo')
    expect(resolveTaskStatusCategory('todo')).toBe('todo')
    // Review and testing are started-but-not-finished work.
    expect(resolveTaskStatusCategory('in_progress')).toBe('in_progress')
    expect(resolveTaskStatusCategory('review')).toBe('in_progress')
    expect(resolveTaskStatusCategory('testing')).toBe('in_progress')
    expect(resolveTaskStatusCategory('done')).toBe('done')
    expect(resolveTaskStatusCategory('blocked')).toBe('blocked')
  })

  it('lets a project override the meaning of a status it renamed', () => {
    const configured = [{ key: 'qa_signoff', category: 'done' as const }]

    expect(resolveTaskStatusCategory('qa_signoff', configured)).toBe('done')
  })

  it('prefers the project configuration over the built-in default', () => {
    // A team that treats "testing" as shipped.
    const configured = [{ key: 'testing', category: 'done' as const }]

    expect(resolveTaskStatusCategory('testing', configured)).toBe('done')
    expect(resolveTaskStatusCategory('testing')).toBe('in_progress')
  })

  it('falls back to the built-in map when the project entry has no category', () => {
    const configured = [{ key: 'done' }]

    expect(resolveTaskStatusCategory('done', configured)).toBe('done')
  })

  it('treats an unrecognised custom status as still-open work', () => {
    // Guessing "done" would silently close carry-forward items and drop tasks
    // out of the pool — the invisible-loss failure INV-8 exists to prevent.
    expect(resolveTaskStatusCategory('waiting_on_client')).toBe(FALLBACK_TASK_STATUS_CATEGORY)
    expect(isClosedStatusCategory(resolveTaskStatusCategory('waiting_on_client'))).toBe(false)
  })
})

describe('category predicates', () => {
  it('counts only delivered work as done', () => {
    expect(isDoneStatusCategory('done')).toBe(true)
    expect(isDoneStatusCategory('cancelled')).toBe(false)
    expect(isDoneStatusCategory('in_progress')).toBe(false)
  })

  it('counts cancelled work as closed but never as delivered', () => {
    // Cancelled must leave the pool and stop ageing carry-forward items...
    expect(isClosedStatusCategory('cancelled')).toBe(true)
    // ...without ever showing up under "Completed since last stand-up".
    expect(isDoneStatusCategory('cancelled')).toBe(false)
  })

  it('treats blocked work as open', () => {
    expect(isClosedStatusCategory('blocked')).toBe(false)
  })
})
