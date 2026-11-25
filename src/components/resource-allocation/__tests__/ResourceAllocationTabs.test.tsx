/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'

import { ResourceAllocationTabs } from '@/components/resource-allocation/ResourceAllocationTabs'

describe('ResourceAllocationTabs', () => {
  it('hides History for roles without view_history', () => {
    render(<ResourceAllocationTabs active="overview" showHistory={false} onChange={jest.fn()} />)

    expect(screen.getByRole('tab', { name: /allocation overview/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('tab', { name: /allocation history/i })).not.toBeInTheDocument()
  })

  it('shows the History count and switches tabs', () => {
    const onChange = jest.fn()
    render(<ResourceAllocationTabs active="overview" showHistory historyCount={3} onChange={onChange} />)

    const history = screen.getByRole('tab', { name: /allocation history/i })
    expect(history).toHaveTextContent('3')
    fireEvent.click(history)
    expect(onChange).toHaveBeenCalledWith('history')
  })
})
