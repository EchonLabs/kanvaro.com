/**
 * Stand-up notifications (spec §9.5, N1–N12).
 *
 * Phase 1 only needs **N10** — "Calendar change affected your stand-up
 * schedule" — but the switch-checking and dedup rules that CAL-15 and SCH-16/17
 * impose apply to all twelve, so they live here once rather than being
 * reimplemented per notification.
 *
 * CAL-15 is the rule this file exists to enforce: a calendar change that touches
 * several stand-ups produces **one** consolidated notification, never one per
 * affected date. A PM who declares a two-week shutdown should get a single
 * message, not ten.
 */
import { notificationService } from '@/lib/notification-service'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'

import type { CalendarImpactItem } from './calendar-impact'
import { sendStandupNotificationOnce } from './jobs/notify'
import { standupStrings } from './strings'

/** The §9.5 notification ids. Used as keys into `notificationSwitches`. */
export type StandupNotificationId =
  | 'N1' | 'N2' | 'N3' | 'N4' | 'N5' | 'N6'
  | 'N7' | 'N8' | 'N9' | 'N10' | 'N11' | 'N12'

/**
 * Whether a project has this notification switched on (SCH-16).
 *
 * User-level preferences take precedence over the project switch, but those are
 * applied downstream by `notificationService.createNotification`, which reads
 * `user.preferences.notifications`. This only answers the project half.
 *
 * Defaults to **on** for an unconfigured project: the spec's default is all
 * switches on except N3, and a project that has never opened the stand-up
 * settings screen should still be told its calendar changed.
 */
export async function isNotificationEnabled(
  projectId: string,
  notificationId: StandupNotificationId
): Promise<boolean> {
  const settings = await ProjectStandupSettings.findOne({ project: projectId })
    .select('notificationSwitches')
    .lean()

  const switches = (settings as any)?.notificationSwitches
  if (!switches) return notificationId !== 'N3'

  return switches[notificationId] !== false
}

export interface CalendarChangeNotificationInput {
  projectId: string
  organizationId: string
  /** Who to tell. Typically the facilitator; deduplicated before sending. */
  recipientIds: string[]
  /** Every date the change touched, from the impact analysis. */
  items: CalendarImpactItem[]
  /** Shown so the message can name what was changed. */
  changeLabel: string
  projectName?: string
}

/**
 * N10 — tells the PM that a calendar change affected their stand-up schedule.
 *
 * Returns the number of notifications sent, which is at most one per recipient
 * regardless of how many dates changed. Callers should not await this on the
 * request path if latency matters; a failure here must never fail the calendar
 * change that triggered it.
 */
export async function notifyCalendarChange(
  input: CalendarChangeNotificationInput
): Promise<number> {
  const { projectId, organizationId, items, changeLabel, projectName } = input

  // Dates whose working-day state did not actually change are not news.
  const affected = items.filter((item) => item.disposition !== 'no_change')
  if (affected.length === 0) return 0

  if (!(await isNotificationEnabled(projectId, 'N10'))) return 0

  const recipients = Array.from(new Set(input.recipientIds)).filter(Boolean)
  if (recipients.length === 0) return 0

  const message = standupStrings.calendar.changeNotification({
    change: changeLabel,
    summary: summariseForNotification(affected)
  })

  let sent = 0
  for (const userId of recipients) {
    const notification = await notificationService.createNotification(userId, organizationId, {
      type: 'standup',
      title: standupStrings.calendar.changeNotificationTitle(),
      message,
      data: {
        entityType: 'working_calendar',
        entityId: projectId,
        action: 'updated',
        priority: affected.some((item) => item.blocked) ? 'high' : 'medium',
        projectName,
        url: `/projects/${projectId}?tab=settings`,
        // Carried so the UI can list the dates without recomputing the impact.
        metadata: {
          notificationId: 'N10',
          dates: affected.map((item) => item.date),
          dispositions: affected.map((item) => ({
            date: item.date,
            disposition: item.disposition,
            blocked: item.blocked
          }))
        }
      }
    })

    if (notification) sent += 1
  }

  return sent
}

/**
 * {@link notifyCalendarChange} that never throws.
 *
 * The calendar change is already saved and audited by the time this runs. A
 * notification failure — a downed mail transport, a user record that has since
 * been deleted — must not surface to the PM as "the change failed", because it
 * did not. Errors are logged and swallowed.
 *
 * This is the opposite of `recordAudit`, which deliberately does throw: an
 * unaudited mutation violates SEC-3, whereas an unsent notification is a
 * nuisance.
 */
export async function notifyCalendarChangeSafely(
  input: CalendarChangeNotificationInput
): Promise<number> {
  try {
    return await notifyCalendarChange(input)
  } catch (error) {
    console.error('[standup] N10 calendar-change notification failed', error)
    return 0
  }
}

/**
 * N4 — UI-10/UI-11: each member's own commitment summary, sent once the
 * stand-up completes. `perRecipient` on the shared primitive is what keeps
 * this to at most one per member per stand-up even if the completion path
 * that calls it is itself retried.
 */
export async function notifyPersonalCommitment(input: {
  standupId: string
  projectId: string
  organizationId: string
  memberId: string
  summaryUrl: string
}): Promise<number> {
  return sendStandupNotificationOnce({
    standupId: input.standupId,
    projectId: input.projectId,
    organizationId: input.organizationId,
    notificationId: 'N4',
    recipientIds: [input.memberId],
    perRecipient: true,
    title: standupStrings.notifications.personalCommitmentTitle(),
    message: standupStrings.notifications.personalCommitmentMessage(),
    url: input.summaryUrl
  })
}

/**
 * N5 — the facilitator/admin/stakeholder digest, sent once the stand-up
 * completes.
 */
export async function notifyStandupCompleted(input: {
  standupId: string
  projectId: string
  organizationId: string
  recipientIds: string[]
  summaryUrl: string
}): Promise<number> {
  return sendStandupNotificationOnce({
    standupId: input.standupId,
    projectId: input.projectId,
    organizationId: input.organizationId,
    notificationId: 'N5',
    recipientIds: input.recipientIds,
    perRecipient: true,
    title: standupStrings.notifications.completedTitle(),
    message: standupStrings.notifications.completedMessage(),
    url: input.summaryUrl
  })
}

/**
 * N6 — tells a member their stand-up completed with no work allocated to
 * them, so an empty day reads as a deliberate fact rather than a silent gap.
 */
export async function notifyNotAllocated(input: {
  standupId: string
  projectId: string
  organizationId: string
  memberId: string
}): Promise<number> {
  return sendStandupNotificationOnce({
    standupId: input.standupId,
    projectId: input.projectId,
    organizationId: input.organizationId,
    notificationId: 'N6',
    recipientIds: [input.memberId],
    perRecipient: true,
    title: standupStrings.notifications.notAllocatedTitle(),
    message: standupStrings.notifications.notAllocatedMessage()
  })
}

/**
 * N7 — an override was issued during the stand-up (AC-11).
 *
 * `variantKey` is keyed on `overrideId`, not the notification id alone: a
 * stand-up can carry several distinct overrides (spec §14.2 allows more than
 * one), and each is newsworthy in its own right. Reusing `notifyOverrideIssued`
 * with the same overrideId twice — the retry case — still resolves to the
 * same ledger key and sends once.
 */
export async function notifyOverrideIssued(input: {
  standupId: string
  projectId: string
  organizationId: string
  recipientIds: string[]
  overrideType: string
  overrideId: string
}): Promise<number> {
  return sendStandupNotificationOnce({
    standupId: input.standupId,
    projectId: input.projectId,
    organizationId: input.organizationId,
    notificationId: 'N7',
    variantKey: `N7:${input.overrideId}`,
    recipientIds: input.recipientIds,
    perRecipient: true,
    title: standupStrings.notifications.overrideIssuedTitle(),
    message: standupStrings.notifications.overrideIssuedMessage({ type: input.overrideType })
  })
}

/**
 * N11 — RUN-11: a status change the PM made on somebody else's behalf.
 *
 * Unlike N4-N7 (once per stand-up), N11 must be able to fire several times for
 * the same assignee on the same stand-up — a PM can change several of that
 * person's tasks in one Yesterday-review pass, and each is its own piece of
 * news. What it must not do is double-send when the *same* change is retried
 * (e.g. a client double-submitting one PATCH).
 *
 * The `yesterday` route's PATCH is keyed by `taskIds` and is otherwise a plain
 * "set this task's status" write with no request-id or client-nonce of its
 * own — so a retried, identical PATCH is indistinguishable from the original
 * except by its *effect*: same task, same resulting status. That effect is
 * exactly what `variantKey` is built from (`standupId:taskId:newStatus`)
 * rather than a wall-clock value: a genuine retry recomputes the same key and
 * is deduped by the ledger, while two different edits to the same task later
 * in the pass (different resulting status) get their own keys and each
 * notify, matching RUN-11's "must trigger notification N11" for every real
 * change.
 */
export async function notifyStatusChangedOnBehalf(input: {
  standupId: string
  projectId: string
  organizationId: string
  assigneeId: string
  taskId: string
  newStatus: string
  taskKey?: string
}): Promise<number> {
  return sendStandupNotificationOnce({
    standupId: input.standupId,
    projectId: input.projectId,
    organizationId: input.organizationId,
    notificationId: 'N11',
    variantKey: `N11:${input.standupId}:${input.taskId}:${input.newStatus}`,
    recipientIds: [input.assigneeId],
    perRecipient: true,
    priority: 'low',
    title: standupStrings.notifications.statusChangedOnBehalfTitle(),
    message: standupStrings.notifications.statusChangedOnBehalfMessage({
      taskKey: input.taskKey ?? ''
    }),
    url: `/tasks/${input.taskId}`
  })
}

/**
 * One sentence covering every affected date.
 *
 * Deliberately counts rather than lists when the change is large — a
 * notification naming forty dates is not readable, and the detail is one click
 * away in `metadata.dates`.
 */
function summariseForNotification(items: CalendarImpactItem[]): string {
  const created = items.filter((item) => item.disposition === 'create').length
  const skipped = items.filter(
    (item) => item.disposition === 'skip' || item.disposition === 'skip_clear_missed'
  ).length
  const blocked = items.filter((item) => item.blocked).length
  const warned = items.filter((item) => item.disposition === 'warn_in_progress').length

  const parts: string[] = []
  if (created > 0) parts.push(standupStrings.calendar.countCreated({ count: created }))
  if (skipped > 0) parts.push(standupStrings.calendar.countSkipped({ count: skipped }))
  if (warned > 0) parts.push(standupStrings.calendar.countWarned({ count: warned }))
  if (blocked > 0) parts.push(standupStrings.calendar.countBlocked({ count: blocked }))

  return parts.join(' ')
}
