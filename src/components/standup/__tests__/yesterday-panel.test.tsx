/**
 * @jest-environment jsdom
 */
/**
 * Panel 2 — yesterday's review (Phase 8, Task 15 — RUN-9..RUN-13, E39, RUN-25).
 *
 * The assertions that matter here are the ones about what a PM can *tell apart*
 * at 09:05:
 *
 *   - all four buckets render, so an empty one is visibly empty rather than
 *     absent (RUN-9);
 *   - the completed bucket is collapsed but its count is not, because "six
 *     things finished" is the one fact about it worth reading;
 *   - a rejected status change goes back **and says so** (RUN-25) — a silent
 *     revert is worse than no optimism at all;
 *   - unplanned work is labelled rather than blended into the plan (E39).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { YesterdayPanel } from '@/components/standup/run/YesterdayPanel'
import { minutes, type Minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import { partitionYesterday, type YesterdayRow } from '@/lib/standup/yesterday'

const m = (value: number): Minutes => minutes(value)

const statusSets = {
  done: ['done'],
  inProgress: ['in_progress'],
  blocked: ['blocked']
}

const row = (overrides: Partial<YesterdayRow> = {}): YesterdayRow => ({
  allocationId: 'alloc-214',
  taskId: 'task-214',
  taskKey: 'KAN-214',
  title: 'Invoice model',
  memberId: 'kasun',
  memberName: 'Kasun Perera',
  previousStatus: 'todo',
  currentStatus: 'in_progress',
  plannedMinutes: m(360),
  loggedMinutes: m(480),
  dayVarianceMinutes: m(120),
  remainingEstimateMinutes: m(180),
  ageInStandups: 2,
  unplanned: false,
  ...overrides
})

const panelData = (rows: YesterdayRow[]) => ({
  previousStandupId: 'day-3',
  previousStandupDate: '2026-08-19',
  buckets: partitionYesterday({ rows, statusSets })
})

const makeApi = () => ({
  setStatus: jest.fn().mockResolvedValue(undefined),
  confirmCompleted: jest.fn().mockResolvedValue(undefined),
  openTask: jest.fn(),
  reviseEstimate: jest.fn()
})

describe('YesterdayPanel', () => {
  it('renders all four buckets in the RUN-9 order with the completed one collapsed', () => {
    const data = panelData([row(), row({ taskKey: 'KAN-255', taskId: 'task-255', currentStatus: 'done' })])
    render(<YesterdayPanel data={data} api={makeApi()} />)

    const headings = screen.getAllByRole('heading', { level: 4 }).map((node) => node.textContent)
    expect(headings).toEqual([
      standupStrings.yesterday.bucketCount({
        label: standupStrings.yesterday.bucketCompleted(),
        count: 1
      }),
      standupStrings.yesterday.bucketCount({
        label: standupStrings.yesterday.bucketInProgress(),
        count: 1
      }),
      standupStrings.yesterday.bucketCount({
        label: standupStrings.yesterday.bucketNotStarted(),
        count: 0
      }),
      standupStrings.yesterday.bucketCount({
        label: standupStrings.yesterday.bucketBlocked(),
        count: 0
      })
    ])

    // Collapsed, but its count is still readable.
    expect(screen.queryByTestId('yesterday-row-KAN-255')).not.toBeInTheDocument()
    expect(screen.getByTestId('yesterday-row-KAN-214')).toBeInTheDocument()
  })

  it('expands the completed bucket from a real button, so the keyboard works (NFR-A1)', () => {
    const data = panelData([row({ taskKey: 'KAN-255', taskId: 'task-255', currentStatus: 'done' })])
    render(<YesterdayPanel data={data} api={makeApi()} />)

    // A native <button> with aria-expanded is operable by Enter and Space
    // without any key handling of our own — which is why it is a button and
    // not a clickable heading.
    const toggle = screen.getAllByRole('button', { expanded: false })[0]
    expect(toggle.tagName).toBe('BUTTON')

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('yesterday-row-KAN-255')).toBeInTheDocument()
  })

  it('shows every RUN-12 field on a row', () => {
    render(<YesterdayPanel data={panelData([row()])} api={makeApi()} />)
    const rendered = within(screen.getByTestId('yesterday-row-KAN-214'))

    expect(rendered.getByText('KAN-214')).toBeInTheDocument()
    expect(rendered.getByText('Invoice model')).toBeInTheDocument()
    expect(rendered.getByLabelText('Kasun Perera')).toBeInTheDocument()
    expect(rendered.getByTestId('previous-status')).toHaveTextContent('todo')
    expect(rendered.getByTestId('current-status')).toHaveValue('in_progress')
    expect(rendered.getByTestId('planned')).toHaveTextContent('6.0h')
    expect(rendered.getByTestId('logged')).toHaveTextContent('8.0h')
    expect(rendered.getByTestId('day-variance')).toHaveTextContent('+2.0h')
    expect(rendered.getByTestId('remaining')).toHaveTextContent('3.0h')
    expect(rendered.getByTestId('age-badge')).toHaveTextContent(
      standupStrings.yesterday.ageBadge({ standups: 2 })
    )
  })

  it('omits the age badge on a task planned for the first time', () => {
    render(<YesterdayPanel data={panelData([row({ ageInStandups: 1 })])} api={makeApi()} />)
    expect(screen.queryByTestId('age-badge')).not.toBeInTheDocument()
  })

  it('marks the whole completed bucket confirmed in one action (RUN-13)', () => {
    const api = makeApi()
    const data = panelData([
      row({ taskKey: 'KAN-255', taskId: 'task-255', currentStatus: 'done' }),
      row({ taskKey: 'KAN-256', taskId: 'task-256', currentStatus: 'done' })
    ])
    render(<YesterdayPanel data={data} api={api} />)

    fireEvent.click(screen.getByRole('button', { name: /mark all confirmed/i }))
    expect(api.confirmCompleted).toHaveBeenCalledWith({ taskIds: ['task-255', 'task-256'] })
  })

  it('shows an unplanned badge on a row with no allocation (E39)', () => {
    const data = panelData([
      row({ taskKey: 'KAN-999', taskId: 'task-999', allocationId: undefined, unplanned: true })
    ])
    render(<YesterdayPanel data={data} api={makeApi()} />)

    expect(
      within(screen.getByTestId('yesterday-row-KAN-999')).getByText(
        standupStrings.yesterday.unplannedBadge()
      )
    ).toBeInTheDocument()
  })

  it('records a status change against the member it belongs to (RUN-11)', () => {
    const api = makeApi()
    render(<YesterdayPanel data={panelData([row()])} api={api} />)

    fireEvent.change(screen.getByLabelText('Status for KAN-214'), {
      target: { value: 'done' }
    })

    expect(api.setStatus).toHaveBeenCalledWith({
      taskIds: ['task-214'],
      status: 'done',
      onBehalfOf: 'kasun'
    })
  })

  it('rolls a status change back and raises a toast when the server refuses (RUN-25)', async () => {
    const api = makeApi()
    api.setStatus.mockRejectedValueOnce(new Error('STALE_STANDUP'))
    render(<YesterdayPanel data={panelData([row()])} api={api} />)

    const select = screen.getByLabelText('Status for KAN-214')
    fireEvent.change(select, { target: { value: 'done' } })

    expect(await screen.findByRole('alert')).toHaveTextContent(standupStrings.run.editRejected())
    await waitFor(() => expect(select).toHaveValue('in_progress'))
  })

  it('renders the empty state for a day-one stand-up, which has no yesterday', () => {
    render(
      <YesterdayPanel
        data={{ buckets: partitionYesterday({ rows: [], statusSets }) }}
        api={makeApi()}
      />
    )
    expect(screen.getByText(standupStrings.yesterday.noPreviousStandup())).toBeInTheDocument()
    expect(screen.queryByTestId(/yesterday-row-/)).not.toBeInTheDocument()
  })

  it('opens the revision modal and the task drawer from the row (RUN-10)', () => {
    const api = makeApi()
    render(<YesterdayPanel data={panelData([row()])} api={api} />)

    fireEvent.click(screen.getByRole('button', { name: /revise remaining estimate/i }))
    expect(api.reviseEstimate).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'task-214' }))

    fireEvent.click(screen.getByRole('button', { name: /open KAN-214/i }))
    expect(api.openTask).toHaveBeenCalledWith('task-214')
  })

  it('disables every control while the stand-up is locked', () => {
    render(<YesterdayPanel data={panelData([row()])} api={makeApi()} disabled />)
    expect(screen.getByLabelText('Status for KAN-214')).toBeDisabled()
  })
})
