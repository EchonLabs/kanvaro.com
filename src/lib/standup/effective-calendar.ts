/**
 * The time zone and day length a project actually runs on.
 *
 * A project that has saved its own calendar keeps it. A project that has not
 * inherits from the organisation with no PM action, and follows later changes:
 *
 * - **time zone** comes from the Organization itself (Global Settings), never
 *   from the org-scoped `WorkingCalendar`. That calendar is created implicitly
 *   by the first holiday action (see `organization-calendar.ts`) and seeded
 *   once, so its zone goes stale the moment an admin edits Global Settings.
 * - **day length** comes from the org calendar when one exists, else 480.
 *
 * Reading both through one function is what keeps the calendar screen and the
 * working-day resolver agreeing on the zone for an unconfigured project.
 */
import { Organization } from '@/models/Organization'
import { Project } from '@/models/Project'
import { WorkingCalendar } from '@/models/WorkingCalendar'

export const DEFAULT_EFFECTIVE_TIMEZONE = 'UTC'
export const DEFAULT_EFFECTIVE_MINUTES_PER_DAY = 480

export interface EffectiveCalendarSettings {
  timezone: string
  standardMinutesPerDay: number
  /** True when the project has no calendar of its own. */
  inherited: boolean
}

export async function loadEffectiveCalendarSettings(
  projectIds: string[]
): Promise<Map<string, EffectiveCalendarSettings>> {
  const result = new Map<string, EffectiveCalendarSettings>()
  if (projectIds.length === 0) return result

  const [projectCalendars, projects] = await Promise.all([
    WorkingCalendar.find({ scope: 'project', project: { $in: projectIds } })
      .select('project timezone standardMinutesPerDay')
      .lean(),
    Project.find({ _id: { $in: projectIds } })
      .select('organization')
      .lean()
  ])

  const ownByProject = new Map<string, any>()
  for (const calendar of projectCalendars as any[]) {
    ownByProject.set(String(calendar.project), calendar)
  }

  const organizationByProject = new Map<string, string>()
  for (const project of projects as any[]) {
    if (project.organization) organizationByProject.set(String(project._id), String(project.organization))
  }

  const inheritingOrganizations = new Set<string>()
  for (const projectId of projectIds) {
    if (ownByProject.has(String(projectId))) continue
    const organizationId = organizationByProject.get(String(projectId))
    if (organizationId) inheritingOrganizations.add(organizationId)
  }

  const [organizations, organizationCalendars] = inheritingOrganizations.size
    ? await Promise.all([
        Organization.find({ _id: { $in: Array.from(inheritingOrganizations) } })
          .select('timezone')
          .lean(),
        WorkingCalendar.find({
          scope: 'organization',
          organization: { $in: Array.from(inheritingOrganizations) }
        })
          .select('organization timezone standardMinutesPerDay')
          .lean()
      ])
    : [[], []]

  const zoneByOrganization = new Map<string, string | undefined>()
  for (const organization of organizations as any[]) {
    zoneByOrganization.set(String(organization._id), organization.timezone)
  }
  const calendarByOrganization = new Map<string, any>()
  for (const calendar of organizationCalendars as any[]) {
    calendarByOrganization.set(String(calendar.organization), calendar)
  }

  // A project that cannot be resolved to an organisation (a stale id) still
  // inherits from the one org calendar, as `loadCalendarContext` always has.
  const needsFallback = projectIds.some(
    (id) => !ownByProject.has(String(id)) && !organizationByProject.has(String(id))
  )
  const fallbackCalendar = needsFallback
    ? ((await WorkingCalendar.findOne({ scope: 'organization' })
        .select('organization timezone standardMinutesPerDay')
        .lean()) as any)
    : null

  for (const projectId of projectIds) {
    const key = String(projectId)
    const own = ownByProject.get(key)
    if (own) {
      result.set(key, {
        timezone: own.timezone ?? DEFAULT_EFFECTIVE_TIMEZONE,
        standardMinutesPerDay: own.standardMinutesPerDay ?? DEFAULT_EFFECTIVE_MINUTES_PER_DAY,
        inherited: false
      })
      continue
    }

    const organizationId = organizationByProject.get(key)
    const orgCalendar = organizationId
      ? calendarByOrganization.get(organizationId)
      : fallbackCalendar ?? undefined
    result.set(key, {
      timezone:
        (organizationId ? zoneByOrganization.get(organizationId) : undefined) ||
        orgCalendar?.timezone ||
        DEFAULT_EFFECTIVE_TIMEZONE,
      standardMinutesPerDay:
        orgCalendar?.standardMinutesPerDay ?? DEFAULT_EFFECTIVE_MINUTES_PER_DAY,
      inherited: true
    })
  }

  return result
}
