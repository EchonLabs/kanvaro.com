import { NextRequest, NextResponse } from 'next/server';
import connectDB, { hasDatabaseConfig } from '@/lib/db-config';
import { authenticateUser } from '@/lib/auth-utils';
import { PermissionService } from '@/lib/permissions/permission-service';
import { Permission } from '@/lib/permissions/permission-definitions';

// Default permissions for basic navigation when database is not configured
const getDefaultPermissions = () => ({
  globalPermissions: [
    Permission.PROJECT_READ,
    Permission.TASK_READ,
    Permission.TEAM_READ,
    Permission.TIME_TRACKING_READ,
    Permission.FINANCIAL_READ,
    Permission.REPORTING_VIEW,
    Permission.SETTINGS_READ,
    Permission.EPIC_READ,
    Permission.SPRINT_READ,
    Permission.STORY_READ,
    Permission.CALENDAR_READ,
    Permission.KANBAN_READ,
    Permission.BACKLOG_READ,
    Permission.TEST_SUITE_READ,
    Permission.TEST_CASE_READ,
    Permission.TEST_PLAN_READ,
    Permission.TEST_EXECUTION_READ,
    Permission.TEST_REPORT_VIEW
  ],
  projectPermissions: {},
  projectRoles: {},
  userRole: 'team_member',
  accessibleProjects: []
});

export async function GET(req: NextRequest) {
  try {
    // Check if database is configured first
    const isConfigured = await hasDatabaseConfig();
    
    if (!isConfigured) {
      // Return default permissions when database is not configured
      // This allows the app to function even during initial setup
      return NextResponse.json(getDefaultPermissions());
    }

    try {
      await connectDB();
    } catch (dbError) {
      // If database connection fails, return default permissions
      console.error('Database connection failed, using default permissions:', dbError);
      return NextResponse.json(getDefaultPermissions());
    }
    
    try {
      const authResult = await authenticateUser();
      if ('error' in authResult) {
        // If authentication fails, still return default permissions for basic navigation
        // This prevents the UI from breaking during setup
        return NextResponse.json(getDefaultPermissions());
      }

      const userId = authResult.user.id;
      const userPermissions = await PermissionService.getUserPermissions(userId);
      
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
        globalPermissions: userPermissions.globalPermissions,
        projectPermissions,
        projectRoles,
        userRole: userPermissions.userRole,
        accessibleProjects: await PermissionService.getAccessibleProjects(userId)
      });
    } catch (authError) {
      // If authentication or permission fetching fails, return default permissions
      console.error('Error fetching user permissions, using default permissions:', authError);
      return NextResponse.json(getDefaultPermissions());
    }
  } catch (error) {
    console.error('Error in permissions API, using default permissions:', error);
    
    // Return default permissions instead of error to prevent UI breakage
    // This allows the app to continue functioning even if permission fetch fails
    return NextResponse.json(getDefaultPermissions());
  }
}
