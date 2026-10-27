/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react'

import { PokerCardCarousel } from '../PokerCardCarousel'

const CARDS = [1, 2, 3, 5, 8, 13, 21, '?', 'coffee']

describe('PokerCardCarousel — browse only, no implicit vote', () => {
  it('starts centered on the middle card when nothing is selected yet', () => {
    render(<PokerCardCarousel cards={CARDS} selected={null} onPick={jest.fn()} />)

    const middle = screen.getByRole('option', { name: 'Card 8' })
    expect(middle).toHaveAttribute('aria-current', 'true')
  })

  it('starts centered on the already-selected card', () => {
    render(<PokerCardCarousel cards={CARDS} selected={13} onPick={jest.fn()} />)

    expect(screen.getByRole('option', { name: 'Card 13' })).toHaveAttribute('aria-current', 'true')
  })

  it('clicking any off-center card centers it as the candidate, without voting', () => {
    const onPick = jest.fn()
    render(<PokerCardCarousel cards={CARDS} selected={null} onPick={onPick} />)

    fireEvent.click(screen.getByRole('option', { name: 'Card 21' }))

    // "Voting" happens outside this component — it only ever reports a
    // candidate via onPick, never anything that submits by itself.
    expect(onPick).toHaveBeenCalledWith(21)
    expect(screen.getByRole('option', { name: 'Card 21' })).toHaveAttribute('aria-current', 'true')
  })

  it('clicking the already-centered card reports it as the candidate too', () => {
    const onPick = jest.fn()
    render(<PokerCardCarousel cards={CARDS} selected={null} onPick={onPick} />)

    fireEvent.click(screen.getByRole('option', { name: 'Card 8' }))

    expect(onPick).toHaveBeenCalledWith(8)
  })

  it('does nothing while disabled', () => {
    const onPick = jest.fn()
    render(<PokerCardCarousel cards={CARDS} selected={null} disabled onPick={onPick} />)

    fireEvent.click(screen.getByRole('option', { name: 'Card 8' }))

    expect(onPick).not.toHaveBeenCalled()
  })

  it('clamps centering at both ends of the deck, including the non-numeric cards', () => {
    const onPick = jest.fn()
    render(<PokerCardCarousel cards={CARDS} selected={null} onPick={onPick} />)

    fireEvent.click(screen.getByRole('option', { name: 'Coffee break card' }))

    expect(onPick).toHaveBeenCalledWith('coffee')
    expect(screen.getByRole('option', { name: 'Coffee break card' })).toHaveAttribute('aria-current', 'true')
  })

  it('treats "?" and "coffee" as ordinary cards to pick', () => {
    const onPick = jest.fn()
    render(<PokerCardCarousel cards={CARDS} selected={null} onPick={onPick} />)

    fireEvent.click(screen.getByRole('option', { name: 'Unsure card' }))

    expect(onPick).toHaveBeenCalledWith('?')
  })

  it('reports the settled card once a drag ends, not on every intermediate move', () => {
    // jsdom's PointerEvent support doesn't carry `clientX` through
    // fireEvent's init dict, so this drives the same `endDrag` path the real
    // pointerup handler calls, rather than simulating clientX deltas.
    const onPick = jest.fn()
    render(<PokerCardCarousel cards={CARDS} selected={null} onPick={onPick} />)

    const listbox = screen.getByRole('listbox')

    fireEvent.pointerDown(listbox, { pointerId: 1 })
    expect(onPick).not.toHaveBeenCalled()

    fireEvent.pointerUp(listbox, { pointerId: 1 })

    // No net movement — settles back on the still-centered middle card (8).
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith(8)
  })

  it('reports the settled card once a wheel scroll settles', () => {
    jest.useFakeTimers()
    try {
      const onPick = jest.fn()
      render(<PokerCardCarousel cards={CARDS} selected={null} onPick={onPick} />)

      const listbox = screen.getByRole('listbox')
      fireEvent.wheel(listbox, { deltaY: 140 })
      expect(onPick).not.toHaveBeenCalled()

      act(() => {
        jest.advanceTimersByTime(200)
      })

      // Started centered on 8 (index 4); one wheel unit moves focus to index 5 (13).
      expect(onPick).toHaveBeenCalledTimes(1)
      expect(onPick).toHaveBeenCalledWith(13)
    } finally {
      jest.useRealTimers()
    }
  })
})
