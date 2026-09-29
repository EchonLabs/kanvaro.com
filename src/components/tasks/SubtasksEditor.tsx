'use client'

import React, { useState } from 'react'
import { Plus, Trash2, CornerDownRight, User as UserIcon, ChevronDown, ChevronUp, Layers } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select'
import { Checkbox } from '@/components/ui/Checkbox'
import { TaskStatus } from '@/models/Task'

export interface NestedSubtaskItem {
  _id?: string
  title: string
  description?: string
  status: TaskStatus
  isCompleted: boolean
}

export interface SubtaskItem {
  _id?: string
  title: string
  description?: string
  status: TaskStatus
  isCompleted: boolean
  assignedTo?: string | any
  story?: string | any
  dueDate?: string | Date
  type?: 'bug' | 'feature' | 'improvement' | 'task' | 'subtask'
  priority?: 'low' | 'medium' | 'high' | 'critical'
  estimatedHours?: number | string
  subtasks?: NestedSubtaskItem[]
}

interface MemberUser {
  _id?: string
  id?: string
  firstName?: string
  lastName?: string
  email?: string
  avatar?: string
}

interface StoryOption {
  _id?: string
  id?: string
  title: string
}

interface SubtasksEditorProps {
  subtasks: SubtaskItem[]
  onChange: (subtasks: SubtaskItem[]) => void
  projectMembers?: MemberUser[]
  users?: MemberUser[]
  stories?: StoryOption[]
  onAssigneeAdded?: (userId: string) => void
  disabled?: boolean
}

const SUBTASK_STATUS_OPTIONS: Array<{ value: TaskStatus; label: string; color: string }> = [
  { value: 'backlog', label: 'Backlog', color: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' },
  { value: 'todo', label: 'To Do', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  { value: 'review', label: 'Review', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  { value: 'testing', label: 'Testing', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300' },
  { value: 'done', label: 'Done', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' }
]

const SUBTASK_TYPE_OPTIONS: Array<{ value: 'subtask' | 'task' | 'bug' | 'feature' | 'improvement'; label: string }> = [
  { value: 'subtask', label: 'Subtask' },
  { value: 'task', label: 'Task' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'improvement', label: 'Improvement' },
]

const SUBTASK_PRIORITY_OPTIONS: Array<{ value: 'low' | 'medium' | 'high' | 'critical'; label: string; color: string }> = [
  { value: 'low', label: 'Low', color: 'text-blue-500' },
  { value: 'medium', label: 'Medium', color: 'text-amber-500' },
  { value: 'high', label: 'High', color: 'text-orange-500' },
  { value: 'critical', label: 'Critical', color: 'text-rose-500' },
]

export const SubtasksEditor: React.FC<SubtasksEditorProps> = ({
  subtasks,
  onChange,
  projectMembers = [],
  users,
  stories = [],
  onAssigneeAdded,
  disabled = false
}) => {
  const members = users && users.length > 0 ? users : projectMembers
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<number, boolean>>({})

  const toggleDescription = (index: number) => {
    setExpandedDescriptions(prev => ({
      ...prev,
      [index]: !prev[index]
    }))
  }

  const addSubtask = () => {
    const newSubtask: SubtaskItem = {
      title: '',
      description: '',
      status: 'todo',
      isCompleted: false,
      assignedTo: undefined,
      story: undefined,
      dueDate: undefined,
      type: 'subtask',
      priority: 'medium',
      estimatedHours: undefined,
      subtasks: []
    }
    onChange([...subtasks, newSubtask])
  }

  const removeSubtask = (index: number) => {
    onChange(subtasks.filter((_, i) => i !== index))
  }

  const updateSubtask = (index: number, field: keyof SubtaskItem, value: any) => {
    const updated = [...subtasks]
    const current = { ...updated[index] }

    if (field === 'status') {
      const nextStatus = value as TaskStatus
      current.status = nextStatus
      current.isCompleted = nextStatus === 'done'
    } else if (field === 'isCompleted') {
      const checked = !!value
      current.isCompleted = checked
      current.status = checked ? 'done' : (current.status === 'done' ? 'todo' : current.status)
    } else if (field === 'assignedTo') {
      current.assignedTo = value || undefined
      if (value && onAssigneeAdded) {
        onAssigneeAdded(value)
      }
    } else {
      (current as any)[field] = value
    }

    updated[index] = current
    onChange(updated)
  }

  const addNestedSubtask = (parentIndex: number) => {
    const updated = [...subtasks]
    const parent = { ...updated[parentIndex] }
    const nestedList = [...(parent.subtasks || [])]

    nestedList.push({
      title: '',
      description: '',
      status: 'todo',
      isCompleted: false
    })

    parent.subtasks = nestedList
    updated[parentIndex] = parent
    onChange(updated)
  }

  const removeNestedSubtask = (parentIndex: number, nestedIndex: number) => {
    const updated = [...subtasks]
    const parent = { ...updated[parentIndex] }
    parent.subtasks = (parent.subtasks || []).filter((_, i) => i !== nestedIndex)
    updated[parentIndex] = parent
    onChange(updated)
  }

  const updateNestedSubtask = (
    parentIndex: number,
    nestedIndex: number,
    field: keyof NestedSubtaskItem,
    value: any
  ) => {
    const updated = [...subtasks]
    const parent = { ...updated[parentIndex] }
    const nestedList = [...(parent.subtasks || [])]
    const currentNested = { ...nestedList[nestedIndex] }

    if (field === 'status') {
      const nextStatus = value as TaskStatus
      currentNested.status = nextStatus
      currentNested.isCompleted = nextStatus === 'done'
    } else if (field === 'isCompleted') {
      const checked = !!value
      currentNested.isCompleted = checked
      currentNested.status = checked ? 'done' : (currentNested.status === 'done' ? 'todo' : currentNested.status)
    } else {
      (currentNested as any)[field] = value
    }

    nestedList[nestedIndex] = currentNested
    parent.subtasks = nestedList
    updated[parentIndex] = parent
    onChange(updated)
  }

  const getMemberId = (member: MemberUser): string => {
    return member._id || member.id || ''
  }

  const getAssigneeId = (assignedTo: any): string => {
    if (!assignedTo) return ''
    if (typeof assignedTo === 'string') return assignedTo
    return assignedTo._id || assignedTo.id || ''
  }

  const getStoryId = (story: any): string => {
    if (!story) return ''
    if (typeof story === 'string') return story
    return story._id || story.id || ''
  }

  const formatDueDateForInput = (d?: string | Date): string => {
    if (!d) return ''
    if (typeof d === 'string') {
      if (d.includes('T')) return d.split('T')[0]
      return d
    }
    if (d instanceof Date && !isNaN(d.getTime())) {
      return d.toISOString().split('T')[0]
    }
    return ''
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <h3 className="text-[14px] font-semibold text-foreground">Subtasks</h3>
          {subtasks.length > 0 && (
            <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground font-mono">
              {subtasks.filter(s => s.isCompleted || s.status === 'done').length}/{subtasks.length}
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addSubtask}
          disabled={disabled}
          className="h-8 text-xs font-medium gap-1 rounded-md"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Subtask
        </Button>
      </div>

      {subtasks.map((subtask, index) => {
        const subtaskAssigneeId = getAssigneeId(subtask.assignedTo)
        const subtaskStoryId = getStoryId(subtask.story)
        const isDone = subtask.isCompleted || subtask.status === 'done'
        const hasDescription = !!(subtask.description && subtask.description.trim().length > 0)
        const isDescOpen = expandedDescriptions[index] || hasDescription
        const nestedCount = subtask.subtasks?.length || 0

        return (
          <div
            key={subtask._id || index}
            className="p-4 border border-border/80 rounded-xl space-y-3 bg-card shadow-sm transition-all"
          >
            {/* Header: Checkbox + Title + Status + Assignee + Remove */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <Checkbox
                  checked={isDone}
                  disabled={disabled}
                  onCheckedChange={(checked) => updateSubtask(index, 'isCompleted', !!checked)}
                  aria-label="Toggle subtask completion"
                />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-shrink-0">
                  Subtask {index + 1}
                </span>
                {isDone && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 font-medium">
                    Done
                  </span>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeSubtask(index)}
                disabled={disabled}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full"
                title="Remove subtask"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Title & Status Row */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-8">
                <label className="text-[12px] font-medium text-foreground block mb-1">
                  Title <span className="text-destructive">*</span>
                </label>
                <Input
                  value={subtask.title}
                  onChange={(e) => updateSubtask(index, 'title', e.target.value)}
                  placeholder="What needs to be done?"
                  disabled={disabled}
                  className={`h-9 text-sm ${isDone ? 'line-through text-muted-foreground' : ''}`}
                  required
                />
              </div>

              <div className="sm:col-span-4">
                <label className="text-[12px] font-medium text-foreground block mb-1">Status</label>
                <Select
                  value={subtask.status || 'todo'}
                  onValueChange={(value) => updateSubtask(index, 'status', value as TaskStatus)}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBTASK_STATUS_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value} className="text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${option.color.split(' ')[0]}`} />
                          <span>{option.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Type, Priority, Due Date, Estimated Hours Row */}
            <div className="grid grid-cols-2 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-3">
                <label className="text-[12px] font-medium text-foreground block mb-1">Type</label>
                <Select
                  value={subtask.type || 'subtask'}
                  onValueChange={(val) => updateSubtask(index, 'type', val)}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBTASK_TYPE_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value} className="text-xs">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-3">
                <label className="text-[12px] font-medium text-foreground block mb-1">Priority</label>
                <Select
                  value={subtask.priority || 'medium'}
                  onValueChange={(val) => updateSubtask(index, 'priority', val)}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBTASK_PRIORITY_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value} className="text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-semibold ${option.color}`}>•</span>
                          <span>{option.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-3">
                <label className="text-[12px] font-medium text-foreground block mb-1">Due Date</label>
                <Input
                  type="date"
                  value={formatDueDateForInput(subtask.dueDate)}
                  onChange={(e) => updateSubtask(index, 'dueDate', e.target.value || undefined)}
                  disabled={disabled}
                  className="h-9 text-xs"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="text-[12px] font-medium text-foreground block mb-1">Est. Hours</label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={subtask.estimatedHours !== undefined && subtask.estimatedHours !== null ? subtask.estimatedHours : ''}
                  onChange={(e) => updateSubtask(index, 'estimatedHours', e.target.value === '' ? undefined : Number(e.target.value))}
                  placeholder="0"
                  disabled={disabled}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* Assignee, User Story & Description Toggle Row */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-6">
                <label className="text-[12px] font-medium text-foreground block mb-1">
                  Assignee <span className="text-[11px] font-normal text-muted-foreground">(Auto-added to main task)</span>
                </label>
                <Select
                  value={subtaskAssigneeId || 'unassigned'}
                  onValueChange={(val) => updateSubtask(index, 'assignedTo', val === 'unassigned' ? '' : val)}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Unassigned">
                      {subtaskAssigneeId ? (() => {
                        const member = members.find(m => getMemberId(m) === subtaskAssigneeId)
                        if (!member) {
                          if (typeof subtask.assignedTo === 'object' && subtask.assignedTo?.firstName) {
                            return `${subtask.assignedTo.firstName} ${subtask.assignedTo.lastName || ''}`.trim()
                          }
                          return 'Assigned Member'
                        }
                        return `${member.firstName || ''} ${member.lastName || ''}`.trim() || member.email
                      })() : (
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <UserIcon className="h-3 w-3" /> Unassigned
                        </span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned" className="text-xs">
                      <span className="text-muted-foreground">Unassigned</span>
                    </SelectItem>
                    {members.map(member => {
                      const id = getMemberId(member)
                      if (!id) return null
                      const fullName = `${member.firstName || ''} ${member.lastName || ''}`.trim()
                      return (
                        <SelectItem key={id} value={id} className="text-xs">
                          <div className="flex items-center gap-2">
                            {member.avatar ? (
                              <img src={member.avatar} alt="" className="w-4 h-4 rounded-full object-cover" />
                            ) : (
                              <div className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-medium">
                                {(member.firstName?.[0] || 'U').toUpperCase()}
                              </div>
                            )}
                            <span>{fullName || member.email}</span>
                          </div>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-4">
                <label className="text-[12px] font-medium text-foreground block mb-1">User Story</label>
                <Select
                  value={subtaskStoryId || 'none'}
                  onValueChange={(val) => updateSubtask(index, 'story', val === 'none' ? undefined : val)}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="None">
                      {subtaskStoryId ? (() => {
                        const matchedStory = stories.find(s => (s._id || (s as any).id) === subtaskStoryId)
                        if (matchedStory) return matchedStory.title
                        if (typeof subtask.story === 'object' && subtask.story?.title) {
                          return subtask.story.title
                        }
                        return 'Selected Story'
                      })() : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-xs">
                      <span className="text-muted-foreground">None</span>
                    </SelectItem>
                    {stories.map(st => {
                      const id = st._id || (st as any).id
                      if (!id) return null
                      return (
                        <SelectItem key={id} value={id} className="text-xs">
                          {st.title}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2 flex items-center justify-end pb-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleDescription(index)}
                  className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1"
                >
                  {isDescOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {isDescOpen ? 'Hide' : (hasDescription ? 'Desc' : '+ Desc')}
                </Button>
              </div>
            </div>

            {/* Optional Description */}
            {isDescOpen && (
              <div className="pt-1">
                <label className="text-[12px] font-medium text-foreground block mb-1">Description</label>
                <Textarea
                  value={subtask.description || ''}
                  onChange={(e) => updateSubtask(index, 'description', e.target.value)}
                  placeholder="Add additional details or notes for this subtask..."
                  disabled={disabled}
                  rows={2}
                  className="text-xs resize-none"
                />
              </div>
            )}

            {/* Nested Subtasks Container */}
            <div className="pt-2 border-t border-border/50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <CornerDownRight className="h-3.5 w-3.5 text-primary" />
                  <span>Nested Subtasks</span>
                  {nestedCount > 0 && (
                    <span className="text-[11px] bg-muted px-1.5 py-0.2 rounded-full">
                      {subtask.subtasks?.filter(n => n.isCompleted || n.status === 'done').length}/{nestedCount}
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => addNestedSubtask(index)}
                  disabled={disabled}
                  className="h-6 text-[11px] text-primary hover:text-primary/80 gap-1 px-2"
                >
                  <Plus className="h-3 w-3" />
                  Add Nested
                </Button>
              </div>

              {/* Nested Subtask Items */}
              {subtask.subtasks && subtask.subtasks.length > 0 && (
                <div className="space-y-2 pl-3 sm:pl-4 border-l-2 border-primary/20 mt-2">
                  {subtask.subtasks.map((nested, nIndex) => {
                    const isNestedDone = nested.isCompleted || nested.status === 'done'
                    return (
                      <div
                        key={nested._id || nIndex}
                        className="p-2.5 rounded-lg border border-border/60 bg-muted/30 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <Checkbox
                              checked={isNestedDone}
                              disabled={disabled}
                              onCheckedChange={(checked) =>
                                updateNestedSubtask(index, nIndex, 'isCompleted', !!checked)
                              }
                              aria-label="Toggle nested subtask completion"
                            />
                            <Input
                              value={nested.title}
                              onChange={(e) =>
                                updateNestedSubtask(index, nIndex, 'title', e.target.value)
                              }
                              placeholder="Nested subtask title..."
                              disabled={disabled}
                              className={`h-7 text-xs flex-1 ${isNestedDone ? 'line-through text-muted-foreground' : ''}`}
                              required
                            />
                          </div>

                          <div className="w-28 flex-shrink-0">
                            <Select
                              value={nested.status || 'todo'}
                              onValueChange={(val) =>
                                updateNestedSubtask(index, nIndex, 'status', val as TaskStatus)
                              }
                              disabled={disabled}
                            >
                              <SelectTrigger className="h-7 text-[11px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SUBTASK_STATUS_OPTIONS.map(opt => (
                                  <SelectItem key={opt.value} value={opt.value} className="text-[11px]">
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeNestedSubtask(index, nIndex)}
                            disabled={disabled}
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive rounded"
                            title="Remove nested subtask"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>

                        {/* Optional Nested Description */}
                        <div>
                          <Input
                            value={nested.description || ''}
                            onChange={(e) =>
                              updateNestedSubtask(index, nIndex, 'description', e.target.value)
                            }
                            placeholder="Optional note..."
                            disabled={disabled}
                            className="h-6 text-[11px] bg-background/50 placeholder:text-muted-foreground/60"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {subtasks.length === 0 && (
        <div className="text-center py-6 border border-dashed border-border rounded-xl text-muted-foreground">
          <Layers className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-xs font-medium">No subtasks added yet</p>
          <p className="text-[11px] text-muted-foreground/80 mt-0.5">
            Break this task down into subtasks with assignees and nested child items
          </p>
        </div>
      )}
    </div>
  )
}
