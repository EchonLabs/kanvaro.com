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
import { Checkbox } from '@/components/ui/Checkbox'
import { Loader2, ArrowLeft, CheckCircle, Plus, Trash2 } from 'lucide-react'

const STATUS_OPTIONS = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'review', label: 'Review' },
  { value: 'testing', label: 'Testing' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' }
] as const

type TaskStatus = typeof STATUS_OPTIONS[number]['value']
type TaskPriority = 'low' | 'medium' | 'high' | 'critical'
type TaskType = 'task' | 'bug' | 'feature' | 'improvement' | 'subtask'

type SubtaskStatus = TaskStatus

interface Subtask {
  _id?: string
  title: string
  description?: string
  status: SubtaskStatus
  isCompleted: boolean
  createdAt?: string
  updatedAt?: string
}

interface TaskFormState {
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  type: TaskType
}

const mapTaskFormState = (data: any): TaskFormState => ({
  title: data?.title ?? '',
  description: data?.description ?? '',
  status: (data?.status ?? 'backlog') as TaskStatus,
  priority: (data?.priority ?? 'medium') as TaskPriority,
  type: (data?.type ?? 'task') as TaskType
})

const mapSubtasksFromResponse = (input: any): Subtask[] => {
  if (!Array.isArray(input)) return []
  return input.map((item: any) => ({
    _id: typeof item?._id === 'string' ? item._id : undefined,
    title: item?.title ?? '',
    description: item?.description ?? '',
    status: (item?.status ?? 'todo') as SubtaskStatus,
    isCompleted: typeof item?.isCompleted === 'boolean' ? item.isCompleted : item?.status === 'done',
    createdAt: item?.createdAt,
    updatedAt: item?.updatedAt
  }))
}

const sanitizeSubtasksForPayload = (subtasks: Subtask[]) =>
  subtasks
    .filter((subtask) => subtask.title.trim().length > 0)
    .map((subtask) => ({
      _id: subtask._id,
      title: subtask.title.trim(),
      description: subtask.description?.trim() || undefined,
      status: subtask.status,
      isCompleted: subtask.status === 'done' ? true : subtask.isCompleted
    }))

const normalizeSubtasksForCompare = (subtasks: Subtask[]) =>
  sanitizeSubtasksForPayload(subtasks).map((subtask) => ({
    _id: subtask._id ?? null,
    title: subtask.title,
    description: subtask.description ?? '',
    status: subtask.status,
    isCompleted: subtask.isCompleted
  }))

export default function EditTaskPage() {
  const router = useRouter()
  const params = useParams()
  const taskId = params.id as string

  const [task, setTask] = useState<TaskFormState | null>(null)
  const [originalTask, setOriginalTask] = useState<TaskFormState | null>(null)
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [originalSubtasks, setOriginalSubtasks] = useState<Subtask[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const fetchTask = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/tasks/${taskId}`)
      const data = await res.json()

      if (data.success) {
        const mappedTask = mapTaskFormState(data.data)
        const mappedSubtasks = mapSubtasksFromResponse(data.data?.subtasks)

        setTask(mappedTask)
        setOriginalTask(mappedTask)
        setSubtasks(mappedSubtasks)
        setOriginalSubtasks(mappedSubtasks)
        setError('')
      } else {
        setError(data.error || 'Failed to load task')
      }
    } catch (e) {
      setError('Failed to load task')
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    if (taskId) {
      fetchTask()
    }
  }, [taskId, fetchTask])

  const addSubtask = () => {
    setSubtasks((prev) => ([
      ...prev,
      {
        title: '',
        description: '',
        status: 'todo',
        isCompleted: false
      }
    ]))
  }

  const updateSubtask = (index: number, field: keyof Subtask, value: any) => {
    setSubtasks((prev) => {
      const updated = [...prev]
      updated[index] = {
        ...updated[index],
        [field]: field === 'status' ? (value as SubtaskStatus) : value
      }
      if (field === 'status') {
        updated[index].isCompleted = (value as SubtaskStatus) === 'done'
      }
      return updated
    })
  }

  const toggleSubtaskCompletion = (index: number, checked: boolean) => {
    setSubtasks((prev) => {
      const updated = [...prev]
      const current = updated[index]
      const nextStatus: SubtaskStatus = checked
        ? 'done'
        : (current.status === 'done' ? 'todo' : current.status || 'todo')
      updated[index] = {
        ...current,
        status: nextStatus,
        isCompleted: checked
      }
      return updated
    })
  }

  const removeSubtask = (index: number) => {
    setSubtasks((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    if (!task) return

    try {
      setSaving(true)
      const preparedSubtasks = sanitizeSubtasksForPayload(subtasks)

      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          type: task.type,
          subtasks: preparedSubtasks
        })
      })

      const data = await res.json()

      if (data.success) {
        const mappedTask = mapTaskFormState(data.data)
        const mappedSubtasks = mapSubtasksFromResponse(data.data?.subtasks)

        setTask(mappedTask)
        setOriginalTask(mappedTask)
        setSubtasks(mappedSubtasks)
        setOriginalSubtasks(mappedSubtasks)
        setSuccess('Task updated successfully')
        setTimeout(() => setSuccess(''), 4000)
        setError('')
      } else {
        setError(data.error || 'Failed to save task')
      }
    } catch (e) {
      setError('Failed to save task')
    } finally {
      setSaving(false)
    }
  }

  const comparableOriginalSubtasks = useMemo(() => normalizeSubtasksForCompare(originalSubtasks), [originalSubtasks])
  const comparableCurrentSubtasks = useMemo(() => normalizeSubtasksForCompare(subtasks), [subtasks])

  const isDirty = useMemo(() => {
    if (!task || !originalTask) return false
    const taskChanged = JSON.stringify(task) !== JSON.stringify(originalTask)
    const subtasksChanged = JSON.stringify(comparableCurrentSubtasks) !== JSON.stringify(comparableOriginalSubtasks)
    return taskChanged || subtasksChanged
  }, [task, originalTask, comparableCurrentSubtasks, comparableOriginalSubtasks])

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading task...</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (error || !task) {
    return (
      <MainLayout>
        <div className="max-w-3xl mx-auto">
          <Button variant="ghost" onClick={() => router.back()} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <Alert variant="destructive">
            <AlertDescription>{error || 'Task not found'}</AlertDescription>
          </Alert>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>

        {success && (
          <Alert>
            <div className="flex items-center">
              <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
              <AlertDescription>{success}</AlertDescription>
            </div>
          </Alert>
        )}

        {error && !success && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Edit Task</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4">
              <div>
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={task.title}
                  onChange={(e) => setTask((prev) => prev ? ({ ...prev, title: e.target.value }) : prev)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={task.description}
                  onChange={(e) => setTask((prev) => prev ? ({ ...prev, description: e.target.value }) : prev)}
                  className="mt-1"
                  rows={4}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Status</label>
                  <Select value={task.status} onValueChange={(v) => setTask((prev) => prev ? ({ ...prev, status: v as TaskStatus }) : prev)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Priority</label>
                  <Select value={task.priority} onValueChange={(v) => setTask((prev) => prev ? ({ ...prev, priority: v as TaskPriority }) : prev)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Type</label>
                  <Select value={task.type} onValueChange={(v) => setTask((prev) => prev ? ({ ...prev, type: v as TaskType }) : prev)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="task">Task</SelectItem>
                      <SelectItem value="bug">Bug</SelectItem>
                      <SelectItem value="feature">Feature</SelectItem>
                      <SelectItem value="improvement">Improvement</SelectItem>
                      <SelectItem value="subtask">Subtask</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between mt-2">
                <div>
                  <h3 className="text-lg font-medium">Subtask Details</h3>
                  <p className="text-sm text-muted-foreground">Manage subtasks linked to this task</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addSubtask}>
                  <Plus className="h-4 w-4 mr-2" /> Add Subtask
                </Button>
              </div>

              {subtasks.length === 0 && (
                <div className="text-center py-10 text-muted-foreground border rounded-lg">
                  <p className="font-medium">No subtasks yet</p>
                  <p className="text-sm">Use the button above to add a new subtask.</p>
                </div>
              )}

              {subtasks.map((subtask, index) => (
                <div key={subtask._id || index} className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Subtask {index + 1}</h4>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSubtask(index)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium">Title *</label>
                      <Input
                        value={subtask.title}
                        onChange={(e) => updateSubtask(index, 'title', e.target.value)}
                        placeholder="Subtask title"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium">Status</label>
                      <Select
                        value={subtask.status}
                        onValueChange={(value) => updateSubtask(index, 'status', value as SubtaskStatus)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="z-[10050]">
                          {STATUS_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      checked={subtask.isCompleted || subtask.status === 'done'}
                      onCheckedChange={(checked) => toggleSubtaskCompletion(index, !!checked)}
                    />
                    <span className="text-sm text-muted-foreground">Mark as completed</span>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Description</label>
                    <Textarea
                      value={subtask.description || ''}
                      onChange={(e) => updateSubtask(index, 'description', e.target.value)}
                      placeholder="Subtask description"
                      rows={2}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <Button variant="outline" onClick={() => router.push('/tasks')}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !isDirty}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...
                  </>
                ) : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
