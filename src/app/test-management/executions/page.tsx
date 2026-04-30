'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import { TestExecutionForm } from '@/components/test-management/TestExecutionForm'
import { DeleteConfirmDialog } from '@/components/test-management/DeleteConfirmDialog'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { Play, Calendar, User, Clock, CheckCircle, XCircle, AlertCircle, SkipForward, Edit, Eye, Trash2, MoreVertical } from 'lucide-react'
import { Permission } from '@/lib/permissions'
import { PermissionGate } from '@/lib/permissions/permission-components'
import { useNotify } from '@/lib/notify'

interface TestExecution {
  _id?: string
  testCase: string
  testPlan?: string
  status: 'passed' | 'failed' | 'blocked' | 'skipped'
  actualResult: string
  comments: string
  executionTime: number
  environment: string
  version: string
  attachments?: string[]
}

interface Project {
  _id: string
  name: string
  description?: string
  status?: string
}

interface ExecutionRow {
  _id: string
  testCase?: { _id: string; title: string } | string
  testPlan?: { _id: string; name: string; version?: string } | string
  project?: { _id: string; name: string } | string
  executedBy?: { firstName?: string; lastName?: string; email?: string }
  status: TestExecution['status']
  actualResult: string
  comments: string
  executionTime: number
  environment: string
  version: string
  attachments?: string[]
  executedAt?: string
}

type ApiResponse<T> = {
  success?: boolean
  data?: T
  error?: string
}

export default function TestExecutionsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setItems } = useBreadcrumb()
  const { success: notifySuccess, error: notifyError } = useNotify()

  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [projectQuery, setProjectQuery] = useState('')
  const [projectsLoading, setProjectsLoading] = useState(true)

  // Helper function to focus filter search inputs
  const focusSearchInput = (el: HTMLInputElement | null) => {
    if (!el || el.disabled) return

    const doFocus = () => {
      el.focus({ preventScroll: true })
      try {
        el.select?.()
      } catch {
        // ignore
      }
    }

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(doFocus)
    } else {
      setTimeout(doFocus, 0)
    }
  }

  const projectSearchInputRef = useRef<HTMLInputElement | null>(null)

  const [testExecutionDialogOpen, setTestExecutionDialogOpen] = useState(false)
  const [selectedTestExecution, setSelectedTestExecution] = useState<TestExecution | null>(null)
  const [saving, setSaving] = useState(false)
  const [executions, setExecutions] = useState<ExecutionRow[]>([])
  const [loading, setLoading] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const { formatDate, formatTime } = useDateTime()

  useEffect(() => {
    // Set breadcrumb
    setItems([
      { label: 'Test Management', href: '/test-management' },
      { label: 'Test Executions' }
    ])
  }, [setItems])

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setProjectsLoading(true)
        const res = await fetch('/api/projects')
        const data = await res.json().catch(() => ({}))
        if (res.ok && data?.success && Array.isArray(data.data)) {
          setProjects(data.data)
        } else {
          setProjects([])
        }
      } catch {
        setProjects([])
      } finally {
        setProjectsLoading(false)
      }
    }

    fetchProjects()
  }, [])

  useEffect(() => {
    if (projectsLoading) return
    if (selectedProject) return

    const fromQuery = searchParams.get('projectId')
    if (!fromQuery) return
    if (!projects.some((p) => p._id === fromQuery)) return

    setSelectedProject(fromQuery)
  }, [searchParams, projectsLoading, projects, selectedProject])

  useEffect(() => {
    const fetchExecutions = async () => {
      if (!selectedProject) {
        setExecutions([])
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const res = await fetch(`/api/test-executions?projectId=${encodeURIComponent(selectedProject)}&page=1&limit=200`)
        const data = (await res.json().catch(() => ({}))) as ApiResponse<ExecutionRow[]>
        if (res.ok && data?.success && Array.isArray(data.data)) {
          setExecutions(data.data as ExecutionRow[])
        } else {
          setExecutions([])
        }
      } catch {
        setExecutions([])
      } finally {
        setLoading(false)
      }
    }

    fetchExecutions()
  }, [selectedProject])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed': return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />
      case 'blocked': return <AlertCircle className="h-4 w-4 text-yellow-500" />
      case 'skipped': return <SkipForward className="h-4 w-4 text-gray-500" />
      default: return <AlertCircle className="h-4 w-4 text-gray-500" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed': return 'bg-green-100 text-green-800'
      case 'failed': return 'bg-red-100 text-red-800'
      case 'blocked': return 'bg-yellow-100 text-yellow-800'
      case 'skipped': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDuration = (seconds: number) => {
    if (seconds === 0) return 'N/A'
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  const formatDateTime = (dateString: string) => {
    return `${formatDate(dateString)} ${formatTime(dateString)}`
  }

  const handleExecuteTest = () => {
    if (!selectedProject) return
    router.push(`/test-management/executions/new?projectId=${encodeURIComponent(selectedProject)}`)
  }

  const handleEditTestExecution = (execution: ExecutionRow) => {
    const mapped: TestExecution = {
      _id: execution._id,
      testCase: typeof execution.testCase === 'string' ? execution.testCase : execution.testCase?._id ?? '',
      testPlan: typeof execution.testPlan === 'string' ? execution.testPlan : execution.testPlan?._id,
      status: execution.status,
      actualResult: execution.actualResult,
      comments: execution.comments,
      executionTime: execution.executionTime,
      environment: execution.environment,
      version: execution.version,
      attachments: execution.attachments || [],
    }

    setSelectedTestExecution(mapped)
    setTestExecutionDialogOpen(true)
  }

  const handleViewTestExecution = (id: string) => {
    router.push(`/test-management/executions/${id}`)
  }

  const handleDeleteTestExecution = async (id: string) => {
    setDeleteId(id)
    setDeleteDialogOpen(true)
  }

  const handleSaveTestExecution = async (executionData: TestExecution) => {
    if (!selectedTestExecution?._id) return

    setSaving(true)
    try {
      const url = `/api/test-executions/${selectedTestExecution._id}`
      const payload = {
        status: executionData.status,
        actualResult: executionData.actualResult,
        comments: executionData.comments,
        executionTime: executionData.executionTime,
        environment: executionData.environment,
        version: executionData.version,
        attachments: executionData.attachments || []
      }

      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await response.json().catch(() => ({}))

      if (response.ok && (data as any)?.success !== false) {
        notifySuccess({ title: 'Test execution updated.' })
        setTestExecutionDialogOpen(false)
        setSelectedTestExecution(null)

        // Refresh list
        const res = await fetch(`/api/test-executions?projectId=${encodeURIComponent(selectedProject)}&page=1&limit=200`)
        const refreshed = (await res.json().catch(() => ({}))) as ApiResponse<ExecutionRow[]>
        if (res.ok && refreshed?.success && Array.isArray(refreshed.data)) {
          setExecutions(refreshed.data as ExecutionRow[])
        }
      } else {
        notifyError({
          title: 'Failed to update test execution.',
          message: (data as any)?.error || 'Please try again.'
        })
        console.error('Failed to update test execution', data)
      }
    } catch (error) {
      notifyError({ title: 'Failed to update test execution.', message: 'Please try again.' })
      console.error('Error saving test execution:', error)
    } finally {
      setSaving(false)
    }
  }

  const deleteExecution = deleteId ? executions.find((e) => e._id === deleteId) : undefined

  return (
    <MainLayout>
      <PermissionGate permission={Permission.TEST_MANAGE}>
        <div className="space-y-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Test Executions</h1>
              <p className="text-muted-foreground">
                Track and manage test execution results
              </p>
            </div>
            <Button onClick={handleExecuteTest} className="w-full sm:w-auto" disabled={!selectedProject}>
              <Play className="mr-2 h-4 w-4" />
              Execute Test
            </Button>
          </div>

          {/* Project Selection */}
          <div className="space-y-1">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <label htmlFor="project-select" className="text-sm font-medium">
                Project:
              </label>
              <Select
                value={selectedProject}
                onValueChange={setSelectedProject}
                onOpenChange={(open) => {
                  if (open) {
                    setProjectQuery('')
                    focusSearchInput(projectSearchInputRef.current)
                  }
                }}
                disabled={projectsLoading}
              >
                <SelectTrigger id="project-select" className="w-full sm:w-96">
                  <SelectValue placeholder={projectsLoading ? 'Loading projects...' : 'Select a project'} />
                </SelectTrigger>
                <SelectContent className="p-0">
                  <div className="p-2">
                    <Input
                      ref={projectSearchInputRef}
                      value={projectQuery}
                      onChange={(e) => setProjectQuery(e.target.value)}
                      placeholder="Search projects"
                      className="mb-2"
                      onKeyDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="max-h-56 overflow-y-auto">
                      {(projects.filter(p => !projectQuery.trim() || (p.name || '').toLowerCase().includes(projectQuery.toLowerCase()))).length === 0 ? (
                        <div className="px-2 py-2 text-sm text-muted-foreground">No matching projects</div>
                      ) : (
                        projects
                          .filter(p => !projectQuery.trim() || (p.name || '').toLowerCase().includes(projectQuery.toLowerCase()))
                          .map((p) => (
                            <SelectItem key={p._id} value={p._id}>
                              {p.name}
                            </SelectItem>
                          ))
                      )}
                    </div>
                  </div>
                </SelectContent>
              </Select>
            </div>
            {!selectedProject && (
              <div className="flex items-center gap-2 text-sm text-amber-600">
                <AlertCircle className="h-4 w-4" />
                <span>Please select a project to view and execute tests</span>
              </div>
            )}
          </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Test Executions</CardTitle>
              <CardDescription>
                {selectedProject ? 'Latest test execution results for the selected project' : 'Select a project to see executions'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Test Case</TableHead>
                    <TableHead>Test Plan</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tester</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Executed</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead className="w-12">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={9}>Loading…</TableCell>
                    </TableRow>
                  ) : executions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9}>No test executions found</TableCell>
                    </TableRow>
                  ) : executions.map((execution) => (
                    <TableRow key={execution._id}>
                      <TableCell className="font-medium">
                        {typeof execution.testCase === 'string' ? execution.testCase : execution.testCase?.title || '—'}
                      </TableCell>
                      <TableCell>
                        {typeof execution.testPlan === 'string' ? execution.testPlan : execution.testPlan?.name || 'N/A'}
                      </TableCell>
                      <TableCell>
                        {typeof execution.project === 'string' ? execution.project : execution.project?.name || '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(execution.status)}
                          <Badge className={getStatusColor(execution.status)}>
                            {execution.status.charAt(0).toUpperCase() + execution.status.slice(1)}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <User className="h-4 w-4" />
                          <span>{(execution?.executedBy?.firstName || '') + ' ' + (execution?.executedBy?.lastName || '') || execution?.executedBy?.email || '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Clock className="h-4 w-4" />
                          <span>{formatDuration(execution.executionTime)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Calendar className="h-4 w-4" />
                          <span>{execution?.executedAt ? formatDateTime(execution.executedAt) : '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell>{execution.version}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Open actions">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-36">
                            <DropdownMenuItem onClick={() => handleViewTestExecution(execution._id)}>
                              <Eye className="h-4 w-4 mr-2" /> View
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEditTestExecution(execution)}>
                              <Edit className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDeleteTestExecution(execution._id)} className="text-red-600 focus:text-red-700">
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
          </CardContent>
          </Card>
        </div>

        {/* Dialog */}
        <ResponsiveDialog
          open={testExecutionDialogOpen}
          onOpenChange={setTestExecutionDialogOpen}
          title="Edit Test Execution"
          dismissible={false}
        >
          <TestExecutionForm
            testExecution={selectedTestExecution || undefined}
            projectId={selectedProject}
            onSave={handleSaveTestExecution}
            onCancel={() => {
              setTestExecutionDialogOpen(false)
              setSelectedTestExecution(null)
            }}
            loading={saving}
          />
        </ResponsiveDialog>
        <DeleteConfirmDialog
          isOpen={deleteDialogOpen}
          onClose={() => {
            setDeleteDialogOpen(false)
            setDeleteId(null)
          }}
          onConfirm={async () => {
            if (!deleteId) return
            try {
              const res = await fetch(`/api/test-executions/${deleteId}`, { method: 'DELETE' })
              const data = await res.json().catch(() => ({}))

              if (res.ok && (data as any)?.success !== false) {
                notifySuccess({ title: 'Test execution deleted.' })
                const refreshed = await fetch(`/api/test-executions?projectId=${encodeURIComponent(selectedProject)}&page=1&limit=200`)
                const refreshedData = (await refreshed.json().catch(() => ({}))) as ApiResponse<ExecutionRow[]>
                if (refreshed.ok && refreshedData?.success && Array.isArray(refreshedData.data)) {
                  setExecutions(refreshedData.data as ExecutionRow[])
                } else {
                  setExecutions((prev) => prev.filter((e) => e._id !== deleteId))
                }
              } else {
                notifyError({
                  title: 'Failed to delete test execution.',
                  message: (data as any)?.error || 'Please try again.'
                })
                console.error('Failed to delete execution', data)
              }
            } catch (e) {
              notifyError({ title: 'Failed to delete test execution.', message: 'Please try again.' })
              console.error('Error deleting execution:', e)
            } finally {
              setDeleteDialogOpen(false)
              setDeleteId(null)
            }
          }}
          title="Delete Test Execution"
          itemName={String(
            typeof deleteExecution?.testCase === 'string'
              ? deleteExecution.testCase
              : deleteExecution?.testCase?.title || 'this execution'
          )}
          itemType="Test Execution"
        />
      </div>
      </PermissionGate>
    </MainLayout>
  )
}
