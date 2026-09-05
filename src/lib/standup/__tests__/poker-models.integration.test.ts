/**
 * Poker persistence rules (spec PLN-11, PLN-12).
 *
 * The reveal maths is covered by `poker.test.ts`. What needs a database is the
 * vote-history contract: one vote per voter per task per round, and a revote
 * opening a new round rather than editing the old one — which is what lets the
 * sprint report show that the team went 5, 5, 13 before settling.
 */
import { PokerSession, PokerVote } from '@/models/PokerSession'
import { revealVotes } from '../poker'
import { anyId, ids, syncIndexes, useMongo } from './helpers/mongo'

const { organization, project, user, member } = ids

const sprintId = anyId()
const taskId = anyId()

const createSession = (overrides: Record<string, unknown> = {}) =>
  PokerSession.create({
    organization,
    project,
    sprint: sprintId,
    facilitator: user,
    participants: [user, member],
    createdBy: user,
    queue: [{ task: taskId, status: 'voting', roundCount: 1 }],
    currentTask: taskId,
    ...overrides
  })

describe('PokerSession defaults — PLN-10', () => {
  useMongo()

  it('applies the spec defaults', async () => {
    const session = await createSession()

    expect(session.deckType).toBe('fibonacci')
    expect(session.estimationUnit).toBe('story_points')
    expect(session.consensusRule).toBe('facilitator_decides')
    expect(session.pointsToHours).toBe(4)
    expect(session.allowRevote).toBe(true)
    expect(session.autoRevealOnAllVoted).toBe(true)
    expect(session.hideVoterIdentity).toBe(false)
    expect(session.status).toBe('open')
  })

  it('rejects an unknown deck', async () => {
    await expect(createSession({ deckType: 'tarot' })).rejects.toThrow()
  })

  it('rejects an unknown consensus rule', async () => {
    await expect(createSession({ consensusRule: 'loudest' })).rejects.toThrow()
  })
})

describe('PokerVote — one vote per voter per round', () => {
  useMongo()

  const vote = (session: any, overrides: Record<string, unknown> = {}) =>
    PokerVote.create({
      pokerSession: session._id,
      task: taskId,
      voter: user,
      card: '5',
      value: 5,
      round: 1,
      ...overrides
    })

  it('refuses a duplicate vote in the same round', async () => {
    await syncIndexes(PokerVote)
    const session = await createSession()

    await vote(session)
    await expect(vote(session, { card: '8', value: 8 })).rejects.toThrow(/duplicate key/i)
  })

  it('allows the same voter a new vote in a new round', async () => {
    await syncIndexes(PokerVote)
    const session = await createSession()

    await vote(session)
    await expect(vote(session, { card: '13', value: 13, round: 2 })).resolves.toBeTruthy()

    // PLN-12 — both rounds survive.
    expect(await PokerVote.countDocuments({ pokerSession: session._id })).toBe(2)
  })

  it('keeps different voters independent', async () => {
    await syncIndexes(PokerVote)
    const session = await createSession()

    await vote(session)
    await expect(vote(session, { voter: member, card: '8', value: 8 })).resolves.toBeTruthy()
  })

  it('stores an abstention as null, not zero', async () => {
    const session = await createSession()
    const abstention = await vote(session, { card: '?', value: null })

    expect(abstention.value).toBeNull()
  })

  it('feeds the reveal maths from stored rows', async () => {
    await syncIndexes(PokerVote)
    const session = await createSession()

    await vote(session, { card: '5', value: 5 })
    await vote(session, { voter: member, card: '13', value: 13 })

    const stored = await PokerVote.find({ pokerSession: session._id, round: 1 })
      .select('voter card')
      .lean()

    const result = revealVotes(
      'fibonacci',
      'median',
      (stored as any[]).map((row) => ({ voterId: row.voter.toString(), card: row.card }))
    )

    expect(result.spread).toBe(8)
    expect(result.median).toBe(9)
    expect(result.votes.filter((entry) => entry.isOutlier)).toHaveLength(2)
  })
})

describe('the queue', () => {
  useMongo()

  it('records the outcome per task', async () => {
    const session = await createSession()

    session.queue[0].status = 'estimated'
    session.queue[0].finalValue = 8
    session.queue[0].consensusReached = false
    session.queue[0].voteSpread = 8
    await session.save()

    const stored: any = await PokerSession.findById(session._id).lean()
    expect(stored.queue[0].finalValue).toBe(8)
    expect(stored.queue[0].consensusReached).toBe(false)
    expect(stored.queue[0].voteSpread).toBe(8)
  })
})
