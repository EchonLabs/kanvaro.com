/**
 * Audit recording for the stand-up module (spec SEC-3).
 *
 * SEC-3 requires an immutable audit entry with actor, UTC timestamp, entity
 * type, entity id, action, **previous value and new value** on every mutation.
 *
 * This wraps the platform's `logActivity` rather than replacing it, but changes
 * one behaviour deliberately: `logActivity` is fire-and-forget and swallows its
 * errors, which is right for an activity feed and wrong for an audit trail. A
 * mutation whose audit entry silently vanished has not satisfied SEC-3, and the
 * completion saga needs to know so it can compensate. So {@link recordAudit}
 * awaits and throws.
 *
 * No stand-up service should call `ActivityLog.create` or `logActivity`
 * directly — going through here is what keeps the before/after shape uniform
 * across all 56 endpoints.
 */
import { ActivityLog, type ActivityAction, type ActivityEntityType } from '@/models/ActivityLog'

/**
 * Identifies who caused a mutation.
 *
 * INV-10: a system action is attributed to the job that performed it, never to
 * the last human who touched the record.
 */
export type AuditActor =
  | { type: 'user'; userId: string }
  | { type: 'system'; systemActor: string }

/** Convenience constructor for the scheduler jobs. */
export const systemActor = (jobName: string): AuditActor => ({
  type: 'system',
  systemActor: jobName
})

export interface RecordAuditParams {
  actor: AuditActor
  organizationId: string
  action: ActivityAction
  entityType: ActivityEntityType
  entityId?: string
  entityName?: string
  projectId?: string
  projectName?: string
  /** State before the mutation. `null` for a creation. */
  before?: Record<string, unknown> | null
  /** State after the mutation. `null` for a deletion. */
  after?: Record<string, unknown> | null
  /** Anything else worth recording alongside the change. */
  context?: Record<string, unknown>
}

/**
 * Writes one immutable audit entry.
 *
 * Throws if the write fails — callers inside a transaction-like sequence must
 * treat that as a failure of the whole operation rather than continuing with an
 * unaudited mutation.
 */
export async function recordAudit(params: RecordAuditParams): Promise<void> {
  const { actor, before, after, context } = params

  await ActivityLog.create({
    organization: params.organizationId,
    ...(actor.type === 'user'
      ? { user: actor.userId, actorType: 'user' }
      : { actorType: 'system', systemActor: actor.systemActor }),
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    entityName: params.entityName,
    project: params.projectId,
    projectName: params.projectName,
    details: {
      ...(before === undefined ? {} : { before }),
      ...(after === undefined ? {} : { after }),
      ...(context ?? {})
    }
  })
}

/**
 * Runs a mutation and records its audit entry, deriving before/after from the
 * state either side of the call.
 *
 * `readState` is invoked once before and once after, so it should be cheap and
 * should return a plain snapshot rather than a live Mongoose document — a
 * document reference would show identical before/after values once mutated.
 */
export async function withAudit<T>(
  params: Omit<RecordAuditParams, 'before' | 'after'> & {
    readState: () => Promise<Record<string, unknown> | null>
  },
  mutate: () => Promise<T>
): Promise<T> {
  const { readState, ...auditParams } = params

  const before = await readState()
  const result = await mutate()
  const after = await readState()

  await recordAudit({ ...auditParams, before, after })

  return result
}

/**
 * Reduces a document to just the fields worth auditing.
 *
 * Auditing whole documents makes entries unreadable and stores a lot of noise;
 * pick the fields whose change actually means something.
 */
export function auditSnapshot<T extends Record<string, unknown>>(
  source: T | null | undefined,
  fields: readonly (keyof T)[]
): Record<string, unknown> | null {
  if (!source) return null

  const snapshot: Record<string, unknown> = {}
  for (const field of fields) {
    if (source[field] !== undefined) {
      snapshot[field as string] = source[field]
    }
  }
  return snapshot
}
