import mongoose, { Schema, Document } from 'mongoose'

import {
  CONSENSUS_RULES,
  DECK_TYPES,
  type ConsensusRule,
  type DeckType
} from '@/lib/standup/poker'
import { ESTIMATE_UNITS, type EstimateUnit } from '@/lib/standup/estimates'

/**
 * A planning poker session and its votes (spec PLN-9 to PLN-12).
 *
 * Votes are a **separate collection**, not a subdocument array, for one reason:
 * PLN-11 requires them hidden until reveal. A subdocument comes back with its
 * parent on every read, so hiding it would mean remembering to strip it at
 * every call site — and forgetting once puts the whole team's votes in the
 * browser's network tab. A separate collection is hidden by default and has to
 * be asked for.
 */

export const POKER_SESSION_STATUSES = ['open', 'completed', 'abandoned'] as const
export type PokerSessionStatus = typeof POKER_SESSION_STATUSES[number]

export const POKER_TASK_STATUSES = ['pending', 'voting', 'revealed', 'estimated', 'skipped'] as const
export type PokerTaskStatus = typeof POKER_TASK_STATUSES[number]

export interface IPokerSession extends Document {
  organization: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId
  sprint: mongoose.Types.ObjectId
  planningSession?: mongoose.Types.ObjectId

  status: PokerSessionStatus
  deckType: DeckType
  estimationUnit: EstimateUnit
  pointsToHours: number
  allowRevote: boolean
  autoRevealOnAllVoted: boolean
  consensusRule: ConsensusRule
  hideVoterIdentity: boolean

  facilitator: mongoose.Types.ObjectId
  participants: mongoose.Types.ObjectId[]

  /** The queue of tasks, in the order the facilitator will walk them. */
  queue: Array<{
    task: mongoose.Types.ObjectId
    status: PokerTaskStatus
    roundCount: number
    revealedAt?: Date
    finalValue?: number
    consensusReached?: boolean
    voteSpread?: number
    estimatedAt?: Date
    estimatedBy?: mongoose.Types.ObjectId
  }>

  /** The task currently open for voting. */
  currentTask?: mongoose.Types.ObjectId

  createdBy: mongoose.Types.ObjectId
  completedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const PokerQueueItemSchema = new Schema(
  {
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    status: { type: String, enum: [...POKER_TASK_STATUSES], default: 'pending' },
    roundCount: { type: Number, default: 0, min: 0 },
    revealedAt: Date,
    finalValue: { type: Number, min: 0 },
    consensusReached: Boolean,
    voteSpread: { type: Number, min: 0 },
    estimatedAt: Date,
    estimatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { _id: false }
)

const PokerSessionSchema = new Schema<IPokerSession>(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    sprint: { type: Schema.Types.ObjectId, ref: 'Sprint', required: true },
    planningSession: { type: Schema.Types.ObjectId, ref: 'SprintPlanningSession' },

    status: { type: String, enum: [...POKER_SESSION_STATUSES], default: 'open' },
    deckType: { type: String, enum: [...DECK_TYPES], default: 'fibonacci' },
    estimationUnit: { type: String, enum: [...ESTIMATE_UNITS], default: 'story_points' },
    pointsToHours: { type: Number, default: 4, min: 0.5, max: 40 },
    allowRevote: { type: Boolean, default: true },
    autoRevealOnAllVoted: { type: Boolean, default: true },
    consensusRule: { type: String, enum: [...CONSENSUS_RULES], default: 'facilitator_decides' },
    hideVoterIdentity: { type: Boolean, default: false },

    facilitator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    participants: [{ type: Schema.Types.ObjectId, ref: 'User' }],

    queue: { type: [PokerQueueItemSchema], default: [] },
    currentTask: { type: Schema.Types.ObjectId, ref: 'Task' },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    completedAt: Date
  },
  { timestamps: true }
)

PokerSessionSchema.index({ sprint: 1, createdAt: -1 })
PokerSessionSchema.index({ project: 1, status: 1 })

export const PokerSession =
  mongoose.models.PokerSession ||
  mongoose.model<IPokerSession>('PokerSession', PokerSessionSchema)

// ---------------------------------------------------------------------------

export interface IPokerVote extends Document {
  pokerSession: mongoose.Types.ObjectId
  task: mongoose.Types.ObjectId
  voter: mongoose.Types.ObjectId
  /** The raw card — a number, or `XS`/`?`/`coffee`. */
  card: string
  /** Numeric weight, or null for an abstention. Denormalised at write time. */
  value?: number | null
  round: number
  createdAt: Date
  updatedAt: Date
}

const PokerVoteSchema = new Schema<IPokerVote>(
  {
    pokerSession: { type: Schema.Types.ObjectId, ref: 'PokerSession', required: true },
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    voter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    card: { type: String, required: true },
    value: { type: Number, default: null },
    round: { type: Number, required: true, min: 1 }
  },
  { timestamps: true }
)

/**
 * One vote per voter per task per round.
 *
 * A revote is a new round, not an edit, so PLN-12's full vote history survives
 * — the sprint report can show that the team went 5, 5, 13 before settling.
 */
PokerVoteSchema.index({ pokerSession: 1, task: 1, voter: 1, round: 1 }, { unique: true })
PokerVoteSchema.index({ pokerSession: 1, task: 1, round: 1 })

export const PokerVote =
  mongoose.models.PokerVote || mongoose.model<IPokerVote>('PokerVote', PokerVoteSchema)
