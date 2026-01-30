import { PermissionService } from '../permission-service';
import { Permission, Role, ProjectRole } from '../permission-definitions';
import { User } from '@/models/User';
import { Project } from '@/models/Project';
import mongoose from 'mongoose';

// Mock the database models
jest.mock('@/models/User');
jest.mock('@/models/Project');

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
        (User.findById as jest.Mock).mockResolvedValue(mockUser);
        (Project.find as jest.Mock).mockResolvedValue([mockProject]);

        const hasPermission = await PermissionService.hasPermission(
          'user123',
          Permission.PROJECT_CREATE
        );

        expect(hasPermission).toBe(true);
      });

      it('should return false for users without required permissions', async () => {
        const teamMemberUser = { ...mockUser, role: Role.TEAM_MEMBER };
        (User.findById as jest.Mock).mockResolvedValue(teamMemberUser);
        (Project.find as jest.Mock).mockResolvedValue([mockProject]);

        const hasPermission = await PermissionService.hasPermission(
          'user123',
          Permission.USER_DELETE
        );

        expect(hasPermission).toBe(false);
      });

      it('should return true for project-scoped permissions when user has access', async () => {
        (User.findById as jest.Mock).mockResolvedValue(mockUser);
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
        (User.findById as jest.Mock).mockResolvedValue(teamMemberUser);
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
        (User.findById as jest.Mock).mockResolvedValue(mockUser);
        (Project.find as jest.Mock).mockResolvedValue([mockProject]);

        const canAccess = await PermissionService.canAccessProject(
          'user123',
          'project123'
        );

        expect(canAccess).toBe(true);
      });

      it('should return true for project team members', async () => {
        const teamMemberUser = { ...mockUser, role: Role.TEAM_MEMBER };
        (User.findById as jest.Mock).mockResolvedValue(teamMemberUser);
        (Project.find as jest.Mock).mockResolvedValue([mockProject]);

        const canAccess = await PermissionService.canAccessProject(
          'user123',
          'project123'
        );

        expect(canAccess).toBe(true);
      });

      it('should return false for users without project access', async () => {
        const teamMemberUser = { ...mockUser, role: Role.TEAM_MEMBER };
        (User.findById as jest.Mock).mockResolvedValue(teamMemberUser);
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
        const allProjects = [
          { _id: 'project1' },
          { _id: 'project2' },
          { _id: 'project3' }
        ];

        (User.findById as jest.Mock).mockResolvedValue(mockUser);
        (Project.find as jest.Mock).mockResolvedValue(allProjects);

        const accessibleProjects = await PermissionService.getAccessibleProjects('user123');

        expect(accessibleProjects).toEqual(['project1', 'project2', 'project3']);
      });

      it('should return only assigned projects for non-admin users', async () => {
        const teamMemberUser = { ...mockUser, role: Role.TEAM_MEMBER };
        (User.findById as jest.Mock).mockResolvedValue(teamMemberUser);
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
    });

    it('should correctly identify project permissions', () => {
      const { getPermissionScope } = require('../permission-definitions');
      
      expect(getPermissionScope(Permission.PROJECT_UPDATE)).toBe('project');
      expect(getPermissionScope(Permission.TASK_CREATE)).toBe('project');
      expect(getPermissionScope(Permission.TEAM_INVITE)).toBe('project');
    });

    it('should correctly identify own permissions', () => {
      const { getPermissionScope } = require('../permission-definitions');
      
      expect(getPermissionScope(Permission.USER_READ)).toBe('own');
      expect(getPermissionScope(Permission.TIME_TRACKING_CREATE)).toBe('own');
      expect(getPermissionScope(Permission.SETTINGS_VIEW)).toBe('own');
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

      expect(teamMemberPermissions).toContain(Permission.TASK_CREATE);
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
