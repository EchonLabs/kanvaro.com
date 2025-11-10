'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import { TestExecutionForm } from '@/components/test-management/TestExecutionForm'
import { DeleteConfirmDialog } from '@/components/test-management/DeleteConfirmDialog'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { Play, Calendar, User, Clock, CheckCircle, XCircle, AlertCircle, SkipForward, Edit, Eye, Trash2, MoreVertical } from 'lucide-react'

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

export default function TestExecutionsPage() {
  const router = useRouter()
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [testExecutionDialogOpen, setTestExecutionDialogOpen] = useState(false)
  const [selectedTestExecution, setSelectedTestExecution] = useState<TestExecution | null>(null)
  const [saving, setSaving] = useState(false)
  const [executions, setExecutions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => {
    const fetchExecutions = async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/test-executions')
        const data = await res.json()
        if (res.ok && data?.success && Array.isArray(data.data)) {
          setExecutions(data.data)
        } else {
          setExecutions([])
        }
      } catch (e) {
        setExecutions([])
      } finally {
        setLoading(false)
      }
    }
    fetchExecutions()
  }, [])

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const handleExecuteTest = () => {
    setSelectedTestExecution(null)
    setTestExecutionDialogOpen(true)
  }

  const handleEditTestExecution = (execution: TestExecution) => {
    setSelectedTestExecution(execution)
    setTestExecutionDialogOpen(true)
  }

  const handleViewTestExecution = (id: string) => {
    router.push(`/test-management/executions/${id}`)
  }

  const handleDeleteTestExecution = async (id: string) => {
    setDeleteId(id)
    setDeleteDialogOpen(true)
  }

  const handleSaveTestExecution = async (executionData: any) => {
    setSaving(true)
    try {
      const url = selectedTestExecution?._id 
        ? `/api/test-executions/${selectedTestExecution._id}`
        : '/api/test-executions'
      
      const method = selectedTestExecution?._id ? 'PUT' : 'POST'
      const payload = selectedTestExecution?._id
        ? {
            status: executionData.status,
            actualResult: executionData.actualResult,
            comments: executionData.comments,
            executionTime: executionData.executionTime,
            environment: executionData.environment,
            version: executionData.version,
            attachments: executionData.attachments || []
          }
        : {
            testCaseId: executionData.testCase,
            testPlanId: executionData.testPlan || undefined,
            status: executionData.status,
            actualResult: executionData.actualResult,
            comments: executionData.comments,
            executionTime: executionData.executionTime,
            environment: executionData.environment,
            version: executionData.version,
            attachments: executionData.attachments || []
          }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        setTestExecutionDialogOpen(false)
        setSelectedTestExecution(null)
        const res = await fetch('/api/test-executions')
        const data = await res.json().catch(() => ({}))
        if (res.ok && (data as any)?.success && Array.isArray((data as any).data)) {
          setExecutions((data as any).data)
        }
      } else {
        console.error('Failed to save test execution')
      }
    } catch (error) {
      console.error('Error saving test execution:', error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Test Executions</h1>
            <p className="text-muted-foreground">
              Track and manage test execution results
            </p>
          </div>
          <Button onClick={handleExecuteTest} className="w-full sm:w-auto">
            <Play className="mr-2 h-4 w-4" />
            Execute Test
          </Button>
        </div>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Test Executions</CardTitle>
              <CardDescription>
                Latest test execution results across all projects
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
                  ) : executions.map((execution: any) => (
                    <TableRow key={execution._id}>
                      <TableCell className="font-medium">
                        {execution?.testCase?.title || execution.testCase}
                      </TableCell>
                      <TableCell>{execution?.testPlan?.name || 'N/A'}</TableCell>
                      <TableCell>{execution?.project?.name || execution.project}</TableCell>
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
                          <span>{execution?.executedAt ? formatDate(execution.executedAt) : '—'}</span>
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
          title={selectedTestExecution ? 'Edit Test Execution' : 'Execute Test Case'}
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
              if (res.ok) {
                const refreshed = await fetch('/api/test-executions')
                const data = await refreshed.json().catch(() => ({}))
                if (refreshed.ok && (data as any)?.success && Array.isArray((data as any).data)) {
                  setExecutions((data as any).data)
                } else {
                  setExecutions(prev => prev.filter(e => e._id !== deleteId))
                }
              } else {
                console.error('Failed to delete execution')
              }
            } catch (e) {
              console.error('Error deleting execution:', e)
            } finally {
              setDeleteDialogOpen(false)
              setDeleteId(null)
            }
          }}
          title="Delete Test Execution"
          itemName={String((executions.find(e => e._id === deleteId)?.testCase?.title) || (executions.find(e => e._id === deleteId)?.testCase) || 'this execution')}
          itemType="Test Execution"
        />
      </div>
    </MainLayout>
  )
}
