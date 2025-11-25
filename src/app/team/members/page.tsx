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
  Loader2
} from 'lucide-react'
import { InviteMemberModal } from '@/components/members/InviteMemberModal'
import { EditMemberModal } from '@/components/members/EditMemberModal'

interface Member {
  _id: string
  firstName: string
  lastName: string
  email: string
  role: string
  isActive: boolean
  createdAt: string
  lastLogin?: string
}

interface PendingInvitation {
  _id: string
  email: string
  role: string
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

  const handleInviteMember = async (inviteData: any) => {
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
        // Clear success message after 5 seconds
        setTimeout(() => setSuccess(''), 5000)
        // Refresh authentication state and then fetch members
        await checkAuth()
        await fetchMembers()
      } else {
        setError(data.error || 'Failed to send invitation')
        setSuccess('')
      }
    } catch (err) {
      setError('Failed to send invitation')
    }
  }

  const handleUpdateMember = async (memberId: string, updates: any) => {
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
        setTimeout(() => setSuccess(''), 5000)
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

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      case 'project_manager': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'team_member': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'client': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      case 'viewer': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

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

  return (
    <MainLayout>
      <div className="space-y-6 sm:space-y-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">Team Members</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">Manage your team members and invitations</p>
          </div>
          <Button 
            onClick={() => setShowInviteModal(true)} 
            className="w-full sm:w-auto flex-shrink-0 text-sm sm:text-base"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            <span className="sm:inline">Invite Member</span>
            <span className="sm:hidden">Invite</span>
          </Button>
        </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert variant="default">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="members" className="text-xs sm:text-sm">
            <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
            <span className="hidden sm:inline">Members</span>
            <span className="sm:hidden">Members</span>
            <span className="ml-1">({members.length})</span>
          </TabsTrigger>
          <TabsTrigger value="invitations" className="text-xs sm:text-sm">
            <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
            <span className="hidden sm:inline">Pending Invitations</span>
            <span className="sm:hidden">Invitations</span>
            <span className="ml-1">({pendingInvitations.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4">
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <div className="space-y-3 sm:space-y-4">
                <div>
                  <CardTitle className="text-lg sm:text-xl">Team Members</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Manage your team members and their roles
                  </CardDescription>
                </div>
                <div className="flex flex-col gap-2 sm:gap-3">
                  <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Search members..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 w-full text-sm sm:text-base"
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                      <SelectTrigger className="w-full sm:w-[160px] text-sm">
                        <SelectValue placeholder="Filter by role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Roles</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="project_manager">Project Manager</SelectItem>
                        <SelectItem value="team_member">Team Member</SelectItem>
                        <SelectItem value="client">Client</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-full sm:w-[160px] text-sm">
                        <SelectValue placeholder="Filter by status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-3 sm:space-y-4">
                {filteredMembers.length === 0 ? (
                  <div className="text-center py-8 sm:py-12 text-muted-foreground">
                    <Users className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50" />
                    <p className="text-sm sm:text-base">No members found</p>
                  </div>
                ) : (
                  filteredMembers.map((member) => (
                    <div key={member._id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 border border-muted rounded-lg gap-3 sm:gap-4">
                      <div className="flex items-start sm:items-center space-x-3 sm:space-x-4 flex-1 min-w-0 w-full">
                        <GravatarAvatar 
                          user={{
                            firstName: member.firstName,
                            lastName: member.lastName,
                            email: member.email
                          }}
                          className="flex-shrink-0 h-10 w-10 sm:h-12 sm:w-12"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <h3 className="font-medium text-sm sm:text-base truncate min-w-0">{member.firstName} {member.lastName}</h3>
                            {member.isActive ? (
                              <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500 flex-shrink-0" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-500 flex-shrink-0" />
                            )}
                          </div>
                          <p className="text-xs sm:text-sm text-muted-foreground truncate mb-2">{member.email}</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={`${getRoleColor(member.role)} text-xs flex-shrink-0`}>
                              {formatToTitleCase(member.role)}
                            </Badge>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              Joined {new Date(member.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 w-full sm:w-auto flex-shrink-0 sm:ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingMember(member)}
                          className="flex-1 sm:flex-initial text-xs sm:text-sm"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRemoveMember(member._id)}
                          disabled={member.role === 'admin'}
                          className="flex-1 sm:flex-initial text-xs sm:text-sm"
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invitations" className="space-y-4">
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-lg sm:text-xl">Pending Invitations</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Invitations that are waiting to be accepted
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-3 sm:space-y-4">
                {pendingInvitations.length === 0 ? (
                  <div className="text-center py-8 sm:py-12 text-muted-foreground">
                    <Mail className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50" />
                    <p className="text-sm sm:text-base">No pending invitations</p>
                  </div>
                ) : (
                  pendingInvitations.map((invitation) => (
                    <div key={invitation._id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 border border-muted rounded-lg gap-3 sm:gap-4">
                      <div className="flex items-start sm:items-center space-x-3 sm:space-x-4 flex-1 min-w-0 w-full">
                        <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                          <Mail className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm sm:text-base truncate mb-1">{invitation.email}</h3>
                          <p className="text-xs sm:text-sm text-muted-foreground truncate mb-2">
                            Invited by {invitation.invitedBy.firstName} {invitation.invitedBy.lastName}
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={`${getRoleColor(invitation.role)} text-xs flex-shrink-0`}>
                              {formatToTitleCase(invitation.role)}
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
                          className="text-destructive hover:text-destructive flex-1 sm:flex-initial text-xs sm:text-sm"
                        >
                          <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {showInviteModal && (
        <InviteMemberModal
          onClose={() => setShowInviteModal(false)}
          onInvite={handleInviteMember}
        />
      )}

      {editingMember && (
        <EditMemberModal
          member={editingMember}
          onClose={() => setEditingMember(null)}
          onUpdate={handleUpdateMember}
        />
      )}
      </div>
    </MainLayout>
  )
}
