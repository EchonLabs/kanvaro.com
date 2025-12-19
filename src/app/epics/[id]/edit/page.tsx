'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, ArrowLeft, Plus, X } from 'lucide-react'

interface EpicForm {
  title: string
  description: string
  // Match Epic model status: Backlog | todo | inprogress | done | cancelled
  status: 'Backlog' | 'todo' | 'inprogress' | 'done' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  dueDate: string
  estimatedHours: number | string
  labels: string[]
}

export default function EditEpicPage() {
  const router = useRouter()
  const params = useParams()
  const epicId = params.id as string
  const { setItems } = useBreadcrumb()

  const [form, setForm] = useState<EpicForm>({
    title: '',
    description: '',
    status: 'Backlog',
    priority: 'medium',
    dueDate: '',
    estimatedHours: '',
    labels: []
  })
  const [newLabel, setNewLabel] = useState('')
  const [project, setProject] = useState<{ startDate?: Date; endDate?: Date } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [initialForm, setInitialForm] = useState<EpicForm | null>(null)
  const [storyProgress, setStoryProgress] = useState<{
    totalStories: number
    storiesCompleted: number
  } | null>(null)

  const fetchEpic = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/epics/${epicId}`)
      const data = await res.json()
      if (res.ok && data.success) {
        const e = data.data
        // Normalize status to match new Epic model values
        let normalizedStatus = e?.status || 'Backlog'
        if (!normalizedStatus) {
          normalizedStatus = 'Backlog'
        }
        // Ensure status is one of the valid form values
        const validStatuses: EpicForm['status'][] = ['Backlog', 'todo', 'inprogress', 'done', 'cancelled']
        if (!validStatuses.includes(normalizedStatus as EpicForm['status'])) {
          normalizedStatus = 'Backlog'
        }

        const nextForm: EpicForm = {
          title: e?.title || '',
          description: e?.description || '',
          status: normalizedStatus as EpicForm['status'],
          priority: (e?.priority || 'medium'),
          dueDate: e?.dueDate ? new Date(e.dueDate).toISOString().slice(0, 10) : '',
          estimatedHours: e?.estimatedHours ?? '',
          labels: Array.isArray(e?.tags) ? e.tags : []
        }
        console.log('Fetched epic status:', e?.status, 'Normalized to:', normalizedStatus)
        setForm(nextForm)
        setInitialForm(nextForm)

        // Set project details for date validation
        if (e?.project) {
          setProject({
            startDate: e.project.startDate ? new Date(e.project.startDate) : undefined,
            endDate: e.project.endDate ? new Date(e.project.endDate) : undefined
          })
        }

        if (e?.progress) {
          setStoryProgress({
            totalStories: e.progress.totalStories ?? 0,
            storiesCompleted: e.progress.storiesCompleted ?? 0
          })
        } else {
          setStoryProgress(null)
        }
        setError('')
      } else {
        setError(data?.error || 'Failed to load epic')
      }
    } catch (e) {
      setError('Failed to load epic')
    } finally {
      setLoading(false)
    }
  }, [epicId])

  useEffect(() => {
    if (epicId) fetchEpic()
  }, [epicId, fetchEpic])

  // Clear due date if it's outside the valid range
  useEffect(() => {
    if (project && form.dueDate) {
      const dateRange = getValidDateRange()
      if (dateRange) {
        const selectedDate = new Date(form.dueDate)
        const isBeforeMin = dateRange.minDate && selectedDate < dateRange.minDate
        const isAfterMax = dateRange.maxDate && selectedDate > dateRange.maxDate

        if (isBeforeMin || isAfterMax) {
          setForm(prev => ({ ...prev, dueDate: '' }))
        }
      }
    }
  }, [project])

  const addLabel = () => {
    if (newLabel.trim() && !form.labels.includes(newLabel.trim())) {
      setForm(prev => ({
        ...prev,
        labels: [...prev.labels, newLabel.trim()]
      }))
      setNewLabel('')
    }
  }

  const removeLabel = (index: number) => {
    setForm(prev => ({
      ...prev,
      labels: prev.labels.filter((_, i) => i !== index)
    }))
  }

  // Calculate valid date range for due date based on project
  const getValidDateRange = () => {
    if (!project) return null

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    let minDate = today // Must be today or future
    let maxDate = null

    // If project has start date, due date should be after project start
    if (project.startDate) {
      const projectStart = new Date(project.startDate)
      projectStart.setHours(0, 0, 0, 0)
      minDate = projectStart > today ? projectStart : today
    }

    // If project has end date, due date should be before or on project end
    if (project.endDate) {
      maxDate = new Date(project.endDate)
      maxDate.setHours(23, 59, 59, 999)
    }

    return { minDate, maxDate }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const payload: any = {
        title: form.title,
        description: form.description,
        status: form.status,
        priority: form.priority,
        goal: undefined
      }
      if (form.dueDate) payload.dueDate = new Date(form.dueDate)
      if (form.estimatedHours !== '') payload.estimatedHours = Number(form.estimatedHours)
      if (form.labels.length > 0) payload.tags = form.labels

      const res = await fetch(`/api/epics/${epicId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (res.ok && data.success) {
        router.push('/epics?updated=true')
      } else {
        setError(data?.error || 'Failed to save epic')
      }
    } catch (e) {
      setError('Failed to save epic')
    } finally {
      setSaving(false)
    }
  }

  const canMarkCompleted =
    !storyProgress ||
    storyProgress.totalStories === 0 ||
    storyProgress.storiesCompleted >= storyProgress.totalStories

  const statusBlocked = form.status === 'done' && !canMarkCompleted
  const hasChanges = initialForm !== null && JSON.stringify(form) !== JSON.stringify(initialForm)

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading epic...</p>
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
            <AlertDescription>{error || 'Epic not found'}</AlertDescription>
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
            <CardTitle>Edit Epic</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Status</label>
                <Select
                  value={form.status || 'backlog'}
                  onValueChange={(v) => setForm({ ...form, status: v as EpicForm['status'] })}
                  key={form.status}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Backlog">Backlog</SelectItem>
                    <SelectItem value="todo">Todo</SelectItem>
                    <SelectItem value="inprogress">In Progress</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                {storyProgress && storyProgress.totalStories > 0 && !statusBlocked && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Stories completed: {storyProgress.storiesCompleted}/{storyProgress.totalStories}.<br />
                    You can only mark this epic as Done when all linked stories are completed.
                  </p>
                )}
                {statusBlocked && storyProgress && storyProgress.totalStories > 0 && (
                  <p className="mt-1 text-xs text-red-500">
                    Cannot set status to Done. Stories completed: {storyProgress.storiesCompleted}/
                    {storyProgress.totalStories}.
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">Priority</label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as EpicForm['priority'] })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Due Date</label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  min={getValidDateRange()?.minDate?.toISOString().split('T')[0]}
                  max={getValidDateRange()?.maxDate?.toISOString().split('T')[0]}
                  className="mt-1"
                />
                {getValidDateRange() && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Due date must be within the project's date range
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">Estimated Hours</label>
                <Input type="number" value={form.estimatedHours} onChange={(e) => setForm({ ...form, estimatedHours: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Labels</label>
                <div className="space-y-2 mt-1">
                  <div className="flex space-x-2">
                    <Input
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      placeholder="Enter label"
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addLabel())}
                    />
                    <Button type="button" onClick={addLabel} size="sm" disabled={newLabel.trim() === ''}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {form.labels.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {form.labels.map((label, index) => (
                        <div
                          key={index}
                          className="inline-flex items-center gap-1.5 bg-muted px-3 py-1.5 rounded-md text-sm"
                        >
                          <span>{label}</span>
                          <button
                            type="button"
                            aria-label="Remove label"
                            className="text-muted-foreground hover:text-foreground focus:outline-none transition-colors"
                            onClick={() => removeLabel(index)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => router.push(`/epics/${epicId}`)}>Cancel</Button>
              <Button
                onClick={handleSave}
                disabled={saving || !hasChanges || statusBlocked}
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
