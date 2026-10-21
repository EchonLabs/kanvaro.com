/**
 * @jest-environment jsdom
 */
/**
 * The summary screen end to end: one payload in, every §15.13 section out.
 *
 * The sections themselves are covered by their own tests — what this proves
 * is the wiring the page owns and nothing else does: that the three load
 * states are distinguishable, that a completed stand-up renders every section
 * (including the commonly-empty ones), and that the export actions reach the
 * export route and the clipboard.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import StandupSummaryPage from '../page'
import { standupStrings } from '@/lib/standup/strings'

jest.mock('@/components/layout/MainLayout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}))

const s = standupStrings.summary

const params = { id: 'p1', sprintId: 'sp1', standupId: 'st1' }

const payload = {
  headerFacts: {
    standupDate: '2026-09-11',
    dayNumber: 2,
    totalDays: 10,
    facilitatorName: 'PM Ruth',
    durationMinutes: 15
  },
  attendance: [
    { memberId: 'm1', name: 'PM Ruth', status: 'present', email: 'ruth@example.test' }
  ],
  completedYesterday: [],
  varianceTable: [],
  debtMovements: [],
  memberCommitments: [],
  blockersRaised: [],
  blockersResolved: [],
  carryForwardState: [],
  overridesIssued: []
}

function mockSummaryResponse(response: Partial<Response> & { json?: () => unknown }) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: payload }),
    ...response
  }) as unknown as typeof fetch
}

describe('StandupSummaryPage', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('says it is loading before the payload arrives', () => {
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {})) as unknown as typeof fetch

    render(<StandupSummaryPage params={params} />)

    expect(screen.getByText(s.loading())).toBeInTheDocument()
  })

  it('explains that an unfinished stand-up has no summary yet', async () => {
    mockSummaryResponse({ ok: false, status: 404 })

    render(<StandupSummaryPage params={params} />)

    expect(await screen.findByText(s.notAvailable())).toBeInTheDocument()
  })

  it('reports a failed load rather than showing a blank page', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch

    render(<StandupSummaryPage params={params} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(s.loadFailed())
  })

  it('renders every section, including the ones with nothing in them', async () => {
    mockSummaryResponse({})

    render(<StandupSummaryPage params={params} />)

    await screen.findByRole('heading', { level: 1 })

    for (const title of [
      s.sectionAttendance(),
      s.sectionCompletedYesterday(),
      s.sectionVariance(),
      s.sectionCommitments(),
      s.sectionDebtMovements(),
      s.sectionCarryForward(),
      s.sectionBlockersRaised(),
      s.sectionBlockersResolved(),
      s.sectionOverrides()
    ]) {
      expect(screen.getByRole('heading', { name: title, level: 2 })).toBeInTheDocument()
    }
  })

  it('leaves the PM notes section out when the stand-up recorded none', async () => {
    mockSummaryResponse({})

    render(<StandupSummaryPage params={params} />)
    await screen.findByRole('heading', { level: 1 })

    expect(screen.queryByRole('heading', { name: s.sectionNotes() })).not.toBeInTheDocument()
  })

  it('shows the PM notes section when there are notes', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { ...payload, pmNotes: 'Watch the vendor sandbox.' } })
    }) as unknown as typeof fetch

    render(<StandupSummaryPage params={params} />)

    expect(await screen.findByText('Watch the vendor sandbox.')).toBeInTheDocument()
  })

  it('copies the exported markdown to the clipboard', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    global.fetch = jest.fn().mockImplementation((url: string) =>
      url.includes('/export')
        ? Promise.resolve({ ok: true, status: 200, text: async () => '# Stand-up' })
        : Promise.resolve({ ok: true, status: 200, json: async () => ({ data: payload }) })
    ) as unknown as typeof fetch

    render(<StandupSummaryPage params={params} />)
    fireEvent.click(await screen.findByRole('button', { name: s.copyAsText() }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('# Stand-up'))
    expect(await screen.findByText(s.copied())).toBeInTheDocument()
  })

  it('says so when the clipboard refuses', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockRejectedValue(new Error('denied')) }
    })
    mockSummaryResponse({ text: async () => '# Stand-up' })

    render(<StandupSummaryPage params={params} />)
    fireEvent.click(await screen.findByRole('button', { name: s.copyAsText() }))

    expect(await screen.findByText(s.copyFailed())).toBeInTheDocument()
  })

  it('prints through the browser, which is how the PDF is produced', async () => {
    mockSummaryResponse({})
    const print = jest.fn()
    Object.assign(window, { print })

    render(<StandupSummaryPage params={params} />)
    fireEvent.click(await screen.findByRole('button', { name: s.printOrSave() }))

    expect(print).toHaveBeenCalledTimes(1)
  })
})
