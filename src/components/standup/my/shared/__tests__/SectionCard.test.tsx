/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { SectionCard } from '../SectionCard'

describe('SectionCard', () => {
  it('renders the title and the summary together in the header', () => {
    render(
      <SectionCard title="Yesterday" summary="2 of 3 done, 6.5h logged">
        <p>content</p>
      </SectionCard>
    )
    expect(screen.getByText('Yesterday')).toBeInTheDocument()
    expect(screen.getByText('2 of 3 done, 6.5h logged')).toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('renders without a summary', () => {
    render(
      <SectionCard title="Blockers">
        <p>content</p>
      </SectionCard>
    )
    expect(screen.getByText('Blockers')).toBeInTheDocument()
  })
})
