'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Separator } from '@/components/ui/Separator'
import { Play, ArrowLeft, CheckCircle, XCircle, AlertTriangle, Clock, Calendar, User, FileText, Edit, Trash2 } from 'lucide-react'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { TestExecutionForm } from '@/components/test-management/TestExecutionForm'
import { DeleteConfirmDialog } from '@/components/test-management/DeleteConfirmDialog'

interface Execution {
  _id: string
  testCase?: { _id: string; title: string; priority?: string; category?: string }
  testPlan?: { _id: string; name: string; version?: string }
  project?: { _id: string; name: string }
  executedBy?: { firstName?: string; lastName?: string; email?: string }
  status: 'passed' | 'failed' | 'blocked' | 'skipped'
  actualResult: string
  comments: string
  executionTime: number
  environment: string
  version: string
  attachments?: string[]
  executedAt?: string
}

export default function TestExecutionViewPage() {
  const router = useRouter()
  const params = useParams() as { id: string }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [execution, setExecution] = useState<Execution | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    const fetchExecution = async () => {
      if (!params?.id) return
      try {
        setLoading(true)
        const res = await fetch(`/api/test-executions/${params.id}`)
        const data = await res.json()
        if (res.ok && data?.success) {
          setExecution(data.data)
        } else {
          setError(data?.error || 'Failed to load execution')
        }
      } catch (e: any) {
        setError('Failed to load execution')
      } finally {
        setLoading(false)
      }
    }
    fetchExecution()
  }, [params?.id])

  const mappedForForm = useMemo(() => {
    if (!execution) return undefined
    return {
      _id: execution._id,
      testCase: (execution as any)?.testCase?._id || (execution as any)?.testCase,
      testPlan: (execution as any)?.testPlan?._id || (execution as any)?.testPlan,
      status: execution.status,
      actualResult: execution.actualResult,
      comments: execution.comments,
      executionTime: execution.executionTime,
      environment: execution.environment,
      version: execution.version,
      attachments: (execution as any)?.attachments || []
    }
  }, [execution])

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'passed': return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'failed': return <XCircle className="h-4 w-4 text-red-600" />
      case 'blocked': return <AlertTriangle className="h-4 w-4 text-yellow-600" />
      case 'skipped': return <Clock className="h-4 w-4 text-gray-600" />
      default: return <Play className="h-4 w-4 text-blue-600" />
    }
  }

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'passed': return 'bg-green-100 text-green-800'
      case 'failed': return 'bg-red-100 text-red-800'
      case 'blocked': return 'bg-yellow-100 text-yellow-800'
      case 'skipped': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return 'N/A'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}m ${s}s`
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleString()
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h1 className="text-2xl font-bold">Test Execution</h1>
          </div>
          {execution && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Edit className="h-4 w-4 mr-2" /> Edit
              </Button>
              <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </Button>
            </div>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Execution Details</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-muted-foreground">Loading…</div>
            ) : error ? (
              <div className="text-red-600 text-sm">{error}</div>
            ) : execution ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Test Case</div>
                    <div className="text-sm font-medium flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      {execution.testCase?.title ?? String(execution?.testCase ?? '—')}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Test Plan</div>
                    <div className="text-sm">{execution.testPlan?.name || '—'}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Project</div>
                    <div className="text-sm">{execution.project?.name || '—'}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Tester</div>
                    <div className="text-sm flex items-center gap-2">
                      <User className="h-4 w-4" />
                      {(execution.executedBy?.firstName || '') + ' ' + (execution.executedBy?.lastName || '') || execution.executedBy?.email || '—'}
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Status</div>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(execution.status)}
                      <Badge className={getStatusColor(execution.status)}>
                        {execution.status.charAt(0).toUpperCase() + execution.status.slice(1)}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Executed At</div>
                    <div className="text-sm flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {formatDate(execution.executedAt)}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Duration</div>
                    <div className="text-sm">{formatDuration(execution.executionTime)}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Environment</div>
                    <div className="text-sm">{execution.environment || '—'}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Version</div>
                    <div className="text-sm">{execution.version || '—'}</div>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Actual Result</div>
                    <div className="text-sm whitespace-pre-wrap">{execution.actualResult || '—'}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Comments</div>
                    <div className="text-sm whitespace-pre-wrap">{execution.comments || '—'}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground">Execution not found</div>
            )}
          </CardContent>
        </Card>
        <ResponsiveDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          title="Edit Test Execution"
        >
          <TestExecutionForm
            testExecution={mappedForForm}
            projectId={String((execution as any)?.project?._id || '')}
            onSave={async (formData: any) => {
              if (!execution) return
              setSaving(true)
              try {
                const payload = {
                  status: formData.status,
                  actualResult: formData.actualResult,
                  comments: formData.comments,
                  executionTime: formData.executionTime,
                  environment: formData.environment,
                  version: formData.version,
                  attachments: formData.attachments || []
                }
                const res = await fetch(`/api/test-executions/${execution._id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload)
                })
                const data = await res.json()
                if (res.ok && data?.success) {
                  setEditOpen(false)
                  // refetch execution
                  const refreshed = await fetch(`/api/test-executions/${execution._id}`)
                  const refreshedData = await refreshed.json()
                  if (refreshed.ok && refreshedData?.success) setExecution(refreshedData.data)
                } else {
                  console.error('Failed to update execution')
                }
              } catch (e) {
                console.error('Error updating execution:', e)
              } finally {
                setSaving(false)
              }
            }}
            onCancel={() => setEditOpen(false)}
            loading={saving}
          />
        </ResponsiveDialog>

        <DeleteConfirmDialog
          isOpen={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onConfirm={async () => {
            if (!execution) return
            try {
              const res = await fetch(`/api/test-executions/${execution._id}`, { method: 'DELETE' })
              if (res.ok) {
                router.push('/test-management/executions')
              } else {
                console.error('Failed to delete test execution')
              }
            } catch (e) {
              console.error('Error deleting execution:', e)
            } finally {
              setDeleteOpen(false)
            }
          }}
          title="Delete Test Execution"
          itemName={String(execution?.testCase && (execution as any)?.testCase?.title ? (execution as any).testCase.title : (execution as any)?.testCase || 'this execution')}
          itemType="Test Execution"
        />
      </div>
    </MainLayout>
  )
}
