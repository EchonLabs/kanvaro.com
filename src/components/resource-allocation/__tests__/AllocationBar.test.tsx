/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'

import { AllocationBar } from '@/components/resource-allocation/AllocationBar'

describe('AllocationBar', () => {
  it('labels the bar with the total and an accessible name', () => {
    render(<AllocationBar total={80} threshold={100} />)

    expect(screen.getByText('80%')).toBeInTheDocument()
    expect(screen.getByLabelText('Allocation 80%')).toHaveAttribute('data-status', 'partial')
  })

  it('uses the over style above the threshold and caps the bar width at 100%', () => {
    render(<AllocationBar total={130} threshold={100} />)

    const bar = screen.getByLabelText('Allocation 130%')
    expect(bar).toHaveAttribute('data-status', 'over')
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('100%')
  })

  it('marks a full allocation and an empty one', () => {
    const { rerender } = render(<AllocationBar total={100} threshold={100} />)
    expect(screen.getByLabelText('Allocation 100%')).toHaveAttribute('data-status', 'full')

    rerender(<AllocationBar total={0} threshold={100} />)
    expect(screen.getByLabelText('Allocation 0%')).toHaveAttribute('data-status', 'unallocated')
  })
})
