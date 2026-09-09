import { isOwnRowReadOnly, isSelfSelectDisabled } from '../own-row'

/**
 * RUN-26, extracted from the two screens that used to state it separately.
 * The two call shapes below are exactly what those screens pass:
 * `StandupRunScreen` supplies the viewer's real `canAllocateOthers` (or `true`
 * when it has no viewer at all), `MyStandupScreen` always supplies `false`.
 */
describe('isOwnRowReadOnly', () => {
  describe("the member screen's call shape (canAllocateOthers: false)", () => {
    it('allows editing while the stand-up is Ready', () => {
      expect(isOwnRowReadOnly({ status: 'Ready', canAllocateOthers: false })).toBe(false)
    })

    it('locks the row the moment the stand-up starts', () => {
      expect(isOwnRowReadOnly({ status: 'In_Progress', canAllocateOthers: false })).toBe(true)
    })

    it('locks every other status too, not only In_Progress', () => {
      for (const status of ['Scheduled', 'Completed', 'Reopened', 'Missed', 'Cancelled']) {
        expect(isOwnRowReadOnly({ status, canAllocateOthers: false })).toBe(true)
      }
    })
  })

  describe("the run screen's call shape", () => {
    it('never locks a PM out, whatever the status', () => {
      for (const status of ['Ready', 'In_Progress', 'Completed']) {
        expect(isOwnRowReadOnly({ status, canAllocateOthers: true })).toBe(false)
      }
    })

    it('locks a member viewing the run screen once it has started', () => {
      expect(isOwnRowReadOnly({ status: 'In_Progress', canAllocateOthers: false })).toBe(true)
    })
  })
})

/**
 * Task 14/E31. Narrower and deliberately different from `isOwnRowReadOnly`
 * above: adding a brand-new self-selected task is meant to stay possible on
 * `Completed`, while editing an *existing* row's hours (what
 * `isOwnRowReadOnly` governs) must not be.
 */
describe('isSelfSelectDisabled', () => {
  it('stays enabled on Ready when self-select is allowed', () => {
    expect(
      isSelfSelectDisabled({ status: 'Ready', canAllocateOthers: false, allowSelfSelect: true })
    ).toBe(false)
  })

  it('is enabled on Completed when self-select is allowed — the whole point of E31', () => {
    expect(
      isSelfSelectDisabled({
        status: 'Completed',
        canAllocateOthers: false,
        allowSelfSelect: true
      })
    ).toBe(false)
  })

  it('stays disabled on every other status, In_Progress included', () => {
    for (const status of ['Scheduled', 'In_Progress', 'Reopened', 'Missed', 'Cancelled']) {
      expect(
        isSelfSelectDisabled({ status, canAllocateOthers: false, allowSelfSelect: true })
      ).toBe(true)
    }
  })

  it('stays disabled whatever the status when the project has self-select turned off', () => {
    for (const status of ['Ready', 'Completed', 'In_Progress']) {
      expect(
        isSelfSelectDisabled({ status, canAllocateOthers: false, allowSelfSelect: false })
      ).toBe(true)
    }
  })

  it('never disables a PM, whatever the status or the project setting', () => {
    for (const status of ['Ready', 'Completed', 'In_Progress']) {
      expect(
        isSelfSelectDisabled({ status, canAllocateOthers: true, allowSelfSelect: false })
      ).toBe(false)
    }
  })
})
