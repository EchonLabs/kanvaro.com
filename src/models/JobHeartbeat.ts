import mongoose, { Schema, Document } from 'mongoose'

/**
 * One row per completed job run (spec NFR-16).
 *
 * This is the evidence the `SCHEDULER_STALE` degradation reads. Without it a
 * stopped scheduler is indistinguishable from a quiet one, and stand-ups would
 * silently stop being promoted with nothing on screen to say so.
 */
export interface IJobHeartbeat extends Document {
  job: string
  ranAt: Date
  durationMs: number
  ok: boolean
  scannedProjects: number
  created: number
  skipped: number
  repaired: number
  errorCount: number
}

const JobHeartbeatSchema = new Schema<IJobHeartbeat>({
  job: { type: String, required: true },
  ranAt: { type: Date, required: true },
  durationMs: { type: Number, required: true },
  ok: { type: Boolean, required: true },
  scannedProjects: { type: Number, default: 0 },
  created: { type: Number, default: 0 },
  skipped: { type: Number, default: 0 },
  repaired: { type: Number, default: 0 },
  errorCount: { type: Number, default: 0 }
})

// The staleness check reads the newest row, per job and across all jobs.
JobHeartbeatSchema.index({ job: 1, ranAt: -1 })
JobHeartbeatSchema.index({ ranAt: -1 })

export const JobHeartbeat =
  mongoose.models.JobHeartbeat ||
  mongoose.model<IJobHeartbeat>('JobHeartbeat', JobHeartbeatSchema)
