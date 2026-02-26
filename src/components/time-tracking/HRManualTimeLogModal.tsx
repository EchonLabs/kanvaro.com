'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Clock,
  Plus,
  X,
  Search,
  Loader2,
  AlertTriangle,
  FolderOpen,
  Target,
  User,
  DollarSign,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'

interface Employee {
  _id: string
  firstName: string
  lastName: string
  email: string
  role: string
  avatar?: string
  memberId?: string
}

interface Project {
  _id: string
  name: string
  status?: string
  settings?: {
    allowTimeTracking?: boolean
    allowManualTimeSubmission?: boolean
  }
}

interface Task {
  _id: string
  title: string
  status: string
  priority: string
  isBillable?: boolean
  displayId?: string
}

interface HRManualTimeLogModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  onSuccess?: () => void
}

export function HRManualTimeLogModal({
  open,
  onOpenChange,
  organizationId,
  onSuccess
}: HRManualTimeLogModalProps) {
  // State for selections
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState('')

  // Data lists
  const [employees, setEmployees] = useState<Employee[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])

  // Loading states
  const [employeesLoading, setEmployeesLoading] = useState(false)
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [tasksLoading, setTasksLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Search states
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [projectSearch, setProjectSearch] = useState('')
  const [taskSearch, setTaskSearch] = useState('')

  // Form data
  const [formData, setFormData] = useState({
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    memo: ''
  })

  // Time tracking settings (for maxSessionHours validation)
  const [timeTrackingSettings, setTimeTrackingSettings] = useState<{
    maxSessionHours?: number
    allowOvertime?: boolean
  } | null>(null)

  // Errors
  const [error, setError] = useState('')
  const [startDateError, setStartDateError] = useState('')
  const [startTimeError, setStartTimeError] = useState('')
  const [endDateError, setEndDateError] = useState('')
  const [endTimeError, setEndTimeError] = useState('')

  // Filtered lists based on search
  const filteredEmployees = useMemo(() => {
    if (!employeeSearch.trim()) return employees
    const searchLower = employeeSearch.toLowerCase()
    return employees.filter(emp => {
      const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.toLowerCase()
      const email = emp.email?.toLowerCase() || ''
      const memberId = emp.memberId?.toLowerCase() || ''
      return fullName.includes(searchLower) || email.includes(searchLower) || memberId.includes(searchLower)
    })
  }, [employees, employeeSearch])

  const filteredProjects = useMemo(() => {
    if (!projectSearch.trim()) return projects
    const searchLower = projectSearch.toLowerCase()
    return projects.filter(p => p.name?.toLowerCase().includes(searchLower))
  }, [projects, projectSearch])

  const filteredTasks = useMemo(() => {
    if (!taskSearch.trim()) return tasks
    const searchLower = taskSearch.toLowerCase()
    return tasks.filter(t =>
      t.title?.toLowerCase().includes(searchLower) ||
      t.displayId?.toLowerCase().includes(searchLower)
    )
  }, [tasks, taskSearch])

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      resetForm()
      loadEmployees()
      loadTimeTrackingSettings()
    }
  }, [open])

  // Load projects when employee changes
  useEffect(() => {
    if (selectedEmployeeId) {
      loadProjects(selectedEmployeeId)
    } else {
      setProjects([])
      setSelectedProjectId('')
      setTasks([])
      setSelectedTaskId('')
    }
  }, [selectedEmployeeId])

  // Load tasks when project changes
  useEffect(() => {
    if (selectedEmployeeId && selectedProjectId) {
      loadTasks(selectedEmployeeId, selectedProjectId)
    } else {
      setTasks([])
      setSelectedTaskId('')
    }
  }, [selectedEmployeeId, selectedProjectId])


  const resetForm = () => {
    setSelectedEmployeeId('')
    setSelectedProjectId('')
    setSelectedTaskId('')
    setEmployees([])
    setProjects([])
    setTasks([])
    setEmployeeSearch('')
    setProjectSearch('')
    setTaskSearch('')
    setFormData({
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      memo: ''
    })
    setError('')
    setStartDateError('')
    setStartTimeError('')
    setEndDateError('')
    setEndTimeError('')
  }

  const loadEmployees = async () => {
    setEmployeesLoading(true)
    try {
      const res = await fetch('/api/time-tracking/hr/employees')
      const data = await res.json()
      if (data.success && Array.isArray(data.employees)) {
        setEmployees(data.employees)
      } else {
        setEmployees([])
      }
    } catch {
      setEmployees([])
      toast.error('Failed to load employees')
    } finally {
      setEmployeesLoading(false)
    }
  }

  const loadTimeTrackingSettings = async () => {
    try {
      const res = await fetch('/api/time-tracking/settings')
      if (res.ok) {
        const data = await res.json()
        if (data.settings) {
          setTimeTrackingSettings(data.settings)
        }
      }
    } catch {
      // silently ignore – validation will just be skipped
    }
  }

  const loadProjects = async (employeeId: string) => {
    setProjectsLoading(true)
    setProjects([])
    setSelectedProjectId('')
    setTasks([])
    setSelectedTaskId('')
    setProjectSearch('')
    setTaskSearch('')
    try {
      const res = await fetch(`/api/time-tracking/hr/employee-projects?employeeId=${employeeId}`)
      const data = await res.json()
      if (data.success && Array.isArray(data.projects)) {
        setProjects(data.projects)
      } else {
        setProjects([])
      }
    } catch {
      setProjects([])
      toast.error('Failed to load projects')
    } finally {
      setProjectsLoading(false)
    }
  }

  const loadTasks = async (employeeId: string, projectId: string) => {
    setTasksLoading(true)
    setTasks([])
    setSelectedTaskId('')
    setTaskSearch('')
    try {
      const res = await fetch(`/api/time-tracking/hr/employee-tasks?employeeId=${employeeId}&projectId=${projectId}`)
      const data = await res.json()
      if (data.success && Array.isArray(data.tasks)) {
        setTasks(data.tasks)
      } else {
        setTasks([])
      }
    } catch {
      setTasks([])
      toast.error('Failed to load tasks')
    } finally {
      setTasksLoading(false)
    }
  }

  const combineDateTime = (date: string, time: string): string => {
    if (!date || !time) return ''
    return `${date}T${time}`
  }

  const validateDateTime = useCallback(() => {
    setStartDateError('')
    setStartTimeError('')
    setEndDateError('')
    setEndTimeError('')

    if (!formData.startDate || !formData.startTime || !formData.endDate || !formData.endTime) {
      return
    }

    const startDateTime = combineDateTime(formData.startDate, formData.startTime)
    const endDateTime = combineDateTime(formData.endDate, formData.endTime)
    const start = new Date(startDateTime)
    const end = new Date(endDateTime)

    if (isNaN(start.getTime())) {
      setStartDateError('Invalid start date/time')
      return
    }
    if (isNaN(end.getTime())) {
      setEndDateError('Invalid end date/time')
      return
    }

    if (end <= start) {
      setEndTimeError('End time must be after start time')
      return
    }

    // Check if start is in the future
    if (start > new Date()) {
      setStartDateError('Start date/time cannot be in the future')
      return
    }

    // Validate against maxSessionHours
    if (timeTrackingSettings?.maxSessionHours) {
      const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
      const maxHours = timeTrackingSettings.maxSessionHours
      if (durationHours > maxHours) {
        setEndTimeError(
          `Session duration (${durationHours.toFixed(2)}h) exceeds the maximum allowed session length (${maxHours}h). Please adjust the start or end time.`
        )
      }
    }
  }, [formData.startDate, formData.startTime, formData.endDate, formData.endTime, timeTrackingSettings])

  // Validate times when date/time fields change
  useEffect(() => {
    validateDateTime()
  }, [validateDateTime])

  // Calculate duration for display
  const calculatedDuration = useMemo(() => {
    if (!formData.startDate || !formData.startTime || !formData.endDate || !formData.endTime) {
      return null
    }
    const startDateTime = combineDateTime(formData.startDate, formData.startTime)
    const endDateTime = combineDateTime(formData.endDate, formData.endTime)
    const start = new Date(startDateTime)
    const end = new Date(endDateTime)

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      return null
    }

    const durationMinutes = Math.floor((end.getTime() - start.getTime()) / (1000 * 60))
    const hours = Math.floor(durationMinutes / 60)
    const minutes = durationMinutes % 60
    return { hours, minutes, totalMinutes: durationMinutes }
  }, [formData.startDate, formData.startTime, formData.endDate, formData.endTime])

  const handleSubmit = async () => {
    // Validate required fields
    if (!selectedEmployeeId) {
      setError('Please select an employee')
      return
    }
    if (!selectedProjectId) {
      setError('Please select a project')
      return
    }
    if (!selectedTaskId) {
      setError('Please select a task')
      return
    }
    if (!formData.startDate || !formData.startTime) {
      setError('Start date and time are required')
      return
    }
    if (!formData.endDate || !formData.endTime) {
      setError('End date and time are required')
      return
    }
    if (!formData.memo || !formData.memo.trim()) {
      setError('Description is required')
      return
    }

    if (startDateError || startTimeError || endDateError || endTimeError) {
      return
    }

    const startDateTime = combineDateTime(formData.startDate, formData.startTime)
    const endDateTime = combineDateTime(formData.endDate, formData.endTime)
    const start = new Date(startDateTime)
    const end = new Date(endDateTime)

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setError('Invalid date/time values')
      return
    }

    if (end <= start) {
      setError('End time must be after start time')
      return
    }

    if (formData.memo && formData.memo.length > 500) {
      setError('Memo must be 500 characters or less')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const response = await fetch('/api/time-tracking/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedEmployeeId,
          organizationId,
          projectId: selectedProjectId,
          taskId: selectedTaskId,
          description: formData.memo || '',
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          isBillable: true
        })
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('Manual time log created successfully')
        onOpenChange(false)
        resetForm()
        onSuccess?.()
      } else {
        setError(data.error || 'Failed to create time entry')
      }
    } catch {
      setError('Failed to create time entry. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedEmployee = employees.find(e => e._id === selectedEmployeeId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Add Manual Time Log
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4 overflow-y-auto">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Employee Selection */}
          <div className="space-y-2">
            <Label htmlFor="hr-employee">Employee *</Label>
            <Select
              value={selectedEmployeeId}
              onValueChange={(value) => {
                setSelectedEmployeeId(value)
                setError('')
              }}
            >
              <SelectTrigger className="w-full" id="hr-employee">
                <SelectValue placeholder={
                  employeesLoading ? 'Loading employees...' : 'Select an employee'
                } />
              </SelectTrigger>
              <SelectContent className="max-h-[250px]">
                <div className="p-2 border-b">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search employees..."
                      value={employeeSearch}
                      onChange={(e) => setEmployeeSearch(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      className="h-8 pl-7 pr-7 text-xs"
                    />
                    {employeeSearch && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEmployeeSearch('')
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Clear search"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="max-h-[200px] overflow-y-auto">
                  {employeesLoading ? (
                    <div className="flex items-center justify-center p-4">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      <span className="text-sm text-muted-foreground">Loading employees...</span>
                    </div>
                  ) : filteredEmployees.length === 0 ? (
                    <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                      No employees found
                    </div>
                  ) : (
                    filteredEmployees.map((emp) => (
                      <SelectItem key={emp._id} value={emp._id} onMouseDown={(e) => e.preventDefault()}>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="truncate font-medium">
                              {emp.firstName} {emp.lastName}
                            </span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {emp.email}
                            </span>
                          </div>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </div>
              </SelectContent>
            </Select>
            {selectedEmployee && (
              <p className="text-xs text-muted-foreground">
                Selected: {selectedEmployee.firstName} {selectedEmployee.lastName} ({selectedEmployee.email})
              </p>
            )}
          </div>

          {/* Project and Task Selection */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="hr-project">Project *</Label>
              <Select
                value={selectedProjectId}
                onValueChange={(value) => {
                  setSelectedProjectId(value)
                  setSelectedTaskId('')
                  setTasks([])
                  setTaskSearch('')
                  setError('')
                }}
                disabled={!selectedEmployeeId}
              >
                <SelectTrigger className="w-full" id="hr-project">
                  <SelectValue placeholder={
                    !selectedEmployeeId
                      ? 'Select an employee first'
                      : projectsLoading
                        ? 'Loading projects...'
                        : projects.length > 0
                          ? 'Select a project'
                          : 'No projects available'
                  } />
                </SelectTrigger>
                <SelectContent className="max-h-[250px]">
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search projects..."
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        className="h-8 pl-7 pr-7 text-xs"
                      />
                      {projectSearch && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setProjectSearch('')
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Clear search"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto">
                    {projectsLoading ? (
                      <div className="flex items-center justify-center p-4">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span className="text-sm text-muted-foreground">Loading projects...</span>
                      </div>
                    ) : filteredProjects.length === 0 ? (
                      <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                        No projects found
                      </div>
                    ) : (
                      filteredProjects.map((project) => (
                        <SelectItem key={project._id} value={project._id} onMouseDown={(e) => e.preventDefault()}>
                          <div className="flex items-center gap-2">
                            <FolderOpen className="h-4 w-4 flex-shrink-0" />
                            <span className="truncate">{project.name}</span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </div>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="hr-task">Task *</Label>
              <Select
                value={selectedTaskId}
                onValueChange={(value) => {
                  setSelectedTaskId(value)
                  setError('')
                }}
                disabled={!selectedProjectId}
              >
                <SelectTrigger className="w-full" id="hr-task">
                  <SelectValue placeholder={
                    !selectedProjectId
                      ? 'Select a project first'
                      : tasksLoading
                        ? 'Loading tasks...'
                        : tasks.length > 0
                          ? 'Select a task'
                          : 'No tasks available'
                  } />
                </SelectTrigger>
                <SelectContent className="max-h-[250px]">
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search tasks..."
                        value={taskSearch}
                        onChange={(e) => setTaskSearch(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        className="h-8 pl-7 pr-7 text-xs"
                      />
                      {taskSearch && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setTaskSearch('')
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Clear search"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto">
                    {tasksLoading ? (
                      <div className="flex items-center justify-center p-4">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span className="text-sm text-muted-foreground">Loading tasks...</span>
                      </div>
                    ) : filteredTasks.length === 0 ? (
                      <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                        No tasks found
                      </div>
                    ) : (
                      filteredTasks.map((task) => (
                        <SelectItem key={task._id} value={task._id} onMouseDown={(e) => e.preventDefault()}>
                          <div className="flex items-center space-x-2 min-w-0 w-full">
                            <Target className="h-4 w-4 flex-shrink-0" />
                            <div className="flex-1 min-w-0 overflow-hidden">
                              <div className="font-medium truncate flex items-center gap-2 min-w-0">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="truncate">{task.title}</span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{task.title}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {task.displayId && `${task.displayId} • `}{task.status} • {task.priority}
                              </div>
                            </div>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </div>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Date and Time Fields */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="hr-start-date">Start Date *</Label>
              <Input
                id="hr-start-date"
                type="date"
                value={formData.startDate}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, startDate: e.target.value }))
                  setError('')
                }}
                disabled={!selectedTaskId}
                className={`w-full ${startDateError ? 'border-destructive' : ''}`}
              />
              {startDateError && (
                <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
                  <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive font-medium leading-relaxed">{startDateError}</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="hr-start-time">Start Time *</Label>
              <Input
                id="hr-start-time"
                type="time"
                value={formData.startTime}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, startTime: e.target.value }))
                  setError('')
                }}
                disabled={!selectedTaskId}
                className={`w-full ${startTimeError ? 'border-destructive' : ''}`}
              />
              {startTimeError && (
                <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
                  <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive font-medium leading-relaxed">{startTimeError}</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="hr-end-date">End Date *</Label>
              <Input
                id="hr-end-date"
                type="date"
                value={formData.endDate}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, endDate: e.target.value }))
                  setError('')
                }}
                disabled={!selectedTaskId}
                className={`w-full ${endDateError ? 'border-destructive' : ''}`}
              />
              {endDateError && (
                <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
                  <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive font-medium leading-relaxed">{endDateError}</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="hr-end-time">End Time *</Label>
              <Input
                id="hr-end-time"
                type="time"
                value={formData.endTime}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, endTime: e.target.value }))
                  setError('')
                }}
                disabled={!selectedTaskId}
                className={`w-full ${endTimeError ? 'border-destructive' : ''}`}
              />
              {endTimeError && (
                <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
                  <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive font-medium leading-relaxed">{endTimeError}</p>
                </div>
              )}
            </div>
          </div>

          {/* Duration Display */}
          {calculatedDuration && (
            <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50 border border-border">
              <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  Duration: {calculatedDuration.hours}h {calculatedDuration.minutes}m
                </p>
                <p className="text-xs text-muted-foreground">
                  Total: {(calculatedDuration.totalMinutes / 60).toFixed(2)} hours
                  {timeTrackingSettings?.maxSessionHours && !(endTimeError) && (
                    <span className="ml-1 text-muted-foreground">(Max: {timeTrackingSettings.maxSessionHours}h)</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Memo */}
          <div className="space-y-2">
            <Label htmlFor="hr-memo">
              Memo *<span className="text-xs text-muted-foreground">(max 500 characters)</span>
            </Label>
            <Textarea
              id="hr-memo"
              value={formData.memo}
              onChange={(e) => {
                if (e.target.value.length <= 500) {
                  setFormData(prev => ({ ...prev, memo: e.target.value }))
                }
              }}
              placeholder="Enter a description of the work done..."
              rows={3}
              disabled={!selectedTaskId}
              className="w-full"
              maxLength={500}
            />
            {formData.memo && (
              <p className="text-xs text-muted-foreground text-right">
                {formData.memo.length}/500
              </p>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false)
              resetForm()
            }}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              submitting ||
              !selectedEmployeeId ||
              !selectedProjectId ||
              !selectedTaskId ||
              !formData.startDate ||
              !formData.startTime ||
              !formData.endDate ||
              !formData.endTime ||
              !formData.memo.trim() ||
              !!(startDateError || startTimeError || endDateError || endTimeError)
            }
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Add Time Log
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
