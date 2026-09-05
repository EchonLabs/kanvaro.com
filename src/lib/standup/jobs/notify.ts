/**
 * Send-once notification delivery for the scheduler jobs (spec SCH-17).
 *
 * The jobs tick every sixty seconds and are safe to run concurrently, so "send
 * N2 when the stand-up becomes Ready" would otherwise mean sending N2 roughly
 * once a minute for fifteen minutes, twice over if two runners overlap.
 *
 * The ledger is claimed **before** the message is sent, not after. Claiming
 * first can lose a notification if the process dies in between; sending first
 * can send it twice, and the spec is explicit that N4 must not arrive twice.
 * A missing reminder is a nuisance, a duplicate one is a bug people report.
 */
import { Standup } from '@/models/Standup'
import { notificationService } from '@/lib/notification-service'

import { isNotificationEnabled, type StandupNotificationId } from '../notifications'

export interface SendOnceInput {
  standupId: string
  projectId: string
  organizationId: string
  notificationId: StandupNotificationId
  recipientIds: string[]
  title: string
  message: string
  url?: string
  priority?: 'low' | 'medium' | 'high'
  /** Distinguishes per-recipient ledger keys, e.g. one N1 per attendee. */
  perRecipient?: boolean
  /**
   * Overrides the ledger key and the id reported in metadata.
   *
   * SCH-15's escalations are variants of N8 rather than notifications of their
   * own: they honour the same project switch, but each must be able to fire
   * once in its own right, so they cannot share N8's ledger key.
   */
  variantKey?: string
}

/**
 * Sends one notification per recipient, at most once per stand-up.
 *
 * Returns how many were actually sent, so a job can report it without having to
 * know whether the ledger already held the key.
 */
export async function sendStandupNotificationOnce(input: SendOnceInput): Promise<number> {
  const recipients = Array.from(new Set(input.recipientIds)).filter(Boolean)
  if (recipients.length === 0) return 0

  if (!(await isNotificationEnabled(input.projectId, input.notificationId))) return 0

  let sent = 0

  for (const recipientId of recipients) {
    const base = input.variantKey ?? input.notificationId
    const key = input.perRecipient ? `${base}:${recipientId}` : base

    // Conditional update as the claim: only one caller can transition the key
    // from absent to set, so only one caller sends.
    const claimed = await Standup.updateOne(
      { _id: input.standupId, [`notificationsSent.${key}`]: { $exists: false } },
      { $set: { [`notificationsSent.${key}`]: new Date() } }
    )

    if (claimed.modifiedCount === 0) continue

    await notificationService.createNotification(recipientId, input.organizationId, {
      type: 'standup',
      title: input.title,
      message: input.message,
      data: {
        entityType: 'standup',
        entityId: input.standupId,
        action: 'updated',
        priority: input.priority ?? 'medium',
        url: input.url,
        metadata: { notificationId: input.variantKey ?? input.notificationId }
      }
    })

    sent += 1
  }

  return sent
}
