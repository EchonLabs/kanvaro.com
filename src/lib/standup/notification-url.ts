/**
 * Where a notification should take the reader when clicked.
 *
 * Stand-up notifications are stored with whatever URL the job that raised them
 * knew about, and several of those (`/standups/<id>`) were never routes — they
 * 404. Resolving at read time, from the entity the notification is about, fixes
 * those already sitting in people's inboxes as well as any raised in future.
 *
 * Calendar-change notices (entityType `working_calendar`) are about the project
 * rather than a stand-up and keep their own URL.
 */
export function resolveNotificationUrl(notification: {
  type?: string
  data?: { entityType?: string; entityId?: string; url?: string }
}): string | undefined {
  const data = notification.data
  if (data?.entityType === 'standup' && data.entityId) {
    return `/my/standup/${data.entityId}`
  }
  return data?.url
}
