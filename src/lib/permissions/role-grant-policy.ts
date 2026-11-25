import { Permission, Role } from './permission-definitions'
import type { UserPermissions } from './permission-service'

/**
 * Who may hand out which roles (decision record F11).
 *
 * Before this, any signed-in user could create a custom role with every
 * permission and assign it to themselves. Project managers and HR also hold
 * user:manage_roles, so "require user:manage_roles" alone would not stop them
 * promoting themselves. The rules:
 *
 * 1. Managing roles needs user:manage_roles.
 * 2. Only admins (admin / super_admin) can grant the Admin role, act on an
 *    admin's role, or create, edit, delete or assign a custom role carrying
 *    permissions they do not hold themselves.
 * 3. Everyone else may only work with custom roles within their own
 *    permissions.
 * 4. Nobody changes their own role.
 *
 * System roles are not a strict hierarchy (admin lacks a couple of PM and HR
 * permissions), so rule 3 applies to custom roles only; rule 2 covers the
 * Admin system role.
 */

const ADMIN_ROLES: string[] = [Role.SUPER_ADMIN, Role.ADMIN]

export function isAdminRole(role: string | undefined | null): boolean {
  return !!role && ADMIN_ROLES.includes(role)
}

export type GrantDecision = { ok: true } | { ok: false; error: string }

const ALLOW: GrantDecision = { ok: true }
const deny = (error: string): GrantDecision => ({ ok: false, error })

export function canManageRoles(actor: UserPermissions): GrantDecision {
  return actor.globalPermissions.includes(Permission.USER_MANAGE_ROLES)
    ? ALLOW
    : deny('Insufficient permissions')
}

/** Permissions in `permissions` the actor does not hold (always [] for admins). */
export function permissionsBeyondActor(actor: UserPermissions, permissions: string[]): string[] {
  if (isAdminRole(actor.userRole)) return []
  const held = new Set<string>(actor.globalPermissions)
  return permissions.filter((p) => !held.has(p))
}

/** Creating, editing, deleting or assigning a custom role with these permissions. */
export function canWorkWithCustomRole(actor: UserPermissions, permissions: string[]): GrantDecision {
  const beyond = permissionsBeyondActor(actor, permissions)
  return beyond.length === 0
    ? ALLOW
    : deny(`You cannot grant permissions you do not have: ${beyond.join(', ')}`)
}

/** Granting a system role, for example in an invitation. */
export function canGrantSystemRole(actor: UserPermissions, role: string): GrantDecision {
  return isAdminRole(role) && !isAdminRole(actor.userRole)
    ? deny('Only administrators can grant the administrator role')
    : ALLOW
}

/** Changing the role of `target`. */
export function canChangeRoleOf(
  actor: UserPermissions,
  actorId: string,
  target: { id: string; role?: string | null }
): GrantDecision {
  if (actorId === target.id) return deny('You cannot change your own role')
  if (isAdminRole(target.role) && !isAdminRole(actor.userRole)) {
    return deny("Only administrators can change an administrator's role")
  }
  return ALLOW
}
