'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
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
  ArrowLeft
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
      case 'admin': return 'bg-red-100 text-red-800'
      case 'project_manager': return 'bg-blue-100 text-blue-800'
      case 'team_member': return 'bg-green-100 text-green-800'
      case 'client': return 'bg-purple-100 text-purple-800'
      case 'viewer': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
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
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-4 flex-1 min-w-0">
            <Button variant="outline" size="sm" onClick={() => router.back()} className="flex-shrink-0">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground truncate">Team Members</h1>
              <p className="text-sm sm:text-base text-muted-foreground mt-1">Manage your team members and invitations</p>
            </div>
          </div>
          <Button onClick={() => setShowInviteModal(true)} className="w-full sm:w-auto flex-shrink-0">
            <UserPlus className="h-4 w-4 mr-2" />
            Invite Member
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

      <Tabs defaultValue="members" className="space-y-4">
        <TabsList>
          <TabsTrigger value="members">
            <Users className="h-4 w-4 mr-2" />
            Members ({members.length})
          </TabsTrigger>
          <TabsTrigger value="invitations">
            <Mail className="h-4 w-4 mr-2" />
            Pending Invitations ({pendingInvitations.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Team Members</CardTitle>
                    <CardDescription>
                      Manage your team members and their roles
                    </CardDescription>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search members..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 w-full"
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                      <SelectTrigger className="w-full sm:w-40">
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
                      <SelectTrigger className="w-full sm:w-40">
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
            <CardContent>
              <div className="space-y-4">
                {filteredMembers.map((member) => (
                  <div key={member._id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg gap-4">
                    <div className="flex items-center space-x-4 flex-1 min-w-0 w-full sm:w-auto">
                      <GravatarAvatar 
                        user={{
                          firstName: member.firstName,
                          lastName: member.lastName,
                          email: member.email
                        }}
                        className="flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 flex-wrap">
                          <h3 className="font-medium text-sm sm:text-base truncate">{member.firstName} {member.lastName}</h3>
                          {member.isActive ? (
                            <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-xs sm:text-sm text-muted-foreground truncate">{member.email}</p>
                        <div className="flex items-center space-x-2 mt-1 flex-wrap gap-2">
                          <Badge className={getRoleColor(member.role) + ' flex-shrink-0'}>
                            {member.role.replace('_', ' ')}
                          </Badge>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            Joined {new Date(member.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 w-full sm:w-auto flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingMember(member)}
                        className="flex-1 sm:flex-initial"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemoveMember(member._id)}
                        disabled={member.role === 'admin'}
                        className="flex-1 sm:flex-initial"
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invitations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending Invitations</CardTitle>
              <CardDescription>
                Invitations that are waiting to be accepted
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {pendingInvitations.map((invitation) => (
                  <div key={invitation._id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg gap-4">
                    <div className="flex items-center space-x-4 flex-1 min-w-0 w-full sm:w-auto">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <Mail className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm sm:text-base truncate">{invitation.email}</h3>
                        <p className="text-xs sm:text-sm text-muted-foreground truncate">
                          Invited by {invitation.invitedBy.firstName} {invitation.invitedBy.lastName}
                        </p>
                        <div className="flex items-center space-x-2 mt-1 flex-wrap gap-2">
                          <Badge className={getRoleColor(invitation.role) + ' flex-shrink-0'}>
                            {invitation.role.replace('_', ' ')}
                          </Badge>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 w-full sm:w-auto flex-shrink-0">
                      <Clock className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                      <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">Pending</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCancelInvitation(invitation._id)}
                        className="text-destructive hover:text-destructive flex-1 sm:flex-initial sm:ml-2"
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ))}
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
