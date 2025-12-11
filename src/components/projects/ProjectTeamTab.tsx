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
  MoreHorizontal,
  DollarSign,
  Edit2,
  Check,
  Info
} from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { PermissionGate } from '@/lib/permissions'
import { Permission } from '@/lib/permissions/permission-definitions'
import { usePermissions } from '@/lib/permissions/permission-context'
import { formatCurrency } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface TeamMember {
  _id: string
  firstName: string
  lastName: string
  email: string
  avatar?: string
  role?: string
  hourlyRate?: number
  projectHourlyRate?: number
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
    budget?: {
      currency?: string
    }
  } | null
  onUpdate: () => void
}

export function ProjectTeamTab({ projectId, project, onUpdate }: ProjectTeamTabProps) {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [projectRoles, setProjectRoles] = useState<ProjectRole[]>([])
  const [availableMembers, setAvailableMembers] = useState<TeamMember[]>([])
  const [organizationRoles, setOrganizationRoles] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [memberSearchQuery, setMemberSearchQuery] = useState('')
  const [showAddMember, setShowAddMember] = useState(false)
  const [selectedMemberId, setSelectedMemberId] = useState<string>('')
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [projectBudget, setProjectBudget] = useState<{ defaultHourlyRate?: number } | null>(null)
  const [editingRate, setEditingRate] = useState<string | null>(null)
  const [tempRate, setTempRate] = useState<string>('')

  const pageRef = useRef<HTMLDivElement | null>(null)
  const addMemberSectionRef = useRef<HTMLDivElement | null>(null)
  const { hasPermission } = usePermissions()
  const canManageOrgRoles = hasPermission(Permission.USER_MANAGE_ROLES)
  const canManageBudget = hasPermission(Permission.BUDGET_HANDLING)

  const scrollToAddMemberSection = () => {
    if (addMemberSectionRef.current) {
      addMemberSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  useEffect(() => {
    fetchTeamData()
  }, [projectId])

  // Load organization/system roles for inline role selection
  useEffect(() => {
    const loadRoles = async () => {
      try {
        const res = await fetch('/api/roles')
        const data = await res.json()
        if (data.success && Array.isArray(data.data)) {
          const allRoles = data.data.map((role: any) => ({
            id: role._id,
            name: role.name,
          }))
          setOrganizationRoles(allRoles)
        }
      } catch (err) {
        console.error('Failed to load organization roles for project team', err)
      }
    }

    loadRoles()
  }, [])

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
        setProjectBudget(data.data.budget || null)
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
    if (!selectedMemberId || !selectedMember) {
      setError('Please select a member to add')
      return
    }

    // Auto-determine project role based on member's organization role
    const autoProjectRole = getProjectRoleFromOrganizationRole(selectedMember.role)

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
          role: autoProjectRole
        })
      })

      const data = await response.json()

      if (data.success) {
        setSuccess('Team member added successfully')
        setShowAddMember(false)
        setSelectedMemberId('')
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

  const handleUpdateRate = async (memberId: string, rate: string) => {
    try {
      setError('')
      const response = await fetch(`/api/projects/${projectId}/team`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          memberId,
          hourlyRate: rate !== '' ? Number(rate) : null
        })
      })

      const data = await response.json()

      if (data.success) {
        setSuccess('Member rate updated successfully')
        setEditingRate(null)
        fetchTeamData()
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(data.error || 'Failed to update member rate')
      }
    } catch (err) {
      setError('Failed to update member rate')
    }
  }

  // Inline update of a member's organization role, reflected in users/members collection
  const handleInlineOrgRoleChange = async (memberId: string, newRole: string) => {
    if (!memberId || !newRole) return

    try {
      setError('')
      const response = await fetch('/api/members', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          memberId,
          updates: { role: newRole },
        }),
      })

      const data = await response.json()

      if (data.success) {
        setSuccess('Member role updated successfully')
        // Refresh team so project roles and org roles are in sync
        fetchTeamData()
        onUpdate()
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(data.error || 'Failed to update member role')
      }
    } catch (err) {
      console.error('Failed to update member role from project team tab', err)
      setError('Failed to update member role')
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
      'project_manager': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900',
      'project_member': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900',
      'project_viewer': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900',
      'project_client': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900',
      'project_account_manager': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 hover:bg-orange-100 dark:hover:bg-orange-900',
      'project_qa_lead': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900',
      'project_tester': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-900'
    }
    return colorMap[role] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
  }

  // Helper function to format organization role for display in title case
  const formatOrganizationRole = (role?: string) => {
    if (!role) return 'No Role'

    // Normalize role to lowercase for consistent matching
    const normalizedRole = role.toLowerCase().trim()

    const roleMap: Record<string, string> = {
      'admin': 'Admin',
      'project_manager': 'Project Manager',
      'team_member': 'Team Member',
      'member': 'Team Member', // Handle 'member' as alias for 'team_member'
      'client': 'Client',
      'viewer': 'Viewer'
    }

    // Check exact match first
    if (roleMap[normalizedRole]) {
      return roleMap[normalizedRole]
    }

    // Fallback: Convert snake_case or kebab-case to Title Case
    return normalizedRole
      .split(/[_\s-]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  // Helper function to get organization role color
  const getOrganizationRoleColor = (role?: string) => {
    if (!role) return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900'
      case 'project_manager': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900'
      case 'team_member': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900'
      case 'client': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900'
      case 'viewer': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
    }
  }

  // Map organization role to project role
  const getProjectRoleFromOrganizationRole = (orgRole?: string): string => {
    if (!orgRole) return 'project_viewer'

    const roleMap: Record<string, string> = {
      'admin': 'project_manager',
      'project_manager': 'project_manager',
      'team_member': 'project_viewer',
      'client': 'project_viewer',
      'viewer': 'project_viewer'
    }

    return roleMap[orgRole] || 'project_viewer'
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

  const projectCurrency = project?.budget?.currency || 'USD'

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
            <div className="flex items-center space-x-4 p-4 border rounded-lg bg-card hover:bg-accent/5 transition-colors">
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
              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-none">
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
                const organizationRole = memberData.role || member.role

                // Rate data (will only be present if user has permission)
                const hourlyRate = member.projectHourlyRate ?? member.hourlyRate
                const isProjectSpecificRate = member.projectHourlyRate !== undefined

                const memberRole = getMemberRole(memberId)
                const isEditingThisMember = editingRate === memberId

                return (
                  <div
                    key={memberId}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg hover:border-primary/20 hover:bg-accent/5 transition-all gap-4"
                  >
                    <div className="flex items-center space-x-4">
                      <GravatarAvatar
                        user={{
                          avatar: avatar,
                          firstName: firstName,
                          lastName: lastName,
                          email: email
                        }}
                        size={48}
                        className="h-12 w-12 flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {firstName} {lastName}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">{email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap justify-end">
                      {/* Hourly Rate - Only visible with permission */}
                      {canManageBudget && (
                        <div className="flex items-center gap-2">
                          {isEditingThisMember ? (
                            <div className="w-24">
                              <Input
                                type="number"
                                value={tempRate}
                                onChange={(e) => setTempRate(e.target.value)}
                                className="h-8 text-sm text-right"
                                placeholder={(member.hourlyRate ?? projectBudget?.defaultHourlyRate)?.toString() || "0.00"}
                                min="0"
                                step="0.01"
                                autoFocus
                                onBlur={() => handleUpdateRate(memberId, tempRate)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.currentTarget.blur()
                                  }
                                  if (e.key === 'Escape') {
                                    setEditingRate(null)
                                  }
                                }}
                              />
                            </div>
                          ) : (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div
                                    className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer hover:bg-muted ${isProjectSpecificRate ? 'text-primary font-medium' : 'text-muted-foreground'}`}
                                    onClick={() => {
                                      setEditingRate(memberId)
                                      setTempRate(member.projectHourlyRate?.toString() ?? '')
                                    }}
                                  >
                                    <DollarSign className="h-3.5 w-3.5 opacity-70" />
                                    <span className="text-sm">
                                      {hourlyRate ? formatCurrency(hourlyRate, projectCurrency) : (projectBudget?.defaultHourlyRate ? formatCurrency(projectBudget.defaultHourlyRate, projectCurrency) : 'Set rate')}
                                    </span>
                                    <span className="text-xs text-muted-foreground">/hr</span>
                                    {isProjectSpecificRate && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-primary ml-1" />
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {isProjectSpecificRate
                                    ? 'Project-specific rate override active'
                                    : (hourlyRate ? 'Default user rate' : (projectBudget?.defaultHourlyRate ? 'Project default rate' : 'Click to set rate'))}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      )}

                      {/* Organization role badge (read-only) */}
                      {organizationRole && (
                        <Badge className={`${getOrganizationRoleColor(organizationRole)} border-none`}>
                          {formatOrganizationRole(organizationRole)}
                        </Badge>
                      )}

                      <PermissionGate permission={Permission.PROJECT_MANAGE_TEAM} projectId={projectId}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canManageBudget && (
                              <DropdownMenuItem onClick={() => {
                                setEditingRate(memberId)
                                setTempRate(hourlyRate ? hourlyRate.toString() : '')
                              }}>
                                <Edit2 className="h-4 w-4 mr-2" />
                                Edit Hourly Rate
                              </DropdownMenuItem>
                            )}
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

              {/* Selected Member Preview */}
              {selectedMember && (
                <>
                  <div className="space-y-2 p-4 border rounded-lg bg-muted/50">
                    <label className="text-sm font-medium">Selected Member</label>
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-foreground">
                          {selectedMember.firstName} {selectedMember.lastName}
                        </p>
                        <p className="text-sm text-muted-foreground">{selectedMember.email}</p>
                      </div>
                      <Badge className={getOrganizationRoleColor(selectedMember.role)}>
                        {formatOrganizationRole(selectedMember.role)}
                      </Badge>
                    </div>
                  </div>

                  {/* Project Role Preview */}
                  <div className="space-y-2 p-4 border rounded-lg bg-muted/30">
                    <label className="text-sm font-medium">Project Role (Auto-assigned)</label>
                    <div className="flex items-center">
                      <Badge className={getRoleColor(getProjectRoleFromOrganizationRole(selectedMember.role))}>
                        {getRoleDisplayName(getProjectRoleFromOrganizationRole(selectedMember.role))}
                      </Badge>
                      <p className="text-xs text-muted-foreground ml-3">
                        Based on organization role: {formatOrganizationRole(selectedMember.role)}
                      </p>
                    </div>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddMember(false)
                    setSelectedMemberId('')
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

