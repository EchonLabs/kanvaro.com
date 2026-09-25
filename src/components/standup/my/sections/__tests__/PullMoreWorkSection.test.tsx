/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { PullMoreWorkSection } from '../PullMoreWorkSection'
import { minutes } from '@/lib/standup/minutes'

const pool = [{ taskId: 't2', key: 'KAN-2', title: 'Pool task', remainingEstimateMinutes: minutes(60) }]

describe('PullMoreWorkSection', () => {
  it('renders nothing when there is no gap', () => {
    const { container } = render(
      <PullMoreWorkSection poolTasks={pool} allowSelfSelect gapMinutes={0} disabled={false} onAdd={jest.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when self-select is off', () => {
    const { container } = render(
      <PullMoreWorkSection poolTasks={pool} allowSelfSelect={false} gapMinutes={120} disabled={false} onAdd={jest.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the pool is empty', () => {
    const { container } = render(
      <PullMoreWorkSection poolTasks={[]} allowSelfSelect gapMinutes={120} disabled={false} onAdd={jest.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the pool and calls onAdd when self-select is on and there is a gap', () => {
    const onAdd = jest.fn()
    render(<PullMoreWorkSection poolTasks={pool} allowSelfSelect gapMinutes={120} disabled={false} onAdd={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: /add kan-2/i }))
    expect(onAdd).toHaveBeenCalledWith('t2')
  })

  it('marks a task larger than the gap Over Limit and will not pull it', () => {
    const onAdd = jest.fn()
    render(
      <PullMoreWorkSection
        poolTasks={[{ taskId: 't3', key: 'KAN-3', title: 'Big task', remainingEstimateMinutes: minutes(300) }]}
        allowSelfSelect
        gapMinutes={120}
        disabled={false}
        onAdd={onAdd}
      />
    )
    const button = screen.getByRole('button', { name: /add kan-3/i })
    expect(button).toHaveTextContent(/over limit/i)
    expect(button).toBeDisabled()
  })

  it('shows the spare capacity and the task priority when the pool carries one', () => {
    render(
      <PullMoreWorkSection
        poolTasks={[{ ...pool[0], priority: 'low' }]}
        allowSelfSelect
        gapMinutes={120}
        disabled={false}
        onAdd={jest.fn()}
      />
    )
    expect(screen.getByText('2.0h spare capacity')).toBeInTheDocument()
    expect(screen.getByText(/estimated: 1\.0h • priority: low/i)).toBeInTheDocument()
  })

  it('disables the add button when disabled', () => {
    render(<PullMoreWorkSection poolTasks={pool} allowSelfSelect gapMinutes={120} disabled onAdd={jest.fn()} />)
    expect(screen.getByRole('button', { name: /add kan-2/i })).toBeDisabled()
  })
})
