/**
 * Pins the stand-up permission grants against the spec's §3.2 role matrix.
 *
 * SEC-1 says a hidden button is not sufficient — every check is enforced server
 * side — so the grant table itself is the thing worth testing. NFR-13 in
 * particular is a privacy rule, not a UI preference, and gets its own case.
 */
import {
  Permission,
  PROJECT_ROLE_PERMISSIONS,
  ProjectRole,
  Role,
  ROLE_PERMISSIONS
} from '../../permissions/permission-definitions'

const orgRole = (role: Role) => ROLE_PERMISSIONS[role]
const projectRole = (role: ProjectRole) => PROJECT_ROLE_PERMISSIONS[role]

describe('Org Admin', () => {
  it('is the only role that can approve a planning waiver (PLN-16)', () => {
    const holders = Object.values(Role).filter((role) =>
      ROLE_PERMISSIONS[role].includes(Permission.STANDUP_PLANNING_WAIVER)
    )

    // Super admin holds every permission by construction; admin is the spec's
    // "Org Admin". Nobody else may waive the planning gate.
    expect(holders.sort()).toEqual([Role.ADMIN, Role.SUPER_ADMIN].sort())
  })
})

describe('Project Manager', () => {
  it('can run, complete and override a stand-up', () => {
    for (const permission of [
      Permission.STANDUP_RUN,
      Permission.STANDUP_COMPLETE,
      Permission.STANDUP_OVERRIDE,
      Permission.STANDUP_ALLOCATE,
      Permission.STANDUP_REVISE_ESTIMATE
    ]) {
      expect(orgRole(Role.PROJECT_MANAGER)).toContain(permission)
      expect(projectRole(ProjectRole.PROJECT_MANAGER)).toContain(permission)
    }
  })

  it('cannot approve a planning waiver', () => {
    expect(orgRole(Role.PROJECT_MANAGER)).not.toContain(Permission.STANDUP_PLANNING_WAIVER)
    expect(projectRole(ProjectRole.PROJECT_MANAGER)).not.toContain(
      Permission.STANDUP_PLANNING_WAIVER
    )
  })
})

describe('Team Member', () => {
  it('may edit only their own allocation row, never assign to others', () => {
    expect(orgRole(Role.TEAM_MEMBER)).toContain(Permission.STANDUP_ALLOCATE_OWN)
    expect(orgRole(Role.TEAM_MEMBER)).not.toContain(Permission.STANDUP_ALLOCATE)
  })

  it('may raise a blocker but not complete or override the stand-up', () => {
    expect(orgRole(Role.TEAM_MEMBER)).toContain(Permission.STANDUP_BLOCKER_RAISE)
    expect(orgRole(Role.TEAM_MEMBER)).not.toContain(Permission.STANDUP_COMPLETE)
    expect(orgRole(Role.TEAM_MEMBER)).not.toContain(Permission.STANDUP_OVERRIDE)
    expect(orgRole(Role.TEAM_MEMBER)).not.toContain(Permission.STANDUP_REOPEN)
  })

  it('sees their own debt but not the team\'s', () => {
    expect(orgRole(Role.TEAM_MEMBER)).toContain(Permission.STANDUP_VIEW_OWN_DEBT)
    expect(orgRole(Role.TEAM_MEMBER)).not.toContain(Permission.STANDUP_VIEW_DEBT)
  })
})

describe('NFR-13 — stakeholders never see individual debt', () => {
  const readOnlyRoles = [Role.VIEWER, Role.CLIENT]

  it.each(readOnlyRoles)('%s cannot view individual estimate debt', (role) => {
    expect(orgRole(role)).not.toContain(Permission.STANDUP_VIEW_DEBT)
    expect(orgRole(role)).not.toContain(Permission.STANDUP_VIEW_OWN_DEBT)
  })

  it('project viewer cannot view individual estimate debt', () => {
    expect(projectRole(ProjectRole.PROJECT_VIEWER)).not.toContain(Permission.STANDUP_VIEW_DEBT)
  })

  it('but stakeholders can still see team aggregate analytics', () => {
    expect(orgRole(Role.VIEWER)).toContain(Permission.STANDUP_VIEW_ANALYTICS)
    expect(projectRole(ProjectRole.PROJECT_VIEWER)).toContain(Permission.STANDUP_VIEW_ANALYTICS)
  })

  it('and cannot write off debt', () => {
    expect(orgRole(Role.VIEWER)).not.toContain(Permission.STANDUP_WRITE_OFF_DEBT)
    expect(orgRole(Role.TEAM_MEMBER)).not.toContain(Permission.STANDUP_WRITE_OFF_DEBT)
  })
})

describe('grant table integrity', () => {
  it('super admin holds every stand-up permission', () => {
    const standupPermissions = Object.values(Permission).filter((p) => p.startsWith('standup:'))

    expect(standupPermissions.length).toBeGreaterThan(0)
    for (const permission of standupPermissions) {
      expect(orgRole(Role.SUPER_ADMIN)).toContain(permission)
    }
  })

  it('no role list contains a duplicate stand-up grant', () => {
    for (const role of Object.values(Role)) {
      const standupGrants = ROLE_PERMISSIONS[role].filter((p) => p.startsWith('standup:'))
      expect(new Set(standupGrants).size).toBe(standupGrants.length)
    }
  })
})

/**
 * Holiday administration (plan DO-2).
 *
 * A deliberate deviation from spec §3.2, which restricts the organisation
 * holiday calendar to Org Admin. In this product the person holding the
 * published gazette is HR, so HR gets it too — and the deviation is expressed
 * as its own permission rather than implied by a generic calendar grant, so it
 * is legible in the table instead of buried in a route.
 */
describe('Holiday administration', () => {
  it('is held by exactly super admin, admin and human resource', () => {
    const holders = Object.values(Role).filter((role) =>
      ROLE_PERMISSIONS[role].includes(Permission.HOLIDAY_MANAGE)
    )

    expect(holders.sort()).toEqual([Role.ADMIN, Role.HUMAN_RESOURCE, Role.SUPER_ADMIN].sort())
  })

  it('is not held by a project manager', () => {
    // The organisation holiday calendar is shared by every project. A PM editing
    // it changes the working days of teams they have nothing to do with.
    expect(orgRole(Role.PROJECT_MANAGER)).not.toContain(Permission.HOLIDAY_MANAGE)
  })

  it('is not held by a tester', () => {
    // TESTER holds STANDUP_CONFIGURE, which is what these routes used to be
    // gated on — which meant a tester could import a national holiday gazette.
    expect(orgRole(Role.TESTER)).not.toContain(Permission.HOLIDAY_MANAGE)
  })

  it('lets human resource read stand-up config so the admin screen can load', () => {
    expect(orgRole(Role.HUMAN_RESOURCE)).toContain(Permission.STANDUP_VIEW)
  })
})
