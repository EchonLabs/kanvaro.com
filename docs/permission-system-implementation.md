---
slug: "reference/permission-system-implementation"
title: "Permission System Implementation"
summary: "Technical implementation details for the role-based permission system with granular access control and security."
visibility: "public"
audiences: ["admin", "self_host_admin"]
category: "reference"
order: 70
updated: "2025-01-04"
---

# Kanvaro Permission System Implementation

## Overview

The Kanvaro permission system provides comprehensive role-based access control (RBAC) with project-scoped permissions, allowing fine-grained control over user access to features and resources.

## Architecture

### Core Components

1. **Permission Definitions** (`src/lib/permissions/permission-definitions.ts`)
   - Defines all available permissions and roles
   - Maps roles to their default permissions
   - Defines project-specific roles and permissions

2. **Permission Service** (`src/lib/permissions/permission-service.ts`)
   - Core logic for checking permissions
   - Handles project-scoped access control
   - Manages user permission aggregation

3. **Permission Middleware** (`src/lib/permissions/permission-middleware.ts`)
   - API route protection
   - Permission checking utilities
   - Project access validation

4. **Permission Hooks** (`src/lib/permissions/permission-hooks.ts`)
   - React hooks for client-side permission checking
   - Feature-specific permission hooks
   - User permission state management

5. **Permission Components** (`src/lib/permissions/permission-components.tsx`)
   - React components for conditional rendering
   - Permission-based UI gates
   - Higher-order components for permission wrapping

## Permission Categories

### Global Permissions
- **System**: `SYSTEM_ADMIN`, `SYSTEM_MONITOR`, `SYSTEM_MAINTENANCE`
- **User Management**: `USER_CREATE`, `USER_READ`, `USER_UPDATE`, `USER_DELETE`, `USER_INVITE`, `USER_ACTIVATE`, `USER_DEACTIVATE`, `USER_MANAGE_ROLES`
- **Organization**: `ORGANIZATION_READ`, `ORGANIZATION_UPDATE`, `ORGANIZATION_DELETE`, `ORGANIZATION_MANAGE_SETTINGS`, `ORGANIZATION_MANAGE_BILLING`
- **Settings**: `SETTINGS_READ`, `SETTINGS_UPDATE`, `SETTINGS_MANAGE_EMAIL`, `SETTINGS_MANAGE_DATABASE`, `SETTINGS_MANAGE_SECURITY`

### Project-Scoped Permissions
- **Projects**: `PROJECT_CREATE`, `PROJECT_READ`, `PROJECT_UPDATE`, `PROJECT_DELETE`, `PROJECT_MANAGE_TEAM`, `PROJECT_MANAGE_BUDGET`, `PROJECT_ARCHIVE`, `PROJECT_RESTORE`, `PROJECT_VIEW_ALL`
- **Tasks**: `TASK_CREATE`, `TASK_READ`, `TASK_UPDATE`, `TASK_DELETE`, `TASK_ASSIGN`, `TASK_CHANGE_STATUS`, `TASK_MANAGE_COMMENTS`, `TASK_MANAGE_ATTACHMENTS`
- **Team**: `TEAM_READ`, `TEAM_INVITE`, `TEAM_REMOVE`, `TEAM_MANAGE_PERMISSIONS`, `TEAM_VIEW_ACTIVITY`
- **Time Tracking**: `TIME_TRACKING_CREATE`, `TIME_TRACKING_READ`, `TIME_TRACKING_UPDATE`, `TIME_TRACKING_DELETE`, `TIME_TRACKING_APPROVE`, `TIME_TRACKING_EXPORT`, `TIME_TRACKING_VIEW_ALL`
- **Financial**: `FINANCIAL_READ`, `FINANCIAL_MANAGE_BUDGET`, `FINANCIAL_CREATE_EXPENSE`, `FINANCIAL_APPROVE_EXPENSE`, `FINANCIAL_CREATE_INVOICE`, `FINANCIAL_SEND_INVOICE`, `FINANCIAL_MANAGE_PAYMENTS`
- **Reporting**: `REPORTING_VIEW`, `REPORTING_CREATE`, `REPORTING_EXPORT`, `REPORTING_SHARE`
- **Epics**: `EPIC_CREATE`, `EPIC_READ`, `EPIC_UPDATE`, `EPIC_DELETE`
- **Sprints**: `SPRINT_CREATE`, `SPRINT_READ`, `SPRINT_UPDATE`, `SPRINT_DELETE`, `SPRINT_MANAGE`
- **Stories**: `STORY_CREATE`, `STORY_READ`, `STORY_UPDATE`, `STORY_DELETE`
- **Calendar**: `CALENDAR_READ`, `CALENDAR_CREATE`, `CALENDAR_UPDATE`, `CALENDAR_DELETE`
- **Kanban**: `KANBAN_READ`, `KANBAN_MANAGE`
- **backlog**: `BACKLOG_READ`, `BACKLOG_MANAGE`

### Own Permissions
- **User Profile**: `USER_READ`, `USER_UPDATE`
- **Time Tracking**: `TIME_TRACKING_CREATE`, `TIME_TRACKING_UPDATE`, `TIME_TRACKING_DELETE`
- **Settings**: `SETTINGS_READ`

## User Roles

### Global Roles
1. **Super Admin**: All permissions
2. **Admin**: Most permissions, can manage organization and users
3. **Project Manager**: Project and team management permissions
4. **Team Member**: Basic project and task permissions
5. **Client**: Read-only access to assigned projects
6. **Viewer**: Read-only access to assigned projects

### Project Roles
1. **Project Manager**: Full project management permissions
2. **Project Member**: Task creation and management permissions
3. **Project Viewer**: Read-only project access
4. **Project Client**: Read-only project access

## Usage Examples

### API Route Protection

```typescript
import { withPermission } from '@/lib/permissions/permission-middleware';
import { Permission } from '@/lib/permissions/permission-definitions';

export const GET = withPermission(Permission.PROJECT_READ)(
  async (req: NextRequest, context: PermissionContext) => {
    // Your route logic here
    return NextResponse.json({ data: projects });
  }
);
```

### Project-Scoped Permissions

```typescript
import { withProjectAccess } from '@/lib/permissions/permission-middleware';

export const PUT = withProjectAccess('id', { requireManagement: true })(
  async (req: NextRequest, context: PermissionContext) => {
    // Only users who can manage the project can access this route
    return NextResponse.json({ success: true });
  }
);
```

### Client-Side Permission Checking

```typescript
import { usePermissions, useProjectPermissions } from '@/lib/permissions/permission-hooks';

function MyComponent({ projectId }: { projectId: string }) {
  const { hasPermission, canAccessProject } = usePermissions();
  const { canManage } = useProjectPermissions(projectId);

  if (!canAccessProject(projectId)) {
    return <div>Access denied</div>;
  }

  return (
    <div>
      {hasPermission(Permission.TASK_CREATE, projectId) && (
        <button>Create Task</button>
      )}
      {canManage && (
        <button>Manage Project</button>
      )}
    </div>
  );
}
```

### Permission Gates in Components

```typescript
import { PermissionGate, PermissionButton } from '@/lib/permissions/permission-components';
import { Permission } from '@/lib/permissions/permission-definitions';

function ProjectActions({ projectId }: { projectId: string }) {
  return (
    <div>
      <PermissionGate permission={Permission.PROJECT_UPDATE} projectId={projectId}>
        <button>Edit Project</button>
      </PermissionGate>
      
      <PermissionButton 
        permission={Permission.PROJECT_DELETE} 
        projectId={projectId}
        onClick={() => deleteProject(projectId)}
      >
        Delete Project
      </PermissionButton>
    </div>
  );
}
```

### Sidebar Navigation with Permissions

```typescript
import { PermissionGate } from '@/lib/permissions/permission-components';
import { Permission } from '@/lib/permissions/permission-definitions';

const navigationItems = [
  {
    id: 'projects',
    label: 'Projects',
    icon: FolderOpen,
    path: '/projects',
    permission: Permission.PROJECT_READ
  },
  {
    id: 'team',
    label: 'Team',
    icon: Users,
    path: '/team',
    permission: Permission.TEAM_READ
  }
];

function NavigationItem({ item }: { item: any }) {
  return (
    <PermissionGate permission={item.permission}>
      <a href={item.path}>{item.label}</a>
    </PermissionGate>
  );
}
```

## Project Scoping

### How Project Scoping Works

1. **User Assignment**: Users are assigned to projects through:
   - `teamMembers` array (automatic project member role)
   - `client` field (project client role)
   - `projectRoles` array (explicit role assignment)

2. **Permission Inheritance**: Users inherit permissions based on:
   - Global role permissions
   - Project-specific role permissions
   - Direct project access

3. **Access Control**: The system checks:
   - Global permissions for organization-wide features
   - Project permissions for project-specific features
   - Project access for resource visibility

### Project Access Levels

1. **No Access**: User cannot see or interact with the project
2. **Viewer Access**: User can view project details and tasks
3. **Member Access**: User can create and manage tasks
4. **Manager Access**: User can manage project settings and team
5. **Admin Access**: User can manage all projects in the organization

## Database Schema Updates

### User Model Updates

```typescript
export interface IUser extends Document {
  // ... existing fields
  projectRoles: {
    project: mongoose.Types.ObjectId
    role: 'project_manager' | 'project_member' | 'project_viewer' | 'project_client'
    assignedBy: mongoose.Types.ObjectId
    assignedAt: Date
  }[]
}
```

### Project Model Updates

```typescript
export interface IProject extends Document {
  // ... existing fields
  projectRoles: {
    user: mongoose.Types.ObjectId
    role: 'project_manager' | 'project_member' | 'project_viewer' | 'project_client'
    assignedBy: mongoose.Types.ObjectId
    assignedAt: Date
  }[]
}
```

## API Endpoints

### Permission Endpoint

```
GET /api/auth/permissions
```

Returns user's permissions and accessible projects:

```json
{
  "globalPermissions": ["user:read", "project:create", ...],
  "projectPermissions": {
    "project123": ["project:update", "task:create", ...],
    "project456": ["project:read", "task:read", ...]
  },
  "projectRoles": {
    "project123": "project_manager",
    "project456": "project_member"
  },
  "userRole": "admin",
  "accessibleProjects": ["project123", "project456"]
}
```

## Testing

The permission system includes comprehensive tests covering:

- Permission checking logic
- Project access control
- Role-based permissions
- Permission scopes
- API route protection
- Component rendering

Run tests with:

```bash
npm test src/lib/permissions/__tests__/permission-system.test.ts
```

## Migration Guide

### For Existing Users

1. **Default Role Assignment**: Existing users will be assigned appropriate roles based on their current permissions
2. **Project Access**: Users will be granted access to projects they're already members of
3. **Permission Inheritance**: Users will inherit permissions from their global role

### For New Features

1. **Define Permissions**: Add new permissions to the permission definitions
2. **Update Roles**: Assign permissions to appropriate roles
3. **Protect Routes**: Use permission middleware in API routes
4. **Update UI**: Use permission gates in components
5. **Test**: Ensure permissions work correctly

## Best Practices

1. **Principle of Least Privilege**: Grant only necessary permissions
2. **Explicit Permissions**: Use specific permissions rather than broad ones
3. **Project Scoping**: Use project-scoped permissions for project-specific features
4. **Permission Gates**: Always use permission gates in UI components
5. **API Protection**: Protect all API routes with appropriate permissions
6. **Testing**: Test permission logic thoroughly
7. **Documentation**: Document permission requirements for features

## Troubleshooting

### Common Issues

1. **Permission Denied**: Check if user has the required permission and project access
2. **Project Not Found**: Verify user has access to the project
3. **Role Assignment**: Ensure user has appropriate role for the action
4. **Permission Scope**: Verify permission scope (global, project, own)

### Debug Tools

1. **Permission API**: Use `/api/auth/permissions` to check user permissions
2. **Console Logging**: Enable debug logging in permission service
3. **Permission Hooks**: Use permission hooks to debug client-side permissions
4. **Test Cases**: Use test cases to verify permission logic

## Security Considerations

1. **Server-Side Validation**: Always validate permissions on the server
2. **Client-Side Hiding**: Use permission gates to hide UI elements
3. **API Protection**: Protect all API endpoints with permission middleware
4. **Project Isolation**: Ensure users can only access their assigned projects
5. **Permission Inheritance**: Verify permission inheritance logic
6. **Role Changes**: Handle role changes and permission updates properly
