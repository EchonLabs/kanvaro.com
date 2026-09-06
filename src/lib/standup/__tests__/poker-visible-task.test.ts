/**
 * Which task a poker modal should be showing (PLN-11).
 *
 * Regression cover for a real stall: every client held the task it opened on
 * and nothing re-read the session, so when the facilitator finalised task one
 * and the server advanced `currentTask`, the voters' modals stayed on task one
 * — which was now `estimated` and refused their votes. Only the facilitator
 * moved, because only they saw `nextTaskId` in their own finalize response.
 *
 * The server's `currentTask` is the single source of truth; every client
 * follows it.
 */
import { resolveVisibleTask } from '../poker'

const queue = [
  { taskId: 'task-1', status: 'estimated' },
  { taskId: 'task-2', status: 'voting' },
  { taskId: 'task-3', status: 'pending' }
]

describe('resolveVisibleTask', () => {
  it("follows the server's currentTask, overriding what the client was showing", () => {
    expect(
      resolveVisibleTask({ serverCurrentTask: 'task-2', queue, showing: 'task-1' })
    ).toBe('task-2')
  })

  it('falls back to the first unestimated task when the server names none', () => {
    expect(resolveVisibleTask({ serverCurrentTask: null, queue, showing: 'task-1' })).toBe('task-2')
  })

  it('ignores a currentTask that is not in the queue', () => {
    expect(
      resolveVisibleTask({ serverCurrentTask: 'not-in-queue', queue, showing: 'task-1' })
    ).toBe('task-2')
  })

  it('returns null when every task is estimated, so the modal can close', () => {
    expect(
      resolveVisibleTask({
        serverCurrentTask: null,
        queue: [{ taskId: 'task-1', status: 'estimated' }],
        showing: 'task-1'
      })
    ).toBeNull()
  })

  it('keeps showing the current task when nothing has moved', () => {
    expect(
      resolveVisibleTask({ serverCurrentTask: 'task-2', queue, showing: 'task-2' })
    ).toBe('task-2')
  })

  it('copes with an empty queue', () => {
    expect(resolveVisibleTask({ serverCurrentTask: null, queue: [], showing: undefined })).toBeNull()
  })
})
