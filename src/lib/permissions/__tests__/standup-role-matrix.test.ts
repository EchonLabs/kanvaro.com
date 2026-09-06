/**
 * The stand-up role matrix (spec §3.2) as a regression test.
 *
 * Kanvaro's roles are project-locked — a hoster cannot repair a wrong grant
 * from Settings — so a role missing a stand-up permission is a defect shipped
 * to every install, not a configuration mistake someone can work around. That
 * is what these tests exist to catch.
 *
 * The block that matters most is the first one. Generation copies
 * `sprint.teamMembers` into `expectedAttendees` (`generation.ts`), and
 * `send-reminders` sends N1 to exactly that list (`jobs/send-reminders.ts`)
 * with a link to `/standups/:id`, whose route is gated on STANDUP_VIEW.
 * Nothing anywhere joins those two facts up: the notification path reads a
 * sprint's team, and the permission table is a separate literal. While
 * PROJECT_QA_LEAD and PROJECT_TESTER held no stand-up permissions at all,
 * every suite passed and the scheduler mailed QA engineers a reminder pointing
 * at a 403.
 */
import {
  Permission,
  PermissionScope,
  ProjectRole,
  PROJECT_ROLE_PERMISSIONS,
  Role,
  ROLE_PERMISSIONS,
  getPermissionScope
} from '../permission-definitions'

type AnyRole = Role | ProjectRole

const orgRoles = Object.values(Role)
const projectRoles = Object.values(ProjectRole)

const permissionsOf = (role: AnyRole): Permission[] =>
  (ROLE_PERMISSIONS as Record<string, Permission[]>)[role as Role] ??
  (PROJECT_ROLE_PERMISSIONS as Record<string, Permission[]>)[role as ProjectRole]

const holds = (role: AnyRole, permission: Permission): boolean =>
  permissionsOf(role).includes(permission)

/**
 * "Can this role be given work in a sprint?"
 *
 * Derived from the task permissions rather than listed by name on purpose: a
 * role added later that can move a task is caught by these tests without
 * anyone remembering to extend a list. Read-only roles — Client, Viewer and
 * their project equivalents — hold TASK_READ only and drop out here.
 *
 * Project roles only. A stand-up permission in the ORG table is
 * organisation-wide (see `no organisation-wide stand-up access` below), so the
 * attendee floor has to be met per project or it is not scoping at all.
 */
const CAN_BE_GIVEN_WORK: ProjectRole[] = projectRoles.filter(
  (role) =>
    holds(role, Permission.TASK_UPDATE) || holds(role, Permission.TASK_CHANGE_STATUS)
)

/** What §3.2's Team Member column grants, and the floor for any attendee. */
const ATTENDEE_PERMISSIONS = [
  Permission.STANDUP_VIEW,
  Permission.STANDUP_ALLOCATE_OWN,
  Permission.STANDUP_BLOCKER_RAISE,
  Permission.STANDUP_VIEW_OWN_DEBT
]

/** Roles that attend a stand-up but do not run one. */
const ATTENDEE_ONLY_ROLES: ProjectRole[] = [
  ProjectRole.PROJECT_MEMBER,
  ProjectRole.PROJECT_QA_LEAD,
  ProjectRole.PROJECT_TESTER
]

describe('stand-up role matrix (§3.2)', () => {
  describe('notification recipients can open what they are sent', () => {
    // The three delivery roles must be in here, or the filter has silently
    // stopped matching and every case below passes vacuously.
    it('finds the roles that can be given work', () => {
      expect(CAN_BE_GIVEN_WORK).toEqual(
        expect.arrayContaining([
          ProjectRole.PROJECT_MEMBER,
          ProjectRole.PROJECT_QA_LEAD,
          ProjectRole.PROJECT_TESTER
        ])
      )
    })

    it.each(CAN_BE_GIVEN_WORK)(
      '%s can be a sprint team member, so it holds standup:view',
      (role) => {
        expect(holds(role, Permission.STANDUP_VIEW)).toBe(true)
      }
    )

    it.each(CAN_BE_GIVEN_WORK)('%s can maintain its own stand-up row', (role) => {
      for (const permission of ATTENDEE_PERMISSIONS) {
        expect({ role, permission, held: holds(role, permission) }).toEqual({
          role,
          permission,
          held: true
        })
      }
    })

    // Named as well as derived: these two are the roles that regressed, and a
    // later edit to the predicate above must not quietly drop them. A QA
    // engineer or tester with no explicit project role falls back to
    // PROJECT_MEMBER, which is covered by the derived cases above.
    it.each([ProjectRole.PROJECT_QA_LEAD, ProjectRole.PROJECT_TESTER])(
      '%s is a working sprint member, not a spectator',
      (role) => {
        expect(holds(role, Permission.STANDUP_VIEW)).toBe(true)
        expect(holds(role, Permission.STANDUP_ALLOCATE_OWN)).toBe(true)
        expect(holds(role, Permission.STANDUP_BLOCKER_RAISE)).toBe(true)
      }
    )
  })

  describe('what an attendee must not hold', () => {
    // §3.2: assigning, overriding, completing and reopening are PM-and-above.
    it.each(ATTENDEE_ONLY_ROLES)('%s cannot run the stand-up', (role) => {
      for (const permission of [
        Permission.STANDUP_RUN,
        Permission.STANDUP_COMPLETE,
        Permission.STANDUP_REOPEN,
        Permission.STANDUP_ALLOCATE,
        Permission.STANDUP_OVERRIDE,
        Permission.STANDUP_GENERATE,
        Permission.STANDUP_CONFIGURE,
        Permission.STANDUP_REVISE_ESTIMATE,
        Permission.STANDUP_CARRY_FORWARD_NOTE,
        Permission.STANDUP_WRITE_OFF_DEBT
      ]) {
        expect({ role, permission, held: holds(role, permission) }).toEqual({
          role,
          permission,
          held: false
        })
      }
    })

    // NFR-13 / decision D2: individual debt is for the member and their PM.
    it.each(ATTENDEE_ONLY_ROLES)('%s sees own debt only, never the team', (role) => {
      expect(holds(role, Permission.STANDUP_VIEW_DEBT)).toBe(false)
      expect(holds(role, Permission.STANDUP_VIEW_OWN_DEBT)).toBe(true)
    })
  })

  describe('no organisation-wide stand-up access', () => {
    /**
     * A grant in the ORG table reaches every project in the organisation.
     * `hasPermission` returns true for a PROJECT-scoped permission the moment
     * the org role holds it, without consulting the project at all
     * (permission-service.ts) — so an org-table grant is not "this role can
     * attend stand-ups", it is "this role can read every stand-up in the
     * company, including projects it is not on".
     *
     * These four roles are the deliberate exceptions, each for a stated
     * reason. Everyone else gets their stand-up permissions from their project
     * role, which is scoped to projects they are actually a member of.
     */
    const ORG_WIDE_BY_DESIGN: Role[] = [
      Role.SUPER_ADMIN,
      Role.ADMIN,
      // Runs stand-ups across the organisation. Narrowing this to project
      // membership is a live decision, not settled here.
      Role.PROJECT_MANAGER,
      // The delivery-lead/stakeholder persona: org-wide read-only by
      // definition, and holds no mutating stand-up permission.
      Role.VIEWER,
      // Owns the holiday calendar org-wide and must see the coverage gap it is
      // asked to close. Read-only: STANDUP_VIEW and nothing else.
      Role.HUMAN_RESOURCE
    ]

    const scopedToProjects = orgRoles.filter((role) => !ORG_WIDE_BY_DESIGN.includes(role))

    it.each(scopedToProjects)('%s holds no stand-up permission org-wide', (role) => {
      const standupPermissions = permissionsOf(role).filter((permission) =>
        permission.startsWith('standup:')
      )
      expect(standupPermissions).toEqual([])
    })

    // The specific regression: a team member could read every stand-up in the
    // organisation, capacity gaps and estimate debt included, because
    // STANDUP_VIEW sat in the org table.
    it('does not let a team member read other projects’ stand-ups', () => {
      expect(holds(Role.TEAM_MEMBER, Permission.STANDUP_VIEW)).toBe(false)
      expect(holds(ProjectRole.PROJECT_MEMBER, Permission.STANDUP_VIEW)).toBe(true)
    })

    it('keeps HR org-wide but read-only', () => {
      const hrStandup = permissionsOf(Role.HUMAN_RESOURCE).filter((permission) =>
        permission.startsWith('standup:')
      )
      expect(hrStandup).toEqual([Permission.STANDUP_VIEW])
    })
  })

  describe('read-only roles', () => {
    // §3.2's stakeholder column: history and analytics, nothing else, and no
    // team debt.
    it.each([Role.VIEWER, ProjectRole.PROJECT_VIEWER])('%s is read-only', (role) => {
      expect(holds(role, Permission.STANDUP_VIEW)).toBe(true)
      expect(holds(role, Permission.STANDUP_VIEW_ANALYTICS)).toBe(true)
      expect(holds(role, Permission.STANDUP_VIEW_DEBT)).toBe(false)
      expect(holds(role, Permission.STANDUP_ALLOCATE_OWN)).toBe(false)
      expect(holds(role, Permission.STANDUP_RUN)).toBe(false)
    })

    // Clients are external. Capacity gaps, estimate debt and override counts
    // are internal delivery signals, so a client sees no stand-up at all —
    // deliberate, and pinned here so it stays a decision rather than drifting.
    it.each([Role.CLIENT, ProjectRole.PROJECT_CLIENT])('%s sees no stand-up data', (role) => {
      const standupPermissions = permissionsOf(role).filter((permission) =>
        permission.startsWith('standup:')
      )
      expect(standupPermissions).toEqual([])
    })
  })

  describe('project manager', () => {
    it.each([Role.PROJECT_MANAGER, ProjectRole.PROJECT_MANAGER])(
      '%s runs stand-ups end to end',
      (role) => {
        for (const permission of [
          Permission.STANDUP_CONFIGURE,
          Permission.STANDUP_VIEW,
          Permission.STANDUP_GENERATE,
          Permission.STANDUP_RUN,
          Permission.STANDUP_COMPLETE,
          Permission.STANDUP_REOPEN,
          Permission.STANDUP_ALLOCATE,
          Permission.STANDUP_OVERRIDE,
          Permission.STANDUP_VIEW_DEBT,
          Permission.STANDUP_WRITE_OFF_DEBT
        ]) {
          expect({ role, permission, held: holds(role, permission) }).toEqual({
            role,
            permission,
            held: true
          })
        }
      }
    )

    // §3.2: approving a planning gate waiver is Org Admin only. A PM waiving
    // their own gate is the gate not existing.
    it.each([Role.PROJECT_MANAGER, ProjectRole.PROJECT_MANAGER])(
      '%s cannot approve a planning waiver',
      (role) => {
        expect(holds(role, Permission.STANDUP_PLANNING_WAIVER)).toBe(false)
      }
    )

    it('leaves the planning waiver with org admins alone', () => {
      const withWaiver = [...orgRoles, ...projectRoles].filter((role) =>
        holds(role, Permission.STANDUP_PLANNING_WAIVER)
      )
      expect(withWaiver).toEqual([Role.SUPER_ADMIN, Role.ADMIN])
    })
  })

  describe('holiday administration (plan DO-2)', () => {
    // HR owns the published gazette; a PM must not be able to edit the
    // national calendar for teams they have nothing to do with.
    it('is held by admins and HR only', () => {
      const withHolidayManage = [...orgRoles, ...projectRoles].filter((role) =>
        holds(role, Permission.HOLIDAY_MANAGE)
      )
      expect(withHolidayManage).toEqual([Role.SUPER_ADMIN, Role.ADMIN, Role.HUMAN_RESOURCE])
    })

    // HR loads the gazette and needs to see the coverage warning it is
    // responsible for closing, which the health route gates on STANDUP_VIEW.
    it('lets HR see the coverage gap it must close', () => {
      expect(holds(Role.HUMAN_RESOURCE, Permission.STANDUP_VIEW)).toBe(true)
    })

    // A holiday set is shared by every project, so there is no project to
    // scope it to. Fall-through to PROJECT scope only appeared to work because
    // every role holding it holds it globally.
    it('is organisation-scoped', () => {
      expect(getPermissionScope(Permission.HOLIDAY_MANAGE)).toBe(PermissionScope.GLOBAL)
    })
  })

  describe('super admin', () => {
    it('holds every stand-up permission', () => {
      const standupPermissions = Object.values(Permission).filter((permission) =>
        permission.startsWith('standup:')
      )
      expect(standupPermissions.length).toBeGreaterThan(10)

      for (const permission of standupPermissions) {
        expect(holds(Role.SUPER_ADMIN, permission)).toBe(true)
      }
    })
  })
})
