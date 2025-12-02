'use client';

import React from 'react';
import { Permission } from './permission-definitions';
import { usePermissions, useProjectPermissions, useFeaturePermissions } from './permission-context';

interface PermissionGateProps {
  permission: Permission;
  projectId?: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

// Component to conditionally render content based on permissions
export function PermissionGate({ 
  permission, 
  projectId, 
  fallback = null, 
  children 
}: PermissionGateProps) {
  const { hasPermission, loading, permissions } = usePermissions();
  
  // Show children while loading to prevent content flicker
  // Also show if permissions haven't been loaded yet (optimistic rendering)
  if (loading || !permissions) {
    return <>{children}</>;
  }
  
  // Once loaded, check permissions and hide if not granted
  if (hasPermission(permission, projectId)) {
    return <>{children}</>;
  }
  
  return <>{fallback}</>;
}

interface PermissionsGateProps {
  permissions: Permission[];
  projectId?: string;
  requireAll?: boolean;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

// Component to conditionally render content based on multiple permissions
export function PermissionsGate({ 
  permissions, 
  projectId, 
  requireAll = false, 
  fallback = null, 
  children 
}: PermissionsGateProps) {
  const { hasAnyPermission, hasAllPermissions, loading } = usePermissions();
  
  // Show children immediately if permissions are still loading to prevent blocking
  if (loading) {
    return <>{children}</>;
  }
  
  const hasRequiredPermissions = requireAll 
    ? hasAllPermissions(permissions, projectId)
    : hasAnyPermission(permissions, projectId);
  
  if (hasRequiredPermissions) {
    return <>{children}</>;
  }
  
  return <>{fallback}</>;
}

interface ProjectAccessGateProps {
  projectId: string;
  requireManagement?: boolean;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

// Component to conditionally render content based on project access
export function ProjectAccessGate({ 
  projectId, 
  requireManagement = false, 
  fallback = null, 
  children 
}: ProjectAccessGateProps) {
  const { canAccess, canManage } = useProjectPermissions(projectId);
  
  const hasAccess = requireManagement ? canManage : canAccess;
  
  if (hasAccess) {
    return <>{children}</>;
  }
  
  return <>{fallback}</>;
}

interface FeatureGateProps {
  feature: keyof ReturnType<typeof useFeaturePermissions>;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

// Component to conditionally render content based on feature permissions
export function FeatureGate({ 
  feature, 
  fallback = null, 
  children 
}: FeatureGateProps) {
  const permissions = useFeaturePermissions();
  
  if (permissions[feature]) {
    return <>{children}</>;
  }
  
  return <>{fallback}</>;
}

// Higher-order component for permission-based rendering
export function withPermissionComponent<P extends object>(
  Component: React.ComponentType<P>,
  permission: Permission,
  projectId?: string
) {
  return function PermissionWrappedComponent(props: P) {
    return (
      <PermissionGate permission={permission} projectId={projectId}>
        <Component {...props} />
      </PermissionGate>
    );
  };
}

// Higher-order component for multiple permissions
export function withPermissionsComponent<P extends object>(
  Component: React.ComponentType<P>,
  permissions: Permission[],
  projectId?: string,
  requireAll: boolean = false
) {
  return function PermissionsWrappedComponent(props: P) {
    return (
      <PermissionsGate 
        permissions={permissions} 
        projectId={projectId} 
        requireAll={requireAll}
      >
        <Component {...props} />
      </PermissionsGate>
    );
  };
}

// Higher-order component for project access
export function withProjectAccessComponent<P extends object>(
  Component: React.ComponentType<P>,
  projectId: string,
  requireManagement: boolean = false
) {
  return function ProjectAccessWrappedComponent(props: P) {
    return (
      <ProjectAccessGate 
        projectId={projectId} 
        requireManagement={requireManagement}
      >
        <Component {...props} />
      </ProjectAccessGate>
    );
  };
}

// Utility component for showing permission-based buttons
interface PermissionButtonProps {
  permission: Permission;
  projectId?: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
}

export function PermissionButton({ 
  permission, 
  projectId, 
  onClick, 
  children, 
  className = '',
  disabled = false,
  variant = 'default'
}: PermissionButtonProps) {
  const { hasPermission } = usePermissions();
  
  if (!hasPermission(permission, projectId)) {
    return null;
  }
  
  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={className}
      data-variant={variant}
    >
      {children}
    </button>
  );
}

// Utility component for showing permission-based links
interface PermissionLinkProps {
  permission: Permission;
  projectId?: string;
  href: string;
  children: React.ReactNode;
  className?: string;
}

export function PermissionLink({ 
  permission, 
  projectId, 
  href, 
  children, 
  className = ''
}: PermissionLinkProps) {
  const { hasPermission } = usePermissions();
  
  if (!hasPermission(permission, projectId)) {
    return null;
  }
  
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

// Utility component for showing permission-based navigation items
interface PermissionNavItemProps {
  permission: Permission;
  projectId?: string;
  href: string;
  children: React.ReactNode;
  className?: string;
  active?: boolean;
}

export function PermissionNavItem({ 
  permission, 
  projectId, 
  href, 
  children, 
  className = '',
  active = false
}: PermissionNavItemProps) {
  const { hasPermission } = usePermissions();
  
  if (!hasPermission(permission, projectId)) {
    return null;
  }
  
  return (
    <a 
      href={href} 
      className={`${className} ${active ? 'active' : ''}`}
    >
      {children}
    </a>
  );
}
