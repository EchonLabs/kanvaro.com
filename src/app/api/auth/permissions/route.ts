import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db-config';
import { authenticateUser } from '@/lib/auth-utils';
import { PermissionService } from '@/lib/permissions/permission-service';
import '@/models/registry';


export async function GET(req: NextRequest) {
  try {
    const authResult = await authenticateUser();
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    // Ensure the org DB context is set for the proxy models used by PermissionService
    await connectDB(authResult.user.orgId);
    const orgId = authResult.user.orgId;
    console.log(`[permissions] Fetching permissions for user ${authResult.user.id} in org ${orgId}`);

    const userId = authResult.user.id;
    const userPermissions = await PermissionService.getUserPermissions(userId, orgId);
    
    // Convert Map to plain object for JSON serialization
    const projectPermissions: Record<string, string[]> = {};
    userPermissions.projectPermissions.forEach((permissions, projectId) => {
      projectPermissions[projectId] = permissions;
    });

    const projectRoles: Record<string, string> = {};
    userPermissions.projectRoles.forEach((role, projectId) => {
      projectRoles[projectId] = role;
    });

    return NextResponse.json({
      userId: userId,
      globalPermissions: userPermissions.globalPermissions,
      projectPermissions,
      projectRoles,
      userRole: userPermissions.userRole,
      accessibleProjects: await PermissionService.getAccessibleProjects(userId, orgId)
    });


  } catch (error) {
    console.error('Error fetching user permissions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch permissions' },
      { status: 500 }
    );
  }
}