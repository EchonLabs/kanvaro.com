'use client'

import { useState, useEffect, useRef } from 'react'
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
  const pageRef = useRef<HTMLDivElement | null>(null)
  const addMemberSectionRef = useRef<HTMLDivElement | null>(null)

  const scrollToAddMemberSection = () => {
    if (addMemberSectionRef.current) {
      addMemberSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

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
        setShowRemoveConfirm(false)
        setMemberToRemove(null)
        setError(data.error || 'Failed to remove team member')
      }
    } catch (err) {
      setShowRemoveConfirm(false)
      setMemberToRemove(null)
      setError('Failed to remove team member')
    } finally {
      setIsRemoving(false)
    }
  }

  const getMemberRole = (memberId: string) => {
    // Normalize memberId for comparison
    const normalizedMemberId = memberId?.toString()
    
    // Find the role by matching user IDs in various formats
    const role = projectRoles.find(r => {
      if (!r || !r.user) return false
      
      const user = r.user as any
      // Handle various data structures: _doc, direct _id, or string
      const userId = user._doc?._id || user._id || user
      const normalizedUserId = userId?.toString()
      
      // Compare normalized IDs
      return normalizedUserId === normalizedMemberId
    })
    
    // Return the exact role as assigned, or default to 'project_member'
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

  const normalizedSearch = memberSearchQuery.trim().toLowerCase()
  const filteredAvailableMembers = availableMembers.filter(member => {
    if (!normalizedSearch) return true
    const fullName = `${member.firstName} ${member.lastName}`.toLowerCase()
    return fullName.includes(normalizedSearch) || member.email.toLowerCase().includes(normalizedSearch)
  })
  useEffect(() => {
    if (showAddMember) {
      scrollToAddMemberSection()
    }
  }, [showAddMember])

  useEffect(() => {
    if ((error || success) && pageRef.current) {
      pageRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [error, success])

  
  const selectedMember = availableMembers.find(m => m._id === selectedMemberId)

  const handleOpenAddMember = () => {
    if (showAddMember) {
      scrollToAddMemberSection()
    } else {
      setShowAddMember(true)
    }
  }

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
    <div ref={pageRef} className="space-y-6">
      {error && (
        <Alert variant="destructive" className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-1" />
            <AlertDescription>{error}</AlertDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => setError('')}
            aria-label="Dismiss error"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </Alert>
      )}

      {success && (
        <Alert variant="success" className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2">
            <AlertDescription>{success}</AlertDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => setSuccess('')}
            aria-label="Dismiss success"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
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
          <Button onClick={handleOpenAddMember}>
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
                  onClick={handleOpenAddMember}
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
        <div ref={addMemberSectionRef}>
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
              <Select
                value={selectedMemberId || ''}
                onValueChange={(value) => setSelectedMemberId(value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a team member" />
                </SelectTrigger>
                <SelectContent className="z-[10050] p-0">
                  <div className="p-2">
                    <Input
                      value={memberSearchQuery}
                      onChange={(e) => setMemberSearchQuery(e.target.value)}
                      placeholder="Type to search team members"
                      className="mb-2"
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                    <div className="max-h-56 overflow-y-auto">
                      {filteredAvailableMembers.length === 0 ? (
                        <div className="px-2 py-1 text-sm text-muted-foreground">
                          {normalizedSearch ? 'No matching members' : 'No members available'}
                        </div>
                      ) : (
                        filteredAvailableMembers.map((member) => (
                          <SelectItem key={member._id} value={member._id}>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">
                                {member.firstName} {member.lastName}
                              </span>
                              <span className="text-xs text-muted-foreground">{member.email}</span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </div>
                  </div>
                </SelectContent>
              </Select>
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
        </div>
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

