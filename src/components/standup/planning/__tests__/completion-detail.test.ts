/**
 * The secondary line on the "Planning complete" card.
 *
 * It used to say stand-ups "are generated when the scheduler runs", which was
 * never true — they are generated as planning completes — and flatly
 * contradicted the main message when the project has stand-ups turned off.
 */
import { completionDetail } from '../completion-detail'

describe('completionDetail', () => {
  it('names how many stand-ups were scheduled', () => {
    expect(completionDetail({ created: 5, totalSprintDays: 5 })).toBe(
      '5 stand-ups scheduled, one for each working day.'
    )
  })

  it('uses the singular for a one-day sprint', () => {
    expect(completionDetail({ created: 1, totalSprintDays: 1 })).toBe(
      '1 stand-up scheduled, one for each working day.'
    )
  })

  it('says nothing more when stand-ups are off — the main message already explains', () => {
    expect(completionDetail(null)).toBeNull()
    expect(completionDetail(undefined)).toBeNull()
  })

  it('says nothing more when every day already had a stand-up', () => {
    expect(completionDetail({ created: 0, totalSprintDays: 5 })).toBeNull()
  })
})
