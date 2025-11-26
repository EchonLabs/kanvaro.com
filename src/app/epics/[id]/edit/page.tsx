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
import { Loader2, ArrowLeft } from 'lucide-react'

interface EpicForm {
  title: string
  description: string
  // Match Epic model status: backlog | in_progress | completed | cancelled
  status: 'backlog' | 'in_progress' | 'completed' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  dueDate: string
  estimatedHours: number | string
  labels: string
}

export default function EditEpicPage() {
  const router = useRouter()
  const params = useParams()
  const epicId = params.id as string

  const [form, setForm] = useState<EpicForm>({
    title: '',
    description: '',
    status: 'backlog',
    priority: 'medium',
    dueDate: '',
    estimatedHours: '',
    labels: ''
  })
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
        const nextForm: EpicForm = {
          title: e?.title || '',
          description: e?.description || '',
          status: (e?.status || 'backlog') as EpicForm['status'],
          priority: (e?.priority || 'medium'),
          dueDate: e?.dueDate ? new Date(e.dueDate).toISOString().slice(0, 10) : '',
          estimatedHours: e?.estimatedHours ?? '',
          labels: Array.isArray(e?.tags) ? e.tags.join(', ') : ''
        }
        setForm(nextForm)
        setInitialForm(nextForm)
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
      if (form.labels.trim()) payload.tags = form.labels.split(',').map((s) => s.trim()).filter(Boolean)

      const res = await fetch(`/api/epics/${epicId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (res.ok && data.success) {
        router.push(`/epics/${epicId}`)
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

  const statusBlocked = form.status === 'completed' && !canMarkCompleted
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
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v as EpicForm['status'] })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="backlog">Backlog</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Done</SelectItem>
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
                <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Estimated Hours</label>
                <Input type="number" value={form.estimatedHours} onChange={(e) => setForm({ ...form, estimatedHours: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Labels (comma separated)</label>
                <Input value={form.labels} onChange={(e) => setForm({ ...form, labels: e.target.value })} className="mt-1" />
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
