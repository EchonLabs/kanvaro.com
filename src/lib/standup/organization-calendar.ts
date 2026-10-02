/**
 * Writes the organisation's default holiday subscription onto the org-scoped
 * `WorkingCalendar`.
 *
 * This exists as a shared function because the organisation-scoped calendar is
 * **only ever created here** — implicitly, by whichever holiday action first
 * needs somewhere to record the default. There is no org-calendar editor
 * anywhere in the UI (`WorkingCalendarSettings` is project-scoped), so whatever
 * this insert writes is what every project without its own calendar inherits,
 * permanently and uneditably.
 *
 * That is why the insert seeds `timezone` from the Organization rather than
 * letting the schema default apply. Before an org calendar exists,
 * `/api/projects/:id/working-calendar`'s GET shows an unconfigured project
 * `Organization.timezone` as its inherited zone; the moment one exists, it
 * shows that document's zone instead. Taking the schema default here would
 * therefore move every unconfigured project from the organisation's own zone to
 * UTC the first time an admin pressed "Refresh from API" — a silent scheduling
 * change nobody asked for and nobody could undo from the UI.
 *
 * Only `timezone` needs seeding: the schema's other defaults (Mon–Fri, 480
 * minutes) are already exactly what that GET falls back to, so a calendar
 * created here is indistinguishable from the inheritance it replaces.
 */
import { Organization } from '@/models/Organization'
import { WorkingCalendar } from '@/models/WorkingCalendar'

export async function setOrganizationHolidaySubscription(
  organizationId: string,
  holidaySetId: string
): Promise<void> {
  const organization = await Organization.findById(organizationId).select('timezone').lean()

  await WorkingCalendar.updateOne(
    { organization: organizationId, scope: 'organization' },
    {
      $set: { subscribedHolidaySets: [holidaySetId] },
      // Insert-only: an existing calendar is the organisation's configured one,
      // and changing which holiday set it subscribes to must never quietly
      // rewrite its working week or zone.
      $setOnInsert: { timezone: (organization as any)?.timezone || 'UTC' }
    },
    { upsert: true }
  )
}
