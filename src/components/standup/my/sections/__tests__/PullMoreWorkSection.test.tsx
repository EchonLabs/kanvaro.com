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
      <PullMoreWorkSection poolTasks={pool} allowSelfSelect hasGap={false} disabled={false} onAdd={jest.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when self-select is off', () => {
    const { container } = render(
      <PullMoreWorkSection poolTasks={pool} allowSelfSelect={false} hasGap disabled={false} onAdd={jest.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the pool is empty', () => {
    const { container } = render(
      <PullMoreWorkSection poolTasks={[]} allowSelfSelect hasGap disabled={false} onAdd={jest.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the pool and calls onAdd when self-select is on and there is a gap', () => {
    const onAdd = jest.fn()
    render(<PullMoreWorkSection poolTasks={pool} allowSelfSelect hasGap disabled={false} onAdd={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: /add kan-2/i }))
    expect(onAdd).toHaveBeenCalledWith('t2')
  })

  it('disables the add button when disabled', () => {
    render(<PullMoreWorkSection poolTasks={pool} allowSelfSelect hasGap disabled onAdd={jest.fn()} />)
    expect(screen.getByRole('button', { name: /add kan-2/i })).toBeDisabled()
  })
})
