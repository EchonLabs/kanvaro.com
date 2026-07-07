'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { CreateRoleModal } from '@/components/roles/CreateRoleModal'
import { EditRoleModal } from '@/components/roles/EditRoleModal'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { useNotify } from '@/lib/notify'
import { useAuthContext } from '@/contexts/AuthContext'
import { PageContent } from '@/components/ui/PageContent'
import {
  Shield,
  Plus,
  Edit,
  Trash2,
  Users,
  Lock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Role {
  _id: string
  name: string
  description: string
  permissions: string[]
  isSystem: boolean
  userCount: number
  createdAt: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupPermissions(permissions: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {}
  for (const perm of permissions) {
    const [category] = perm.split(':')
    if (!groups[category]) groups[category] = []
    groups[category].push(perm)
  }
  return groups
}

function formatCategory(cat: string): string {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatAction(perm: string): string {
  const action = perm.split(':')[1] ?? perm
  return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ─── Role Card ────────────────────────────────────────────────────────────────

function RoleCard({
  role,
  onEdit,
  onDelete,
}: {
  role: Role
  onEdit: (r: Role) => void
  onDelete: (r: Role) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const grouped = groupPermissions(role.permissions)
  const permCount = role.permissions.length

  return (
    <div className={cn(
      'rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card overflow-hidden',
      'shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-none',
    )}>
      {/* Header */}
      <div className="px-5 py-4 flex items-start gap-4">
        {/* Icon */}
        <Shield className="h-5 w-5 flex-shrink-0 mt-0.5 text-[var(--apple-secondary-label)]" strokeWidth={1.5} />

        {/* Name + description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[15px] font-semibold text-[var(--apple-label)]">{role.name}</h3>
            <span className={cn(
              'text-[11px] font-medium px-1.5 py-0.5 rounded bg-[var(--apple-tertiary-fill)] text-[var(--apple-secondary-label)]',
            )}>
              {role.isSystem ? 'System' : 'Custom'}
            </span>
          </div>
          {role.description && (
            <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5 leading-snug">
              {role.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-[12px] text-[var(--apple-tertiary-label)]">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" strokeWidth={1.5} />
              {role.userCount} member{role.userCount !== 1 ? 's' : ''}
            </span>
            <span>·</span>
            <span>{permCount} permission{permCount !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {role.isSystem ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="h-8 w-8 flex items-center justify-center text-[var(--apple-quaternary-label)]">
                    <Lock className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </div>
                </TooltipTrigger>
                <TooltipContent><p>System roles cannot be modified</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={() => onEdit(role)}
                      className="h-8 w-8 p-0 text-[var(--apple-tertiary-label)] hover:text-[var(--apple-label)] hover:bg-[var(--apple-tertiary-fill)] apple-transition">
                      <Edit className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Edit</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={() => onDelete(role)}
                      className="h-8 w-8 p-0 text-[var(--apple-tertiary-label)] hover:text-destructive hover:bg-[var(--apple-tertiary-fill)] apple-transition">
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Delete</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}
        </div>
      </div>

      {/* Permissions — only shown when expanded */}
      {expanded && permCount > 0 && (
        <div className="px-5 pb-4 space-y-3">
          <div className="h-px bg-[var(--apple-separator)]" />
          {Object.entries(grouped).map(([cat, perms]) => (
            <div key={cat}>
              <p className="apple-section-label mb-1.5">{formatCategory(cat)}</p>
              <div className="flex flex-wrap gap-1.5">
                {perms.map((p) => (
                  <span key={p} className="inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-medium bg-[var(--apple-tertiary-fill)] text-[var(--apple-secondary-label)] border border-[var(--apple-separator)]">
                    {formatAction(p)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Expand toggle */}
      {permCount > 0 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            'w-full flex items-center justify-center gap-1.5 py-2.5',
            'text-[12px] text-[var(--apple-tertiary-label)] hover:text-[var(--apple-secondary-label)]',
            'border-t border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)] hover:bg-[var(--apple-secondary-fill)]',
            'apple-transition',
          )}
        >
          {expanded ? <ChevronUp className="h-3 w-3" strokeWidth={1.5} /> : <ChevronDown className="h-3 w-3" strokeWidth={1.5} />}
          {expanded ? 'Hide permissions' : `View ${permCount} permission${permCount !== 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function RoleCardSkeleton() {
  return (
    <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card px-5 py-4 flex items-start gap-4">
      <div className="h-9 w-9 rounded-[var(--apple-radius-md)] bg-[var(--apple-tertiary-fill)] animate-pulse flex-shrink-0" />
      <div className="flex-1 space-y-2 pt-0.5">
        <div className="flex items-center gap-2">
          <div className="h-4 w-28 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
          <div className="h-4 w-12 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
        </div>
        <div className="h-3 w-48 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
        <div className="h-3 w-32 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RolesPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuthContext()
  const router = useRouter()
  const { success: notifySuccess, error: notifyError } = useNotify()
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const hasInitializedRef = useRef(false)

  useEffect(() => {
    if (hasInitializedRef.current) return
    if (!authLoading && isAuthenticated) {
      setLoading(false)
      hasInitializedRef.current = true
      fetchRoles()
    } else if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated])

  const fetchRoles = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/roles')
      const data = await response.json()
      if (data.success) setRoles(data.data)
      else notifyError({ title: data.error || 'Failed to fetch roles' })
    } catch {
      notifyError({ title: 'Failed to fetch roles' })
    } finally {
      setLoading(false)
    }
  }

  const handleRoleCreated = (newRole: Role) => {
    setRoles(prev => [...prev, newRole])
    setShowCreateModal(false)
    notifySuccess({ title: 'Role created successfully' })
  }

  const handleRoleUpdated = (updatedRole: Role) => {
    setRoles(prev => prev.map(r => r._id === updatedRole._id ? updatedRole : r))
    setShowEditModal(false)
    setSelectedRole(null)
    notifySuccess({ title: 'Role updated successfully' })
  }

  const handleDeleteClick = (role: Role) => {
    if (role.isSystem) { notifyError({ title: 'Cannot delete system roles' }); return }
    if (role.userCount > 0) { notifyError({ title: 'Cannot delete a role assigned to users' }); return }
    setRoleToDelete(role)
    setShowDeleteConfirm(true)
  }

  const handleDeleteRole = async () => {
    if (!roleToDelete) return
    try {
      setIsDeleting(true)
      const response = await fetch(`/api/roles/${roleToDelete._id}`, { method: 'DELETE' })
      const data = await response.json()
      if (data.success) {
        setRoles(prev => prev.filter(r => r._id !== roleToDelete._id))
        notifySuccess({ title: 'Role deleted successfully' })
        setShowDeleteConfirm(false)
        setRoleToDelete(null)
      } else {
        notifyError({ title: data.error || 'Failed to delete role' })
      }
    } catch {
      notifyError({ title: 'Failed to delete role' })
    } finally {
      setIsDeleting(false)
    }
  }

  // ─── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <MainLayout>
        <PageContent>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-8 w-48 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
                <div className="h-4 w-32 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
              </div>
              <div className="h-9 w-28 bg-[var(--apple-tertiary-fill)] rounded-[var(--apple-radius-md)] animate-pulse" />
            </div>
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => <RoleCardSkeleton key={i} />)}
            </div>
          </div>
        </PageContent>
      </MainLayout>
    )
  }

  const systemRoles = roles.filter(r => r.isSystem)
  const customRoles = roles.filter(r => !r.isSystem)

  return (
    <MainLayout>
      <PageContent>
        <div className="space-y-8">

          {/* ─── Page Header ───────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 flex-shrink-0 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
              <div>
                <h1 className="text-[28px] font-bold tracking-tight leading-tight text-[var(--apple-label)]">
                  Roles &amp; Permissions
                </h1>
                <p className="text-[15px] text-[var(--apple-secondary-label)] mt-0.5">
                  {roles.length} role{roles.length !== 1 ? 's' : ''} · {customRoles.length} custom
                </p>
              </div>
            </div>
            <Button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 text-sm font-medium apple-transition w-full sm:w-auto"
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Create Role
            </Button>
          </div>

          {/* ─── Empty ─────────────────────────────────────────────────────── */}
          {roles.length === 0 && (
            <div className={cn(
              'rounded-[var(--apple-radius-lg)] border border-dashed border-[var(--apple-separator)]',
              'flex flex-col items-center justify-center py-20 gap-4 text-center',
            )}>
              <Shield className="h-6 w-6 text-[var(--apple-tertiary-label)]" strokeWidth={1.5} />
              <div className="space-y-1">
                <p className="text-[15px] font-semibold text-[var(--apple-label)]">No roles yet</p>
                <p className="text-[13px] text-[var(--apple-secondary-label)] max-w-[240px]">
                  Create a custom role to control what team members can access.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowCreateModal(true)} className="apple-transition">
                <Plus className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.5} />
                Create Role
              </Button>
            </div>
          )}

          {/* ─── System Roles ──────────────────────────────────────────────── */}
          {systemRoles.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="apple-section-label">System Roles</span>
                <div className="flex-1 h-px bg-[var(--apple-separator)]" />
              </div>
              <div className="space-y-2">
                {systemRoles.map((role) => (
                  <RoleCard key={role._id} role={role} onEdit={(r) => { setSelectedRole(r); setShowEditModal(true) }} onDelete={handleDeleteClick} />
                ))}
              </div>
            </section>
          )}

          {/* ─── Custom Roles ──────────────────────────────────────────────── */}
          {customRoles.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="apple-section-label">Custom Roles</span>
                <div className="flex-1 h-px bg-[var(--apple-separator)]" />
              </div>
              <div className="space-y-2">
                {customRoles.map((role) => (
                  <RoleCard key={role._id} role={role} onEdit={(r) => { setSelectedRole(r); setShowEditModal(true) }} onDelete={handleDeleteClick} />
                ))}
              </div>
            </section>
          )}

          {/* ─── No custom roles nudge ─────────────────────────────────────── */}
          {roles.length > 0 && customRoles.length === 0 && (
            <button
              onClick={() => setShowCreateModal(true)}
              className={cn(
                'w-full rounded-[var(--apple-radius-lg)] border border-dashed border-[var(--apple-separator)]',
                'flex items-center justify-center gap-2 py-6',
                'text-[13px] text-[var(--apple-tertiary-label)] hover:text-[var(--apple-secondary-label)]',
                'hover:bg-[var(--apple-tertiary-fill)] apple-transition',
              )}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
              Create a custom role
            </button>
          )}

        </div>
      </PageContent>

      {/* ─── Modals ──────────────────────────────────────────────────────────── */}
      <CreateRoleModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} onRoleCreated={handleRoleCreated} />
      <EditRoleModal
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setSelectedRole(null) }}
        onRoleUpdated={handleRoleUpdated}
        role={selectedRole}
      />
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setRoleToDelete(null) }}
        onConfirm={handleDeleteRole}
        title="Delete Role"
        description={`Are you sure you want to delete "${roleToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
        isLoading={isDeleting}
      />
    </MainLayout>
  )
}
