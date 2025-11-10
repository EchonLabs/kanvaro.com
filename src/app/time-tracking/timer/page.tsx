'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Timer } from '@/components/time-tracking/Timer'
import { TimeLogs } from '@/components/time-tracking/TimeLogs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/Badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  ArrowLeft, 
  Clock, 
  Target,
  FolderOpen,
  Loader2,
  AlertTriangle
} from 'lucide-react'

interface Project {
  _id: string
  name: string
  settings: {
    allowTimeTracking: boolean
  }
}

interface Task {
  _id: string
  title: string
  description?: string
  status: string
  priority: string
  assignedTo?: {
    _id: string
    firstName: string
    lastName: string
  }
  project: {
    _id: string
    name: string
  }
}

interface User {
  id: string
  firstName: string
  lastName: string
  email: string
  organization: string
  billingRate?: number
}

export default function TimerPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [selectedTask, setSelectedTask] = useState<string>('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [timeLogsRefreshKey, setTimeLogsRefreshKey] = useState(0)
  const [liveActiveTimer, setLiveActiveTimer] = useState<any | null | undefined>(undefined)
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me')
        
        if (response.ok) {
          const userData = await response.json()
       
          
          setUser(userData)
          setAuthError('')
          await fetchProjects(userData)
        } else if (response.status === 401) {
          const refreshResponse = await fetch('/api/auth/refresh', {
            method: 'POST'
          })
          
          if (refreshResponse.ok) {
            const refreshData = await refreshResponse.json()
         
            
            setUser(refreshData.user)
            setAuthError('')
            await fetchProjects(refreshData.user)
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
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [router])

  // Preselect project from query params when projects are loaded
  useEffect(() => {
    if (!projects || projects.length === 0) return
    if (selectedProject) return
    let pid = searchParams?.get('project') || searchParams?.get('projectId') || ''
    const pnameRaw = searchParams?.get('projectName') || ''
    const pname = pnameRaw && pnameRaw !== 'undefined' && pnameRaw !== 'null' ? pnameRaw : ''
    if (pid === 'undefined' || pid === 'null') pid = ''
    let projectIdToSelect = pid || ''
    if (!projectIdToSelect && pname) {
      const match = projects.find(p => p.name.toLowerCase() === pname.toLowerCase())
      if (match) projectIdToSelect = match._id
    }
    if (projectIdToSelect) {
      handleProjectChange(projectIdToSelect)
    }
  }, [projects, searchParams, selectedProject])

  // Preselect task from query params when tasks are loaded
  useEffect(() => {
    if (!tasks || tasks.length === 0) return
    if (selectedTask) return
    if (!selectedProject) return
    
    let tid = searchParams?.get('taskId') || ''
    const tnameRaw = searchParams?.get('taskName') || ''
    const tname = tnameRaw && tnameRaw !== 'undefined' && tnameRaw !== 'null' ? tnameRaw : ''
    if (tid === 'undefined' || tid === 'null') tid = ''
    
    let taskIdToSelect = tid || ''
    if (!taskIdToSelect && tname) {
      const match = tasks.find(t => t.title.toLowerCase() === tname.toLowerCase())
      if (match) taskIdToSelect = match._id
    }
    
    if (taskIdToSelect && tasks.some(t => t._id === taskIdToSelect)) {
      handleTaskChange(taskIdToSelect)
    }
  }, [tasks, searchParams, selectedTask, selectedProject])

  const fetchProjects = async (currentUser?: User | null) => {
    try {
      const response = await fetch('/api/projects')
      const data = await response.json()
      if (data.success && Array.isArray(data.data)) {
        const effectiveUser = currentUser ?? user
        const filtered = data.data.filter((project: any) => {
          const u = effectiveUser
          if (!u) return false
          const allow = project?.settings?.allowTimeTracking
          if (!allow) return false
          const createdByMatch = project?.createdBy === u.id || project?.createdBy?.id === u.id
          const teamMembers = Array.isArray(project?.teamMembers) ? project.teamMembers : []
          const teamMatch = teamMembers.some((memberId: any) => {
            if (typeof memberId === 'string') return memberId === u.id
            return memberId?._id === u.id || memberId?.id === u.id
          })
          const members = Array.isArray(project?.members) ? project.members : []
          const membersMatch = members.some((m: any) => (typeof m === 'string' ? m === u.id : m?.id === u.id || m?._id === u.id))
          return createdByMatch || teamMatch || membersMatch
        })
        setProjects(filtered)
      } else {
        setProjects([])
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err)
      setProjects([])
    }
  }

  const fetchTasks = async (projectId: string) => {
    if (!projectId || !user) {
      setTasks([])
      return
    }

    try {
      const response = await fetch(`/api/tasks?project=${projectId}&assignedTo=${user.id}`)
      const data = await response.json()

      if (data.success && Array.isArray(data.data)) {
        const assignedOnly = data.data.filter((t: any) => {
          const at = t?.assignedTo
          if (!at) return false
          if (typeof at === 'string') return at === user.id
          return at?._id === user.id || at?.id === user.id
        })
        setTasks(assignedOnly)
      } else {
        setTasks([])
      }
    } catch (err) {
      console.error('Failed to fetch tasks:', err)
      setTasks([])
    }
  }

  const handleProjectChange = (projectId: string) => {
    setSelectedProject(projectId)
    setSelectedTask('')
    setTasks([])
    if (projectId) {
      fetchTasks(projectId)
    }
  }

  const handleTaskChange = (taskId: string) => {
    setSelectedTask(taskId === 'none' ? '' : taskId)
    const task = tasks.find(t => t._id === taskId)
    if (task) {
      setDescription(task.title)
    }
  }

  // Debug Timer component rendering
  useEffect(() => {
  
    
    if (selectedProject && user) {
    }
  }, [selectedProject, user])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading timer...</p>
        </div>
      </div>
    )
  }

  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-destructive mb-4">{authError}</p>
          <p className="text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">No user data available</p>
        </div>
      </div>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Button variant="ghost" onClick={() => router.push('/time-tracking')} className="flex-shrink-0 w-full sm:w-auto">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground flex items-center space-x-2">
              <Clock className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 text-blue-600 flex-shrink-0" />
              <span className="truncate">Time Tracker</span>
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">Start tracking time for your tasks</p>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Clock className="h-5 w-5 flex-shrink-0" />
              <span className="text-xl sm:text-2xl">Time Tracker</span>
            </CardTitle>
            <CardDescription className="text-sm sm:text-base">
              Select a project and task, then start tracking your time
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="project">Project *</Label>
                <Select value={selectedProject} onValueChange={handleProjectChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.isArray(projects) && projects.map((project) => (
                      <SelectItem key={project._id} value={project._id}>
                        <div className="flex items-center space-x-2">
                          <FolderOpen className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate">{project.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedProject && (
                <div className="space-y-2">
                  <Label htmlFor="task">Task *</Label>
                  <Select value={selectedTask} onValueChange={handleTaskChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a task" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.isArray(tasks) && tasks.map((task) => (
                        <SelectItem key={task._id} value={task._id}>
                          <div className="flex items-center space-x-2">
                            <Target className="h-4 w-4 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{task.title}</div>
                              <div className="text-xs sm:text-sm text-muted-foreground truncate">
                                {task.status} • {task.priority}
                              </div>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {Array.isArray(tasks) && tasks.length === 0 && (
                    <p className="text-xs text-muted-foreground">No tasks available in this project. Please create or assign a task to start tracking.</p>
                  )}
                </div>
              )}
            </div>

            {selectedProject && (
              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What are you working on?"
                  rows={2}
                  required
                  className="w-full"
                />
              </div>
            )}

            {selectedProject && user && selectedTask && (
              <div className="my-4">
                <Timer
                  userId={user.id}
                  organizationId={user.organization}
                  projectId={selectedProject}
                  taskId={selectedTask || undefined}
                  description={description}
                  onTimerUpdate={(timer) => {
                    if (!timer) {
                      setDescription('')
                      setSelectedTask('')
                      setSelectedProject('')
                      setTasks([])
                    }
                    setLiveActiveTimer(timer ?? null)
                    setTimeLogsRefreshKey((prev) => prev + 1)
                  }}
                />
              </div>
            )}

            {selectedProject && user && !selectedTask && (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground">Select a task to start the timer.</p>
              </div>
            )}

            {user && (
              <TimeLogs
                userId={user.id}
                organizationId={user.organization}
                projectId={selectedProject || undefined}
                taskId={selectedTask || undefined}
                refreshKey={timeLogsRefreshKey}
                liveActiveTimer={liveActiveTimer}
              />
            )}

            {!selectedProject && (
              <div className="text-center py-8">
                <Target className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-base sm:text-lg font-medium mb-2">Select a Project</h3>
                <p className="text-sm sm:text-base text-muted-foreground">
                  Choose a project above to start tracking time
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}