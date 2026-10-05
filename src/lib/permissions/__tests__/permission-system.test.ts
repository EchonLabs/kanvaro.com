import { PermissionService } from '../permission-service';
import { Permission, Role, ProjectRole } from '../permission-definitions';
import { User } from '@/models/User';
import { Project } from '@/models/Project';
import mongoose from 'mongoose';

// Mock the database models
jest.mock('@/models/User');
jest.mock('@/models/Project');

function mockUserFindById(user: unknown) {
  ;(User.findById as jest.Mock).mockReturnValue({
    populate: jest.fn().mockResolvedValue(user)
  })
}

// getAccessibleProjects chains `.select('_id')` onto Project.find, while
// getUserPermissions awaits it directly. Mock both shapes.
function mockProjectFindChainable(projects: unknown[]) {
  ;(Project.find as jest.Mock).mockReturnValue({
    select: jest.fn().mockResolvedValue(projects),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(projects).then(resolve)
  })
}

describe('Permission System', () => {
  const mockUser = {
    _id: 'user123',
    role: Role.ADMIN,
    organization: 'org123'
  };

  const mockProject = {
    _id: 'project123',
    organization: 'org123',
    createdBy: 'user123',
    teamMembers: ['user123', 'user456'],
    client: 'user789',
    projectRoles: [
      {
        user: 'user123',
        role: ProjectRole.PROJECT_MANAGER,
        assignedBy: 'user123',
        assignedAt: new Date()
      }
    ]
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('PermissionService', () => {
    describe('hasPermission', () => {
      it('should return true for admin users with global permissions', async () => {
        mockUserFindById(mockUser);
        (Project.find as jest.Mock).mockResolvedValue([mockProject]);

        const hasPermission = await PermissionService.hasPermission(
          'user123',
          Permission.PROJECT_CREATE
        );

        expect(hasPermission).toBe(true);
      });

      it('should return false for users without required permissions', async () => {
        const teamMemberUser = { ...mockUser, role: Role.TEAM_MEMBER };
        mockUserFindById(teamMemberUser);
        (Project.find as jest.Mock).mockResolvedValue([mockProject]);

        const hasPermission = await PermissionService.hasPermission(
          'user123',
          Permission.USER_DELETE
        );

        expect(hasPermission).toBe(false);
      });

      it('should return true for project-scoped permissions when user has access', async () => {
        mockUserFindById(mockUser);
        (Project.find as jest.Mock).mockResolvedValue([mockProject]);

        const hasPermission = await PermissionService.hasPermission(
          'user123',
          Permission.PROJECT_UPDATE,
          'project123'
        );

        expect(hasPermission).toBe(true);
      });

      it('should return false for project-scoped permissions when user lacks access', async () => {
        const teamMemberUser = { ...mockUser, role: Role.TEAM_MEMBER };
        mockUserFindById(teamMemberUser);
        (Project.find as jest.Mock).mockResolvedValue([]);

        const hasPermission = await PermissionService.hasPermission(
          'user123',
          Permission.PROJECT_UPDATE,
          'project123'
        );

        expect(hasPermission).toBe(false);
      });
    });

    describe('canAccessProject', () => {
      it('should return true for admin users', async () => {
        mockUserFindById(mockUser);
        (Project.find as jest.Mock).mockResolvedValue([mockProject]);

        const canAccess = await PermissionService.canAccessProject(
          'user123',
          'project123'
        );

        expect(canAccess).toBe(true);
      });

      it('should return true for project team members', async () => {
        const teamMemberUser = { ...mockUser, role: Role.TEAM_MEMBER };
        mockUserFindById(teamMemberUser);
        (Project.find as jest.Mock).mockResolvedValue([mockProject]);

        const canAccess = await PermissionService.canAccessProject(
          'user123',
          'project123'
        );

        expect(canAccess).toBe(true);
      });

      it('should return false for users without project access', async () => {
        const teamMemberUser = { ...mockUser, role: Role.TEAM_MEMBER };
        mockUserFindById(teamMemberUser);
        (Project.find as jest.Mock).mockResolvedValue([]);

        const canAccess = await PermissionService.canAccessProject(
          'user123',
          'project123'
        );

        expect(canAccess).toBe(false);
      });
    });

    describe('getAccessibleProjects', () => {
      it('should return all projects for admin users', async () => {
        // Project.createdBy is `required: true` (models/Project.ts), and
        // getUserPermissions' $or query only ever returns projects the user
        // touches, so getUserProjectRole dereferences createdBy/teamMembers
        // unguarded. Stubs must therefore carry them.
        const allProjects = [
          { _id: 'project1', createdBy: 'user123', teamMembers: [] },
          { _id: 'project2', createdBy: 'user456', teamMembers: [] },
          { _id: 'project3', createdBy: 'user456', teamMembers: [] }
        ];

        mockUserFindById(mockUser);
        mockProjectFindChainable(allProjects);

        const accessibleProjects = await PermissionService.getAccessibleProjects('user123');

        expect(accessibleProjects).toEqual(['project1', 'project2', 'project3']);
      });

      it('should return only assigned projects for non-admin users', async () => {
        const teamMemberUser = { ...mockUser, role: Role.TEAM_MEMBER };
        mockUserFindById(teamMemberUser);
        (Project.find as jest.Mock).mockResolvedValue([mockProject]);

        const accessibleProjects = await PermissionService.getAccessibleProjects('user123');

        expect(accessibleProjects).toEqual(['project123']);
      });
    });
  });

  describe('Permission Scopes', () => {
    it('should correctly identify global permissions', () => {
      const { getPermissionScope } = require('../permission-definitions');
      
      expect(getPermissionScope(Permission.USER_DELETE)).toBe('global');
      expect(getPermissionScope(Permission.ORGANIZATION_UPDATE)).toBe('global');
      expect(getPermissionScope(Permission.PROJECT_VIEW_ALL)).toBe('global');
      // Inviting is organisation-wide, not per project: permission-definitions
      // lists TEAM_INVITE (and USER_INVITE) under globalPermissions with that
      // exact rationale. GLOBAL is the stricter scope - a project-role grant
      // cannot satisfy it (permission-service.ts, PermissionScope.GLOBAL).
      expect(getPermissionScope(Permission.TEAM_INVITE)).toBe('global');
    });

    it('should correctly identify project permissions', () => {
      const { getPermissionScope } = require('../permission-definitions');
      
      expect(getPermissionScope(Permission.PROJECT_UPDATE)).toBe('project');
      expect(getPermissionScope(Permission.TASK_CREATE)).toBe('project');
      // SETTINGS_VIEW is NOT an `own` permission. OWN scope short-circuits to
      // `true` for every caller (permission-service.ts), which would void the
      // fact that only Role.ADMIN and Role.HUMAN_RESOURCE are granted
      // SETTINGS_VIEW - Role.TEAM_MEMBER deliberately is not.
      expect(getPermissionScope(Permission.SETTINGS_VIEW)).toBe('project');
    });

    it('should correctly identify own permissions', () => {
      const { getPermissionScope } = require('../permission-definitions');
      
      expect(getPermissionScope(Permission.USER_READ)).toBe('own');
      expect(getPermissionScope(Permission.TIME_TRACKING_CREATE)).toBe('own');
      expect(getPermissionScope(Permission.USER_UPDATE)).toBe('own');
    });
  });

  describe('Role Permissions', () => {
    it('should have correct permissions for admin role', () => {
      const { ROLE_PERMISSIONS } = require('../permission-definitions');
      const adminPermissions = ROLE_PERMISSIONS[Role.ADMIN];

      expect(adminPermissions).toContain(Permission.USER_CREATE);
      expect(adminPermissions).toContain(Permission.PROJECT_CREATE);
      expect(adminPermissions).toContain(Permission.TASK_CREATE);
      expect(adminPermissions).toContain(Permission.TEAM_INVITE);
      expect(adminPermissions).toContain(Permission.TIME_TRACKING_APPROVE);
    });

    it('should have correct permissions for team member role', () => {
      const { ROLE_PERMISSIONS } = require('../permission-definitions');
      const teamMemberPermissions = ROLE_PERMISSIONS[Role.TEAM_MEMBER];

      // TASK_CREATE is withheld org-wide ON PURPOSE and granted per project
      // instead: see the [Role.TEAM_MEMBER] block comment in
      // permission-definitions.ts - a grant in ROLE_PERMISSIONS is
      // organisation-wide, so listing a PROJECT-scoped permission there would
      // let every team member in the org act on every project. The capability
      // lives on PROJECT_ROLE_PERMISSIONS[PROJECT_MEMBER] (asserted below).
      expect(teamMemberPermissions).not.toContain(Permission.TASK_CREATE);
      expect(teamMemberPermissions).toContain(Permission.TIME_TRACKING_CREATE);
      expect(teamMemberPermissions).not.toContain(Permission.USER_DELETE);
      expect(teamMemberPermissions).not.toContain(Permission.PROJECT_DELETE);
    });

    it('should have correct permissions for client role', () => {
      const { ROLE_PERMISSIONS } = require('../permission-definitions');
      const clientPermissions = ROLE_PERMISSIONS[Role.CLIENT];

      expect(clientPermissions).toContain(Permission.PROJECT_READ);
      expect(clientPermissions).toContain(Permission.TASK_READ);
      expect(clientPermissions).not.toContain(Permission.TASK_CREATE);
      expect(clientPermissions).not.toContain(Permission.PROJECT_CREATE);
    });
  });

  describe('Project Role Permissions', () => {
    it('should have correct permissions for project manager role', () => {
      const { PROJECT_ROLE_PERMISSIONS } = require('../permission-definitions');
      const projectManagerPermissions = PROJECT_ROLE_PERMISSIONS[ProjectRole.PROJECT_MANAGER];

      expect(projectManagerPermissions).toContain(Permission.PROJECT_UPDATE);
      expect(projectManagerPermissions).toContain(Permission.TASK_CREATE);
      expect(projectManagerPermissions).toContain(Permission.TEAM_INVITE);
      expect(projectManagerPermissions).toContain(Permission.TIME_TRACKING_APPROVE);
    });

    it('should have correct permissions for project member role', () => {
      const { PROJECT_ROLE_PERMISSIONS } = require('../permission-definitions');
      const projectMemberPermissions = PROJECT_ROLE_PERMISSIONS[ProjectRole.PROJECT_MEMBER];

      expect(projectMemberPermissions).toContain(Permission.TASK_CREATE);
      expect(projectMemberPermissions).toContain(Permission.TIME_TRACKING_CREATE);
      expect(projectMemberPermissions).not.toContain(Permission.TEAM_INVITE);
      expect(projectMemberPermissions).not.toContain(Permission.TIME_TRACKING_APPROVE);
    });

    it('should have correct permissions for project viewer role', () => {
      const { PROJECT_ROLE_PERMISSIONS } = require('../permission-definitions');
      const projectViewerPermissions = PROJECT_ROLE_PERMISSIONS[ProjectRole.PROJECT_VIEWER];

      expect(projectViewerPermissions).toContain(Permission.PROJECT_READ);
      expect(projectViewerPermissions).toContain(Permission.TASK_READ);
      expect(projectViewerPermissions).not.toContain(Permission.TASK_CREATE);
      expect(projectViewerPermissions).not.toContain(Permission.PROJECT_UPDATE);
    });
  });
});

// Pinning tests for project-role resolution. `getUserProjectRole` is private,
// so these drive it through the public `getUserPermissions` and read the
// resolved role back out of the returned `projectRoles` map. They exist because
// the teamMembers fix WIDENS a permission boundary: they fix in place every
// outcome that must NOT change when team members stop falling through to
// PROJECT_VIEWER.
describe('Project role resolution', () => {
  const USER = new mongoose.Types.ObjectId();
  const OTHER = new mongoose.Types.ObjectId();

  // Mirrors the real schema: `teamMembers` is an array of subdocuments
  // ({ memberId, hourlyRate }) and `createdBy` is required.
  const projectWith = (overrides: Record<string, unknown>) => ({
    _id: new mongoose.Types.ObjectId(),
    organization: 'org123',
    createdBy: OTHER,
    teamMembers: [] as unknown[],
    projectRoles: [] as unknown[],
    ...overrides
  });

  const resolve = async (project: { _id: mongoose.Types.ObjectId }) => {
    mockUserFindById({ _id: USER, role: Role.TEAM_MEMBER, organization: 'org123' });
    (Project.find as jest.Mock).mockResolvedValue([project]);

    const permissions = await PermissionService.getUserPermissions(USER.toString());
    return permissions.projectRoles.get(project._id.toString());
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('still prefers an explicit projectRoles entry over any fallback', async () => {
    const project = projectWith({
      projectRoles: [{ user: USER, role: ProjectRole.PROJECT_MANAGER }],
      teamMembers: [{ memberId: USER }]
    });

    await expect(resolve(project)).resolves.toBe(ProjectRole.PROJECT_MANAGER);
  });

  it('still resolves the project creator to project manager', async () => {
    const project = projectWith({ createdBy: USER, teamMembers: [{ memberId: USER }] });

    await expect(resolve(project)).resolves.toBe(ProjectRole.PROJECT_MANAGER);
  });

  it('still resolves the client', async () => {
    const project = projectWith({ client: USER });

    await expect(resolve(project)).resolves.toBe(ProjectRole.PROJECT_CLIENT);
  });

  // The one assertion that proves nobody gains access they should not have.
  it('still resolves a non-member to viewer', async () => {
    const project = projectWith({ teamMembers: [{ memberId: OTHER }] });

    await expect(resolve(project)).resolves.toBe(ProjectRole.PROJECT_VIEWER);
  });

  it('still resolves a user with no relationship at all to viewer', async () => {
    const project = projectWith({ client: OTHER });

    await expect(resolve(project)).resolves.toBe(ProjectRole.PROJECT_VIEWER);
  });

  it('still leaves org-level role resolution untouched', async () => {
    const { ROLE_PERMISSIONS } = require('../permission-definitions');
    const project = projectWith({ teamMembers: [{ memberId: USER }] });

    mockUserFindById({ _id: USER, role: Role.TEAM_MEMBER, organization: 'org123' });
    (Project.find as jest.Mock).mockResolvedValue([project]);

    const permissions = await PermissionService.getUserPermissions(USER.toString());

    expect(permissions.userRole).toBe(Role.TEAM_MEMBER);
    expect(permissions.globalPermissions).toEqual(ROLE_PERMISSIONS[Role.TEAM_MEMBER]);
    // STANDUP_VIEW is withheld org-wide on purpose (permission-definitions.ts)
    // so that it can be granted per project. That stays true.
    expect(permissions.globalPermissions).not.toContain(Permission.STANDUP_VIEW);
  });
});
