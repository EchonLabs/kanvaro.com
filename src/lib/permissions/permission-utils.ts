import { PermissionService } from './permission-service';
import { Permission } from './permission-definitions';

/**
 * Utility functions for permission checking
 * This file provides convenient wrapper functions for common permission operations
 */

/**
 * Check if a user has a specific permission
 * @param userId - The user ID to check permissions for
 * @param permission - The permission to check
 * @param projectId - Optional project ID for project-scoped permissions
 * @returns Promise<boolean> - True if user has the permission
 */
export async function hasPermission(
  userId: string, 
  permission: Permission, 
  projectId?: string
): Promise<boolean> {
  return PermissionService.hasPermission(userId, permission, projectId);
}

/**
 * Check if a user has any of the specified permissions
 * @param userId - The user ID to check permissions for
 * @param permissions - Array of permissions to check
 * @param projectId - Optional project ID for project-scoped permissions
 * @returns Promise<boolean> - True if user has any of the permissions
 */
export async function hasAnyPermission(
  userId: string, 
  permissions: Permission[], 
  projectId?: string
): Promise<boolean> {
  return PermissionService.hasAnyPermission(userId, permissions, projectId);
}

/**
 * Check if a user has all of the specified permissions
 * @param userId - The user ID to check permissions for
 * @param permissions - Array of permissions to check
 * @param projectId - Optional project ID for project-scoped permissions
 * @returns Promise<boolean> - True if user has all permissions
 */
export async function hasAllPermissions(
  userId: string, 
  permissions: Permission[], 
  projectId?: string
): Promise<boolean> {
  return PermissionService.hasAllPermissions(userId, permissions, projectId);
}

/**
 * Check if a user can access a specific project
 * @param userId - The user ID to check access for
 * @param projectId - The project ID to check access to
 * @returns Promise<boolean> - True if user can access the project
 */
export async function canAccessProject(userId: string, projectId: string): Promise<boolean> {
  return PermissionService.canAccessProject(userId, projectId);
}

/**
 * Check if a user can manage a specific project
 * @param userId - The user ID to check management access for
 * @param projectId - The project ID to check management access to
 * @returns Promise<boolean> - True if user can manage the project
 */
export async function canManageProject(userId: string, projectId: string): Promise<boolean> {
  return PermissionService.canManageProject(userId, projectId);
}

/**
 * Get all projects a user has access to
 * @param userId - The user ID to get accessible projects for
 * @returns Promise<string[]> - Array of project IDs the user can access
 */
export async function getAccessibleProjects(userId: string): Promise<string[]> {
  return PermissionService.getAccessibleProjects(userId);
}

/**
 * Filter a list of project IDs to only include those the user can access
 * @param userId - The user ID to filter for
 * @param projectIds - Array of project IDs to filter
 * @returns Promise<string[]> - Filtered array of accessible project IDs
 */
export async function filterProjectsByAccess(userId: string, projectIds: string[]): Promise<string[]> {
  return PermissionService.filterProjectsByAccess(userId, projectIds);
}

/**
 * Require that a user has a specific permission (throws error if not)
 * @param userId - The user ID to check permissions for
 * @param permission - The permission to require
 * @param projectId - Optional project ID for project-scoped permissions
 * @throws Error if user doesn't have the permission
 */
export async function requirePermission(
  userId: string, 
  permission: Permission, 
  projectId?: string
): Promise<void> {
  return PermissionService.requirePermission(userId, permission, projectId);
}

/**
 * Require that a user has any of the specified permissions (throws error if not)
 * @param userId - The user ID to check permissions for
 * @param permissions - Array of permissions to check
 * @param projectId - Optional project ID for project-scoped permissions
 * @throws Error if user doesn't have any of the permissions
 */
export async function requireAnyPermission(
  userId: string, 
  permissions: Permission[], 
  projectId?: string
): Promise<void> {
  return PermissionService.requireAnyPermission(userId, permissions, projectId);
}

/**
 * Require that a user has all of the specified permissions (throws error if not)
 * @param userId - The user ID to check permissions for
 * @param permissions - Array of permissions to check
 * @param projectId - Optional project ID for project-scoped permissions
 * @throws Error if user doesn't have all permissions
 */
export async function requireAllPermissions(
  userId: string, 
  permissions: Permission[], 
  projectId?: string
): Promise<void> {
  return PermissionService.requireAllPermissions(userId, permissions, projectId);
}

/**
 * Require that a user can access a specific project (throws error if not)
 * @param userId - The user ID to check access for
 * @param projectId - The project ID to require access to
 * @throws Error if user can't access the project
 */
export async function requireProjectAccess(userId: string, projectId: string): Promise<void> {
  return PermissionService.requireProjectAccess(userId, projectId);
}

/**
 * Require that a user can manage a specific project (throws error if not)
 * @param userId - The user ID to check management access for
 * @param projectId - The project ID to require management access to
 * @throws Error if user can't manage the project
 */
export async function requireProjectManagement(userId: string, projectId: string): Promise<void> {
  return PermissionService.requireProjectManagement(userId, projectId);
}
