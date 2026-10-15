/**
 * @jest-environment jsdom
 */

/**
 * The Estimation section's unit choice (PLN-10/13).
 *
 * Pinned because the unit decides whether a voted "4" becomes four hours or
 * sixteen, and the points-to-hours factor only means anything under points —
 * showing it under hours invites a PM to tune a number that changes nothing.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { StandupConfigSettings } from '../StandupConfigSettings'

jest.mock('@/lib/notify', () => {
  const notify = { success: jest.fn(), error: jest.fn(), info: jest.fn() }
  return { useNotify: () => notify }
})

jest.mock('../PointsMigrationDialog', () => ({
  PointsMigrationDialog: () => null
}))

const baseSettings = {
  enabled: true,
  standupLocalTime: '09:15',
  durationMinutes: 15,
  readyLeadMinutes: 15,
  reminderLeadMinutes: 60,
  overrunPolicy: 'absorb',
  underToleranceHours: 0.25,
  overToleranceHours: 0.25,
  carryForwardNoteThreshold: 3,
  carryForwardEscalationThreshold: 5,
  reopenWindowHours: 24,
  backfillWindowWorkingDays: 2,
  allowSelfSelect: false,
  allowMemberPreEdit: true,
  carryDebtBetweenSprints: false,
  crossSprintCarryForward: false,
  blockedTasksConsumeCapacity: false,
  requireOverAllocationAck: true,
  ceremoniesConsumeCapacity: true,
  pointsToHours: 4
}

let fetchMock: jest.Mock

const respond = (data: unknown) => ({ ok: true, json: async () => ({ data }) })

function mount(estimationUnit: 'story_points' | 'hours') {
  const settings = { ...baseSettings, estimationUnit }
  fetchMock = jest.fn(async (_url: string, init?: RequestInit) =>
    init?.method === 'PUT'
      ? respond({ settings: JSON.parse(String(init.body)) })
      : respond({ settings, unattendedCeremonies: [] })
  )
  global.fetch = fetchMock as any
  render(<StandupConfigSettings projectId="p1" />)
}

const card = (name: RegExp) => screen.getByRole('button', { name })

describe('StandupConfigSettings — estimation unit', () => {
  it('shows story points selected, with the conversion factor', async () => {
    mount('story_points')

    await waitFor(() => expect(card(/^Story points/)).toHaveAttribute('aria-pressed', 'true'))
    expect(card(/^Hours/)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('Points to hours')).toBeInTheDocument()
    expect(screen.getByText('Each point is 4h of capacity.')).toBeInTheDocument()
  })

  it('shows hours selected, without the conversion factor', async () => {
    mount('hours')

    await waitFor(() => expect(card(/^Hours/)).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.queryByLabelText('Points to hours')).not.toBeInTheDocument()
  })

  it('hides the factor as soon as hours is picked, and brings it back for points', async () => {
    mount('story_points')
    await screen.findByLabelText('Points to hours')

    fireEvent.click(card(/^Hours/))
    expect(screen.queryByLabelText('Points to hours')).not.toBeInTheDocument()

    fireEvent.click(card(/^Story points/))
    expect(screen.getByLabelText('Points to hours')).toBeInTheDocument()
  })

  it('saves the chosen unit', async () => {
    mount('story_points')
    await screen.findByLabelText('Points to hours')

    fireEvent.click(card(/^Hours/))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    })

    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(JSON.parse(put[1].body).estimationUnit).toBe('hours')
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Save settings' })).not.toBeInTheDocument()
    )
  })

  it('marks the form clean again when the unit is switched back', async () => {
    mount('story_points')
    await screen.findByLabelText('Points to hours')

    fireEvent.click(card(/^Hours/))
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeInTheDocument()

    fireEvent.click(card(/^Story points/))
    expect(screen.queryByRole('button', { name: 'Save settings' })).not.toBeInTheDocument()
  })
})
