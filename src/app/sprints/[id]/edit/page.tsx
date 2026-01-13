'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/Badge'
import { Loader2, ArrowLeft, Users, X, AlertTriangle } from 'lucide-react'
import { useNotify } from '@/lib/notify'
import { validateSprintDates } from '@/lib/sprintDateValidation'

interface SprintForm {
  name: string
  description: string
  status: 'planning' | 'active' | 'completed' | 'cancelled'
  startDate: string
  endDate: string
  goal: string
  capacity: number | string
  velocity: number | string
}

interface TeamMember {
  _id: string
  firstName: string
  lastName: string
  email: string
  isActive?: boolean
}

interface Project {
  _id: string
  name: string
}

export default function EditSprintPage() {
  const router = useRouter()
  const params = useParams()
  const sprintId = params.id as string
  const { success: notifySuccess, error: notifyError } = useNotify()

  const [form, setForm] = useState<SprintForm>({
    name: '',
    description: '',
    status: 'planning',
    startDate: '',
    endDate: '',
    goal: '',
    capacity: '',
    velocity: ''
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [teamMembers, setTeamMembers] = useState<string[]>([])
  const [teamMemberQuery, setTeamMemberQuery] = useState('')
  const [initialTeamMembers, setInitialTeamMembers] = useState<string[] | null>(null)
  const [availableMembers, setAvailableMembers] = useState<TeamMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState('')
  const [calculatedVelocity, setCalculatedVelocity] = useState<number>(0)
  const [memberLookup, setMemberLookup] = useState<Record<string, TeamMember>>({})
  const [initialForm, setInitialForm] = useState<SprintForm | null>(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [projectId, setProjectId] = useState<string>('')
  const [initialProjectId, setInitialProjectId] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectQuery, setProjectQuery] = useState('')
  const [selectedProject, setSelectedProject] = useState<any>(null)
  const [startDateError, setStartDateError] = useState('')
  const [endDateError, setEndDateError] = useState('')
  const messageContainerRef = useRef<HTMLDivElement>(null)

  const storeMemberDetails = useCallback((members?: TeamMember[]) => {
    if (!Array.isArray(members) || members.length === 0) return
    setMemberLookup((prev) => {
      const next = { ...prev }
      members.forEach((member) => {
        if (member?._id) {
          next[member._id] = {
            _id: member._id,
            firstName: member.firstName,
            lastName: member.lastName,
            email: member.email,
            isActive: member.isActive !== false
          }
        }
      })
      return next
    })
  }, [])

  const fetchProjects = useCallback(async () => {
    try {
      const response = await fetch('/api/projects?limit=1000&page=1')
      if (response.ok) {
        const data = await response.json()
        if (data.success && Array.isArray(data.data)) {
          setProjects(data.data)
        }
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err)
    }
  }, [])

  const fetchProjectMembers = useCallback(async (projectId?: string) => {
    if (!projectId) {
      setAvailableMembers([])
      setSelectedProject(null)
      return
    }

    try {
      setMembersLoading(true)
      setMembersError('')
      const [projectResponse, membersResponse] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch('/api/members')
      ])

      const projectData = await projectResponse.json()
      const membersData = await membersResponse.json().catch(() => ({ success: false }))

      if (projectResponse.ok && projectData.success && projectData.data) {
        setSelectedProject(projectData.data)

        const directoryMembers =
          membersResponse.ok && membersData.success && Array.isArray(membersData.data?.members)
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
          if (entry._id) return entry._id
          return null
        }

        const normalizeMember = (raw: any): TeamMember | null => {
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

        const normalizedMembersMap = new Map<string, TeamMember>()
        const addMember = (entry: any) => {
          const normalized = normalizeMember(entry)
          if (normalized) normalizedMembersMap.set(normalized._id, normalized)
        }

        const projectTeamMembers = Array.isArray(projectData.data.teamMembers)
          ? projectData.data.teamMembers
          : []
        const projectMembersList = Array.isArray(projectData.data.members)
          ? projectData.data.members
          : []

        projectTeamMembers.forEach((member: any) => addMember(member))
        projectMembersList.forEach((member: any) => addMember(member))

        if (normalizedMembersMap.size === 0 && directoryMap.size > 0) {
          const projectMemberIds = new Set<string>()
          projectTeamMembers.forEach((member: any) => {
            const id = collectMemberId(member)
            if (id) projectMemberIds.add(id)
          })
          projectMembersList.forEach((member: any) => {
            const id = collectMemberId(member)
            if (id) projectMemberIds.add(id)
          })

          projectMemberIds.forEach((memberId) => {
            const directoryEntry = directoryMap.get(memberId)
            if (directoryEntry) addMember(directoryEntry)
          })
        }

        const normalizedMembers = Array.from(normalizedMembersMap.values())
        setAvailableMembers(normalizedMembers)
        storeMemberDetails(normalizedMembers)
      } else {
        setAvailableMembers([])
        setSelectedProject(null)
        setMembersError(projectData.error || 'Failed to load project team members')
      }
    } catch (err) {
      console.error('Failed to fetch project members:', err)
      setMembersError('Failed to load project team members')
      setAvailableMembers([])
      setSelectedProject(null)
    } finally {
      setMembersLoading(false)
    }
  }, [storeMemberDetails])

  // Shared sprint date validation
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

  const fetchSprint = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/sprints/${sprintId}`)
      const data = await res.json()
      if (res.ok && data.success) {
        const s = data.data
        
        // Calculate velocity from completed stories
        try {
          const storiesRes = await fetch(`/api/stories?sprintId=${sprintId}`)
          const storiesData = await storiesRes.json()
          if (storiesRes.ok && storiesData.success) {
            const completedStories = (storiesData.data || []).filter(
              (story: any) => story.status === 'completed'
            )
            const velocity = completedStories.reduce(
              (sum: number, story: any) => sum + (story.storyPoints || 0),
              0
            )
            setCalculatedVelocity(velocity)
          } else {
            setCalculatedVelocity(0)
          }
        } catch (e) {
          console.error('Failed to fetch stories for velocity calculation:', e)
          setCalculatedVelocity(0)
        }
        
        const formattedForm: SprintForm = {
          name: s?.name || '',
          description: s?.description || '',
          status: s?.status || 'planning',
          startDate: s?.startDate ? new Date(s.startDate).toISOString().slice(0, 10) : '',
          endDate: s?.endDate ? new Date(s.endDate).toISOString().slice(0, 10) : '',
          goal: s?.goal || '',
          capacity:
            s?.capacity === null || s?.capacity === undefined ? '' : String(s.capacity),
          velocity: '' // Will be calculated, not editable
        }
        setForm(formattedForm)
        setInitialForm(formattedForm)
        const sprintTeamMembers = Array.isArray(s?.teamMembers) ? s.teamMembers : []
        const sprintMemberIds = sprintTeamMembers
          .map((member: TeamMember | string) =>
            typeof member === 'string' ? member : member?._id
          )
          .filter((memberId: string | undefined): memberId is string => Boolean(memberId))
        setTeamMembers(sprintMemberIds)
        setInitialTeamMembers(sprintMemberIds)
        storeMemberDetails(
          sprintTeamMembers.filter(
            (member: TeamMember | string | null | undefined): member is TeamMember =>
              typeof member === 'object' && member !== null
          )
        )
        const sprintProjectId = s?.project?._id || ''
        setProjectId(sprintProjectId)
        setInitialProjectId(sprintProjectId)
        await fetchProjectMembers(sprintProjectId)
        // Project details will be set in fetchProjectMembers
      } else {
        setError(data.error || 'Failed to load sprint')
      }
    } catch (e) {
      setError('Failed to load sprint')
    } finally {
      setLoading(false)
    }
  }, [sprintId, fetchProjectMembers])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  useEffect(() => {
    if (sprintId) fetchSprint()
  }, [sprintId, fetchSprint])

  useEffect(() => {
    // When project changes (but not on initial load), update team members
    if (projectId && initialProjectId !== null && projectId !== initialProjectId) {
      fetchProjectMembers(projectId)
      // Clear team members when project changes
      setTeamMembers([])
      setStartDateError('')
      setEndDateError('')
    }
  }, [projectId, initialProjectId, fetchProjectMembers])

  // Validate dates when project or dates change
  useEffect(() => {
    if (selectedProject && (form.startDate || form.endDate)) {
      runDateValidation(form.startDate, form.endDate, selectedProject, false)
    } else if (!form.startDate || !form.endDate) {
      setStartDateError('')
      setEndDateError('')
    }
  }, [selectedProject, form.startDate, form.endDate])

  useEffect(() => {
    if (successMessage && messageContainerRef.current) {
      // Scroll to the message container when success message appears
      setTimeout(() => {
        messageContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
      const timeout = setTimeout(() => setSuccessMessage(''), 3000)
      return () => clearTimeout(timeout)
    }
  }, [successMessage])

  useEffect(() => {
    if (error && messageContainerRef.current) {
      // Scroll to the message container when error message appears
      setTimeout(() => {
        messageContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    }
  }, [error])

  const handleSave = async () => {
    if (!hasChanges) return
    
    // Validate dates before saving
    if (!selectedProject) {
      setError('Project information is not available. Please refresh the page.')
      notifyError({ title: 'Project information is not available. Please refresh the page.' })
      return
    }

    const datesAreValid = runDateValidation(form.startDate, form.endDate, selectedProject, true)
    if (!datesAreValid) {
      notifyError({ title: 'Please fix the date errors before saving.' })
      return
    }

    try {
      setSaving(true)
      setError('')
      setStartDateError('')
      setEndDateError('')
      const res = await fetch(`/api/sprints/${sprintId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
          name: form.name,
          description: form.description,
          status: form.status,
          startDate: form.startDate ? new Date(form.startDate) : undefined,
          endDate: form.endDate ? new Date(form.endDate) : undefined,
          goal: form.goal,
          capacity: form.capacity === '' ? undefined : Number(form.capacity),
          // Velocity is calculated from completed stories, not sent from form
          velocity: calculatedVelocity,
          project: projectId,
          teamMembers
        })
      })
      const data = await res.json()
      if (data.success) {
        const updatedSprint = data.data
        if (updatedSprint) {
          const updatedForm: SprintForm = {
            name: updatedSprint?.name || '',
            description: updatedSprint?.description || '',
            status: updatedSprint?.status || 'planning',
            startDate: updatedSprint?.startDate ? new Date(updatedSprint.startDate).toISOString().slice(0, 10) : '',
            endDate: updatedSprint?.endDate ? new Date(updatedSprint.endDate).toISOString().slice(0, 10) : '',
            goal: updatedSprint?.goal || '',
            capacity:
              updatedSprint?.capacity === null || updatedSprint?.capacity === undefined
                ? ''
                : String(updatedSprint.capacity),
            velocity: ''
          }
          setForm(updatedForm)
          setInitialForm(updatedForm)

          const updatedTeamMembersRaw = Array.isArray(updatedSprint?.teamMembers) ? updatedSprint.teamMembers : []
          const updatedTeamMemberIds = updatedTeamMembersRaw
            .map((member: TeamMember | string) =>
              typeof member === 'string' ? member : member?._id
            )
            .filter((memberId: string | undefined): memberId is string => Boolean(memberId))
          setTeamMembers(updatedTeamMemberIds)
          setInitialTeamMembers(updatedTeamMemberIds)
          storeMemberDetails(
            updatedTeamMembersRaw.filter(
              (member: TeamMember | string | null | undefined): member is TeamMember =>
                typeof member === 'object' && member !== null
            )
          )
          
          // Update project ID if changed
          const updatedProjectId = updatedSprint?.project?._id || updatedSprint?.project || ''
          setProjectId(updatedProjectId)
          setInitialProjectId(updatedProjectId)
        }
        setSuccessMessage('Sprint updated successfully')
        setError('')
        notifySuccess({ title: 'Sprint updated successfully' })

        // Redirect back to previous location after successful update
        setTimeout(() => {
          router.back()
        }, 1000)
      } else {
        setError(data.error || 'Failed to save sprint')
        notifyError({ title: data.error || 'Failed to save sprint' })
      }
    } catch (e) {
      setError('Failed to save sprint')
      notifyError({ title: 'Failed to save sprint' })
    } finally {
      setSaving(false)
    }
  }

  const activeAvailableMembers = useMemo(
    () => availableMembers.filter((member) => member.isActive !== false),
    [availableMembers]
  )

  const filteredTeamOptions = useMemo(() => {
    // First, exclude already selected members
    const unselectedMembers = activeAvailableMembers.filter(
      (member) => !teamMembers.includes(member._id)
    )
    
    // Then filter by search query if provided
    const query = teamMemberQuery.trim().toLowerCase()
    if (!query) return unselectedMembers
    
    return unselectedMembers.filter((member) => {
      const fullName = `${member.firstName} ${member.lastName}`.toLowerCase()
      return (
        fullName.includes(query) ||
        (member.email ? member.email.toLowerCase().includes(query) : false)
      )
    })
  }, [activeAvailableMembers, teamMembers, teamMemberQuery])

  const isSelectDisabled = membersLoading || activeAvailableMembers.length === 0

  const handleRemoveMember = (memberId: string) => {
    setTeamMembers((prev) => prev.filter((id) => id !== memberId))
  }

  const normalizeValue = (value: string | number | undefined | null) =>
    value === '' || value === undefined || value === null ? '' : String(value)

  const hasFormChanges = useMemo(() => {
    if (!initialForm) return false
    return (
      form.name !== initialForm.name ||
      form.description !== initialForm.description ||
      form.status !== initialForm.status ||
      form.startDate !== initialForm.startDate ||
      form.endDate !== initialForm.endDate ||
      form.goal !== initialForm.goal ||
      normalizeValue(form.capacity) !== normalizeValue(initialForm.capacity)
    )
  }, [form, initialForm])

  const hasTeamChanges = useMemo(() => {
    if (!initialTeamMembers) return false
    if (teamMembers.length !== initialTeamMembers.length) return true
    const sortedCurrent = [...teamMembers].sort()
    const sortedInitial = [...initialTeamMembers].sort()
    return sortedCurrent.some((memberId, index) => memberId !== sortedInitial[index])
  }, [teamMembers, initialTeamMembers])

  const hasProjectChanges = useMemo(() => {
    if (!initialProjectId) return false
    return projectId !== initialProjectId
  }, [projectId, initialProjectId])

  const hasChanges = hasFormChanges || hasTeamChanges || hasProjectChanges

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading sprint...</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (error) {
    return (
      <MainLayout>
        <div className="max-w-2xl mx-auto">
          <Button variant="ghost" onClick={() => router.back()} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <Alert variant="destructive">
            <AlertDescription>{error || 'Sprint not found'}</AlertDescription>
          </Alert>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Edit Sprint</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Project *</label>
              <Select
                value={projectId}
                onValueChange={(value) => {
                  setProjectId(value)
                  setTeamMembers([]) // Clear team members when project changes
                  setStartDateError('') // Clear date errors when project changes
                  setEndDateError('')
                  // Project details will be fetched in useEffect
                }}
                onOpenChange={(open) => {
                  if (open) setProjectQuery('')
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent className="z-[10050] p-0">
                  <div className="p-2">
                    <Input
                      value={projectQuery}
                      onChange={(e) => setProjectQuery(e.target.value)}
                      placeholder="Search projects"
                      className="mb-2"
                      onKeyDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                    <div className="max-h-56 overflow-y-auto">
                      {projects
                        .filter((p) =>
                          !projectQuery.trim() ||
                          p.name.toLowerCase().includes(projectQuery.toLowerCase())
                        )
                        .map((project) => (
                          <SelectItem key={project._id} value={project._id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      {projects.filter((p) =>
                        !projectQuery.trim() ||
                        p.name.toLowerCase().includes(projectQuery.toLowerCase())
                      ).length === 0 && (
                        <div className="px-2 py-1 text-xs text-muted-foreground">
                          No matching projects
                        </div>
                      )}
                    </div>
                  </div>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-1"
                rows={4}
              />
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Status</label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as SprintForm['status'] })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planning">Planning</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedProject?.startDate && selectedProject?.endDate && (
                <div className="p-3 bg-muted/50 rounded-md border border-muted">
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Start Date</label>
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => {
                      const newStartDate = e.target.value
                      setForm({ ...form, startDate: newStartDate })
                      if (selectedProject && (newStartDate || form.endDate)) {
                        runDateValidation(newStartDate, form.endDate, selectedProject, false)
                      } else {
                        setStartDateError('')
                        setEndDateError('')
                      }
                    }}
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
                    className={`mt-1 ${startDateError ? 'border-destructive' : ''}`}
                    disabled={!projectId}
                  />
                  {startDateError && (
                    <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                      {startDateError}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium">End Date</label>
                  <Input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => {
                      const newEndDate = e.target.value
                      setForm({ ...form, endDate: newEndDate })
                      if (selectedProject && (form.startDate || newEndDate)) {
                        runDateValidation(form.startDate, newEndDate, selectedProject, false)
                      } else {
                        setStartDateError('')
                        setEndDateError('')
                      }
                    }}
                    min={
                      selectedProject?.startDate || form.startDate
                        ? new Date(
                            Math.max(
                              form.startDate ? new Date(form.startDate).getTime() : 0,
                              selectedProject?.startDate ? new Date(selectedProject.startDate).getTime() : 0,
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
                    className={`mt-1 ${endDateError ? 'border-destructive' : ''}`}
                    disabled={!projectId || !form.startDate}
                  />
                  {!form.startDate && projectId && (
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
            </div>
            <div>
              <label className="text-sm font-medium">Goal</label>
              <Textarea
                value={form.goal}
                onChange={(e) => setForm({ ...form, goal: e.target.value })}
                className="mt-1"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Capacity (hours)</label>
                <Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Velocity (calculated)</label>
                <Input 
                  type="number" 
                  value={calculatedVelocity} 
                  readOnly 
                  disabled
                  className="mt-1 bg-muted cursor-not-allowed" 
                  title="Velocity is automatically calculated from completed user stories"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Calculated from completed stories only
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center space-x-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>Team Members</span>
                </label>
                {membersLoading && (
                  <span className="text-xs text-muted-foreground flex items-center space-x-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Loading...</span>
                  </span>
                )}
              </div>
              {membersError && (
                <Alert variant="destructive">
                  <AlertDescription className="text-xs">{membersError}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-3">
                <div className="space-y-2">
                  <Select
                    value=""
                    onValueChange={(value) => {
                      if (!teamMembers.includes(value)) {
                        setTeamMembers((prev) => [...prev, value])
                        setTeamMemberQuery('')
                      }
                    }}
                    disabled={isSelectDisabled}
                  >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        membersLoading
                          ? 'Loading team members...'
                          : activeAvailableMembers.length === 0
                            ? 'No active team members for this project'
                            : 'Search team members'
                      }
                    />
                  </SelectTrigger>
                    <SelectContent className="z-[10050] p-0">
                      <div className="p-2">
                        <Input
                          value={teamMemberQuery}
                          onChange={(e) => setTeamMemberQuery(e.target.value)}
                          placeholder="Search team members"
                          className="mb-2"
                        />
                        <div className="max-h-56 overflow-y-auto">
                          {membersLoading ? (
                            <div className="flex items-center space-x-2 text-sm text-muted-foreground p-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Loading members...</span>
                            </div>
                          ) : activeAvailableMembers.length === 0 ? (
                            <div className="px-2 py-1 text-xs text-muted-foreground">
                              No active team members available
                            </div>
                          ) : filteredTeamOptions.length === 0 ? (
                            <div className="px-2 py-1 text-xs text-muted-foreground">
                              No matching team members
                            </div>
                          ) : (
                            filteredTeamOptions.map((member) => (
                              <SelectItem
                                key={member._id}
                                value={member._id}
                              >
                                <div className="flex items-center justify-between w-full">
                                  <span className="text-sm font-medium truncate">
                                    {member.firstName} {member.lastName}
                                  </span>
                                  {member.email && (
                                    <span className="text-xs text-muted-foreground ml-2 truncate max-w-[150px]">
                                      {member.email}
                                    </span>
                                  )}
                                </div>
                              </SelectItem>
                            ))
                          )}
                        </div>
                      </div>
                    </SelectContent>
                  </Select>
                  {!membersLoading && activeAvailableMembers.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">
                      No active team members available for this sprint&apos;s project.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Assigned members ({teamMembers.length})
                    </p>
                    {teamMembers.length > 4 && (
                      <span className="text-[10px] text-muted-foreground">Scroll to view all</span>
                    )}
                  </div>
                  {teamMembers.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No members assigned yet.</p>
                  ) : (
                    <div className="max-h-40 overflow-y-auto rounded-md border border-dashed bg-muted/20 p-2">
                      <div className="flex flex-wrap gap-2">
                        {teamMembers.map((memberId) => {
                          const member = memberLookup[memberId]
                          const memberLabel = member
                            ? `${member.firstName} ${member.lastName}`
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
                                onClick={() => handleRemoveMember(memberId)}
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
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => router.push(`/sprints/${sprintId}`)}>Cancel</Button>
              <Button
                onClick={handleSave}
                disabled={saving || !hasChanges || Boolean(startDateError) || Boolean(endDateError)}
              >
                {saving ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>) : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
