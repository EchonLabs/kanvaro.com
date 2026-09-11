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

  it('renders an icon chip when given one, hidden from the accessibility tree since the title already names the section', () => {
    render(
      <SectionCard title="Blockers" icon={<svg data-testid="section-icon" />} tone="red">
        <p>content</p>
      </SectionCard>
    )
    const icon = screen.getByTestId('section-icon')
    expect(icon).toBeInTheDocument()
    expect(icon.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('renders without an icon chip when none is given', () => {
    render(
      <SectionCard title="Blockers">
        <p>content</p>
      </SectionCard>
    )
    expect(screen.queryByTestId('section-icon')).not.toBeInTheDocument()
  })
})
