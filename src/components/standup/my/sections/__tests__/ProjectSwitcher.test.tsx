/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { ProjectSwitcher } from '../ProjectSwitcher'
import type { StandupCandidate } from '@/lib/standup/my-standup-candidates'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush })
}))

function candidate(overrides: Partial<StandupCandidate> = {}): StandupCandidate {
  return {
    standupId: 's1',
    status: 'Ready',
    scheduledStartAt: '2026-09-05T09:00:00.000Z',
    projectId: 'p1',
    projectName: 'Project Alpha',
    ...overrides
  }
}

const beta = candidate({ standupId: 's2', projectId: 'p2', projectName: 'Project Beta' })

/** Radix opens its trigger on `pointerdown`, which jsdom does not synthesise
 *  from a click; the keyboard path it also supports is the reliable one here. */
function open(name = /switch project/i) {
  fireEvent.keyDown(screen.getByRole('button', { name }), { key: 'Enter' })
}

describe('ProjectSwitcher', () => {
  afterEach(() => mockPush.mockClear())

  it('renders plain text, not a menu, when there is only one stand-up', () => {
    render(
      <ProjectSwitcher
        currentStandupId="s1"
        currentProjectId="p1"
        currentProjectName="Project Alpha"
        candidates={[candidate()]}
      />
    )
    expect(screen.getByText('Project Alpha')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /switch project/i })).not.toBeInTheDocument()
  })

  it('renders nothing when no project could be resolved at all', () => {
    const { container } = render(<ProjectSwitcher currentStandupId="s1" candidates={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('names the current project on the trigger and marks it selected in the menu', () => {
    render(
      <ProjectSwitcher
        currentStandupId="s1"
        currentProjectId="p1"
        currentProjectName="Project Alpha"
        candidates={[candidate(), beta]}
      />
    )
    expect(screen.getByRole('button', { name: /switch project/i })).toHaveTextContent(
      'Project Alpha'
    )

    open()
    const items = screen.getAllByRole('menuitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Project Alpha')
    expect(items[0]).toHaveAttribute('aria-current', 'true')
    expect(items[1]).not.toHaveAttribute('aria-current')
  })

  it('navigates to the chosen project’s stand-up', () => {
    render(
      <ProjectSwitcher
        currentStandupId="s1"
        currentProjectId="p1"
        currentProjectName="Project Alpha"
        candidates={[candidate(), beta]}
      />
    )
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: /project beta/i }))
    expect(mockPush).toHaveBeenCalledWith('/my/standup/s2')
  })

  it('does not navigate when the current project is re-picked', () => {
    render(
      <ProjectSwitcher
        currentStandupId="s1"
        currentProjectId="p1"
        currentProjectName="Project Alpha"
        candidates={[candidate(), beta]}
      />
    )
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: /project alpha/i }))
    expect(mockPush).not.toHaveBeenCalled()
  })

  /** A stand-up that has left `PRIORITY`'s statuses (Completed, Reopened,
   *  Missed) is no longer in the candidates list, but the viewer is still
   *  looking at it — the trigger must name its project, not another one's. */
  it('unions in the current stand-up when the candidates list has dropped it', () => {
    render(
      <ProjectSwitcher
        currentStandupId="s9"
        currentProjectId="p1"
        currentProjectName="Project Alpha"
        candidates={[beta]}
      />
    )
    expect(screen.getByRole('button', { name: /switch project/i })).toHaveTextContent(
      'Project Alpha'
    )
    open()
    expect(screen.getAllByRole('menuitem')).toHaveLength(2)
  })
})
