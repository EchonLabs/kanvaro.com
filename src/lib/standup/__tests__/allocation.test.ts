/**
 * The pure allocation rules (Phase 7, Task 2 — ALO-5, ALO-7, ALO-8, ALO-9).
 *
 * These four rules are what the PM feels every time they drop a task onto a
 * member. ALO-5 in particular is the difference between a board that fills
 * itself sensibly and one that needs a correction after every single drop, so
 * its boundaries are tested exhaustively rather than representatively.
 *
 * All of it is pure. The service layer decides *whether* an allocation may
 * exist; this file decides only what its numbers should be.
 */
import {
  defaultPlannedMinutes,
  describeSplit,
  largerThanOneDay,
  pairingWarning,
  ALLOCATION_STEP_MINUTES
} from '../allocation'
import { minutes } from '../minutes'

const m = minutes

/** A standard eight-hour day, in minutes. */
const FULL_DAY = m(480)

describe('defaultPlannedMinutes (ALO-5)', () => {
  it('offers the whole task when it fits inside the gap', () => {
    expect(
      defaultPlannedMinutes({
        remainingEstimateMinutes: m(180),
        gapMinutes: m(480),
        nominalMinutes: FULL_DAY
      })
    ).toBe(180)
  })

  it('offers the gap when the task is larger — the remainder carries to tomorrow', () => {
    expect(
      defaultPlannedMinutes({
        remainingEstimateMinutes: m(420),
        gapMinutes: m(180),
        nominalMinutes: FULL_DAY
      })
    ).toBe(180)
  })

  it('offers exactly the gap when the two are equal', () => {
    expect(
      defaultPlannedMinutes({
        remainingEstimateMinutes: m(180),
        gapMinutes: m(180),
        nominalMinutes: FULL_DAY
      })
    ).toBe(180)
  })

  it('offers the gap when the task is one minute larger', () => {
    expect(
      defaultPlannedMinutes({
        remainingEstimateMinutes: m(181),
        gapMinutes: m(180),
        nominalMinutes: FULL_DAY
      })
    ).toBe(180)
  })

  it('never returns zero — a fifteen-minute floor applies below the step', () => {
    expect(
      defaultPlannedMinutes({
        remainingEstimateMinutes: m(5),
        gapMinutes: m(480),
        nominalMinutes: FULL_DAY
      })
    ).toBe(ALLOCATION_STEP_MINUTES)
  })

  describe('when the day is already full — ALO-5 second sentence', () => {
    // "If the gap is zero, the default is min(remaining, 1h) and the member
    // goes into over status, prompting the PM." The over status is the point:
    // the PM asked for this, so the rule must produce a number rather than
    // refuse, and let the capacity meter do the arguing.

    it('offers one hour against a zero gap', () => {
      expect(
        defaultPlannedMinutes({
          remainingEstimateMinutes: m(420),
          gapMinutes: m(0),
          nominalMinutes: FULL_DAY
        })
      ).toBe(60)
    })

    it('offers one hour against a negative gap — already over is still over', () => {
      expect(
        defaultPlannedMinutes({
          remainingEstimateMinutes: m(420),
          gapMinutes: m(-120),
          nominalMinutes: FULL_DAY
        })
      ).toBe(60)
    })

    it('offers the whole task against a zero gap when it is smaller than an hour', () => {
      expect(
        defaultPlannedMinutes({
          remainingEstimateMinutes: m(30),
          gapMinutes: m(0),
          nominalMinutes: FULL_DAY
        })
      ).toBe(30)
    })

    it('still respects the floor against a zero gap', () => {
      expect(
        defaultPlannedMinutes({
          remainingEstimateMinutes: m(5),
          gapMinutes: m(0),
          nominalMinutes: FULL_DAY
        })
      ).toBe(ALLOCATION_STEP_MINUTES)
    })
  })

  it('treats a missing remaining estimate as zero and still returns the floor', () => {
    // CC-2 refuses unestimated tasks at the service layer. This rule must not
    // also throw, because it runs on the client to preview a drop before the
    // request is made.
    expect(
      defaultPlannedMinutes({
        remainingEstimateMinutes: m(0),
        gapMinutes: m(480),
        nominalMinutes: FULL_DAY
      })
    ).toBe(ALLOCATION_STEP_MINUTES)
  })
})

describe('describeSplit (ALO-7)', () => {
  it('describes the split when the allocation covers only part of the remainder', () => {
    expect(describeSplit(m(180), m(420))).toEqual({
      plannedMinutes: 180,
      remainingEstimateMinutes: 420,
      carriesMinutes: 240
    })
  })

  it('returns null when the allocation covers the whole remainder', () => {
    expect(describeSplit(m(420), m(420))).toBeNull()
  })

  it('returns null when the allocation exceeds the remainder — nothing carries', () => {
    expect(describeSplit(m(480), m(420))).toBeNull()
  })
})

describe('largerThanOneDay (ALO-8)', () => {
  it('flags a task bigger than the member’s nominal day', () => {
    expect(largerThanOneDay(m(600), FULL_DAY)).toBe(true)
  })

  it('does not flag a task exactly one day long', () => {
    expect(largerThanOneDay(FULL_DAY, FULL_DAY)).toBe(false)
  })

  it('measures against nominal, not effective — a half day off does not make every task large', () => {
    // The advisory is about the task's shape, not today's availability. A
    // four-hour task is not "larger than one day" merely because the member is
    // on leave this afternoon.
    expect(largerThanOneDay(m(240), FULL_DAY)).toBe(false)
  })
})

describe('pairingWarning (ALO-9)', () => {
  it('is silent when the pair sums to the remaining estimate', () => {
    expect(
      pairingWarning([{ plannedMinutes: m(180) }, { plannedMinutes: m(240) }], m(420))
    ).toBeNull()
  })

  it('is silent below the remaining estimate', () => {
    expect(
      pairingWarning([{ plannedMinutes: m(120) }, { plannedMinutes: m(120) }], m(420))
    ).toBeNull()
  })

  it('warns with the overage when the pair exceeds the remaining estimate', () => {
    expect(
      pairingWarning([{ plannedMinutes: m(300) }, { plannedMinutes: m(240) }], m(420))
    ).toEqual({ totalMinutes: 540, remainingEstimateMinutes: 420, overByMinutes: 120 })
  })

  it('is silent for a single allocation, however large — that is ALO-8’s business', () => {
    expect(pairingWarning([{ plannedMinutes: m(600) }], m(420))).toBeNull()
  })

  it('is silent for no allocations', () => {
    expect(pairingWarning([], m(420))).toBeNull()
  })
})
