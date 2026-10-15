/**
 * Ceremony deductions — the pure planner (plan §4, DN-1 … DN-7).
 *
 * The rules here decide how much of a member's day is already spoken for before
 * a single allocation exists, so every one of them is pinned individually. DN-3
 * gets the most coverage in the file because it is the defect that would never
 * be noticed: fifteen minutes removed twice a day still looks like a plausible
 * number, forever.
 */
import { minutes } from '../minutes'
import {
  planCeremonyDeductions,
  totalCeremonyMinutes,
  PROJECT_STANDUP_EVENT_ID,
  type CeremonyEventInput
} from '../ceremonies'

const KASUN = 'kasun'
const NIMAL = 'nimal'
const AMARA = 'amara'
const TEAM = [KASUN, NIMAL, AMARA]

function event(partial: Partial<CeremonyEventInput> = {}): CeremonyEventInput {
  return {
    eventId: 'evt-1',
    title: 'Sprint Review',
    eventType: 'review',
    durationMinutes: 60,
    status: 'scheduled',
    attendeeIds: [...TEAM],
    ...partial
  }
}

function deductionsFor(memberId: string, result: ReturnType<typeof planCeremonyDeductions>) {
  return result.deductions.get(memberId) ?? []
}

describe('a ceremony everyone attends', () => {
  it('removes its duration from every attendee', () => {
    const result = planCeremonyDeductions({ events: [event()], memberIds: TEAM })

    for (const memberId of TEAM) {
      expect(totalCeremonyMinutes(deductionsFor(memberId, result))).toBe(60)
    }
  })

  it('itemises the deduction rather than lumping it (DN-7)', () => {
    const result = planCeremonyDeductions({
      events: [
        event({ eventId: 'evt-1', title: 'Sprint Review', durationMinutes: 60 }),
        event({ eventId: 'evt-2', title: 'Retrospective', eventType: 'retrospective', durationMinutes: 45 })
      ],
      memberIds: TEAM
    })

    expect(deductionsFor(KASUN, result)).toEqual([
      { eventId: 'evt-1', title: 'Sprint Review', eventType: 'review', minutes: 60 },
      { eventId: 'evt-2', title: 'Retrospective', eventType: 'retrospective', minutes: 45 }
    ])
  })
})

describe('attendance scoping (DN-4)', () => {
  it('shrinks only the days of the named attendees', () => {
    const result = planCeremonyDeductions({
      events: [event({ title: 'Customer demo', eventType: 'demo', attendeeIds: [KASUN, NIMAL] })],
      memberIds: TEAM
    })

    expect(totalCeremonyMinutes(deductionsFor(KASUN, result))).toBe(60)
    expect(totalCeremonyMinutes(deductionsFor(NIMAL, result))).toBe(60)
    expect(deductionsFor(AMARA, result)).toEqual([])
  })

  it('includes the facilitator even when they are not listed as an attendee', () => {
    const result = planCeremonyDeductions({
      events: [event({ attendeeIds: [KASUN], facilitatorId: AMARA })],
      memberIds: TEAM
    })

    expect(totalCeremonyMinutes(deductionsFor(AMARA, result))).toBe(60)
  })

  it('never deducts twice when the facilitator is also an attendee', () => {
    const result = planCeremonyDeductions({
      events: [event({ attendeeIds: [KASUN, NIMAL], facilitatorId: KASUN })],
      memberIds: TEAM
    })

    expect(deductionsFor(KASUN, result)).toHaveLength(1)
    expect(totalCeremonyMinutes(deductionsFor(KASUN, result))).toBe(60)
  })

  it("a demo with three named attendees shrinks exactly three members' days", () => {
    // The exit criterion, literally. A demo the whole team is not in must not
    // shrink the whole team's day — that is the failure DN-4 exists to prevent,
    // and it is invisible in aggregate because the total still looks plausible.
    const wider = [...TEAM, 'dilani', 'roshan']
    const result = planCeremonyDeductions({
      events: [
        event({ title: 'Customer demo', eventType: 'demo', attendeeIds: [KASUN, NIMAL, AMARA] })
      ],
      memberIds: wider
    })

    expect(result.deductions.size).toBe(3)
    for (const memberId of TEAM) {
      expect(totalCeremonyMinutes(deductionsFor(memberId, result))).toBe(60)
    }
    for (const memberId of ['dilani', 'roshan']) {
      expect(deductionsFor(memberId, result)).toEqual([])
    }
  })

  it('ignores attendees who are not members of the stand-up', () => {
    const result = planCeremonyDeductions({
      events: [event({ attendeeIds: [KASUN, 'someone-from-another-team'] })],
      memberIds: TEAM
    })

    expect(result.deductions.has('someone-from-another-team')).toBe(false)
  })

  it('deducts from nobody when the event has no attendees, and says so', () => {
    const result = planCeremonyDeductions({
      events: [event({ title: 'All hands', attendeeIds: [] })],
      memberIds: TEAM
    })

    expect(result.deductions.size).toBe(0)
    expect(result.unattended).toEqual([
      { eventId: 'evt-1', title: 'All hands', eventType: 'review' }
    ])
  })
})

describe('DN-3 — the daily stand-up is deducted exactly once', () => {
  it('excludes a daily_standup SprintEvent from the ceremony sum', () => {
    const result = planCeremonyDeductions({
      events: [event({ title: 'Daily stand-up', eventType: 'daily_standup', durationMinutes: 15 })],
      memberIds: TEAM
    })

    expect(result.deductions.size).toBe(0)
  })

  it('deducts the stand-up once even when a duplicate SprintEvent also exists', () => {
    const result = planCeremonyDeductions({
      events: [event({ title: 'Daily stand-up', eventType: 'daily_standup', durationMinutes: 15 })],
      memberIds: TEAM,
      standupDurationMinutes: minutes(15)
    })

    for (const memberId of TEAM) {
      const rows = deductionsFor(memberId, result)
      expect(rows).toHaveLength(1)
      expect(rows[0].eventId).toBe(PROJECT_STANDUP_EVENT_ID)
      expect(totalCeremonyMinutes(rows)).toBe(15)
    }
  })

  it('deducts the stand-up for every expected member when no SprintEvent exists at all', () => {
    const result = planCeremonyDeductions({
      events: [],
      memberIds: TEAM,
      standupDurationMinutes: minutes(15)
    })

    expect(totalCeremonyMinutes(deductionsFor(NIMAL, result))).toBe(15)
  })

  it('leaves the stand-up out when the caller does not ask for it', () => {
    const result = planCeremonyDeductions({ events: [], memberIds: TEAM })

    expect(result.deductions.size).toBe(0)
  })

  it('ignores a zero-minute stand-up duration rather than listing an empty row', () => {
    const result = planCeremonyDeductions({
      events: [],
      memberIds: TEAM,
      standupDurationMinutes: minutes(0)
    })

    expect(result.deductions.size).toBe(0)
  })
})

describe('cancelled and non-deducting events (DN-5)', () => {
  it('deducts nothing for a cancelled retro', () => {
    const result = planCeremonyDeductions({
      events: [event({ title: 'Retrospective', eventType: 'retrospective', status: 'cancelled' })],
      memberIds: TEAM
    })

    expect(result.deductions.size).toBe(0)
  })

  it('does not report a cancelled event as unattended', () => {
    const result = planCeremonyDeductions({
      events: [event({ status: 'cancelled', attendeeIds: [] })],
      memberIds: TEAM
    })

    expect(result.unattended).toEqual([])
  })

  it('still deducts a completed ceremony — the hours were spent', () => {
    const result = planCeremonyDeductions({
      events: [event({ status: 'completed' })],
      memberIds: TEAM
    })

    expect(totalCeremonyMinutes(deductionsFor(KASUN, result))).toBe(60)
  })

  it('ignores an event with no duration', () => {
    const result = planCeremonyDeductions({
      events: [event({ durationMinutes: 0 })],
      memberIds: TEAM
    })

    expect(result.deductions.size).toBe(0)
  })
})

describe('totalCeremonyMinutes', () => {
  it('is zero for an empty list', () => {
    expect(totalCeremonyMinutes([])).toBe(0)
  })

  it('sums in integer minutes', () => {
    const result = planCeremonyDeductions({
      events: [
        event({ eventId: 'a', durationMinutes: 45 }),
        event({ eventId: 'b', durationMinutes: 30 })
      ],
      memberIds: TEAM,
      standupDurationMinutes: minutes(15)
    })

    expect(totalCeremonyMinutes(deductionsFor(KASUN, result))).toBe(90)
  })
})
