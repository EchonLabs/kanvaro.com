/**
 * The "Stand-ups enabled" switch (spec §15.3, §16.2).
 *
 * The spec defaults it **on**, so a project whose settings were never saved
 * must read as enabled — otherwise wiring the switch would silently stop
 * generation for every unconfigured project.
 */
import {
  isLegacySprintFlow,
  isStandupsEnabled,
  LEGACY_SPRINT_FLOW_DEFAULT,
  STANDUPS_ENABLED_DEFAULT
} from '../standup-enablement'
import { startableSprintStates } from '../sprint-states'

describe('isLegacySprintFlow', () => {
  it('defaults to off so the planning gate is kept', () => {
    expect(LEGACY_SPRINT_FLOW_DEFAULT).toBe(false)
    expect(isLegacySprintFlow(null)).toBe(false)
    expect(isLegacySprintFlow(undefined)).toBe(false)
    expect(isLegacySprintFlow({})).toBe(false)
  })

  it('honours an explicit value', () => {
    expect(isLegacySprintFlow({ legacySprintFlow: true })).toBe(true)
    expect(isLegacySprintFlow({ legacySprintFlow: false })).toBe(false)
  })

  it('only opens start from planning/draft when on', () => {
    expect(startableSprintStates(false)).toEqual(['planned'])
    expect(startableSprintStates(true)).toEqual(['draft', 'planning', 'planned'])
    expect(startableSprintStates(true)).not.toContain('completed')
    expect(startableSprintStates(true)).not.toContain('cancelled')
  })
})

describe('isStandupsEnabled', () => {
  it('defaults to on, as spec §16.2 does', () => {
    expect(STANDUPS_ENABLED_DEFAULT).toBe(true)
  })

  it('treats a project with no settings as enabled', () => {
    expect(isStandupsEnabled(null)).toBe(true)
    expect(isStandupsEnabled(undefined)).toBe(true)
    expect(isStandupsEnabled({})).toBe(true)
  })

  it('honours an explicit false', () => {
    expect(isStandupsEnabled({ enabled: false })).toBe(false)
  })

  it('honours an explicit true', () => {
    expect(isStandupsEnabled({ enabled: true })).toBe(true)
  })
})
