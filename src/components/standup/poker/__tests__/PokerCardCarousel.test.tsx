/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'

import { PokerCardCarousel } from '../PokerCardCarousel'

const CARDS = [1, 2, 3, 4, 6, 8, 12, 14, 16]

describe('PokerCardCarousel — two-step select', () => {
  it('starts centered on the middle card when nothing is selected yet', () => {
    render(<PokerCardCarousel cards={CARDS} selected={null} onSelect={jest.fn()} />)

    const middle = screen.getByRole('option', { name: 'Card 6' })
    expect(middle).toHaveAttribute('aria-current', 'true')
  })

  it('starts centered on the already-selected card', () => {
    render(<PokerCardCarousel cards={CARDS} selected={12} onSelect={jest.fn()} />)

    expect(screen.getByRole('option', { name: 'Card 12' })).toHaveAttribute('aria-current', 'true')
  })

  it('clicking an off-center card only re-centers it — no vote yet', () => {
    const onSelect = jest.fn()
    render(<PokerCardCarousel cards={CARDS} selected={null} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('option', { name: 'Card 14' }))

    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByRole('option', { name: 'Card 14' })).toHaveAttribute('aria-current', 'true')
  })

  it('clicking the already-centered card confirms the vote', () => {
    const onSelect = jest.fn()
    render(<PokerCardCarousel cards={CARDS} selected={null} onSelect={onSelect} />)

    // First click brings 14 to center (per the test above); second click on
    // the now-centered card is the confirm step.
    fireEvent.click(screen.getByRole('option', { name: 'Card 14' }))
    fireEvent.click(screen.getByRole('option', { name: 'Card 14' }))

    expect(onSelect).toHaveBeenCalledWith(14)
  })

  it('does nothing while disabled', () => {
    const onSelect = jest.fn()
    render(<PokerCardCarousel cards={CARDS} selected={null} disabled onSelect={onSelect} />)

    // Middle card (6) starts centered, so this click would otherwise confirm.
    fireEvent.click(screen.getByRole('option', { name: 'Card 6' }))

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('clamps centering at both ends of the deck', () => {
    const onSelect = jest.fn()
    render(<PokerCardCarousel cards={CARDS} selected={null} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('option', { name: 'Card 16' }))
    expect(screen.getByRole('option', { name: 'Card 16' })).toHaveAttribute('aria-current', 'true')

    fireEvent.click(screen.getByRole('option', { name: 'Card 16' }))
    expect(onSelect).toHaveBeenCalledWith(16)
  })
})
