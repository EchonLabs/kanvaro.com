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
