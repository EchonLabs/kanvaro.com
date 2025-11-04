'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { 
  Users, 
  UserPlus, 
  Trash2, 
  Loader2,
  AlertTriangle,
  X,
  MoreHorizontal
} from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { PermissionGate } from '@/lib/permissions'
import { Permission } from '@/lib/permissions/permission-definitions'

interface TeamMember {
  _id: string
  firstName: string
  lastName: string
  email: string
  avatar?: string
  role?: string
}

interface ProjectRole {
  user: TeamMember
  role: string
  assignedBy: string
  assignedAt: string
}

interface ProjectTeamTabProps {
  projectId: string
  project: {
    _id: string
    createdBy: {
      firstName: string
      lastName: string
      email: string
    }
    client?: {
      firstName: string
      lastName: string
      email: string
    }
  } | null
  onUpdate: () => void
}

export function ProjectTeamTab({ projectId, project, onUpdate }: ProjectTeamTabProps) {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [projectRoles, setProjectRoles] = useState<ProjectRole[]>([])
  const [availableMembers, setAvailableMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [memberSearchQuery, setMemberSearchQuery] = useState('')
  const [showAddMember, setShowAddMember] = useState(false)
  const [selectedMemberId, setSelectedMemberId] = useState<string>('')
  const [selectedRole, setSelectedRole] = useState<string>('project_member')
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  useEffect(() => {
    fetchTeamData()
  }, [projectId])

  const fetchTeamData = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await fetch(`/api/projects/${projectId}/team`)
      const data = await response.json()

      if (data.success) {
        console.log('Team data received:', data.data)
        console.log('Team members:', data.data.teamMembers)
        setTeamMembers(data.data.teamMembers || [])
        setProjectRoles(data.data.projectRoles || [])
        setAvailableMembers(data.data.availableMembers || [])
      } else {
        setError(data.error || 'Failed to fetch team data')
      }
    } catch (err) {
      setError('Failed to fetch team data')
    } finally {
      setLoading(false)
    }
  }

  const handleAddMember = async () => {
    if (!selectedMemberId) {
      setError('Please select a member to add')
      return
    }

    try {
      setIsAdding(true)
      setError('')
      
      const response = await fetch(`/api/projects/${projectId}/team`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          memberId: selectedMemberId,
          role: selectedRole
        })
      })

      const data = await response.json()

      if (data.success) {
        setSuccess('Team member added successfully')
        setShowAddMember(false)
        setSelectedMemberId('')
        setSelectedRole('project_member')
        fetchTeamData()
        onUpdate()
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(data.error || 'Failed to add team member')
      }
    } catch (err) {
      setError('Failed to add team member')
    } finally {
      setIsAdding(false)
    }
  }

  const handleRemoveMember = async () => {
    if (!memberToRemove) return

    try {
      setIsRemoving(true)
      setError('')
      
      const response = await fetch(`/api/projects/${projectId}/team?memberId=${memberToRemove}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        setSuccess('Team member removed successfully')
        setShowRemoveConfirm(false)
        setMemberToRemove(null)
        fetchTeamData()
        onUpdate()
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(data.error || 'Failed to remove team member')
      }
    } catch (err) {
      setError('Failed to remove team member')
    } finally {
      setIsRemoving(false)
    }
  }

  const getMemberRole = (memberId: string) => {
    const role = projectRoles.find(r => {
      const user = r.user as any
      const userId = user._doc?._id || user._id
      return userId === memberId || userId?.toString() === memberId?.toString()
    })
    return role?.role || 'project_member'
  }

  const getRoleDisplayName = (role: string) => {
    const roleMap: Record<string, string> = {
      'project_manager': 'Project Manager',
      'project_member': 'Member',
      'project_viewer': 'Viewer',
      'project_client': 'Client',
      'project_account_manager': 'Account Manager',
      'project_qa_lead': 'QA Lead',
      'project_tester': 'Tester'
    }
    return roleMap[role] || role
  }

  const getRoleColor = (role: string) => {
    const colorMap: Record<string, string> = {
      'project_manager': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      'project_member': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      'project_viewer': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
      'project_client': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      'project_account_manager': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      'project_qa_lead': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      'project_tester': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200'
    }
    return colorMap[role] || 'bg-gray-100 text-gray-800'
  }

  const filteredAvailableMembers = memberSearchQuery.trim() === '' 
    ? [] 
    : availableMembers.filter(member =>
        `${member.firstName} ${member.lastName}`.toLowerCase().includes(memberSearchQuery.toLowerCase()) ||
        member.email.toLowerCase().includes(memberSearchQuery.toLowerCase())
      )
  
  const selectedMember = availableMembers.find(m => m._id === selectedMemberId)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading team...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert variant="default">
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Team Members</h2>
          <p className="text-sm text-muted-foreground">
            Manage project team members and their roles
          </p>
        </div>
        <PermissionGate permission={Permission.PROJECT_MANAGE_TEAM} projectId={projectId}>
          <Button onClick={() => setShowAddMember(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Add Member
          </Button>
        </PermissionGate>
      </div>

      {/* Project Creator */}
      {project && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Project Creator</CardTitle>
            <CardDescription>The user who created this project</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-4 p-4 border rounded-lg">
              <GravatarAvatar
                user={{
                  firstName: project.createdBy.firstName,
                  lastName: project.createdBy.lastName,
                  email: project.createdBy.email
                }}
                size={48}
                className="h-12 w-12"
              />
              <div className="flex-1">
                <p className="font-medium text-foreground">
                  {project.createdBy.firstName} {project.createdBy.lastName}
                </p>
                <p className="text-sm text-muted-foreground">{project.createdBy.email}</p>
              </div>
              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                Creator
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Team Members List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Team Members</CardTitle>
          <CardDescription>
            {teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''} in the project
          </CardDescription>
        </CardHeader>
        <CardContent>
          {teamMembers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No team members yet</p>
              <PermissionGate permission={Permission.PROJECT_MANAGE_TEAM} projectId={projectId}>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => setShowAddMember(true)}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add First Member
                </Button>
              </PermissionGate>
            </div>
          ) : (
            <div className="space-y-3">
              {teamMembers.map((member: any) => {
                // Handle Mongoose document structure - data might be in _doc or directly on member
                const memberData = member._doc || member
                const memberId = memberData._id || member._id
                const firstName = memberData.firstName || member.firstName || ''
                const lastName = memberData.lastName || member.lastName || ''
                const email = memberData.email || member.email || ''
                const avatar = memberData.avatar || member.avatar
                
                console.log('Rendering team member:', member)
                console.log('Member data:', memberData)
                console.log('Member firstName:', firstName)
                console.log('Member lastName:', lastName)
                console.log('Member email:', email)
                
                const memberRole = getMemberRole(memberId)
                
                return (
                  <div
                    key={memberId}
                    className="flex items-center space-x-4 p-4 border rounded-lg"
                  >
                    <GravatarAvatar
                      user={{
                        avatar: avatar,
                        firstName: firstName,
                        lastName: lastName,
                        email: email
                      }}
                      size={48}
                      className="h-12 w-12"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-foreground">
                        {firstName} {lastName}
                      </p>
                      <p className="text-sm text-muted-foreground">{email}</p>
                    </div>
                    <Badge className={getRoleColor(memberRole)}>
                      {getRoleDisplayName(memberRole)}
                    </Badge>
                    <PermissionGate permission={Permission.PROJECT_MANAGE_TEAM} projectId={projectId}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setMemberToRemove(memberId)
                              setShowRemoveConfirm(true)
                            }}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove from Team
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </PermissionGate>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Member Dialog */}
      {showAddMember && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Add Team Member</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowAddMember(false)
                  setSelectedMemberId('')
                  setSelectedRole('project_member')
                  setMemberSearchQuery('')
                  setError('')
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <CardDescription>Select a member from your organization to add to the project</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Member</label>
              <div className="mt-1 border rounded-md p-2">
                <Input
                  value={memberSearchQuery}
                  onChange={e => setMemberSearchQuery(e.target.value)}
                  placeholder={selectedMember ? `${selectedMember.firstName} ${selectedMember.lastName}` : 'Type to search team members'}
                  className="mb-2"
                />
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {memberSearchQuery.trim() === '' ? null : (
                    filteredAvailableMembers.length === 0 ? (
                      <div className="text-sm text-muted-foreground p-2">No matching members</div>
                    ) : (
                      filteredAvailableMembers.map(member => (
                        <button
                          type="button"
                          key={member._id}
                          className="w-full text-left p-1 rounded hover:bg-accent"
                          onClick={() => {
                            setSelectedMemberId(member._id)
                            setMemberSearchQuery('') // Clear search after selection
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm">
                              {member.firstName} {member.lastName} 
                              <span className="text-muted-foreground"> ({member.email})</span>
                            </span>
                            {selectedMemberId === member._id && (
                              <span className="text-xs text-muted-foreground">Selected</span>
                            )}
                          </div>
                        </button>
                      ))
                    )
                  )}
                </div>
                {selectedMember && (
                  <div className="mt-2">
                    <span className="inline-flex items-center text-xs bg-muted px-2 py-1 rounded">
                      <span className="mr-2">{selectedMember.firstName} {selectedMember.lastName}</span>
                      <button
                        type="button"
                        aria-label="Clear selection"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setSelectedMemberId('')
                          setMemberSearchQuery('')
                        }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Project Role</label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="project_member">Member</SelectItem>
                  <SelectItem value="project_manager">Project Manager</SelectItem>
                  <SelectItem value="project_viewer">Viewer</SelectItem>
                  <SelectItem value="project_qa_lead">QA Lead</SelectItem>
                  <SelectItem value="project_tester">Tester</SelectItem>
                  <SelectItem value="project_account_manager">Account Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddMember(false)
                  setSelectedMemberId('')
                  setSelectedRole('project_member')
                  setMemberSearchQuery('')
                  setError('')
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleAddMember} disabled={isAdding || !selectedMemberId}>
                {isAdding ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add Member
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Remove Confirmation Modal */}
      <ConfirmationModal
        isOpen={showRemoveConfirm}
        onClose={() => {
          setShowRemoveConfirm(false)
          setMemberToRemove(null)
        }}
        onConfirm={handleRemoveMember}
        title="Remove Team Member"
        description={`Are you sure you want to remove this member from the project team? They will lose access to this project.`}
        confirmText="Remove"
        cancelText="Cancel"
        variant="destructive"
        isLoading={isRemoving}
      />
    </div>
  )
}

