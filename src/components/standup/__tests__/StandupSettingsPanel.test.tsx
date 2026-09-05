/**
 * @jest-environment jsdom
 */

/**
 * Keyboard behaviour of the stand-up settings segmented control.
 *
 * The control declares `role="tablist"` / `role="tab"`, which is a promise to
 * assistive technology: arrow keys move between tabs, only the selected tab is
 * in the page's tab sequence, and each tab owns a panel. None of that was
 * implemented, so a screen-reader user was told to press arrow keys that did
 * nothing — worse than plain buttons, which at least behave as they announce.
 *
 * Pinned here because the same pattern is due to reappear on the Phase 7 run
 * screen, which is far more interactive than this one.
 */
import { fireEvent, render, screen } from '@testing-library/react'

import { StandupSettingsPanel } from '../StandupSettingsPanel'

jest.mock('@/lib/permissions/permission-context', () => ({
  usePermissions: () => ({
    hasPermission: () => true,
    loading: false,
    permissions: { global: [], project: {} }
  })
}))

// The three panels each fetch on mount; this suite is about the tablist.
jest.mock('../WorkingCalendarSettings', () => ({
  WorkingCalendarSettings: () => <div>calendar panel</div>
}))
jest.mock('../StandupConfigSettings', () => ({
  StandupConfigSettings: () => <div>configuration panel</div>
}))
jest.mock('../CapacityMembersSettings', () => ({
  CapacityMembersSettings: () => <div>capacity panel</div>
}))

const tabs = () => screen.getAllByRole('tab')

/** Sends a key to whichever tab currently holds focus. */
const press = (key: string) =>
  fireEvent.keyDown(document.activeElement as HTMLElement, { key })

describe('StandupSettingsPanel — tablist keyboard contract', () => {
  it('keeps only the selected tab in the page tab sequence (roving tabindex)', () => {
    render(<StandupSettingsPanel projectId="p1" />)

    expect(tabs().map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])
  })

  it('moves selection with ArrowRight', () => {
    render(<StandupSettingsPanel projectId="p1" />)

    tabs()[0].focus()
    press('ArrowRight')

    expect(tabs()[1]).toHaveAttribute('aria-selected', 'true')
    expect(tabs()[1]).toHaveFocus()
  })

  it('moves selection with ArrowLeft', () => {
    render(<StandupSettingsPanel projectId="p1" />)

    tabs()[0].focus()
    press('ArrowRight')
    press('ArrowLeft')

    expect(tabs()[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs()[0]).toHaveFocus()
  })

  it('wraps from the last tab to the first', () => {
    render(<StandupSettingsPanel projectId="p1" />)

    tabs()[0].focus()
    press('ArrowLeft')

    expect(tabs()[2]).toHaveAttribute('aria-selected', 'true')
  })

  it('jumps to the first and last tab with Home and End', () => {
    render(<StandupSettingsPanel projectId="p1" />)

    tabs()[0].focus()
    press('End')
    expect(tabs()[2]).toHaveAttribute('aria-selected', 'true')

    press('Home')
    expect(tabs()[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('shows the panel belonging to the selected tab', () => {
    render(<StandupSettingsPanel projectId="p1" />)

    expect(screen.getByText('calendar panel')).toBeInTheDocument()

    tabs()[0].focus()
    press('ArrowRight')

    expect(screen.getByText('configuration panel')).toBeInTheDocument()
    expect(screen.queryByText('calendar panel')).not.toBeInTheDocument()
  })

  it('gives every tab a panel that names it back', () => {
    render(<StandupSettingsPanel projectId="p1" />)

    const selected = tabs().find((tab) => tab.getAttribute('aria-selected') === 'true')!
    const panel = screen.getByRole('tabpanel')

    expect(selected).toHaveAttribute('aria-controls', panel.id)
    expect(panel).toHaveAttribute('aria-labelledby', selected.id)
  })

  it('still selects on click, for everyone not using a keyboard', () => {
    render(<StandupSettingsPanel projectId="p1" />)

    fireEvent.click(tabs()[2])

    expect(tabs()[2]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('capacity panel')).toBeInTheDocument()
  })
})
