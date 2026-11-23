/**
 * The per-project "Stand-ups enabled" switch (spec §15.3, §16.2).
 *
 * Off stops *new* schedules being generated; stand-ups that already exist are
 * never touched by it. The spec defaults the switch on, and a project whose
 * settings were never saved has no document at all — so the absent case must
 * read as enabled, or every unconfigured project would silently stop getting
 * stand-ups.
 *
 * Pure on purpose: every caller already loads the settings document for other
 * fields, so interpreting the switch costs no extra read.
 */
export const STANDUPS_ENABLED_DEFAULT = true

export function isStandupsEnabled(
  settings: { enabled?: boolean | null } | null | undefined
): boolean {
  return settings?.enabled ?? STANDUPS_ENABLED_DEFAULT
}

/**
 * The per-project "Legacy sprint flow" switch. On, sprints skip the planning
 * session and start straight from `planning`/`draft`. Unlike the stand-ups
 * switch it defaults **off**: a project with no settings document, or one saved
 * before the field existed, keeps the planning gate.
 */
export const LEGACY_SPRINT_FLOW_DEFAULT = false

export function isLegacySprintFlow(
  settings: { legacySprintFlow?: boolean | null } | null | undefined
): boolean {
  return settings?.legacySprintFlow ?? LEGACY_SPRINT_FLOW_DEFAULT
}
