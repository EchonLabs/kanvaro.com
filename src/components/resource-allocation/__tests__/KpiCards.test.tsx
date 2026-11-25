/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'

import { KpiCards } from '@/components/resource-allocation/KpiCards'

describe('KpiCards', () => {
  it('shows total, fully, partially and available capacity', () => {
    render(
      <KpiCards
        kpis={{
          totalResources: 18,
          fullyAllocated: 10,
          partiallyAllocated: 6,
          unallocated: 2,
          overallocated: 0,
          availableCapacity: 165
        }}
      />
    )

    expect(screen.getByText('Total Resources').nextSibling).toHaveTextContent('18')
    expect(screen.getByText('Fully Allocated').nextSibling).toHaveTextContent('10')
    expect(screen.getByText('Partially Allocated').nextSibling).toHaveTextContent('6')
    expect(screen.getByText('Available Capacity').nextSibling).toHaveTextContent('165%')
  })
})
