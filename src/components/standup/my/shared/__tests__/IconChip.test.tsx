/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { IconChip } from '../IconChip'

describe('IconChip', () => {
  it('renders the icon, hidden from the accessibility tree', () => {
    render(<IconChip icon={<svg data-testid="chip-icon" />} tone="green" />)
    const icon = screen.getByTestId('chip-icon')
    expect(icon.closest('[aria-hidden="true"]')).not.toBeNull()
  })
})
