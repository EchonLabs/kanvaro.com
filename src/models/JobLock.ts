import mongoose, { Schema, Document } from 'mongoose'

/**
 * A cooperative advisory lock for background jobs (spec NFR-J1).
 *
 * Mongo rather than Redis on purpose: `src/lib/redis.ts` throws when `REDIS_URL`
 * is unset, so a Redis-backed lock would make the whole scheduler optional on
 * installs that do not run one. Mongo is always present.
 *
 * `expiresAt` carries a TTL index so a runner that dies mid-job cannot wedge a
 * key forever. The TTL monitor only sweeps once a minute, so the claim in
 * `withJobLock` also treats an already-expired document as free — the index is
 * the janitor, not the gate.
 */
export interface IJobLock extends Document {
  key: string
  owner: string
  acquiredAt: Date
  expiresAt: Date
}

const JobLockSchema = new Schema<IJobLock>({
  key: { type: String, required: true, unique: true },
  owner: { type: String, required: true },
  acquiredAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true }
})

JobLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const JobLock =
  mongoose.models.JobLock || mongoose.model<IJobLock>('JobLock', JobLockSchema)
