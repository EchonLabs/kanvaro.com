'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useNotify } from '@/lib/notify'
import { validateSprintDates } from '@/lib/sprintDateValidation'
import { Badge } from '@/components/ui/Badge'
import {
  ArrowLeft,
  Save,
  Loader2,
  AlertTriangle,
  Zap,
  X
} from 'lucide-react'

interface Project {
  _id: string
  name: string
}

interface User {
  _id: string
  firstName: string
  lastName: string
  email: string
  isActive?: boolean
}

export default function CreateSprintPage() {
  const router = useRouter()
  const { success: notifySuccess, error: notifyError } = useNotify()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [authError, setAuthError] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [teamMemberQuery, setTeamMemberQuery] = useState('')
  const [membersLoading, setMembersLoading] = useState(false)
  const [selectedProject, setSelectedProject] = useState<any>(null)
  const [projectQuery, setProjectQuery] = useState("")
  const [startDateError, setStartDateError] = useState('')
  const [endDateError, setEndDateError] = useState('')

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    project: '',
    startDate: '',
    endDate: '',
    goal: '',
    capacity: '',
    teamMembers: [] as string[]
  })

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')

      if (response.ok) {
        setAuthError('')
        await Promise.all([fetchProjects(), fetchUsers()])
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })

        if (refreshResponse.ok) {
          setAuthError('')
          await Promise.all([fetchProjects(), fetchUsers()])
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

  // Remove the old global sprint count logic

  // Auto-generate sprint name based on selected project
  const generateSprintName = async (projectId: string) => {
    if (!projectId) return

    try {
      const response = await fetch(`/api/sprints?project=${projectId}&countOnly=true`)
      const data = await response.json()

      if (data.success && typeof data.count === 'number') {
        const nextSprintNumber = data.count + 1
        setFormData(prev => ({
          ...prev,
          name: `Sprint ${nextSprintNumber}`
        }))
      }
    } catch (err) {
      console.error('Failed to fetch project sprint count:', err)
      // Fallback to generic name
      setFormData(prev => ({
        ...prev,
        name: 'Sprint 1'
      }))
    }
  }

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects')
      const data = await response.json()

      if (data.success && Array.isArray(data.data)) {
        setProjects(data.data)
      } else {
        setProjects([])
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err)
      setProjects([])
    }
  }

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/members?limit=10000&page=1')
      const data = await response.json()

      if (data.success && Array.isArray(data.data?.members)) {
        setUsers(
          data.data.members.map((member: any) => ({
            _id: member._id,
            firstName: member.firstName || '',
            lastName: member.lastName || '',
            email: member.email || '',
            isActive: member.isActive !== false
          }))
        )
      } else {
        setUsers([])
      }
    } catch (err) {
      console.error('Failed to fetch users:', err)
      setUsers([])
    }
  }

  const fetchProjectDetails = async (projectId: string) => {
    try {
      setMembersLoading(true)
      // Fetch both project data and all members
      const [projectResponse, membersResponse] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch('/api/members')
      ])

      if (projectResponse.ok && membersResponse.ok) {
        const [projectData, membersData] = await Promise.all([
          projectResponse.json(),
          membersResponse.json()
        ])

        if (projectData.success && projectData.data) {
          setSelectedProject(projectData.data)

          const directoryMembers =
            membersData.success && Array.isArray(membersData.data?.members)
              ? membersData.data.members
              : []
          const directoryMap = new Map<string, any>()
          directoryMembers.forEach((member: any) => {
            if (member?._id) directoryMap.set(member._id, member)
          })

          const collectMemberId = (entry: any): string | null => {
            if (!entry) return null
            if (typeof entry === 'string') return entry
            if (entry.memberId) return collectMemberId(entry.memberId)
            if (typeof entry === 'object') {
              if (entry._id && (entry.firstName || entry.lastName || entry.email)) return entry._id
              if (typeof entry._id === 'string' && entry._id.length === 24 && !entry.memberId) {
                return entry._id
              }
            }
            return null
          }

          const normalizeMember = (raw: any): User | null => {
            if (!raw) return null
            if (typeof raw === 'string') {
              const fromDirectory = directoryMap.get(raw)
              if (fromDirectory) return normalizeMember(fromDirectory)
              return {
                _id: raw,
                firstName: 'Unknown',
                lastName: '',
                email: '',
                isActive: true
              }
            }
            if (raw.memberId) return normalizeMember(raw.memberId)
            if (!raw._id) return null
            return {
              _id: raw._id,
              firstName: raw.firstName || '',
              lastName: raw.lastName || '',
              email: raw.email || '',
              isActive: raw.isActive !== false
            }
          }

          const normalizedMembersMap = new Map<string, User>()
          const addMember = (entry: any) => {
            const normalized = normalizeMember(entry)
            if (normalized) normalizedMembersMap.set(normalized._id, normalized)
          }

          const teamMembers = projectData.data.teamMembers || []
          const projectMembers = projectData.data.members || []

          teamMembers.forEach((member: any) => addMember(member))
          projectMembers.forEach((member: any) => addMember(member))

          if (normalizedMembersMap.size === 0 && directoryMap.size > 0) {
            const projectMemberIds = new Set<string>()
            teamMembers.forEach((member: any) => {
              const id = collectMemberId(member)
              if (id) projectMemberIds.add(id)
            })
            projectMembers.forEach((member: any) => {
              const id = collectMemberId(member)
              if (id) projectMemberIds.add(id)
            })
            projectMemberIds.forEach((memberId) => {
              const directoryEntry = directoryMap.get(memberId)
              if (directoryEntry) addMember(directoryEntry)
            })
          }

          setUsers(Array.from(normalizedMembersMap.values()))

          // Clear date errors when project changes and re-validate if dates exist
          setStartDateError('')
          setEndDateError('')
          if (formData.startDate || formData.endDate) {
            runDateValidation(formData.startDate, formData.endDate, projectData.data, false)
          }
        } else {
          setSelectedProject(null)
          setUsers([])
        }
      } else {
        setSelectedProject(null)
        setUsers([])
      }
    } catch (err) {
      console.error('Failed to fetch project details:', err)
      setSelectedProject(null)
      setUsers([])
    } finally {
      setMembersLoading(false)
    }
  }

  const runDateValidation = (
    startDate: string,
    endDate: string,
    project: any,
    requireBoth = false
  ) => {
    const result = validateSprintDates({
      startDate,
      endDate,
      projectStart: project?.startDate,
      projectEnd: project?.endDate,
      requireBoth
    })
    setStartDateError(result.startError)
    setEndDateError(result.endError)
    return result.isValid
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setStartDateError('')
    setEndDateError('')

    // Validate dates before submission
    if (!selectedProject) {
      setError('Please select a project')
      notifyError({ title: 'Please select a project' })
      setLoading(false)
      return
    }

    const datesAreValid = runDateValidation(
      formData.startDate,
      formData.endDate,
      selectedProject,
      true
    )

    if (!datesAreValid) {
      notifyError({ title: 'Please fix the start and end date errors before submitting.' })
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/sprints', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          capacity: formData.capacity ? parseInt(formData.capacity) : 0,
          teamMembers: formData.teamMembers
        })
      })

      const data = await response.json()

      if (data.success) {
        notifySuccess({ title: 'Sprint created successfully' })
        router.push('/sprints?success=sprint-created')
      } else {
        setError(data.error || 'Failed to create sprint')
        notifyError({ title: data.error || 'Failed to create sprint' })
      }
    } catch (err) {
      setError('Failed to create sprint')
      notifyError({ title: 'Failed to create sprint' })
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: string, value: string | string[]) => {
    setFormData(prev => {
      const newData = {
        ...prev,
        [field]: value
      }

      // If project is changed, fetch project details and filter team members
      if (field === 'project' && typeof value === 'string') {
        if (value) {
          fetchProjectDetails(value)
          // Generate sprint name based on project
          generateSprintName(value)
        } else {
          setSelectedProject(null)
          setUsers([]) // Clear users when no project selected
          setMembersLoading(false)
        }
        // Clear team members selection when project changes
        newData.teamMembers = []
        // Clear dates when project changes
        newData.startDate = ''
        newData.endDate = ''
        setStartDateError('')
        setEndDateError('')
        setTeamMemberQuery('')
      }

      // Validate dates when they change
      if (field === 'startDate' || field === 'endDate') {
        const nextStart = field === 'startDate' ? (value as string) : prev.startDate
        const nextEnd = field === 'endDate' ? (value as string) : prev.endDate
        if (selectedProject && (nextStart || nextEnd)) {
          runDateValidation(nextStart, nextEnd, selectedProject, false)
        } else {
          setStartDateError('')
          setEndDateError('')
        }
      }

      return newData
    })
  }

  const handleTeamMemberToggle = (userId: string) => {
    setFormData(prev => ({
      ...prev,
      teamMembers: prev.teamMembers.includes(userId)
        ? prev.teamMembers.filter(id => id !== userId)
        : [...prev.teamMembers, userId]
    }))
  }

  // Check if all required fields are filled
  const isFormValid = () => {
    return formData.name.trim() !== '' &&
      formData.project !== '' &&
      formData.startDate !== '' &&
      formData.endDate !== ''
  }

  const activeUsers = useMemo(() => users.filter((user) => user.isActive !== false), [users])

  const memberLookup = useMemo(() => {
    return users.reduce<Record<string, User>>((acc, user) => {
      acc[user._id] = user
      return acc
    }, {})
  }, [users])

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
      <div className="space-y-8 sm:space-y-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Button variant="ghost" onClick={() => router.push('/sprints')} className="w-full sm:w-auto">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground flex items-center space-x-2">
              <Zap className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 text-blue-600 flex-shrink-0" />
              <span className="truncate">Create New Sprint</span>
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">Create a new sprint for your project</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sprint Details</CardTitle>
            <CardDescription>Fill in the details for your new sprint</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-foreground">Project *</label>
                    <Select
                      value={formData.project}
                      onValueChange={(value) => handleChange('project', value)}
                      onOpenChange={open => { if (open) setProjectQuery(""); }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a project" />
                      </SelectTrigger>
                      <SelectContent className="z-[10050] p-0">
                        <div className="p-2">
                          <Input
                            value={projectQuery}
                            onChange={e => setProjectQuery(e.target.value)}
                            placeholder="Type to search projects"
                            className="mb-2 w-full"
                          />
                          {projects.filter(p => !projectQuery.trim() || p.name.toLowerCase().includes(projectQuery.toLowerCase())).map((project) => (
                            <SelectItem key={project._id} value={project._id} title={project.name}>
                              <div className="truncate max-w-xs" title={project.name}>
                                {project.name}
                              </div>
                            </SelectItem>
                          ))}
                          {projects.filter(p => !projectQuery.trim() || p.name.toLowerCase().includes(projectQuery.toLowerCase())).length === 0 && (
                            <div className="px-2 py-1 text-sm text-muted-foreground">No matching projects</div>
                          )}
                        </div>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground">Name *</label>
                    <Input
                      value={formData.name}
                      onChange={(e) => handleChange('name', e.target.value)}
                      placeholder="Enter sprint name"
                      required
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground">Start Date *</label>
                    {selectedProject?.startDate && selectedProject?.endDate && (
                      <div className="mb-2 p-2 bg-muted/50 rounded-md border border-muted">
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium">Project Duration:</span>{' '}
                          {new Date(selectedProject.startDate).toLocaleDateString()} to{' '}
                          {new Date(selectedProject.endDate).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Sprint dates must be within this range and cannot be in the past.
                        </p>
                      </div>
                    )}
                    <Input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => handleChange('startDate', e.target.value)}
                      min={
                        selectedProject?.startDate
                          ? new Date(
                              Math.max(
                                new Date(selectedProject.startDate).getTime(),
                                new Date().setHours(0, 0, 0, 0)
                              )
                            )
                            .toISOString()
                            .split('T')[0]
                          : new Date().toISOString().split('T')[0]
                      }
                      max={
                        selectedProject?.endDate
                          ? new Date(selectedProject.endDate).toISOString().split('T')[0]
                          : undefined
                      }
                      required
                      className={`w-full ${startDateError ? 'border-destructive' : ''}`}
                      disabled={!formData.project}
                    />
                    {!formData.project && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Please select a project first to set sprint dates
                      </p>
                    )}
                    {startDateError && (
                      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                        {startDateError}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground">End Date *</label>
                    <Input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => handleChange('endDate', e.target.value)}
                      min={
                        selectedProject?.startDate || formData.startDate
                          ? new Date(
                              Math.max(
                                selectedProject?.startDate
                                  ? new Date(selectedProject.startDate).getTime()
                                  : 0,
                                formData.startDate ? new Date(formData.startDate).getTime() : 0,
                                new Date().setHours(0, 0, 0, 0)
                              )
                            )
                            .toISOString()
                            .split('T')[0]
                          : new Date().toISOString().split('T')[0]
                      }
                      max={
                        selectedProject?.endDate
                          ? new Date(selectedProject.endDate).toISOString().split('T')[0]
                          : undefined
                      }
                      required
                      className={`w-full ${endDateError ? 'border-destructive' : ''}`}
                      disabled={!formData.project || !formData.startDate}
                    />
                    {!formData.project && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Please select a project first
                      </p>
                    )}
                    {!formData.startDate && formData.project && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Please select start date first
                      </p>
                    )}
                    {endDateError && (
                      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                        {endDateError}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-foreground">Capacity (hours)</label>
                    <Input
                      type="number"
                      value={formData.capacity}
                      onChange={(e) => handleChange('capacity', e.target.value)}
                      placeholder="Enter sprint capacity"
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground">Sprint Goal</label>
                    <Input
                      value={formData.goal}
                      onChange={(e) => handleChange('goal', e.target.value)}
                      placeholder="Enter sprint goal"
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <label className="text-sm font-medium text-foreground">Description</label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  placeholder="Enter sprint description"
                  rows={4}
                  className="w-full"
                />
              </div>

              {/* Add more space above Team Members */}
              <div className="mt-12 space-y-3">
                <label className="text-sm font-medium text-foreground">Team Members</label>
                {!formData.project ? (
                  <p className="text-xs sm:text-sm text-muted-foreground italic mt-6">
                    Please select a project to see available team members
                  </p>
                ) : (
                  <div className="space-y-3">
                    <Select
                      value=""
                      onValueChange={(value) => {
                        if (!formData.teamMembers.includes(value)) {
                          setFormData((prev) => ({
                            ...prev,
                            teamMembers: [...prev.teamMembers, value]
                          }))
                          setTeamMemberQuery('')
                        }
                      }}
                      onOpenChange={(open) => {
                        if (open) setTeamMemberQuery('')
                      }}
                      disabled={membersLoading || activeUsers.length === 0}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={
                            membersLoading
                              ? 'Loading team members...'
                              : activeUsers.length === 0
                                ? 'No active team members for this project'
                                : 'Search team members'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="z-[10050] p-0 w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)]">
                        <div className="p-2">
                          <div className="relative mb-2">
                            <Input
                              value={teamMemberQuery}
                              onChange={(e) => setTeamMemberQuery(e.target.value)}
                              onKeyDown={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                              placeholder={
                                membersLoading ? 'Loading members...' : 'Type to search team members'
                              }
                              className="pr-8"
                            />
                            {teamMemberQuery && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setTeamMemberQuery('')
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-sm p-0.5"
                                aria-label="Clear search"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                          <div className="max-h-56 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                            {membersLoading ? (
                              <div className="flex items-center space-x-2 text-sm text-muted-foreground p-2">
                                <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                                <span className="truncate">Loading members...</span>
                              </div>
                            ) : activeUsers.length === 0 ? (
                              <div className="px-2 py-1 text-sm text-muted-foreground">
                                No active team members found for this project
                              </div>
                            ) : (
                              (() => {
                                const query = teamMemberQuery.toLowerCase().trim()
                                const filteredMembers = activeUsers.filter((member) => {
                                  if (formData.teamMembers.includes(member._id)) return false
                                  if (!query) return true
                                  const fullName = `${member.firstName} ${member.lastName}`.toLowerCase()
                                  return (
                                    fullName.includes(query) ||
                                    (member.email ? member.email.toLowerCase().includes(query) : false)
                                  )
                                })

                                if (filteredMembers.length === 0) {
                                  return (
                                    <div className="px-2 py-1 text-sm text-muted-foreground">
                                      No matching members
                                    </div>
                                  )
                                }

                                return filteredMembers.map((member) => (
                                  <SelectItem
                                    key={member._id}
                                    value={member._id}
                                    disabled={formData.teamMembers.includes(member._id)}
                                    className={formData.teamMembers.includes(member._id) ? 'opacity-50 cursor-not-allowed' : ''}
                                  >
                                    <div className="flex items-center justify-between w-full min-w-0">
                                      <span className="truncate min-w-0">
                                        {member.firstName} {member.lastName}{' '}
                                        <span className="text-muted-foreground">({member.email})</span>
                                      </span>
                                    </div>
                                  </SelectItem>
                                ))
                              })()
                            )}
                          </div>
                        </div>
                      </SelectContent>
                    </Select>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Assigned members ({formData.teamMembers.length})
                        </p>
                        {formData.teamMembers.length > 4 && (
                          <span className="text-[10px] text-muted-foreground">Scroll to view all</span>
                        )}
                      </div>
                      {formData.teamMembers.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No members assigned yet.</p>
                      ) : (
                        <div className="max-h-40 overflow-y-auto rounded-md border border-dashed bg-muted/20 p-2">
                          <div className="flex flex-wrap gap-2">
                            {formData.teamMembers.map((memberId) => {
                              const member = memberLookup[memberId]
                              const memberLabel = member
                                ? `${member.firstName} ${member.lastName}`.trim() || member.email
                                : 'Member unavailable'
                              return (
                                <Badge
                                  key={memberId}
                                  variant="secondary"
                                  className="flex items-center gap-1 px-3 py-1 text-xs bg-background border"
                                  title={
                                    member
                                      ? `${member.firstName} ${member.lastName} (${member.email})`
                                      : undefined
                                  }
                                >
                                  <span className="truncate max-w-[150px]">{memberLabel}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleTeamMemberToggle(memberId)}
                                    className="ml-1 rounded-full p-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                  >
                                    <X className="h-3 w-3" />
                                    <span className="sr-only">Remove {memberLabel}</span>
                                  </button>
                                </Badge>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-4 pt-6 mt-8 border-t border-muted">
                <Button type="button" variant="outline" onClick={() => router.push('/sprints')} className="w-full sm:w-auto">
                  Cancel
                </Button>
                <Button type="submit" disabled={loading || !isFormValid()} className="w-full sm:w-auto">
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Create Sprint
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
