'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GanttChart } from '@/components/reports/GanttChart'
import { GanttData, GanttTask } from '@/lib/gantt'
import { Calendar, Filter, Download } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function GanttReportPage() {
  const [ganttData, setGanttData] = useState<GanttData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    project: '',
    sprint: '',
    assignee: '',
    startDate: '',
    endDate: ''
  })
  const ALL_PROJECTS = '__ALL_PROJECTS__'
  const ALL_SPRINTS = '__ALL_SPRINTS__'
  const ALL_ASSIGNEES = '__ALL_ASSIGNEES__'
  const [projects, setProjects] = useState<any[]>([])
  const [sprints, setSprints] = useState<any[]>([])
  const [assignees, setAssignees] = useState<any[]>([])
  const router = useRouter()

  useEffect(() => {
    loadGanttData()
  }, [filters])

  useEffect(() => {
    loadFilterOptions()
  }, [filters.project])

  const loadGanttData = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      
      if (filters.project) params.append('projectId', filters.project)
      if (filters.sprint) params.append('sprintId', filters.sprint)
      if (filters.assignee) params.append('assigneeId', filters.assignee)
      if (filters.startDate) params.append('startDate', filters.startDate)
      if (filters.endDate) params.append('endDate', filters.endDate)

      const response = await fetch(`/api/reports/gantt?${params}`)
      if (response.ok) {
        const data = await response.json()
        setGanttData(data)
      }
    } catch (error) {
      console.error('Failed to load Gantt data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadFilterOptions = async () => {
    try {
      // Load projects
      const projectsResponse = await fetch('/api/projects')
      if (projectsResponse.ok) {
        const projectsData = await projectsResponse.json()
        const projectsArray = Array.isArray(projectsData)
          ? projectsData
          : (projectsData?.data && Array.isArray(projectsData.data) ? projectsData.data : [])
        setProjects(projectsArray)
      }

      // Load sprints if project is selected
      if (filters.project) {
        const sprintsResponse = await fetch(`/api/sprints?project=${filters.project}`)
        if (sprintsResponse.ok) {
          const sprintsData = await sprintsResponse.json()
          const sprintsArray = Array.isArray(sprintsData)
            ? sprintsData
            : (sprintsData?.data && Array.isArray(sprintsData.data) ? sprintsData.data : [])
          setSprints(sprintsArray)
        }
      }

      // Load assignees
      const assigneesResponse = await fetch('/api/members')
      if (assigneesResponse.ok) {
        const assigneesData = await assigneesResponse.json()
        const assigneesArray = Array.isArray(assigneesData)
          ? assigneesData
          : (assigneesData?.data && Array.isArray(assigneesData.data) ? assigneesData.data : [])
        setAssignees(assigneesArray)
      }
    } catch (error) {
      console.error('Failed to load filter options:', error)
    }
  }

  const handleTaskClick = (task: GanttTask) => {
    // Navigate to task detail page
    router.push(`/tasks/${task.id}`)
  }

  const handleExport = () => {
    const params = new URLSearchParams()
    if (filters.project) params.append('projectId', filters.project)
    if (filters.sprint) params.append('sprintId', filters.sprint)
    if (filters.assignee) params.append('assigneeId', filters.assignee)
    if (filters.startDate) params.append('startDate', filters.startDate)
    if (filters.endDate) params.append('endDate', filters.endDate)
    params.append('format', 'csv')
    // Trigger browser download
    window.location.href = `/api/reports/gantt/export?${params.toString()}`
  }

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }))
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading Gantt chart...</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <PageWrapper>
        <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold truncate">Gantt Chart</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Visualize project timelines and dependencies
          </p>
        </div>
        <Button onClick={handleExport} className="flex items-center gap-2 w-full sm:w-auto">
          <Download className="h-4 w-4" />
          Export
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Filter className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label htmlFor="project" className="text-xs sm:text-sm">Project</Label>
              <Select
                value={filters.project || ALL_PROJECTS}
                onValueChange={(value) => handleFilterChange('project', value === ALL_PROJECTS ? '' : value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_PROJECTS}>All projects</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project._id} value={project._id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sprint" className="text-xs sm:text-sm">Sprint</Label>
              <Select
                value={filters.sprint || ALL_SPRINTS}
                onValueChange={(value) => handleFilterChange('sprint', value === ALL_SPRINTS ? '' : value)}
                disabled={!filters.project}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All sprints" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SPRINTS}>All sprints</SelectItem>
                  {sprints.map((sprint) => (
                    <SelectItem key={sprint._id} value={sprint._id}>
                      {sprint.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="assignee" className="text-xs sm:text-sm">Assignee</Label>
              <Select
                value={filters.assignee || ALL_ASSIGNEES}
                onValueChange={(value) => handleFilterChange('assignee', value === ALL_ASSIGNEES ? '' : value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All assignees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_ASSIGNEES}>All assignees</SelectItem>
                  {assignees.map((assignee) => (
                    <SelectItem key={assignee._id} value={assignee._id}>
                      {assignee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="startDate" className="text-xs sm:text-sm">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate" className="text-xs sm:text-sm">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                className="w-full"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gantt Chart */}
      {ganttData && ganttData.tasks.length > 0 ? (
        <div className="overflow-x-auto">
          <GanttChart
            tasks={ganttData.tasks}
            startDate={ganttData.startDate}
            endDate={ganttData.endDate}
            onTaskClick={handleTaskClick}
          />
        </div>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center h-64">
            <div className="text-center px-4">
              <Calendar className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-base sm:text-lg font-semibold mb-2">No tasks found</h3>
              <p className="text-sm sm:text-base text-muted-foreground">
                Try adjusting your filters or create some tasks to see the Gantt chart.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
        </div>
      </PageWrapper>
    </MainLayout>
  )
}
