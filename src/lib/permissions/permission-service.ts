import { Permission, Role, ProjectRole, PermissionScope, getPermissionScope } from './permission-definitions';
import { User } from '@/models/User';
import { Project } from '@/models/Project';
import { CustomRole } from '@/models/CustomRole';
import mongoose from 'mongoose';

export interface UserPermissions {
  globalPermissions: Permission[];
  projectPermissions: Map<string, Permission[]>; // projectId -> permissions
  userRole: Role;
  customRole?: {
    _id: string;
    name: string;
    permissions: Permission[];
  };
  projectRoles: Map<string, ProjectRole>; // projectId -> projectRole
}

export class PermissionService {
  static async getUserPermissions(userId: string): Promise<UserPermissions> {
    const user = await User.findById(userId).populate('customRole');
    
    if (!user) {
      throw new Error('User not found');
    }

    // Get global permissions based on user role and custom role
    let globalPermissions = this.getGlobalPermissions(user.role as Role);
    
    // If user has a custom role, merge those permissions
    if (user.customRole) {
      const customRole = user.customRole as any;
      globalPermissions = Array.from(new Set([...globalPermissions, ...customRole.permissions]));
    }
    
    // Get project-specific permissions
    const projectPermissions = new Map<string, Permission[]>();
    const projectRoles = new Map<string, ProjectRole>();
    
    // Find all projects where user is a team member
    const projects = await Project.find({
      $or: [
        { teamMembers: user._id },
        { createdBy: user._id },
        { client: user._id }
      ]
    });

    for (const project of projects) {
      const projectRole = this.getUserProjectRole(user, project);
      const permissions = this.getProjectPermissions(projectRole);
      
      projectPermissions.set(project._id.toString(), permissions);
      projectRoles.set(project._id.toString(), projectRole);
    }

    return {
      globalPermissions,
      projectPermissions,
      userRole: user.role as Role,
      customRole: user.customRole ? {
        _id: (user.customRole as any)._id.toString(),
        name: (user.customRole as any).name,
        permissions: (user.customRole as any).permissions
      } : undefined,
      projectRoles
    };
  }

  static async hasPermission(
    userId: string, 
    permission: Permission, 
    projectId?: string
  ): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId);
    const scope = getPermissionScope(permission);
    
    switch (scope) {
      case PermissionScope.GLOBAL:
        return userPermissions.globalPermissions.includes(permission);
        
      case PermissionScope.PROJECT:
        if (!projectId) {
          // For project-scoped permissions, we need a project context
          return false;
        }
        
        // First check if user has the permission globally (e.g., ADMIN role)
        if (userPermissions.globalPermissions.includes(permission)) {
          // If they have it globally, verify the project belongs to their organization
          const user = await User.findById(userId);
          if (user) {
            const project = await Project.findById(projectId);
            if (project && user.organization.toString() === project.organization.toString()) {
              return true;
            }
          }
        }
        
        // Check project-specific permissions
        const projectPermissions = userPermissions.projectPermissions.get(projectId);
        return projectPermissions ? projectPermissions.includes(permission) : false;
        
      case PermissionScope.OWN:
        // For own permissions, user always has access to their own resources
        return true;
        
      default:
        return false;
    }
  }

  static async hasAnyPermission(
    userId: string, 
    permissions: Permission[], 
    projectId?: string
  ): Promise<boolean> {
    for (const permission of permissions) {
      if (await this.hasPermission(userId, permission, projectId)) {
        return true;
      }
    }
    return false;
  }

  static async hasAllPermissions(
    userId: string, 
    permissions: Permission[], 
    projectId?: string
  ): Promise<boolean> {
    for (const permission of permissions) {
      if (!(await this.hasPermission(userId, permission, projectId))) {
        return false;
      }
    }
    return true;
  }

  static async canAccessProject(userId: string, projectId: string): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId);
    
    // Admin can access all projects
    if (userPermissions.userRole === Role.ADMIN || userPermissions.userRole === Role.SUPER_ADMIN) {
      return true;
    }
    
    // Check if user has access to this specific project
    return userPermissions.projectPermissions.has(projectId);
  }

  static async canManageProject(userId: string, projectId: string): Promise<boolean> {
    return this.hasPermission(userId, Permission.PROJECT_UPDATE, projectId);
  }

  static async getAccessibleProjects(userId: string): Promise<string[]> {
    const userPermissions = await this.getUserPermissions(userId);
    
    // Admin can access all projects
    if (userPermissions.userRole === Role.ADMIN || userPermissions.userRole === Role.SUPER_ADMIN) {
      const allProjects = await Project.find({}).select('_id');
      return allProjects.map(p => p._id.toString());
    }
    
    // Return projects where user has access
    return Array.from(userPermissions.projectPermissions.keys());
  }

  static async filterProjectsByAccess(userId: string, projectIds: string[]): Promise<string[]> {
    const accessibleProjects = await this.getAccessibleProjects(userId);
    return projectIds.filter(id => accessibleProjects.includes(id));
  }

  private static getGlobalPermissions(role: Role): Permission[] {
    const { ROLE_PERMISSIONS } = require('./permission-definitions');
    return ROLE_PERMISSIONS[role] || [];
  }

  private static getProjectPermissions(projectRole: ProjectRole): Permission[] {
    const { PROJECT_ROLE_PERMISSIONS } = require('./permission-definitions');
    return PROJECT_ROLE_PERMISSIONS[projectRole] || [];
  }

  private static getUserProjectRole(user: any, project: any): ProjectRole {
    // Check if user has a specific project role assigned
    if (project.projectRoles && project.projectRoles.length > 0) {
      const userProjectRole = project.projectRoles.find(
        (role: any) => role.user.toString() === user._id.toString()
      );
      
      if (userProjectRole) {
        return userProjectRole.role as ProjectRole;
      }
    }
    
    // Check if user is the project creator
    if (project.createdBy.toString() === user._id.toString()) {
      return ProjectRole.PROJECT_MANAGER;
    }
    
    // Check if user is the client
    if (project.client && project.client.toString() === user._id.toString()) {
      return ProjectRole.PROJECT_CLIENT;
    }
    
    // Check if user is a team member
    const isTeamMember = project.teamMembers.some(
      (memberId: mongoose.Types.ObjectId) => memberId.toString() === user._id.toString()
    );
    
    if (isTeamMember) {
      // Default to project member, but could be enhanced with specific project roles
      return ProjectRole.PROJECT_MEMBER;
    }
    
    // Default to viewer if user has some access but no specific role
    return ProjectRole.PROJECT_VIEWER;
  }

  static async requirePermission(
    userId: string, 
    permission: Permission, 
    projectId?: string
  ): Promise<void> {
    const hasPermission = await this.hasPermission(userId, permission, projectId);
    
    if (!hasPermission) {
      throw new Error(`Insufficient permissions: ${permission}`);
    }
  }

  static async requireAnyPermission(
    userId: string, 
    permissions: Permission[], 
    projectId?: string
  ): Promise<void> {
    const hasAnyPermission = await this.hasAnyPermission(userId, permissions, projectId);
    
    if (!hasAnyPermission) {
      throw new Error(`Insufficient permissions: ${permissions.join(', ')}`);
    }
  }

  static async requireAllPermissions(
    userId: string, 
    permissions: Permission[], 
    projectId?: string
  ): Promise<void> {
    const hasAllPermissions = await this.hasAllPermissions(userId, permissions, projectId);
    
    if (!hasAllPermissions) {
      throw new Error(`Insufficient permissions: ${permissions.join(', ')}`);
    }
  }

  static async requireProjectAccess(userId: string, projectId: string): Promise<void> {
    const canAccess = await this.canAccessProject(userId, projectId);
    
    if (!canAccess) {
      throw new Error('Access denied to project');
    }
  }

  static async requireProjectManagement(userId: string, projectId: string): Promise<void> {
    const canManage = await this.canManageProject(userId, projectId);
    
    if (!canManage) {
      throw new Error('Project management access denied');
    }
  }
}
