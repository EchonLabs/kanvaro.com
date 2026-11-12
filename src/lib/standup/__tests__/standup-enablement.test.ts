/**
 * The "Stand-ups enabled" switch (spec §15.3, §16.2).
 *
 * The spec defaults it **on**, so a project whose settings were never saved
 * must read as enabled — otherwise wiring the switch would silently stop
 * generation for every unconfigured project.
 */
import { isStandupsEnabled, STANDUPS_ENABLED_DEFAULT } from '../standup-enablement'

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
