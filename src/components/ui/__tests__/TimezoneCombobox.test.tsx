/**
 * @jest-environment jsdom
 */
/**
 * The searchable timezone picker: typing filters the ~420 zones, spaces match
 * underscores, and choosing one reports it and closes the list.
 */
import { fireEvent, render, screen } from '@testing-library/react'

import { TimezoneCombobox } from '../TimezoneCombobox'

beforeAll(() => {
  // cmdk and Radix measure and scroll; jsdom implements neither.
  ;(global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.scrollIntoView = jest.fn()
})

function openPicker(value = 'UTC') {
  const onChange = jest.fn()
  render(<TimezoneCombobox id="timezone" value={value} onChange={onChange} />)
  fireEvent.click(screen.getByRole('combobox'))
  return onChange
}

describe('TimezoneCombobox', () => {
  it('shows the current value on the trigger', () => {
    render(<TimezoneCombobox value="Asia/Colombo" onChange={jest.fn()} />)
    expect(screen.getByRole('combobox')).toHaveTextContent('Asia/Colombo')
  })

  it('filters by what is typed and reports the chosen zone', () => {
    const onChange = openPicker()

    fireEvent.change(screen.getByLabelText('Search timezones'), { target: { value: 'colombo' } })

    expect(screen.queryByText('Europe/London')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Asia/Colombo'))

    expect(onChange).toHaveBeenCalledWith('Asia/Colombo')
    expect(screen.queryByLabelText('Search timezones')).not.toBeInTheDocument()
  })

  it('matches spaces against underscores', () => {
    openPicker()

    fireEvent.change(screen.getByLabelText('Search timezones'), { target: { value: 'new york' } })

    expect(screen.getByText('America/New_York')).toBeInTheDocument()
  })

  it('still offers a saved zone that is outside the list', () => {
    openPicker('Legacy/Zone')
    expect(screen.getAllByText('Legacy/Zone').length).toBeGreaterThan(1)
  })
})
