import { isOwnRowReadOnly } from '../own-row'

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
