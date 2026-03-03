import { NextRequest, NextResponse } from 'next/server';
import { Permission } from './permission-definitions';
import { PermissionService } from './permission-service';
import { authenticateUser } from '@/lib/auth-utils';

export interface PermissionContext {
  userId: string;
  projectId?: string;
  permissions: Permission[];
}

export function withPermission(
  permission: Permission,
  options: {
    projectIdParam?: string; // Parameter name to extract project ID from
    requireAll?: boolean; // If true, require all permissions
  } = {}
) {
  return function (handler: (req: NextRequest, context: PermissionContext) => Promise<NextResponse>) {
    return async (req: NextRequest, routeContext?: any) => {
      try {
        // Authenticate user
        const authResult = await authenticateUser();
        if ('error' in authResult) {
          return NextResponse.json(
            { error: authResult.error },
            { status: authResult.status }
          );
        }

        const userId = authResult.user.id;
        let projectId: string | undefined;

        // Extract project ID if needed
        if (options.projectIdParam && routeContext?.params) {
          projectId = routeContext.params[options.projectIdParam];
        }

        // Check permission
        const hasPermission = await PermissionService.hasPermission(userId, permission, projectId);
        
        if (!hasPermission) {
          return NextResponse.json(
            { error: 'Insufficient permissions' },
            { status: 403 }
          );
        }

        // If project-scoped permission, verify project access
        if (projectId) {
          await PermissionService.requireProjectAccess(userId, projectId);
        }

        // Call the original handler with permission context
        const context: PermissionContext = {
          userId,
          projectId,
          permissions: [permission]
        };

        return await handler(req, context);
      } catch (error) {
        console.error('Permission middleware error:', error);
        return NextResponse.json(
          { error: 'Permission check failed' },
          { status: 500 }
        );
      }
    };
  };
}

export function withPermissions(
  permissions: Permission[],
  options: {
    projectIdParam?: string;
    requireAll?: boolean;
  } = {}
) {
  return function (handler: (req: NextRequest, context: PermissionContext) => Promise<NextResponse>) {
    return async (req: NextRequest, routeContext?: any) => {
      try {
        // Authenticate user
        const authResult = await authenticateUser();
        if ('error' in authResult) {
          return NextResponse.json(
            { error: authResult.error },
            { status: authResult.status }
          );
        }

        const userId = authResult.user.id;
        let projectId: string | undefined;

        // Extract project ID if needed
        if (options.projectIdParam && routeContext?.params) {
          projectId = routeContext.params[options.projectIdParam];
        }

        // Check permissions
        let hasRequiredPermissions: boolean;
        
        if (options.requireAll) {
          hasRequiredPermissions = await PermissionService.hasAllPermissions(userId, permissions, projectId);
        } else {
          hasRequiredPermissions = await PermissionService.hasAnyPermission(userId, permissions, projectId);
        }
        
        if (!hasRequiredPermissions) {
          return NextResponse.json(
            { error: 'Insufficient permissions' },
            { status: 403 }
          );
        }

        // If project-scoped permissions, verify project access
        if (projectId) {
          await PermissionService.requireProjectAccess(userId, projectId);
        }

        // Call the original handler with permission context
        const context: PermissionContext = {
          userId,
          projectId,
          permissions
        };

        return await handler(req, context);
      } catch (error) {
        console.error('Permission middleware error:', error);
        return NextResponse.json(
          { error: 'Permission check failed' },
          { status: 500 }
        );
      }
    };
  };
}

export function withProjectAccess(
  projectIdParam: string = 'id',
  options: {
    requireManagement?: boolean;
  } = {}
) {
  return function (handler: (req: NextRequest, context: PermissionContext) => Promise<NextResponse>) {
    return async (req: NextRequest, routeContext?: any) => {
      try {
        // Authenticate user
        const authResult = await authenticateUser();
        if ('error' in authResult) {
          return NextResponse.json(
            { error: authResult.error },
            { status: authResult.status }
          );
        }

        const userId = authResult.user.id;
        const projectId = routeContext?.params?.[projectIdParam];

        if (!projectId) {
          return NextResponse.json(
            { error: 'Project ID required' },
            { status: 400 }
          );
        }

        // Check project access
        if (options.requireManagement) {
          await PermissionService.requireProjectManagement(userId, projectId);
        } else {
          await PermissionService.requireProjectAccess(userId, projectId);
        }

        // Call the original handler with permission context
        const context: PermissionContext = {
          userId,
          projectId,
          permissions: []
        };

        return await handler(req, context);
      } catch (error) {
        console.error('Project access middleware error:', error);
        return NextResponse.json(
          { error: 'Project access denied' },
          { status: 403 }
        );
      }
    };
  };
}

// Utility function to check permissions in API routes
export async function checkPermission(
  userId: string,
  permission: Permission,
  projectId?: string
): Promise<boolean> {
  try {
    return await PermissionService.hasPermission(userId, permission, projectId);
  } catch (error) {
    console.error('Permission check error:', error);
    return false;
  }
}

// Utility function to check multiple permissions
export async function checkPermissions(
  userId: string,
  permissions: Permission[],
  projectId?: string,
  requireAll: boolean = false
): Promise<boolean> {
  try {
    if (requireAll) {
      return await PermissionService.hasAllPermissions(userId, permissions, projectId);
    } else {
      return await PermissionService.hasAnyPermission(userId, permissions, projectId);
    }
  } catch (error) {
    console.error('Permissions check error:', error);
    return false;
  }
}

// Utility function to get user's accessible projects
export async function getUserAccessibleProjects(userId: string): Promise<string[]> {
  try {
    return await PermissionService.getAccessibleProjects(userId);
  } catch (error) {
    console.error('Get accessible projects error:', error);
    return [];
  }
}

// Utility function to filter projects by access
export async function filterProjectsByAccess(
  userId: string,
  projectIds: string[]
): Promise<string[]> {
  try {
    return await PermissionService.filterProjectsByAccess(userId, projectIds);
  } catch (error) {
    console.error('Filter projects by access error:', error);
    return [];
  }
}
