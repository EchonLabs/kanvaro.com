/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { StatusPill } from '../StatusPill'

describe('StatusPill', () => {
  it.each([
    ['blue', 'apple-system-blue'],
    ['green', 'apple-system-green'],
    ['orange', 'apple-system-orange'],
    ['red', 'apple-system-red']
  ] as const)('renders %s tone with the matching Apple system colour token', (tone, token) => {
    render(<StatusPill tone={tone}>Label</StatusPill>)
    const pill = screen.getByText('Label')
    expect(pill.className).toEqual(expect.stringContaining(token))
  })

  it('renders the neutral tone without any system colour token', () => {
    render(<StatusPill tone="neutral">Label</StatusPill>)
    const pill = screen.getByText('Label')
    expect(pill.className).not.toEqual(expect.stringContaining('apple-system-'))
  })
})
