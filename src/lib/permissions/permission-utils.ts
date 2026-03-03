import { PermissionService } from './permission-service';
import { Permission } from './permission-definitions';

/**
 * Utility functions for permission checking
 * This file provides convenient wrapper functions for common permission operations.
 *
 * Every function accepts an optional `orgId` (last argument) that is forwarded
 * to PermissionService so it can open an explicit per-org connection instead of
 * relying on the ambient (and race-prone) module-level fallback.
 */

export async function hasPermission(
  userId: string, 
  permission: Permission, 
  projectId?: string,
  orgId?: string
): Promise<boolean> {
  return PermissionService.hasPermission(userId, permission, projectId, orgId);
}

export async function hasAnyPermission(
  userId: string, 
  permissions: Permission[], 
  projectId?: string,
  orgId?: string
): Promise<boolean> {
  return PermissionService.hasAnyPermission(userId, permissions, projectId, orgId);
}

export async function hasAllPermissions(
  userId: string, 
  permissions: Permission[], 
  projectId?: string,
  orgId?: string
): Promise<boolean> {
  return PermissionService.hasAllPermissions(userId, permissions, projectId, orgId);
}

export async function canAccessProject(userId: string, projectId: string, orgId?: string): Promise<boolean> {
  return PermissionService.canAccessProject(userId, projectId, orgId);
}

export async function canManageProject(userId: string, projectId: string, orgId?: string): Promise<boolean> {
  return PermissionService.canManageProject(userId, projectId, orgId);
}

export async function getAccessibleProjects(userId: string, orgId?: string): Promise<string[]> {
  return PermissionService.getAccessibleProjects(userId, orgId);
}

export async function filterProjectsByAccess(userId: string, projectIds: string[], orgId?: string): Promise<string[]> {
  return PermissionService.filterProjectsByAccess(userId, projectIds, orgId);
}

export async function requirePermission(
  userId: string, 
  permission: Permission, 
  projectId?: string,
  orgId?: string
): Promise<void> {
  return PermissionService.requirePermission(userId, permission, projectId, orgId);
}

export async function requireAnyPermission(
  userId: string, 
  permissions: Permission[], 
  projectId?: string,
  orgId?: string
): Promise<void> {
  return PermissionService.requireAnyPermission(userId, permissions, projectId, orgId);
}

export async function requireAllPermissions(
  userId: string, 
  permissions: Permission[], 
  projectId?: string,
  orgId?: string
): Promise<void> {
  return PermissionService.requireAllPermissions(userId, permissions, projectId, orgId);
}

export async function requireProjectAccess(userId: string, projectId: string, orgId?: string): Promise<void> {
  return PermissionService.requireProjectAccess(userId, projectId, orgId);
}

export async function requireProjectManagement(userId: string, projectId: string, orgId?: string): Promise<void> {
  return PermissionService.requireProjectManagement(userId, projectId, orgId);
}
