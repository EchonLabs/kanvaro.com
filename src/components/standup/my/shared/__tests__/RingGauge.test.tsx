/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { RingGauge } from '../RingGauge'

describe('RingGauge', () => {
  it('renders its children centred inside the ring', () => {
    render(
      <RingGauge percentage={60} tone="blue">
        <span>60%</span>
      </RingGauge>
    )
    expect(screen.getByText('60%')).toBeInTheDocument()
  })

  it('clamps a percentage above 100 rather than overdrawing the ring', () => {
    const { container } = render(<RingGauge percentage={140} tone="red" />)
    const circles = Array.from(container.querySelectorAll('circle'))
    const foreground = circles[1]
    // A fully-drawn ring has zero dash-offset — clamped to 100%, not left
    // reflecting the raw 140 input.
    expect(foreground).toHaveAttribute('stroke-dashoffset', '0')
  })

  it('clamps a negative percentage to an empty ring rather than drawing backwards', () => {
    const { container } = render(<RingGauge percentage={-20} tone="orange" />)
    const circles = Array.from(container.querySelectorAll('circle'))
    const foreground = circles[1]
    // An empty ring's offset equals its own full circumference (dasharray) —
    // nothing drawn, rather than the offset going negative and wrapping the
    // stroke back around the circle.
    expect(foreground.getAttribute('stroke-dashoffset')).toBe(
      foreground.getAttribute('stroke-dasharray')
    )
  })
})
