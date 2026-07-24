'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { formatToTitleCase } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuthContext } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { PageContent } from '@/components/ui/PageContent'
import {
  Users,
  UserPlus,
  Search,
  Mail,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  LayoutGrid,
  List,
  X,
  UserCheck,
} from 'lucide-react'
import { InviteMemberModal } from '@/components/members/InviteMemberModal'
import { EditMemberModal } from '@/components/members/EditMemberModal'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { useNotify } from '@/lib/notify'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Member {
  _id: string
  firstName: string
  lastName: string
  email: string
  avatar?: string
  role: string
  customRole?: { _id: string; name: string; description?: string }
  isActive: boolean
  createdAt: string
  lastLogin?: string
  projectManager?: { _id: string; firstName: string; lastName: string; email: string; role: string }
  humanResourcePartner?: { _id: string; firstName: string; lastName: string; email: string; role: string }
  memberId?: string
}

interface PendingInvitation {
  _id: string
  email: string
  role: string
  customRole?: { _id: string; name: string }
  invitedBy: { firstName: string; lastName: string; email: string }
  createdAt: string
  expiresAt: string
}

// ─── Design Tokens ────────────────────────────────────────────────────────────

const MEMBER_PALETTE = [
  { gradient: 'linear-gradient(135deg,#007AFF 0%,#5AC8FA 100%)', glow: 'rgba(0,122,255,0.30)' },
  { gradient: 'linear-gradient(135deg,#BF5AF2 0%,#FF375F 100%)', glow: 'rgba(191,90,242,0.30)' },
  { gradient: 'linear-gradient(135deg,#34C759 0%,#30D158 100%)', glow: 'rgba(52,199,89,0.30)' },
  { gradient: 'linear-gradient(135deg,#FF9500 0%,#FFD60A 100%)', glow: 'rgba(255,149,0,0.30)' },
  { gradient: 'linear-gradient(135deg,#30B0C7 0%,#64D2FF 100%)', glow: 'rgba(48,176,199,0.30)' },
  { gradient: 'linear-gradient(135deg,#FF453A 0%,#FF9F0A 100%)', glow: 'rgba(255,69,58,0.30)' },
]

const ROLE_CONFIG: Record<string, { bg: string; text: string; border: string }> = {
  admin:           { bg: 'bg-red-50 dark:bg-red-950/30',      text: 'text-red-600 dark:text-red-400',      border: 'border-red-200 dark:border-red-800' },
  project_manager: { bg: 'bg-blue-50 dark:bg-blue-950/30',    text: 'text-blue-600 dark:text-blue-400',    border: 'border-blue-200 dark:border-blue-800' },
  team_member:     { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800' },
  client:          { bg: 'bg-purple-50 dark:bg-purple-950/30', text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-800' },
  viewer:          { bg: 'bg-gray-50 dark:bg-gray-900/40',    text: 'text-gray-500 dark:text-gray-400',    border: 'border-gray-200 dark:border-gray-700' },
  human_resource:  { bg: 'bg-teal-50 dark:bg-teal-950/30',    text: 'text-teal-600 dark:text-teal-400',    border: 'border-teal-200 dark:border-teal-800' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMemberPalette(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash & hash
  }
  return MEMBER_PALETTE[Math.abs(hash) % MEMBER_PALETTE.length]
}

function getRoleConfig(role: string, customRoleId?: string): { bg: string; text: string; border: string } {
  if (customRoleId) {
    let hash = 0
    for (let i = 0; i < customRoleId.length; i++) {
      hash = customRoleId.charCodeAt(i) + ((hash << 5) - hash)
      hash = hash & hash
    }
    const customs = [
      { bg: 'bg-indigo-50 dark:bg-indigo-950/30', text: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-200 dark:border-indigo-800' },
      { bg: 'bg-cyan-50 dark:bg-cyan-950/30',     text: 'text-cyan-600 dark:text-cyan-400',     border: 'border-cyan-200 dark:border-cyan-800' },
      { bg: 'bg-amber-50 dark:bg-amber-950/30',   text: 'text-amber-600 dark:text-amber-400',   border: 'border-amber-200 dark:border-amber-800' },
      { bg: 'bg-pink-50 dark:bg-pink-950/30',     text: 'text-pink-600 dark:text-pink-400',     border: 'border-pink-200 dark:border-pink-800' },
      { bg: 'bg-violet-50 dark:bg-violet-950/30', text: 'text-violet-600 dark:text-violet-400', border: 'border-violet-200 dark:border-violet-800' },
      { bg: 'bg-orange-50 dark:bg-orange-950/30', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-800' },
    ]
    return customs[Math.abs(hash) % customs.length]
  }
  return ROLE_CONFIG[role] ?? { bg: 'bg-gray-50 dark:bg-gray-900/40', text: 'text-gray-500 dark:text-gray-400', border: 'border-gray-200 dark:border-gray-700' }
}

// ─── Atoms ────────────────────────────────────────────────────────────────────

function RoleBadge({ role, customRole }: { role: string; customRole?: { _id: string; name: string } }) {
  const cfg = getRoleConfig(role, customRole?._id)
  const label = customRole?.name ?? formatToTitleCase(role)
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap',
      cfg.bg, cfg.text, cfg.border,
    )}>
      {label}
    </span>
  )
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 text-xs font-medium',
      active ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500',
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', active ? 'bg-emerald-500' : 'bg-gray-300')}
        style={active ? { animation: 'status-pulse 2s ease-in-out infinite' } : undefined}
      />
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

// ─── List layout ──────────────────────────────────────────────────────────────

const MEMBER_LIST_COLS = 'grid-cols-[auto_1fr_auto_auto_auto]'

function MemberListHeader() {
  return (
    <div className={cn(
      'grid gap-x-4 items-center px-5 py-2.5',
      'border-b border-[var(--apple-separator)]',
      'bg-[var(--apple-tertiary-fill)]',
      MEMBER_LIST_COLS,
    )}>
      <div />
      <span className="apple-section-label">Member</span>
      <span className="apple-section-label">Role</span>
      <span className="apple-section-label">Status</span>
      <div />
    </div>
  )
}

function MemberListRow({
  member,
  index,
  canEdit,
  canDelete,
  onEdit,
  onRemove,
  formatDate,
}: {
  member: Member
  index: number
  canEdit: boolean
  canDelete: boolean
  onEdit: (m: Member) => void
  onRemove: (m: Member) => void
  formatDate: (d: string) => string
}) {
  const palette = getMemberPalette(member._id)
  return (
    <div className={cn(
      'group grid gap-x-4 items-center px-5 py-3.5',
      'border-b border-[var(--apple-separator)] last:border-0',
      'apple-transition',
      'hover:bg-[var(--apple-quaternary-fill)]',
      MEMBER_LIST_COLS,
    )}>
      {/* Avatar */}
      <div className="relative">
        <div
          className="rounded-full p-[2px] flex-shrink-0"
          style={{ background: palette.gradient, boxShadow: `0 0 0 0px ${palette.glow}` }}
        >
          <GravatarAvatar
            user={{ firstName: member.firstName, lastName: member.lastName, email: member.email, avatar: member.avatar }}
            className="h-9 w-9 ring-[2px] ring-white dark:ring-[var(--apple-secondary-system-background)]"
          />
        </div>
        <span className={cn(
          'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card',
          member.isActive ? 'bg-emerald-500' : 'bg-gray-300',
        )} />
      </div>

      {/* Name + email */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[15px] font-semibold text-[var(--apple-label)] truncate" title={`${member.firstName} ${member.lastName}`}>
            {member.firstName} {member.lastName}
          </span>
          {member.memberId && (
            <span className="text-[11px] font-apple-mono text-[var(--apple-tertiary-label)]">
              #{member.memberId}
            </span>
          )}
        </div>
        <p className="text-[13px] text-[var(--apple-secondary-label)] truncate">{member.email}</p>
        <p className="text-[12px] text-[var(--apple-tertiary-label)]">Joined {formatDate(member.createdAt)}</p>
      </div>

      {/* Role */}
      <div className="flex-shrink-0">
        <RoleBadge role={member.role} customRole={member.customRole} />
      </div>

      {/* Status */}
      <div className="flex-shrink-0">
        <StatusDot active={member.isActive} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 apple-transition">
        {canEdit && (
          <Button variant="ghost" size="sm" onClick={() => onEdit(member)}
            className="h-7 px-2.5 text-xs text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)] hover:bg-[var(--apple-tertiary-fill)]">
            Edit
          </Button>
        )}
        {canDelete && member.isActive && (
          <Button variant="ghost" size="sm" onClick={() => onRemove(member)}
            className="h-7 px-2.5 text-xs text-destructive hover:text-destructive hover:bg-red-50 dark:hover:bg-red-950/30">
            Remove
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Grid Card ────────────────────────────────────────────────────────────────

function MemberGridCard({
  member,
  index,
  canEdit,
  canDelete,
  onEdit,
  onRemove,
  formatDate,
}: {
  member: Member
  index: number
  canEdit: boolean
  canDelete: boolean
  onEdit: (m: Member) => void
  onRemove: (m: Member) => void
  formatDate: (d: string) => string
}) {
  const palette = getMemberPalette(member._id)
  return (
    <div className={cn(
      'card-fade-in group rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card',
      'shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden flex flex-col',
      'apple-transition',
      'hover:shadow-[0_8px_28px_rgba(0,0,0,0.11)] dark:hover:shadow-[0_8px_28px_rgba(0,0,0,0.40)]',
      'hover:-translate-y-0.5',
    )}>
      {/* Gradient accent bar */}
      <div className="h-[3px] w-full flex-shrink-0" style={{ background: 'var(--apple-card-gradient)' }} />

      <div className="p-5 flex flex-col items-center text-center gap-3 flex-1">
        {/* Avatar with status ring */}
        <div className="relative mt-1">
          <div
            className="rounded-full p-[3px]"
            style={{ background: palette.gradient, boxShadow: `0 0 12px ${palette.glow}` }}
          >
            <GravatarAvatar
              user={{ firstName: member.firstName, lastName: member.lastName, email: member.email, avatar: member.avatar }}
              className="h-16 w-16 ring-[3px] ring-card"
            />
          </div>
          <span className={cn(
            'absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card',
            member.isActive ? 'bg-emerald-500' : 'bg-gray-300',
          )} />
        </div>

        {/* Name + ID + email */}
        <div className="w-full space-y-0.5">
          <h3 className="text-[15px] font-semibold text-[var(--apple-label)] truncate leading-snug"
            title={`${member.firstName} ${member.lastName}`}>
            {member.firstName} {member.lastName}
          </h3>
          {member.memberId && (
            <p className="text-[11px] font-apple-mono text-[var(--apple-tertiary-label)]">#{member.memberId}</p>
          )}
          <p className="text-[13px] text-[var(--apple-secondary-label)] truncate">{member.email}</p>
        </div>

        {/* Role + status */}
        <div className="flex flex-col items-center gap-1.5 w-full">
          <RoleBadge role={member.role} customRole={member.customRole} />
          <StatusDot active={member.isActive} />
        </div>

        {/* Joined date */}
        <p className="text-[12px] text-[var(--apple-tertiary-label)]">
          Joined {formatDate(member.createdAt)}
        </p>

        {/* Actions */}
        {(canEdit || (canDelete && member.isActive)) && (
          <div className="flex items-center gap-2 w-full pt-3 mt-auto border-t border-[var(--apple-separator)]">
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => onEdit(member)}
                className="flex-1 text-xs h-8 apple-transition hover:bg-[var(--apple-tertiary-fill)]">
                Edit
              </Button>
            )}
            {canDelete && member.isActive && (
              <Button variant="outline" size="sm" onClick={() => onRemove(member)}
                className="flex-1 text-xs h-8 text-destructive hover:text-destructive hover:bg-red-50 dark:hover:bg-red-950/30 border-destructive/20 apple-transition">
                Remove
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Invitation Grid Card ─────────────────────────────────────────────────────

function InviteGridCard({
  invitation,
  canCancel,
  onCancel,
  formatDate,
}: {
  invitation: PendingInvitation
  canCancel: boolean
  onCancel: (inv: PendingInvitation) => void
  formatDate: (d: string) => string
}) {
  return (
    <div className={cn(
      'card-fade-in rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card overflow-hidden flex flex-col',
      'shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none apple-transition',
      'hover:shadow-[0_8px_28px_rgba(0,0,0,0.09)] dark:hover:shadow-[0_8px_28px_rgba(0,0,0,0.35)]',
    )}>
      <div className="h-[3px] w-full flex-shrink-0" style={{ background: 'var(--apple-card-gradient)' }} />
      <div className="p-5 flex flex-col items-center text-center gap-3 flex-1">
        <Mail className="h-7 w-7 text-[var(--apple-chart-to)] mt-1" strokeWidth={1.5} />
        <div className="w-full space-y-0.5">
          <h3 className="text-[14px] font-semibold text-[var(--apple-label)] truncate" title={invitation.email}>
            {invitation.email}
          </h3>
          <p className="text-[12px] text-[var(--apple-secondary-label)] truncate">
            Invited by {invitation.invitedBy.firstName} {invitation.invitedBy.lastName}
          </p>
        </div>
        <RoleBadge role={invitation.role} customRole={invitation.customRole} />
        <div className="flex items-center gap-1.5 text-[12px] text-[var(--apple-secondary-label)]">
          <Clock className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.5} />
          <span>Expires {formatDate(invitation.expiresAt)}</span>
        </div>
        {canCancel && (
          <div className="w-full pt-3 mt-auto border-t border-[var(--apple-separator)]">
            <Button variant="outline" size="sm" onClick={() => onCancel(invitation)}
              className="w-full text-xs h-8 text-destructive hover:text-destructive hover:bg-red-50 dark:hover:bg-red-950/30 border-destructive/20 apple-transition">
              <XCircle className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.5} />
              Cancel Invitation
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Invitation List Row ──────────────────────────────────────────────────────

const INVITE_LIST_COLS = 'grid-cols-[auto_1fr_auto_auto_auto]'

function InviteListHeader() {
  return (
    <div className={cn(
      'grid gap-x-4 items-center px-5 py-2.5',
      'border-b border-[var(--apple-separator)]',
      'bg-[var(--apple-tertiary-fill)]',
      INVITE_LIST_COLS,
    )}>
      <div />
      <span className="apple-section-label">Email</span>
      <span className="apple-section-label">Role</span>
      <span className="apple-section-label">Expires</span>
      <div />
    </div>
  )
}

function InviteListRow({
  invitation,
  canCancel,
  onCancel,
  formatDate,
}: {
  invitation: PendingInvitation
  canCancel: boolean
  onCancel: (inv: PendingInvitation) => void
  formatDate: (d: string) => string
}) {
  return (
    <div className={cn(
      'group grid gap-x-4 items-center px-5 py-3.5',
      'border-b border-[var(--apple-separator)] last:border-0',
      'apple-transition hover:bg-[var(--apple-quaternary-fill)]',
      INVITE_LIST_COLS,
    )}>
      <Mail className="h-5 w-5 flex-shrink-0 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-[var(--apple-label)] truncate">{invitation.email}</p>
        <p className="text-[12px] text-[var(--apple-tertiary-label)]">
          By {invitation.invitedBy.firstName} {invitation.invitedBy.lastName}
        </p>
      </div>
      <div className="flex-shrink-0">
        <RoleBadge role={invitation.role} customRole={invitation.customRole} />
      </div>
      <div className="flex items-center gap-1.5 text-[13px] text-[var(--apple-secondary-label)] flex-shrink-0 whitespace-nowrap">
        <Clock className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.5} />
        {formatDate(invitation.expiresAt)}
      </div>
      <div className="flex items-center opacity-0 group-hover:opacity-100 apple-transition">
        {canCancel && (
          <Button variant="ghost" size="sm" onClick={() => onCancel(invitation)}
            className="h-7 px-2.5 text-xs text-destructive hover:text-destructive hover:bg-red-50 dark:hover:bg-red-950/30">
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyMembers({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <Icon className="h-7 w-7 text-[var(--apple-tertiary-label)]" strokeWidth={1.5} />
      <div className="space-y-1">
        <p className="text-[17px] font-semibold text-[var(--apple-label)]">{title}</p>
        <p className="text-[15px] text-[var(--apple-secondary-label)] max-w-[260px]">{subtitle}</p>
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function MemberCardSkeleton() {
  return (
    <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card overflow-hidden">
      <div className="h-[3px] bg-[var(--apple-tertiary-fill)]" />
      <div className="p-5 flex flex-col items-center gap-3">
        <div className="h-16 w-16 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse" />
        <div className="space-y-1.5 w-full flex flex-col items-center">
          <div className="h-4 w-32 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
          <div className="h-3 w-40 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
        </div>
        <div className="h-5 w-20 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse" />
        <div className="h-3 w-24 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
      </div>
    </div>
  )
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({
  pagination,
  onPageChange,
  onLimitChange,
}: {
  pagination: { page: number; limit: number; total: number; totalPages: number }
  onPageChange: (p: number) => void
  onLimitChange: (l: number) => void
}) {
  if (pagination.total === 0) return null
  const from = Math.min(((pagination.page - 1) * pagination.limit) + 1, pagination.total)
  const to = Math.min(pagination.page * pagination.limit, pagination.total)
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-[var(--apple-separator)]">
      <div className="flex items-center gap-3 text-[13px] text-[var(--apple-secondary-label)]">
        <span>Per page:</span>
        <Select value={pagination.limit.toString()} onValueChange={(v) => onLimitChange(parseInt(v))}>
          <SelectTrigger className="w-16 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 20, 50, 100].map((n) => (
              <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>Showing {from}–{to} of {pagination.total}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={pagination.page === 1}
          onClick={() => onPageChange(pagination.page - 1)} className="h-8 text-xs">
          Previous
        </Button>
        <span className="text-[13px] text-[var(--apple-secondary-label)] px-1">
          {pagination.page} / {pagination.totalPages}
        </span>
        <Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPageChange(pagination.page + 1)} className="h-8 text-xs">
          Next
        </Button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MembersPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuthContext()
  const router = useRouter()
  const { formatDate } = useDateTime()
  const [members, setMembers] = useState<Member[]>([])
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [localSearch, setLocalSearch] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [activeTab, setActiveTab] = useState<'members' | 'invitations'>('members')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [invitationViewMode, setInvitationViewMode] = useState<'grid' | 'list'>('grid')
  const { hasPermission, loading: permissionsLoading } = usePermissions()
  const { success: notifySuccess, error: notifyError } = useNotify()

  const [membersPagination, setMembersPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 })
  const [invitationsPagination, setInvitationsPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 })
  const [organizationRoles, setOrganizationRoles] = useState<Array<{ id: string; name: string; key: string; isSystem?: boolean }>>([])
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null)
  const [removingMember, setRemovingMember] = useState(false)
  const [showCancelInvitationConfirm, setShowCancelInvitationConfirm] = useState(false)
  const [invitationToCancel, setInvitationToCancel] = useState<PendingInvitation | null>(null)
  const [cancelingInvitation, setCancelingInvitation] = useState(false)

  const canViewMembers = hasPermission(Permission.TEAM_READ) || hasPermission(Permission.USER_READ)
  const canInviteMembers = hasPermission(Permission.TEAM_INVITE) || hasPermission(Permission.USER_INVITE)
  const canEditMembers = hasPermission(Permission.TEAM_EDIT)
  const canDeleteMembers = hasPermission(Permission.TEAM_REMOVE)
  const hasActiveFilters = searchQuery !== '' || roleFilter !== 'all' || statusFilter !== 'all'

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      setLoading(false)
      fetchMembers()
    } else if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated])

  useEffect(() => {
    const loadRoles = async () => {
      try {
        const res = await fetch('/api/roles')
        const data = await res.json()
        if (data.success && Array.isArray(data.data)) {
          setOrganizationRoles(data.data.map((role: any) => ({ id: role._id, name: role.name, key: role._id, isSystem: role.isSystem })))
        }
      } catch (err) {
        console.error('Failed to load organization roles', err)
      }
    }
    loadRoles()
  }, [])

  // Force grid on mobile
  useEffect(() => {
    const sync = () => { if (window.innerWidth < 640) setViewMode('grid') }
    sync()
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [])

  const fetchMembers = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: membersPagination.page.toString(),
        limit: membersPagination.limit.toString(),
      })
      if (searchQuery) params.append('search', searchQuery)
      if (roleFilter !== 'all') params.append('role', roleFilter)
      if (statusFilter !== 'all') params.append('status', statusFilter)
      const response = await fetch(`/api/members?${params.toString()}`)
      const data = await response.json()
      if (data.success) {
        setMembers(data.data.members)
        setPendingInvitations(data.data.pendingInvitations)
        if (data.data.pagination) {
          setMembersPagination(prev => ({ ...prev, total: data.data.pagination.total, totalPages: data.data.pagination.totalPages }))
        }
      } else {
        notifyError({ title: data.error || 'Failed to fetch members' })
      }
    } catch {
      notifyError({ title: 'Failed to fetch members' })
    } finally {
      setLoading(false)
    }
  }

  const handleInviteMember = async (inviteData: any): Promise<{ error?: string } | void> => {
    if (!canInviteMembers) return { error: 'You do not have permission to invite members.' }
    try {
      const response = await fetch('/api/members/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inviteData) })
      const data = await response.json()
      if (data.success) {
        setShowInviteModal(false)
        notifySuccess({ title: 'Invitation sent successfully' })
        setActiveTab('invitations')
        await fetchMembers()
      } else {
        const errorMsg = data.error || 'Failed to send invitation'
        notifyError({ title: errorMsg })
        return { error: errorMsg }
      }
    } catch {
      const errorMsg = 'Failed to send invitation'
      notifyError({ title: errorMsg })
      return { error: errorMsg }
    }
  }

  const handleUpdateMember = async (memberId: string, updates: any) => {
    if (!canEditMembers) { notifyError({ title: 'You do not have permission to edit this member.' }); return }
    try {
      const response = await fetch('/api/members', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId, updates }) })
      const data = await response.json()
      if (data.success) {
        setEditingMember(null)
        notifySuccess({ title: 'Team member updated successfully' })
        fetchMembers()
      } else {
        notifyError({ title: data.error || 'Failed to update member' })
      }
    } catch {
      notifyError({ title: 'Failed to update member' })
    }
  }

  const handleCancelInvitationConfirm = async () => {
    if (!invitationToCancel) return
    try {
      setCancelingInvitation(true)
      const response = await fetch(`/api/members/cancel-invitation?invitationId=${invitationToCancel._id}`, { method: 'DELETE' })
      const data = await response.json()
      if (data.success) { notifySuccess({ title: 'Invitation cancelled successfully' }); await fetchMembers() }
      else notifyError({ title: data.error || 'Failed to cancel invitation' })
    } catch { notifyError({ title: 'Failed to cancel invitation' }) }
    finally { setCancelingInvitation(false); setShowCancelInvitationConfirm(false); setInvitationToCancel(null) }
  }

  const confirmRemoveMember = async () => {
    if (!memberToRemove || !canDeleteMembers) return
    try {
      setRemovingMember(true)
      const response = await fetch(`/api/members?memberId=${memberToRemove._id}`, { method: 'DELETE' })
      const data = await response.json()
      if (data.success) { notifySuccess({ title: 'Member removed successfully' }); await fetchMembers() }
      else notifyError({ title: data.error || 'Failed to remove member' })
    } catch { notifyError({ title: 'Failed to remove member' }) }
    finally { setRemovingMember(false); setShowRemoveConfirm(false); setMemberToRemove(null) }
  }

  // Fetch on filter / page changes
  useEffect(() => {
    if (!loading) fetchMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, roleFilter, statusFilter, membersPagination.page, membersPagination.limit])

  // Invitations client-side pagination
  useEffect(() => {
    const total = pendingInvitations.length
    const totalPages = Math.ceil(total / invitationsPagination.limit)
    setInvitationsPagination(prev => ({ ...prev, total, totalPages, page: Math.min(prev.page, totalPages || 1) }))
  }, [pendingInvitations.length, invitationsPagination.limit])

  // Reset page on filter change
  useEffect(() => { setMembersPagination(prev => ({ ...prev, page: 1 })) }, [searchQuery, roleFilter, statusFilter])

  // Debounce search
  useEffect(() => { setLocalSearch(searchQuery) }, [searchQuery])
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(localSearch), 800)
    return () => clearTimeout(t)
  }, [localSearch])

  const paginatedInvitations = pendingInvitations.slice(
    (invitationsPagination.page - 1) * invitationsPagination.limit,
    invitationsPagination.page * invitationsPagination.limit,
  )

  const canEditMemberRecord = (member: Member) => canEditMembers

  // ─── Loading state ──────────────────────────────────────────────────────────

  if (loading && members.length === 0) {
    return (
      <MainLayout>
        <PageContent>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-8 w-40 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
                <div className="h-4 w-24 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
              </div>
              <div className="h-9 w-32 bg-[var(--apple-tertiary-fill)] rounded-[var(--apple-radius-md)] animate-pulse" />
            </div>
            <div className="flex gap-2.5">
              <div className="flex-1 h-10 bg-[var(--apple-tertiary-fill)] rounded-[var(--apple-radius-md)] animate-pulse" />
              <div className="h-10 w-32 bg-[var(--apple-tertiary-fill)] rounded-[var(--apple-radius-md)] animate-pulse" />
              <div className="h-10 w-32 bg-[var(--apple-tertiary-fill)] rounded-[var(--apple-radius-md)] animate-pulse" />
              <div className="h-10 w-20 bg-[var(--apple-tertiary-fill)] rounded-[var(--apple-radius-md)] animate-pulse" />
            </div>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => <MemberCardSkeleton key={i} />)}
            </div>
          </div>
        </PageContent>
      </MainLayout>
    )
  }

  if (!permissionsLoading && !canViewMembers) {
    return (
      <MainLayout>
        <PageContent>
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <UserCheck className="h-7 w-7 text-red-500" strokeWidth={1.5} />
            <div className="text-center space-y-1">
              <p className="text-[17px] font-semibold text-[var(--apple-label)]">Access restricted</p>
              <p className="text-[15px] text-[var(--apple-secondary-label)]">You do not have permission to view team members.</p>
            </div>
          </div>
        </PageContent>
      </MainLayout>
    )
  }

  const tabBase = 'flex items-center gap-2 px-4 py-2 rounded-[var(--apple-radius-md)] text-[14px] font-medium apple-transition whitespace-nowrap'
  const tabActive = 'bg-card text-[var(--apple-label)] shadow-sm'
  const tabInactive = 'text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]'

  return (
    <MainLayout>
      <PageContent>
        <div className="space-y-6">

          {/* ─── Page Header ───────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 flex-shrink-0 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
              <div>
                <h1 className="text-[28px] font-bold tracking-tight leading-tight text-[var(--apple-label)]">
                  Team Members
                </h1>
                <p className="text-[15px] text-[var(--apple-secondary-label)] mt-0.5">
                  {membersPagination.total > 0
                    ? `${membersPagination.total} member${membersPagination.total !== 1 ? 's' : ''}`
                    : 'Manage your team members and invitations'}
                </p>
              </div>
            </div>
            {canInviteMembers && (
              <Button
                onClick={() => setShowInviteModal(true)}
                className="flex items-center gap-2 text-sm font-medium apple-transition w-full sm:w-auto"
              >
                <UserPlus className="h-4 w-4" strokeWidth={1.5} />
                Invite Member
              </Button>
            )}
          </div>

          {/* ─── Tab bar ───────────────────────────────────────────────────── */}
          <div className="flex items-center gap-1 p-1 rounded-[var(--apple-radius-md)] bg-[var(--apple-tertiary-fill)] border border-[var(--apple-separator)] w-fit">
            <button onClick={() => setActiveTab('members')} className={cn(tabBase, activeTab === 'members' ? tabActive : tabInactive)}>
              <Users className="h-4 w-4" strokeWidth={1.5} />
              Members
              <span className={cn(
                'ml-0.5 text-[11px] px-1.5 py-0.5 rounded-full font-semibold',
                activeTab === 'members' ? 'bg-[var(--apple-system-blue)] text-white' : 'bg-[var(--apple-fill)] text-[var(--apple-secondary-label)]'
              )}>
                {membersPagination.total}
              </span>
            </button>
            <button onClick={() => setActiveTab('invitations')} className={cn(tabBase, activeTab === 'invitations' ? tabActive : tabInactive)}>
              <Mail className="h-4 w-4" strokeWidth={1.5} />
              Invitations
              {pendingInvitations.length > 0 && (
                <span className={cn(
                  'ml-0.5 text-[11px] px-1.5 py-0.5 rounded-full font-semibold',
                  activeTab === 'invitations' ? 'bg-amber-500 text-white' : 'bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
                )}>
                  {pendingInvitations.length}
                </span>
              )}
            </button>
          </div>

          {/* ─── Members Tab ───────────────────────────────────────────────── */}
          {activeTab === 'members' && (
            <>
              {/* Toolbar */}
              <div className="flex flex-col sm:flex-row gap-2.5">
                {/* Search */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--apple-tertiary-label)] pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    placeholder="Search members..."
                    value={localSearch}
                    onChange={(e) => setLocalSearch(e.target.value)}
                    className={cn(
                      'w-full pl-9 pr-4 h-10 rounded-[var(--apple-radius-md)]',
                      'bg-[var(--apple-tertiary-fill)] border border-transparent',
                      'text-[15px] text-[var(--apple-label)] placeholder:text-[var(--apple-tertiary-label)]',
                      'focus:outline-none focus:ring-2 focus:ring-[var(--apple-system-blue)] focus:ring-offset-0',
                      'apple-transition',
                    )}
                  />
                </div>

                {/* Role filter */}
                <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setMembersPagination(p => ({ ...p, page: 1 })) }}>
                  <SelectTrigger className="w-full sm:w-[150px] h-10 text-sm">
                    <SelectValue placeholder="All Roles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    {organizationRoles.map((role) => (
                      <SelectItem key={role.id} value={role.key}>{formatToTitleCase(role.name)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Status filter */}
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setMembersPagination(p => ({ ...p, page: 1 })) }}>
                  <SelectTrigger className="w-full sm:w-[140px] h-10 text-sm">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>

                {/* View toggle — desktop only */}
                <div className="hidden sm:flex items-center rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] overflow-hidden bg-[var(--apple-tertiary-fill)] flex-shrink-0">
                  {(['grid', 'list'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      aria-label={`${mode} view`}
                      aria-pressed={viewMode === mode}
                      className={cn(
                        'flex items-center justify-center h-10 w-10 apple-transition',
                        viewMode === mode
                          ? 'bg-card text-[var(--apple-label)] shadow-sm'
                          : 'text-[var(--apple-tertiary-label)] hover:text-[var(--apple-secondary-label)]',
                      )}
                    >
                      {mode === 'grid' ? <LayoutGrid className="h-4 w-4" strokeWidth={1.5} /> : <List className="h-4 w-4" strokeWidth={1.5} />}
                    </button>
                  ))}
                </div>

                {/* Clear filters */}
                {hasActiveFilters && (
                  <Button variant="outline" size="sm" onClick={() => { setSearchQuery(''); setLocalSearch(''); setRoleFilter('all'); setStatusFilter('all') }}
                    className="h-10 px-3 text-sm apple-transition">
                    <X className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.5} />
                    Clear
                  </Button>
                )}
              </div>

              {/* Content */}
              {members.length === 0 ? (
                <EmptyMembers icon={Users} title="No members found" subtitle={hasActiveFilters ? 'Try adjusting your search or filters.' : 'Invite your first team member to get started.'} />
              ) : viewMode === 'grid' ? (
                <div key="grid" className="view-transition-container grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {members.map((member, index) => (
                    <MemberGridCard
                      key={member._id}
                      member={member}
                      index={index}
                      canEdit={canEditMemberRecord(member)}
                      canDelete={canDeleteMembers}
                      onEdit={setEditingMember}
                      onRemove={(m) => { setMemberToRemove(m); setShowRemoveConfirm(true) }}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              ) : (
                <div key="list" className="view-transition-container rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none">
                  <MemberListHeader />
                  {members.map((member, index) => (
                    <MemberListRow
                      key={member._id}
                      member={member}
                      index={index}
                      canEdit={canEditMemberRecord(member)}
                      canDelete={canDeleteMembers}
                      onEdit={setEditingMember}
                      onRemove={(m) => { setMemberToRemove(m); setShowRemoveConfirm(true) }}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              )}

              <Pagination
                pagination={membersPagination}
                onPageChange={(p) => setMembersPagination(prev => ({ ...prev, page: p }))}
                onLimitChange={(l) => setMembersPagination(prev => ({ ...prev, limit: l, page: 1 }))}
              />
            </>
          )}

          {/* ─── Invitations Tab ───────────────────────────────────────────── */}
          {activeTab === 'invitations' && (
            <>
              {/* Invitation view toggle */}
              <div className="flex items-center justify-between">
                <p className="text-[15px] text-[var(--apple-secondary-label)]">
                  {pendingInvitations.length === 0
                    ? 'No pending invitations'
                    : `${pendingInvitations.length} pending invitation${pendingInvitations.length !== 1 ? 's' : ''}`}
                </p>
                <div className="hidden sm:flex items-center rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] overflow-hidden bg-[var(--apple-tertiary-fill)]">
                  {(['grid', 'list'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setInvitationViewMode(mode)}
                      aria-label={`${mode} view`}
                      aria-pressed={invitationViewMode === mode}
                      className={cn(
                        'flex items-center justify-center h-9 w-9 apple-transition',
                        invitationViewMode === mode
                          ? 'bg-card text-[var(--apple-label)] shadow-sm'
                          : 'text-[var(--apple-tertiary-label)] hover:text-[var(--apple-secondary-label)]',
                      )}
                    >
                      {mode === 'grid' ? <LayoutGrid className="h-4 w-4" strokeWidth={1.5} /> : <List className="h-4 w-4" strokeWidth={1.5} />}
                    </button>
                  ))}
                </div>
              </div>

              {paginatedInvitations.length === 0 ? (
                <EmptyMembers icon={Mail} title="No pending invitations" subtitle="Invitations sent to new members will appear here." />
              ) : invitationViewMode === 'grid' ? (
                <div key="inv-grid" className="view-transition-container grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {paginatedInvitations.map((inv) => (
                    <InviteGridCard key={inv._id} invitation={inv} canCancel={!!canInviteMembers}
                      onCancel={(i) => { setInvitationToCancel(i); setShowCancelInvitationConfirm(true) }}
                      formatDate={formatDate} />
                  ))}
                </div>
              ) : (
                <div key="inv-list" className="view-transition-container rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none">
                  <InviteListHeader />
                  {paginatedInvitations.map((inv) => (
                    <InviteListRow key={inv._id} invitation={inv} canCancel={!!canInviteMembers}
                      onCancel={(i) => { setInvitationToCancel(i); setShowCancelInvitationConfirm(true) }}
                      formatDate={formatDate} />
                  ))}
                </div>
              )}

              <Pagination
                pagination={invitationsPagination}
                onPageChange={(p) => setInvitationsPagination(prev => ({ ...prev, page: p }))}
                onLimitChange={(l) => setInvitationsPagination(prev => ({ ...prev, limit: l, page: 1 }))}
              />
            </>
          )}

        </div>
      </PageContent>

      {/* ─── Modals ──────────────────────────────────────────────────────────── */}
      {showInviteModal && canInviteMembers && (
        <InviteMemberModal onClose={() => setShowInviteModal(false)} onInvite={handleInviteMember} />
      )}
      {editingMember && canEditMemberRecord(editingMember) && (
        <EditMemberModal member={editingMember} onClose={() => setEditingMember(null)} onUpdate={handleUpdateMember} canEditAdminUsers={canEditMembers} />
      )}
      <ConfirmationModal
        isOpen={showRemoveConfirm}
        onClose={() => { if (removingMember) return; setShowRemoveConfirm(false); setMemberToRemove(null) }}
        onConfirm={confirmRemoveMember}
        title="Remove member"
        description={memberToRemove ? `Are you sure you want to remove ${memberToRemove.firstName} ${memberToRemove.lastName}? This will permanently delete their account and cannot be undone.` : 'Are you sure you want to remove this member?'}
        confirmText="Remove"
        cancelText="Cancel"
        variant="destructive"
        isLoading={removingMember}
      />
      <ConfirmationModal
        isOpen={showCancelInvitationConfirm}
        onClose={() => { if (cancelingInvitation) return; setShowCancelInvitationConfirm(false); setInvitationToCancel(null) }}
        onConfirm={handleCancelInvitationConfirm}
        title="Cancel invitation"
        description={invitationToCancel ? `Are you sure you want to cancel the invitation for ${invitationToCancel.email}? This action cannot be undone.` : 'Are you sure you want to cancel this invitation?'}
        confirmText="Cancel Invitation"
        cancelText="Keep Invitation"
        variant="destructive"
        isLoading={cancelingInvitation}
      />
    </MainLayout>
  )
}
