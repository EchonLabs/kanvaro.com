/**
 * The per-project "Stand-ups enabled" switch (spec §15.3, §16.2).
 *
 * Off stops *new* schedules being generated; stand-ups that already exist are
 * never touched by it. The spec defaults the switch on, and a project whose
 * settings were never saved has no document at all — so the absent case must
 * read as enabled, or every unconfigured project would silently stop getting
 * stand-ups.
 *
 * Callers that already hold the settings document use the pure
 * {@link isStandupsEnabled} and pay nothing extra; only callers without it use
 * {@link areStandupsEnabledForProject}, which is one read on the unique
 * `project` index selecting a single field.
 */
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'

export const STANDUPS_ENABLED_DEFAULT = true

export function isStandupsEnabled(
  settings: { enabled?: boolean | null } | null | undefined
): boolean {
  return settings?.enabled ?? STANDUPS_ENABLED_DEFAULT
}

export async function areStandupsEnabledForProject(projectId: string): Promise<boolean> {
  const settings = (await ProjectStandupSettings.findOne({ project: projectId })
    .select('enabled')
    .lean()) as { enabled?: boolean } | null
  return isStandupsEnabled(settings)
}
