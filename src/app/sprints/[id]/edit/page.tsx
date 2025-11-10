'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, ArrowLeft, Users } from 'lucide-react'

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
  const [availableMembers, setAvailableMembers] = useState<TeamMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState('')

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
        setForm({
          name: s?.name || '',
          description: s?.description || '',
          status: s?.status || 'planning',
          startDate: s?.startDate ? new Date(s.startDate).toISOString().slice(0, 10) : '',
          endDate: s?.endDate ? new Date(s.endDate).toISOString().slice(0, 10) : '',
          goal: s?.goal || '',
          capacity: s?.capacity ?? '',
          velocity: s?.velocity ?? ''
        })
        setTeamMembers(Array.isArray(s?.teamMembers) ? s.teamMembers.map((member: TeamMember) => member._id) : [])
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
          velocity: form.velocity === '' ? undefined : Number(form.velocity),
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
                <label className="text-sm font-medium">Velocity</label>
                <Input type="number" value={form.velocity} onChange={(e) => setForm({ ...form, velocity: e.target.value })} className="mt-1" />
              </div>
            </div>

            <div className="space-y-3">
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
              {availableMembers.length === 0 && !membersLoading ? (
                <p className="text-xs text-muted-foreground italic">
                  No team members available for this sprint&apos;s project.
                </p>
              ) : (
                <div className="max-h-48 overflow-y-auto border rounded-md divide-y divide-border">
                  {availableMembers.map((member) => {
                    const memberId = member._id
                    const isChecked = teamMembers.includes(memberId)
                    return (
                      <label
                        key={memberId}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/60 transition-colors"
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium text-foreground truncate">
                            {member.firstName} {member.lastName}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">{member.email}</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() =>
                            setTeamMembers((prev) =>
                              prev.includes(memberId)
                                ? prev.filter((id) => id !== memberId)
                                : [...prev, memberId]
                            )
                          }
                          className="h-4 w-4"
                        />
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => router.push(`/sprints/${sprintId}`)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>) : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
