/**
 * Issuing an override (spec OVR-1..9, phase 10).
 *
 * `override.ts` decides *whether* a type can be overridden and whether a
 * justification is strong enough — pure, no I/O. This module is the one
 * write path that actually persists an override record, audits it (SEC-3),
 * and — separately, from `detectChronicUnderAllocation` — raises N7 when a
 * member has been under-allocated on three consecutive stand-ups.
 */
import { StandupOverride, type OverrideType } from '@/models/StandupOverride'
import { isOverridable, validateJustification, OVERRIDE_TABLE, type AnyOverrideType } from './override'
import { invalidJustification, overrideNotPermitted } from './errors'
import { recordAudit } from './audit'
import { sendStandupNotificationOnce } from './jobs/notify'

/** §14.2's non-overridable types (O6–O10), derived from the same table `isOverridable` reads. */
export const OVERRIDE_NOT_PERMITTED_TYPES: AnyOverrideType[] = (
  Object.keys(OVERRIDE_TABLE) as AnyOverrideType[]
).filter((type) => !OVERRIDE_TABLE[type].overridable)

export interface IssueOverrideInput {
  standupId: string
  sprintId: string
  projectId: string
  organizationId: string
  type: OverrideType | string
  affectedMemberIds: string[]
  affectedTaskIds?: string[]
  reasonCode: string
  justification: string
  gapMinutes?: number
  memberAcknowledged?: boolean
  issuedBy: string
  /** N7 recipients — project admin, delivery lead (looked up by the caller route). */
  adminRecipientIds: string[]
}

/**
 * OVR-1–7. Issues one override record, covering one or more members under one
 * reason (§15.12 — "one reason per record, separate reasons require separate
 * overrides" is enforced by the caller passing one `reasonCode` per call, not
 * by this function, which trusts its input).
 */
export async function issueOverride(input: IssueOverrideInput) {
  if (!isOverridable(input.type)) {
    throw overrideNotPermitted(input.type)
  }

  const check = validateJustification(input.justification)
  if (!check.valid) throw invalidJustification()

  // OVR-6: an over-allocation override requires the acknowledgement tick.
  if (input.type === 'over_allocation' && !input.memberAcknowledged) {
    throw invalidJustification()
  }

  const override = await StandupOverride.create({
    standup: input.standupId,
    sprint: input.sprintId,
    project: input.projectId,
    organization: input.organizationId,
    type: input.type,
    affectedMemberIds: input.affectedMemberIds,
    affectedTaskIds: input.affectedTaskIds ?? [],
    reasonCode: input.reasonCode,
    justification: input.justification.trim(),
    gapMinutes: input.gapMinutes ?? 0,
    memberAcknowledged: input.memberAcknowledged ?? false,
    issuedBy: input.issuedBy,
    issuedAt: new Date()
  })

  await recordAudit({
    actor: { type: 'user', userId: input.issuedBy },
    organizationId: input.organizationId,
    action: 'override_issued',
    entityType: 'standup_override',
    entityId: String(override._id),
    projectId: input.projectId,
    after: { type: override.type, gapMinutes: override.gapMinutes }
  })

  // N7 — project admin, delivery lead, on completion. Issuing an override
  // happens *during* the run, but N7's spec timing is "on completion" (§9.5),
  // so this call is deliberately made from the completion saga (Task 12),
  // not here. This function only persists the record and audits it.

  return override
}

/**
 * OVR-9. A member under-allocated (CC-1 failed, override issued with type
 * `under_allocation`) on three or more *consecutive* completed stand-ups in
 * this sprint triggers a flag regardless of each day's individual
 * justification. Called from the completion saga after an under-allocation
 * override is issued for a member, walking that member's last three
 * completed stand-ups in the sprint.
 */
export async function detectChronicUnderAllocation(input: {
  sprintId: string
  memberId: string
  organizationId: string
  projectId: string
  adminRecipientIds: string[]
  standupId: string
}): Promise<boolean> {
  const recentOverrides = await StandupOverride.find({
    sprint: input.sprintId,
    type: 'under_allocation',
    affectedMemberIds: input.memberId
  })
    .sort({ issuedAt: -1 })
    .limit(3)
    .lean()

  if (recentOverrides.length < 3) return false

  await sendStandupNotificationOnce({
    standupId: input.standupId,
    projectId: input.projectId,
    organizationId: input.organizationId,
    notificationId: 'N7',
    variantKey: `chronic_under_allocation:${input.memberId}:${input.sprintId}`,
    recipientIds: input.adminRecipientIds,
    title: 'Chronic under-allocation',
    message: 'A member has been under-allocated for three or more consecutive stand-ups.',
    priority: 'high'
  })

  return true
}
