'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { formatToTitleCase } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Users, 
  UserPlus, 
  Search, 
  Filter, 
  MoreHorizontal, 
  Mail, 
  Clock,
  CheckCircle,
  XCircle,
  UserCheck,
  Loader2,
  Grid3x3,
  List
} from 'lucide-react'
import { InviteMemberModal } from '@/components/members/InviteMemberModal'
import { EditMemberModal } from '@/components/members/EditMemberModal'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'

interface Member {
  _id: string
  firstName: string
  lastName: string
  email: string
  role: string
  customRole?: {
    _id: string
    name: string
    description?: string
  }
  isActive: boolean
  createdAt: string
  lastLogin?: string
  projectManager?: {
    _id: string
    firstName: string
    lastName: string
    email: string
    role: string
  }
  humanResourcePartner?: {
    _id: string
    firstName: string
    lastName: string
    email: string
    role: string
  }
}

interface PendingInvitation {
  _id: string
  email: string
  role: string
  customRole?: {
    _id: string
    name: string
  }
  invitedBy: {
    firstName: string
    lastName: string
    email: string
  }
  createdAt: string
  expiresAt: string
}

export default function MembersPage() {
  const router = useRouter()
  const [members, setMembers] = useState<Member[]>([])
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [authError, setAuthError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [activeTab, setActiveTab] = useState('members')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [invitationViewMode, setInvitationViewMode] = useState<'grid' | 'list'>('grid')
  const { hasPermission, loading: permissionsLoading } = usePermissions()

  const canViewMembers = hasPermission(Permission.TEAM_READ) || hasPermission(Permission.USER_READ)
  const canInviteMembers = hasPermission(Permission.TEAM_INVITE) || hasPermission(Permission.USER_INVITE)
  const canEditMembers = hasPermission(Permission.USER_UPDATE)
  const canEditAdminMembers = hasPermission(Permission.USER_MANAGE_ROLES)
  const [organizationRoles, setOrganizationRoles] = useState<Array<{ id: string; name: string }>>([])

  // Load available organization (system) roles from the central roles API
  useEffect(() => {
    const loadRoles = async () => {
      try {
        const res = await fetch('/api/roles')
        const data = await res.json()
        if (data.success && Array.isArray(data.data)) {
          const systemRoles = data.data
            .filter((role: any) => role.isSystem)
            .map((role: any) => ({
              id: role._id,
              name: role.name,
            }))
          setOrganizationRoles(systemRoles)
        }
      } catch (err) {
        console.error('Failed to load organization roles', err)
      }
    }

    loadRoles()
  }, [])

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      
      if (response.ok) {
        setAuthError('')
        await fetchMembers()
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
          setAuthError('')
          await fetchMembers()
        } else {
          setAuthError('Session expired')
          setTimeout(() => {
            router.push('/login')
          }, 2000)
        }
      } else {
        router.push('/login')
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      setAuthError('Authentication failed')
      setTimeout(() => {
        router.push('/login')
      }, 2000)
    }
  }, [router])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const fetchMembers = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/members')
      const data = await response.json()

      if (data.success) {
        setMembers(data.data.members)
        setPendingInvitations(data.data.pendingInvitations)
      } else {
        setError(data.error || 'Failed to fetch members')
      }
    } catch (err) {
      setError('Failed to fetch members')
    } finally {
      setLoading(false)
    }
  }

  const handleInviteMember = async (inviteData: any): Promise<{ error?: string } | void> => {
    if (!canInviteMembers) {
      const errorMsg = 'You do not have permission to invite members.'
      setError(errorMsg)
      setSuccess('')
      return { error: errorMsg }
    }

    try {
      const response = await fetch('/api/members/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(inviteData)
      })

      const data = await response.json()

      if (data.success) {
        setShowInviteModal(false)
        setSuccess('Invitation sent successfully!')
        setError('')
        // Switch to Pending Invitations tab
        setActiveTab('invitations')
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(''), 3000)
        // Refresh authentication state and then fetch members
        await checkAuth()
        await fetchMembers()
        // Return void on success
        return
      } else {
        const errorMsg = data.error || 'Failed to send invitation'
        setError(errorMsg)
        setSuccess('')
        return { error: errorMsg }
      }
    } catch (err) {
      const errorMsg = 'Failed to send invitation'
      setError(errorMsg)
      return { error: errorMsg }
    }
  }

  const handleUpdateMember = async (memberId: string, updates: any) => {
    const member = members.find((m) => m._id === memberId)
    if (!member) {
      setError('Member not found')
      return
    }

    const requiresAdminAccess = member.role === 'admin'
    if (!canEditMembers || (requiresAdminAccess && !canEditAdminMembers)) {
      setError('You do not have permission to edit this member.')
      return
    }

    try {
      const response = await fetch('/api/members', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          memberId,
          updates
        })
      })

      const data = await response.json()

      if (data.success) {
        setEditingMember(null)
        fetchMembers()
      } else {
        setError(data.error || 'Failed to update member')
      }
    } catch (err) {
      setError('Failed to update member')
    }
  }

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      const response = await fetch(`/api/members/cancel-invitation?invitationId=${invitationId}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        setSuccess('Invitation cancelled successfully!')
        setError('')
        setTimeout(() => setSuccess(''), 3000)
        fetchMembers()
      } else {
        setError(data.error || 'Failed to cancel invitation')
      }
    } catch (err) {
      setError('Failed to cancel invitation')
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) {
      return
    }

    try {
      const response = await fetch(`/api/members?memberId=${memberId}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        fetchMembers()
      } else {
        setError(data.error || 'Failed to remove member')
      }
    } catch (err) {
      setError('Failed to remove member')
    }
  }

  const filteredMembers = members.filter(member => {
    const matchesSearch = !searchQuery || 
      member.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesRole = roleFilter === 'all' || member.role === roleFilter
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'active' && member.isActive) ||
      (statusFilter === 'inactive' && !member.isActive)

    return matchesSearch && matchesRole && matchesStatus
  })

  const handleInlineRoleChange = async (member: Member, newRole: string) => {
    if (newRole === member.role) return

    // Prevent assigning admin role without proper permission
    if (newRole === 'admin' && !canEditAdminMembers) {
      setError('You do not have permission to assign admin role.')
      setSuccess('')
      return
    }

    await handleUpdateMember(member._id, { role: newRole })
    // Optional inline success message
    setSuccess('Member role updated successfully.')
    setTimeout(() => setSuccess(''), 3000)
  }

  // Generate a consistent color for custom roles based on their ID
  const getCustomRoleColor = (customRoleId: string): string => {
    // Hash function to convert ID to a number
    let hash = 0
    for (let i = 0; i < customRoleId.length; i++) {
      hash = customRoleId.charCodeAt(i) + ((hash << 5) - hash)
      hash = hash & hash // Convert to 32-bit integer
    }
    
    // Use absolute value and modulo to get a consistent index
    const index = Math.abs(hash) % 12
    
    // Palette of distinct colors (avoiding red which is for admin)
    const colorPalette = [
      'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-900',
      'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200 hover:bg-cyan-100 dark:hover:bg-cyan-900',
      'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200 hover:bg-teal-100 dark:hover:bg-teal-900',
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900',
      'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200 hover:bg-lime-100 dark:hover:bg-lime-900',
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900',
      'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900',
      'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 hover:bg-orange-100 dark:hover:bg-orange-900',
      'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200 hover:bg-pink-100 dark:hover:bg-pink-900',
      'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-900',
      'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-200 hover:bg-fuchsia-100 dark:hover:bg-fuchsia-900',
      'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200 hover:bg-violet-100 dark:hover:bg-violet-900',
    ]
    
    return colorPalette[index]
  }

  const getRoleColor = (role: string, customRoleId?: string) => {
    // If custom role exists, use custom role color
    if (customRoleId) {
      return getCustomRoleColor(customRoleId)
    }
    
    // Otherwise, use predefined role colors
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900'
      case 'project_manager': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900'
      case 'team_member': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900'
      case 'client': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900'
      case 'viewer': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
    }
  }

  const getMemberRoleLabel = (member: Member) => member.customRole?.name || formatToTitleCase(member.role)

  const getInvitationRoleLabel = (invitation: PendingInvitation) =>
    invitation.customRole?.name || formatToTitleCase(invitation.role)

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading members...</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (authError) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-destructive mb-4">{authError}</p>
            <p className="text-muted-foreground">Redirecting to login...</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (!permissionsLoading && !canViewMembers) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center space-y-2">
            <p className="text-lg font-semibold text-foreground">Access restricted</p>
            <p className="text-sm text-muted-foreground">You do not have permission to view team members.</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  const handleOpenInviteModal = () => {
    if (!canInviteMembers) {
      setError('You do not have permission to invite members.')
      setSuccess('')
      return
    }
    setShowInviteModal(true)
  }

  const canEditMemberRecord = (member: Member) => {
    if (member.role === 'admin') {
      return canEditAdminMembers
    }
    return canEditMembers
  }

  return (
    <MainLayout>
      <div className="space-y-4 sm:space-y-6 lg:space-y-8 overflow-x-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground break-words">Team Members</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 break-words">Manage your team members and invitations</p>
          </div>
          {canInviteMembers && (
            <Button 
              onClick={handleOpenInviteModal} 
              className="w-full sm:w-auto flex-shrink-0 text-sm sm:text-base min-h-[44px] touch-target whitespace-nowrap shadow-sm hover:shadow-md transition-shadow"
            >
              <UserPlus className="h-4 w-4 mr-2 flex-shrink-0" />
              <span className="sm:inline">Invite Member</span>
              <span className="sm:hidden">Invite</span>
            </Button>
          )}
        </div>

      {success && (
        <Alert variant="success" className="break-words border-green-500 bg-green-50 dark:bg-green-900/20">
          <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400" />
          <AlertDescription className="break-words text-green-800 dark:text-green-200">{success}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 overflow-x-hidden">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="members" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="truncate">Members</span>
            <span className="ml-1 flex-shrink-0">({members.length})</span>
          </TabsTrigger>
          <TabsTrigger value="invitations" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline truncate">Pending Invitations</span>
            <span className="sm:hidden truncate">Invitations</span>
            <span className="ml-1 flex-shrink-0">({pendingInvitations.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4 mt-4 overflow-x-hidden">
          <Card className="overflow-x-hidden">
            <CardHeader className="p-4 sm:p-6">
              <div className="space-y-3 sm:space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg sm:text-xl break-words">Team Members</CardTitle>
                    <CardDescription className="text-xs sm:text-sm break-words">
                      Manage your team members and their roles
                    </CardDescription>
                  </div>
                  <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'grid' | 'list')}>
                    <TabsList className="grid w-full grid-cols-2 h-9 sm:h-10">
                      <TabsTrigger value="grid" className="text-xs sm:text-sm">
                        <Grid3x3 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
                        Grid
                      </TabsTrigger>
                      <TabsTrigger value="list" className="text-xs sm:text-sm">
                        <List className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
                        List
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <div className="flex flex-col gap-2 sm:gap-3">
                  <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none flex-shrink-0" />
                    <Input
                      placeholder="Search members..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 w-full text-sm sm:text-base min-h-[44px] touch-target"
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                      <SelectTrigger className="w-full sm:w-[160px] text-sm min-h-[44px] touch-target">
                        <SelectValue placeholder="Filter by role" />
                      </SelectTrigger>
                      <SelectContent className="z-[10050]">
                        <SelectItem value="all">All Roles</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="project_manager">Project Manager</SelectItem>
                        <SelectItem value="team_member">Team Member</SelectItem>
                        <SelectItem value="client">Client</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-full sm:w-[160px] text-sm min-h-[44px] touch-target">
                        <SelectValue placeholder="Filter by status" />
                      </SelectTrigger>
                      <SelectContent className="z-[10050]">
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              {filteredMembers.length === 0 ? (
                <div className="text-center py-8 sm:py-12 text-muted-foreground">
                  <Users className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50 flex-shrink-0" />
                  <p className="text-sm sm:text-base break-words">No members found</p>
                </div>
              ) : viewMode === 'grid' ? (
                <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredMembers.map((member) => (
                    <Card key={member._id} className="overflow-hidden hover:shadow-md transition-shadow">
                      <CardContent className="p-4 sm:p-5">
                        <div className="flex flex-col items-center text-center space-y-3">
                          <div className="relative">
                            <GravatarAvatar 
                              user={{
                                firstName: member.firstName,
                                lastName: member.lastName,
                                email: member.email
                              }}
                              className="h-16 w-16 sm:h-20 sm:w-20"
                            />
                            <div className="absolute -bottom-1 -right-1">
                              {member.isActive ? (
                                <CheckCircle className="h-5 w-5 text-green-500 bg-background rounded-full" />
                              ) : (
                                <XCircle className="h-5 w-5 text-red-500 bg-background rounded-full" />
                              )}
                            </div>
                          </div>
                          <div className="w-full space-y-1">
                            <h3 className="font-semibold text-base sm:text-lg truncate" title={`${member.firstName} ${member.lastName}`}>
                              {member.firstName} {member.lastName}
                            </h3>
                            <p className="text-xs sm:text-sm text-muted-foreground truncate" title={member.email}>
                              {member.email}
                            </p>
                          </div>
                          <div className="w-full space-y-2">
                            <div className="flex items-center justify-center">
                              {/* <Badge className={`${getRoleColor(member.role, member.customRole?._id)} text-xs sm:text-sm flex-shrink-0`}>
                                {getMemberRoleLabel(member)}
                              </Badge> */}
                              {organizationRoles.length > 0 && (
                                <Select
                                  value={member.role}
                                  onValueChange={(value) => handleInlineRoleChange(member, value)}
                                  disabled={!canEditMemberRecord(member)}
                                >
                                  <SelectTrigger className="h-8 w-[140px] text-xs sm:text-sm">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {organizationRoles.map((role) => (
                                      <SelectItem key={role.id} value={role.id}>
                                        {role.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Joined {new Date(member.createdAt).toLocaleDateString()}
                            </p>
                            {/* Project Manager / HR partner info */}
                            {member.role !== 'admin' && (!member.projectManager || !member.humanResourcePartner) && (
                              <p className="text-xs text-amber-600 dark:text-amber-300">
                                Project Manager and Human Resource Partner pending
                              </p>
                            )}
                            {member.role !== 'admin' && member.projectManager && member.humanResourcePartner && (
                              <p className="text-xs text-muted-foreground">
                                PM: {member.projectManager.firstName} {member.projectManager.lastName} • HR: {member.humanResourcePartner.firstName} {member.humanResourcePartner.lastName}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 w-full pt-2 border-t">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => canEditMemberRecord(member) && setEditingMember(member)}
                              disabled={!canEditMemberRecord(member)}
                              title={
                                canEditMemberRecord(member)
                                  ? undefined
                                  : 'You do not have permission to edit this member'
                              }
                              className="flex-1 text-xs sm:text-sm min-h-[36px]"
                            >
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRemoveMember(member._id)}
                              disabled={member.role === 'admin'}
                              className="flex-1 text-xs sm:text-sm min-h-[36px]"
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  {filteredMembers.map((member) => (
                    <div key={member._id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 border border-muted rounded-lg gap-3 sm:gap-4 overflow-x-hidden hover:bg-muted/50 transition-colors">
                      <div className="flex items-start sm:items-center space-x-3 sm:space-x-4 flex-1 min-w-0 w-full">
                        <GravatarAvatar 
                          user={{
                            firstName: member.firstName,
                            lastName: member.lastName,
                            email: member.email
                          }}
                          className="flex-shrink-0 h-10 w-10 sm:h-12 sm:w-12"
                        />
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <div className="flex items-center space-x-2 mb-1 min-w-0">
                            <h3 className="font-medium text-sm sm:text-base truncate min-w-0" title={`${member.firstName} ${member.lastName}`}>
                              {member.firstName} {member.lastName}
                            </h3>
                            {member.isActive ? (
                              <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500 flex-shrink-0" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-500 flex-shrink-0" />
                            )}
                          </div>
                          <p className="text-xs sm:text-sm text-muted-foreground truncate mb-2" title={member.email}>{member.email}</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={`${getRoleColor(member.role, member.customRole?._id)} text-xs flex-shrink-0`}>
                              {getMemberRoleLabel(member)}
                            </Badge>
                            {organizationRoles.length > 0 && (
                              <Select
                                value={member.role}
                                onValueChange={(value) => handleInlineRoleChange(member, value)}
                                disabled={!canEditMemberRecord(member)}
                              >
                                <SelectTrigger className="h-8 w-[140px] text-xs sm:text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {organizationRoles.map((role) => (
                                    <SelectItem key={role.id} value={role.id}>
                                      {role.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              Joined {new Date(member.createdAt).toLocaleDateString()}
                            </span>
                            {/* Project Manager / HR partner info */}
                            {member.role !== 'admin' && (!member.projectManager || !member.humanResourcePartner) && (
                              <p className="text-xs text-amber-600 dark:text-amber-300 w-full">
                                Project Manager and Human Resource Partner pending
                              </p>
                            )}
                            {member.role !== 'admin' && member.projectManager && member.humanResourcePartner && (
                              <p className="text-xs text-muted-foreground w-full">
                                PM: {member.projectManager.firstName} {member.projectManager.lastName} • HR: {member.humanResourcePartner.firstName} {member.humanResourcePartner.lastName}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 w-full sm:w-auto flex-shrink-0 sm:ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => canEditMemberRecord(member) && setEditingMember(member)}
                          disabled={!canEditMemberRecord(member)}
                          title={
                            canEditMemberRecord(member)
                              ? undefined
                              : 'You do not have permission to edit this member'
                          }
                          className="flex-1 sm:flex-initial text-xs sm:text-sm min-h-[44px] touch-target"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRemoveMember(member._id)}
                          disabled={member.role === 'admin'}
                          className="flex-1 sm:flex-initial text-xs sm:text-sm min-h-[44px] touch-target"
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invitations" className="space-y-4 mt-4 overflow-x-hidden">
          <Card className="overflow-x-hidden">
            <CardHeader className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg sm:text-xl break-words">Pending Invitations</CardTitle>
                  <CardDescription className="text-xs sm:text-sm break-words">
                    Invitations that are waiting to be accepted
                  </CardDescription>
                </div>
                <Tabs value={invitationViewMode} onValueChange={(value) => setInvitationViewMode(value as 'grid' | 'list')}>
                  <TabsList className="grid w-full grid-cols-2 h-9 sm:h-10">
                    <TabsTrigger value="grid" className="text-xs sm:text-sm">
                      <Grid3x3 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
                      Grid
                    </TabsTrigger>
                    <TabsTrigger value="list" className="text-xs sm:text-sm">
                      <List className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
                      List
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              {pendingInvitations.length === 0 ? (
                <div className="text-center py-8 sm:py-12 text-muted-foreground">
                  <Mail className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50 flex-shrink-0" />
                  <p className="text-sm sm:text-base break-words">No pending invitations</p>
                </div>
              ) : invitationViewMode === 'grid' ? (
                <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {pendingInvitations.map((invitation) => (
                    <Card key={invitation._id} className="overflow-hidden hover:shadow-md transition-shadow">
                      <CardContent className="p-4 sm:p-5">
                        <div className="flex flex-col items-center text-center space-y-3">
                          <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                            <Mail className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
                          </div>
                          <div className="w-full space-y-1">
                            <h3 className="font-semibold text-base sm:text-lg truncate" title={invitation.email}>
                              {invitation.email}
                            </h3>
                            <p className="text-xs sm:text-sm text-muted-foreground truncate" title={`Invited by ${invitation.invitedBy.firstName} ${invitation.invitedBy.lastName}`}>
                              Invited by {invitation.invitedBy.firstName} {invitation.invitedBy.lastName}
                            </p>
                          </div>
                          <div className="w-full space-y-2">
                            <Badge className={`${getRoleColor(invitation.role, invitation.customRole?._id)} text-xs sm:text-sm w-full justify-center py-1.5`}>
                              {getInvitationRoleLabel(invitation)}
                            </Badge>
                            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                              <Clock className="h-3.5 w-3.5 text-yellow-500" />
                              <span>Expires {new Date(invitation.expiresAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 w-full pt-2 border-t">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-1 justify-center">
                              <Clock className="h-3.5 w-3.5 text-yellow-500" />
                              <span>Pending</span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCancelInvitation(invitation._id)}
                              className="text-destructive hover:text-destructive flex-1 text-xs sm:text-sm min-h-[36px]"
                            >
                              <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  {pendingInvitations.map((invitation) => (
                    <div key={invitation._id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 border border-muted rounded-lg gap-3 sm:gap-4 overflow-x-hidden hover:bg-muted/50 transition-colors">
                      <div className="flex items-start sm:items-center space-x-3 sm:space-x-4 flex-1 min-w-0 w-full">
                        <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                          <Mail className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground flex-shrink-0" />
                        </div>
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <h3 className="font-medium text-sm sm:text-base truncate mb-1" title={invitation.email}>{invitation.email}</h3>
                          <p className="text-xs sm:text-sm text-muted-foreground truncate mb-2" title={`Invited by ${invitation.invitedBy.firstName} ${invitation.invitedBy.lastName}`}>
                            Invited by {invitation.invitedBy.firstName} {invitation.invitedBy.lastName}
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={`${getRoleColor(invitation.role, invitation.customRole?._id)} text-xs flex-shrink-0`}>
                              {getInvitationRoleLabel(invitation)}
                            </Badge>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto flex-shrink-0 sm:ml-4">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-yellow-500 flex-shrink-0" />
                          <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">Pending</span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCancelInvitation(invitation._id)}
                          className="text-destructive hover:text-destructive flex-1 sm:flex-initial text-xs sm:text-sm min-h-[44px] touch-target"
                        >
                          <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 flex-shrink-0" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {showInviteModal && canInviteMembers && (
        <InviteMemberModal
          onClose={() => setShowInviteModal(false)}
          onInvite={handleInviteMember}
        />
      )}

      {editingMember && canEditMemberRecord(editingMember) && (
        <EditMemberModal
          member={editingMember}
          onClose={() => setEditingMember(null)}
          onUpdate={handleUpdateMember}
          canEditAdminUsers={canEditAdminMembers}
        />
      )}
      </div>
    </MainLayout>
  )
}
