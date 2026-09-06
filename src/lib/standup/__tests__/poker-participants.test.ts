/**
 * Who may vote in a poker round (PLN-10 `participantIds`, PLN-11).
 *
 * Regression cover for a real lockout: participants were hard-wired to
 * `sprint.teamMembers`, so the facilitator — usually a PM who is not on the
 * sprint team — could open a session and then be refused their own vote with
 * "You are not a participant in this session." QA and specialists who estimate
 * work they are never assigned were shut out the same way.
 */
import { resolveParticipants } from '../poker'

const pm = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const dev = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const qa = 'cccccccccccccccccccccccc'

describe('resolveParticipants', () => {
  it('defaults to the sprint team', () => {
    expect(resolveParticipants(undefined, [dev], pm)).toEqual(expect.arrayContaining([dev]))
  })

  it('always includes the facilitator, even when off the sprint team', () => {
    expect(resolveParticipants(undefined, [dev], pm)).toContain(pm)
  })

  it('honours an explicit list — QA who is not on the sprint team can vote', () => {
    const result = resolveParticipants([dev, qa], [dev], pm)
    expect(result).toEqual(expect.arrayContaining([dev, qa, pm]))
  })

  it('still includes the facilitator when the explicit list omits them', () => {
    expect(resolveParticipants([qa], [dev], pm)).toContain(pm)
  })

  it('never duplicates the facilitator', () => {
    const result = resolveParticipants([pm, dev], [pm, dev], pm)
    expect(result.filter((id) => id === pm)).toHaveLength(1)
  })

  it('copes with an empty sprint team', () => {
    expect(resolveParticipants(undefined, [], pm)).toEqual([pm])
    expect(resolveParticipants(undefined, undefined, pm)).toEqual([pm])
  })

  it('normalises ObjectId-shaped entries to strings', () => {
    const asObjectId = { toString: () => dev }
    expect(resolveParticipants(undefined, [asObjectId], pm)).toEqual([dev, pm])
  })
})
