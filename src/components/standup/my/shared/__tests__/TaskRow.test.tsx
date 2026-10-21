/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { TaskRow } from '../TaskRow'
import { minutes } from '@/lib/standup/minutes'

describe('TaskRow', () => {
  it('renders the task key, title and both hour figures', () => {
    render(
      <TaskRow
        taskKey="KAN-1"
        title="Fix the thing"
        plannedMinutes={minutes(120)}
        loggedMinutes={minutes(90)}
      />
    )
    expect(screen.getByText('KAN-1')).toBeInTheDocument()
    expect(screen.getByText('Fix the thing')).toBeInTheDocument()
    expect(screen.getByText('2.0h')).toBeInTheDocument()
    expect(screen.getByText('1.5h')).toBeInTheDocument()
  })

  it('renders the trailing slot', () => {
    render(<TaskRow title="Fix the thing" trailing={<button>Edit</button>} />)
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })
})
