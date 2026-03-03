import { Permission, Role, ProjectRole, PermissionScope, getPermissionScope } from './permission-definitions';
import { getOrgConnection, getModelOnConnection } from '@/lib/db-connection-manager';
import { getCurrentOrgDb, setCurrentOrgDb } from '@/lib/request-context';
import { getOrgConfigs } from '@/lib/config';
import '@/models/registry';
import mongoose from 'mongoose';

function getModels(orgId: string) {
  // Look up the org whose id matches, get its cached connection from the pool.
  const orgs = getOrgConfigs();
  const orgCfg = orgs.find(o => o.id === orgId);
  if (!orgCfg) throw new Error(`PermissionService: unknown orgId "${orgId}"`);

  return {
    async User() {
      const conn = await getOrgConnection(orgId);
      return getModelOnConnection<any>('User', conn);
    },
    async Project() {
      const conn = await getOrgConnection(orgId);
      return getModelOnConnection<any>('Project', conn);
    },
    async CustomRole() {
      const conn = await getOrgConnection(orgId);
      return getModelOnConnection<any>('CustomRole', conn);
    },
  };
}

function resolveOrgId(orgId?: string): string {
  if (orgId) return orgId;

  // Ambient fallback – look up org whose database name matches the current context.
  const dbName = getCurrentOrgDb();
  if (dbName) {
    const org = getOrgConfigs().find(o => o.database.database === dbName);
    if (org) return org.id;
  }

  // Last resort – primary org
  const orgs = getOrgConfigs();
  if (orgs.length > 0) return orgs[0].id;

  throw new Error('PermissionService: cannot determine orgId – none provided and no ambient context');
}

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
  /**
   * @param orgId  The organisation whose tenant DB should be queried.
   *               Should always be provided by the caller.
   */
  static async getUserPermissions(userId: string, orgId?: string): Promise<UserPermissions> {
    const oid = resolveOrgId(orgId);
    const models = getModels(oid);
    const UserModel = await models.User();

    const user = await UserModel.findById(userId).populate('customRole');
    
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
    const ProjectModel = await models.Project();
    const projects = await ProjectModel.find({
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
    projectId?: string,
    orgId?: string
  ): Promise<boolean> {
    const oid = resolveOrgId(orgId);
    const userPermissions = await this.getUserPermissions(userId, oid);
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
          const models = getModels(oid);
          const UserModel = await models.User();
          const user = await UserModel.findById(userId);
          if (user) {
            const ProjectModel = await models.Project();
            const project = await ProjectModel.findById(projectId);
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
    projectId?: string,
    orgId?: string
  ): Promise<boolean> {
    for (const permission of permissions) {
      if (await this.hasPermission(userId, permission, projectId, orgId)) {
        return true;
      }
    }
    return false;
  }

  static async hasAllPermissions(
    userId: string, 
    permissions: Permission[], 
    projectId?: string,
    orgId?: string
  ): Promise<boolean> {
    for (const permission of permissions) {
      if (!(await this.hasPermission(userId, permission, projectId, orgId))) {
        return false;
      }
    }
    return true;
  }

  static async canAccessProject(userId: string, projectId: string, orgId?: string): Promise<boolean> {
    const oid = resolveOrgId(orgId);
    const userPermissions = await this.getUserPermissions(userId, oid);
    
    // Check if user has PROJECT_VIEW_ALL permission (allows viewing all projects)
    if (userPermissions.globalPermissions.includes(Permission.PROJECT_VIEW_ALL)) {
      // Verify the project belongs to the user's organization
      const models = getModels(oid);
      const UserModel = await models.User();
      const user = await UserModel.findById(userId);
      if (user) {
        const ProjectModel = await models.Project();
        const project = await ProjectModel.findById(projectId);
        if (project && user.organization.toString() === project.organization.toString()) {
          return true;
        }
      }
    }
    
    // Admin and Super Admin can access all projects (backward compatibility)
    if (userPermissions.userRole === Role.ADMIN || userPermissions.userRole === Role.SUPER_ADMIN) {
      return true;
    }
    
    // Check if user has access to this specific project
    return userPermissions.projectPermissions.has(projectId);
  }

  static async canManageProject(userId: string, projectId: string, orgId?: string): Promise<boolean> {
    return this.hasPermission(userId, Permission.PROJECT_UPDATE, projectId, orgId);
  }

  static async getAccessibleProjects(userId: string, orgId?: string): Promise<string[]> {
    const oid = resolveOrgId(orgId);
    const userPermissions = await this.getUserPermissions(userId, oid);
    const models = getModels(oid);
    
    // Check if user has PROJECT_VIEW_ALL permission (allows viewing all projects)
    if (userPermissions.globalPermissions.includes(Permission.PROJECT_VIEW_ALL)) {
      const UserModel = await models.User();
      const user = await UserModel.findById(userId);
      if (user) {
        const ProjectModel = await models.Project();
        const allProjects = await ProjectModel.find({ 
          organization: user.organization,
          is_deleted: { $ne: true }
        }).select('_id');
        return allProjects.map((p: any) => p._id.toString());
      }
    }
    
    // Admin and Super Admin can access all projects (backward compatibility)
    if (userPermissions.userRole === Role.ADMIN || userPermissions.userRole === Role.SUPER_ADMIN) {
      const UserModel = await models.User();
      const user = await UserModel.findById(userId);
      if (user) {
        const ProjectModel = await models.Project();
        const allProjects = await ProjectModel.find({ 
          organization: user.organization,
          is_deleted: { $ne: true }
        }).select('_id');
        return allProjects.map((p: any) => p._id.toString());
      }
    }
    
    // Return projects where user has access
    return Array.from(userPermissions.projectPermissions.keys());
  }

  static async filterProjectsByAccess(userId: string, projectIds: string[], orgId?: string): Promise<string[]> {
    const accessibleProjects = await this.getAccessibleProjects(userId, orgId);
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
    projectId?: string,
    orgId?: string
  ): Promise<void> {
    const hasPermission = await this.hasPermission(userId, permission, projectId, orgId);
    
    if (!hasPermission) {
      throw new Error(`Insufficient permissions: ${permission}`);
    }
  }

  static async requireAnyPermission(
    userId: string, 
    permissions: Permission[], 
    projectId?: string,
    orgId?: string
  ): Promise<void> {
    const hasAnyPermission = await this.hasAnyPermission(userId, permissions, projectId, orgId);
    
    if (!hasAnyPermission) {
      throw new Error(`Insufficient permissions: ${permissions.join(', ')}`);
    }
  }

  static async requireAllPermissions(
    userId: string, 
    permissions: Permission[], 
    projectId?: string,
    orgId?: string
  ): Promise<void> {
    const hasAllPermissions = await this.hasAllPermissions(userId, permissions, projectId, orgId);
    
    if (!hasAllPermissions) {
      throw new Error(`Insufficient permissions: ${permissions.join(', ')}`);
    }
  }

  static async requireProjectAccess(userId: string, projectId: string, orgId?: string): Promise<void> {
    const canAccess = await this.canAccessProject(userId, projectId, orgId);
    
    if (!canAccess) {
      throw new Error('Access denied to project');
    }
  }

  static async requireProjectManagement(userId: string, projectId: string, orgId?: string): Promise<void> {
    const canManage = await this.canManageProject(userId, projectId, orgId);
    
    if (!canManage) {
      throw new Error('Project management access denied');
    }
  }
}
