/**
 * The Backlog page's "New Task" button leads here (create-new-task/page.tsx),
 * a separate full page from CreateTaskModal.tsx. It used to hard-require an
 * assignee before allowing submission, contradicting the rest of the app:
 * the API (`/api/tasks`) only requires `title` + `project`, and
 * CreateTaskModal.tsx already treats assignee as optional ("Optional —
 * tasks are assigned during sprint planning."). This test locks in that the
 * page's submit-validity check no longer depends on an assignee being set.
 */
import { computeIsFormValid } from '../isFormValid'

describe('computeIsFormValid (create-new-task page)', () => {
  it('is valid with a title, project, and due date but no assignee', () => {
    expect(
      computeIsFormValid({
        title: 'Write onboarding docs',
        project: 'project-1',
        dueDate: '2026-12-31',
        subtasks: []
      })
    ).toBe(true)
  })

  it('is still valid when subtasks are present with non-empty titles', () => {
    expect(
      computeIsFormValid({
        title: 'Write onboarding docs',
        project: 'project-1',
        dueDate: '2026-12-31',
        subtasks: [{ title: 'Draft outline' }, { title: 'Review with team' }]
      })
    ).toBe(true)
  })

  it('is invalid when the title is missing or blank', () => {
    expect(
      computeIsFormValid({ title: '   ', project: 'project-1', dueDate: '2026-12-31', subtasks: [] })
    ).toBe(false)
  })

  it('is invalid when no project is selected', () => {
    expect(
      computeIsFormValid({ title: 'Write onboarding docs', project: '', dueDate: '2026-12-31', subtasks: [] })
    ).toBe(false)
  })

  it('is invalid when no due date is set', () => {
    expect(
      computeIsFormValid({ title: 'Write onboarding docs', project: 'project-1', dueDate: '', subtasks: [] })
    ).toBe(false)
  })

  it('is invalid when a subtask has a blank title', () => {
    expect(
      computeIsFormValid({
        title: 'Write onboarding docs',
        project: 'project-1',
        dueDate: '2026-12-31',
        subtasks: [{ title: 'Draft outline' }, { title: '   ' }]
      })
    ).toBe(false)
  })
})
