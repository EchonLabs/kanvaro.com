'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/Badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/Command'
import { Loader2, ArrowLeft, Users, X } from 'lucide-react'

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
}

export default function EditSprintPage() {
  const router = useRouter()
  const params = useParams()
  const sprintId = params.id as string

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
  const [initialTeamMembers, setInitialTeamMembers] = useState<string[] | null>(null)
  const [availableMembers, setAvailableMembers] = useState<TeamMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState('')
  const [calculatedVelocity, setCalculatedVelocity] = useState<number>(0)
  const [memberLookup, setMemberLookup] = useState<Record<string, TeamMember>>({})
  const [memberPickerOpen, setMemberPickerOpen] = useState(false)
  const [initialForm, setInitialForm] = useState<SprintForm | null>(null)

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
            email: member.email
          }
        }
      })
      return next
    })
  }, [])

  const fetchProjectMembers = useCallback(async (projectId?: string) => {
    if (!projectId) {
      setAvailableMembers([])
      return
    }

    try {
      setMembersLoading(true)
      setMembersError('')
      const res = await fetch(`/api/projects/${projectId}`)
      const data = await res.json()

      if (res.ok && data.success && data.data?.teamMembers) {
        setAvailableMembers(data.data.teamMembers)
        storeMemberDetails(data.data.teamMembers)
      } else {
        setAvailableMembers([])
        setMembersError(data.error || 'Failed to load project team members')
      }
    } catch (err) {
      console.error('Failed to fetch project members:', err)
      setMembersError('Failed to load project team members')
      setAvailableMembers([])
    } finally {
      setMembersLoading(false)
    }
  }, [])

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
        await fetchProjectMembers(s?.project?._id)
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
    if (sprintId) fetchSprint()
  }, [sprintId, fetchSprint])

  const handleSave = async () => {
    if (!hasChanges) return
    try {
      setSaving(true)
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
          teamMembers
        })
      })
      const data = await res.json()
      if (data.success) {
        router.push(`/sprints/${sprintId}`)
      } else {
        setError(data.error || 'Failed to save sprint')
      }
    } catch (e) {
      setError('Failed to save sprint')
    } finally {
      setSaving(false)
    }
  }

  const selectableMembers = availableMembers.filter((member) => !teamMembers.includes(member._id))
  const isSelectDisabled = selectableMembers.length === 0 || membersLoading

  const handleAddMember = (memberId: string) => {
    setTeamMembers((prev) => (prev.includes(memberId) ? prev : [...prev, memberId]))
    setMemberPickerOpen(false)
  }

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

  const hasChanges = hasFormChanges || hasTeamChanges

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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <div>
                <label className="text-sm font-medium">Start Date</label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">End Date</label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="mt-1" />
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
                  <Popover open={memberPickerOpen} onOpenChange={setMemberPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        type="button"
                        disabled={isSelectDisabled}
                        className="w-full justify-between"
                      >
                        {membersLoading
                          ? 'Loading team members...'
                          : selectableMembers.length === 0
                            ? availableMembers.length === 0
                              ? 'No team members for this project'
                              : 'All project members already assigned'
                            : 'Select a member to add'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[320px]" align="start">
                      <Command>
                        <CommandInput placeholder="Search team members..." className="h-9" />
                        <CommandList>
                          <CommandEmpty>No matching team members.</CommandEmpty>
                          <CommandGroup heading="Members">
                            {selectableMembers.map((member) => (
                              <CommandItem
                                key={member._id}
                                value={`${member.firstName} ${member.lastName} ${member.email}`}
                                onSelect={() => handleAddMember(member._id)}
                              >
                                <div className="flex flex-col text-left">
                                  <span className="text-sm font-medium">
                                    {member.firstName} {member.lastName}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {member.email}
                                  </span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {!membersLoading && availableMembers.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      No team members available for this sprint&apos;s project.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Use the dropdown to search and add sprint members.
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
              <Button onClick={handleSave} disabled={saving || !hasChanges}>
                {saving ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>) : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
