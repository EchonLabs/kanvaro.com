'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Permission } from './permission-definitions';

interface UserPermissions {
  globalPermissions: Permission[];
  projectPermissions: Record<string, Permission[]>;
  projectRoles: Record<string, string>;
  userRole: string;
  accessibleProjects: string[];
}

interface PermissionContextType {
  permissions: UserPermissions | null;
  loading: boolean;
  error: string | null;
  hasPermission: (permission: Permission, projectId?: string) => boolean;
  hasAnyPermission: (permissions: Permission[], projectId?: string) => boolean;
  hasAllPermissions: (permissions: Permission[], projectId?: string) => boolean;
  canAccessProject: (projectId: string) => boolean;
  canManageProject: (projectId: string) => boolean;
  refreshPermissions: () => Promise<void>;
}

const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

// Cache permissions to prevent repeated API calls
let permissionsCache: UserPermissions | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const STORAGE_KEY = 'kanvaro_permissions';
const STORAGE_TIMESTAMP_KEY = 'kanvaro_permissions_timestamp';

// Load permissions from sessionStorage on initialization
if (typeof window !== 'undefined') {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    const storedTimestamp = sessionStorage.getItem(STORAGE_TIMESTAMP_KEY);
    if (stored && storedTimestamp) {
      const timestamp = parseInt(storedTimestamp, 10);
      if (Date.now() - timestamp < CACHE_DURATION) {
        permissionsCache = JSON.parse(stored);
        cacheTimestamp = timestamp;
      } else {
        // Clear expired cache
        sessionStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(STORAGE_TIMESTAMP_KEY);
      }
    }
  } catch (error) {
    console.error('Error loading permissions from sessionStorage:', error);
  }

  // Global function to clear permission cache for debugging
  (window as any).clearPermissionCache = () => {
    permissionsCache = null;
    cacheTimestamp = 0;
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_TIMESTAMP_KEY);
    console.log('Permission cache cleared. Refresh the page to reload permissions.');
  };
}

// Helper function to save permissions to sessionStorage
function savePermissionsToStorage(permissions: UserPermissions) {
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(permissions));
      sessionStorage.setItem(STORAGE_TIMESTAMP_KEY, Date.now().toString());
    } catch (error) {
      console.error('Error saving permissions to sessionStorage:', error);
    }
  }
}

interface PermissionProviderProps {
  children: ReactNode;
  initialPermissions?: UserPermissions | null;
}

export function PermissionProvider({ children, initialPermissions }: PermissionProviderProps) {
  // Seed from initialPermissions (server-hydrated), sessionStorage, or existing cache
  let initial: UserPermissions | null = null;
  
  if (initialPermissions) {
    initial = initialPermissions;
  } else if (permissionsCache && Date.now() - cacheTimestamp < CACHE_DURATION) {
    initial = permissionsCache;
  }
  
  const [permissions, setPermissions] = useState<UserPermissions | null>(initial);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);

  const fetchPermissions = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Use cached data if available and not expired
      if (permissionsCache && Date.now() - cacheTimestamp < CACHE_DURATION) {
        setPermissions(permissionsCache);
        setLoading(false);
        return;
      }
      
      const response = await fetch('/api/auth/permissions');
      if (!response.ok) {
        if (response.status === 401) {
          // In dev/docker, auth cookies can be momentarily unavailable after navigation.
          // Provide safe defaults to avoid blank UI while user session hydrates.
          const defaultPermissions = {
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
              Permission.SPRINT_VIEW,
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
          };
          setPermissions(defaultPermissions);
          permissionsCache = defaultPermissions;
          cacheTimestamp = Date.now();
          return;
        }
        throw new Error('Failed to fetch permissions');
      }
      
      const data = await response.json();
      setPermissions(data);
      // Cache the data in memory and sessionStorage
      permissionsCache = data;
      cacheTimestamp = Date.now();
      savePermissionsToStorage(data);
    } catch (err) {
      console.error('Error fetching permissions:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      
      // Provide default permissions for basic navigation if API fails
      const defaultPermissions = {
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
          Permission.SPRINT_VIEW,
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
      };
      setPermissions(defaultPermissions);
      permissionsCache = defaultPermissions;
      cacheTimestamp = Date.now();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // If server provided initial permissions, cache them and skip initial fetch
    if (initialPermissions) {
      permissionsCache = initialPermissions;
      cacheTimestamp = Date.now();
      savePermissionsToStorage(initialPermissions);
      setPermissions(initialPermissions);
      setLoading(false);
      return;
    }
    
    // Check if we have cached permissions (from sessionStorage or memory)
    if (permissionsCache && Date.now() - cacheTimestamp < CACHE_DURATION) {
      setPermissions(permissionsCache);
      setLoading(false);
      return;
    }
    
    // Otherwise, fetch on mount
    fetchPermissions();
  }, [initialPermissions]);

  const hasPermission = (permission: Permission, projectId?: string): boolean => {
    // If permissions are still loading, return true to prevent blocking navigation
    // This allows UI to show while permissions are being fetched
    if (!permissions || loading) return true;
    
    // If permissions are empty (user has no permissions), return false
    if (permissions.globalPermissions.length === 0 && Object.keys(permissions.projectPermissions).length === 0) {
      return false;
    }
    
    // Check global permissions first
    if (permissions.globalPermissions.includes(permission)) {
      return true;
    }
    
    // Check project-specific permissions
    if (projectId && permissions.projectPermissions[projectId]) {
      return permissions.projectPermissions[projectId].includes(permission);
    }
    
    
    return false;
  };

  const hasAnyPermission = (permissionsToCheck: Permission[], projectId?: string): boolean => {
    return permissionsToCheck.some(permission => hasPermission(permission, projectId));
  };

  const hasAllPermissions = (permissionsToCheck: Permission[], projectId?: string): boolean => {
    return permissionsToCheck.every(permission => hasPermission(permission, projectId));
  };

  const canAccessProject = (projectId: string): boolean => {
    if (!permissions) return false;
    return permissions.accessibleProjects.includes(projectId);
  };

  const canManageProject = (projectId: string): boolean => {
    return hasPermission(Permission.PROJECT_UPDATE, projectId);
  };

  const refreshPermissions = async () => {
    // Clear cache to force fresh fetch
    permissionsCache = null;
    cacheTimestamp = 0;
    await fetchPermissions();
  };

  const value: PermissionContextType = {
    permissions,
    loading,
    error,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canAccessProject,
    canManageProject,
    refreshPermissions
  };

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissionContext(): PermissionContextType {
  const context = useContext(PermissionContext);
  if (context === undefined) {
    throw new Error('usePermissionContext must be used within a PermissionProvider');
  }
  return context;
}

// Optimized hooks that use the context
export function usePermissions() {
  const context = usePermissionContext();
  
  return {
    hasPermission: context.hasPermission,
    hasAnyPermission: context.hasAnyPermission,
    hasAllPermissions: context.hasAllPermissions,
    canAccessProject: context.canAccessProject,
    canManageProject: context.canManageProject,
    accessibleProjects: context.permissions?.accessibleProjects || [],
    permissions: context.permissions,
    loading: context.loading,
    error: context.error
  };
}

export function useProjectPermissions(projectId: string) {
  const context = usePermissionContext();
  
  return {
    hasPermission: (permission: Permission) => context.hasPermission(permission, projectId),
    hasAnyPermission: (permissions: Permission[]) => context.hasAnyPermission(permissions, projectId),
    hasAllPermissions: (permissions: Permission[]) => context.hasAllPermissions(permissions, projectId),
    canAccess: context.canAccessProject(projectId),
    canManage: context.canManageProject(projectId),
    loading: context.loading,
    error: context.error
  };
}

export function useFeaturePermissions() {
  const { hasPermission, loading, error } = usePermissionContext();

  return {
    // Project permissions
    canCreateProject: hasPermission(Permission.PROJECT_CREATE),
    canViewAllProjects: hasPermission(Permission.PROJECT_VIEW_ALL),
    
    // Task permissions
    canCreateTask: hasPermission(Permission.TASK_CREATE),
    canManageTasks: hasPermission(Permission.TASK_UPDATE) || hasPermission(Permission.TASK_DELETE) || hasPermission(Permission.TASK_ASSIGN),
    
    // Team permissions
    canManageTeam: hasPermission(Permission.TEAM_EDIT) || hasPermission(Permission.TEAM_DELETE) || hasPermission(Permission.TEAM_INVITE) || hasPermission(Permission.TEAM_REMOVE) || hasPermission(Permission.TEAM_MANAGE_PERMISSIONS),
    
    // Time tracking permissions
    canTrackTime: hasPermission(Permission.TIME_TRACKING_CREATE),
    canApproveTime: hasPermission(Permission.TIME_TRACKING_APPROVE),
    canViewAllTime: hasPermission(Permission.TIME_TRACKING_VIEW_ALL),
    
    // Financial permissions
    canManageBudget: hasPermission(Permission.FINANCIAL_MANAGE_BUDGET),
    canCreateExpense: hasPermission(Permission.FINANCIAL_CREATE_EXPENSE),
    canApproveExpense: hasPermission(Permission.FINANCIAL_APPROVE_EXPENSE),
    
    // Settings permissions
    canManageSettings: hasPermission(Permission.SETTINGS_UPDATE) || hasPermission(Permission.SETTINGS_MANAGE_EMAIL) || hasPermission(Permission.SETTINGS_MANAGE_DATABASE) || hasPermission(Permission.SETTINGS_MANAGE_SECURITY),
    
    // Reporting permissions
    canViewReports: hasPermission(Permission.REPORTING_VIEW),
    canCreateReports: hasPermission(Permission.REPORTING_CREATE),
    canExportReports: hasPermission(Permission.REPORTING_EXPORT),
    
    // Epic permissions
    canManageEpics: hasPermission(Permission.EPIC_CREATE) || hasPermission(Permission.EPIC_UPDATE) || hasPermission(Permission.EPIC_DELETE),
    
    // Sprint permissions
    canViewSprints: hasPermission(Permission.SPRINT_VIEW) || hasPermission(Permission.SPRINT_READ),
    canManageSprints: hasPermission(Permission.SPRINT_CREATE) || hasPermission(Permission.SPRINT_UPDATE) || hasPermission(Permission.SPRINT_DELETE) || hasPermission(Permission.SPRINT_MANAGE) || hasPermission(Permission.SPRINT_EDIT),
    canStartSprints: hasPermission(Permission.SPRINT_START),
    canCompleteSprints: hasPermission(Permission.SPRINT_COMPLETE),
    
    // Story permissions
    canManageStories: hasPermission(Permission.STORY_CREATE) || hasPermission(Permission.STORY_UPDATE) || hasPermission(Permission.STORY_DELETE),
    
    // Calendar permissions
    canManageCalendar: hasPermission(Permission.CALENDAR_CREATE) || hasPermission(Permission.CALENDAR_UPDATE) || hasPermission(Permission.CALENDAR_DELETE),
    
    // Kanban permissions
    canManageKanban: hasPermission(Permission.KANBAN_MANAGE),
    
    // backlog permissions
    canManageBacklog: hasPermission(Permission.BACKLOG_MANAGE),
    
    // Test management permissions
    canManageTestSuites: hasPermission(Permission.TEST_SUITE_CREATE) || hasPermission(Permission.TEST_SUITE_UPDATE) || hasPermission(Permission.TEST_SUITE_DELETE),
    canManageTestCases: hasPermission(Permission.TEST_CASE_CREATE) || hasPermission(Permission.TEST_CASE_UPDATE) || hasPermission(Permission.TEST_CASE_DELETE),
    canManageTestPlans: hasPermission(Permission.TEST_PLAN_CREATE) || hasPermission(Permission.TEST_PLAN_UPDATE) || hasPermission(Permission.TEST_PLAN_DELETE) || hasPermission(Permission.TEST_PLAN_MANAGE),
    canExecuteTests: hasPermission(Permission.TEST_EXECUTION_CREATE) || hasPermission(Permission.TEST_EXECUTION_UPDATE),
    canViewTestReports: hasPermission(Permission.TEST_REPORT_VIEW),
    canExportTestReports: hasPermission(Permission.TEST_REPORT_EXPORT),
    
    loading,
    error
  };
}

export function useUserManagementPermissions() {
  const { hasPermission, loading, error } = usePermissionContext();

  return {
    canCreateUser: hasPermission(Permission.USER_CREATE),
    canInviteUser: hasPermission(Permission.USER_INVITE),
    canManageRoles: hasPermission(Permission.USER_MANAGE_ROLES),
    canActivateUser: hasPermission(Permission.USER_ACTIVATE),
    canDeactivateUser: hasPermission(Permission.USER_DEACTIVATE),
    canDeleteUser: hasPermission(Permission.USER_DELETE),
    canManageUsers: hasPermission(Permission.USER_CREATE) || hasPermission(Permission.USER_UPDATE) || hasPermission(Permission.USER_DELETE) || hasPermission(Permission.USER_INVITE),
    loading,
    error
  };
}
