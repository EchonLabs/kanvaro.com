'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { PermissionGate } from '@/lib/permissions/permission-components'
import { Permission } from '@/lib/permissions'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Play, AlertCircle } from 'lucide-react'
import { TestExecutionForm } from '@/components/test-management/TestExecutionForm'
import { useNotify } from '@/lib/notify'

interface Project {
  _id: string
  name: string
  description?: string
  status?: string
}

export default function NewTestExecutionPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setItems } = useBreadcrumb()
  const { success: notifySuccess, error: notifyError } = useNotify()

  const projectIdFromQuery = searchParams.get('projectId') || ''
  const testCaseIdFromQuery = searchParams.get('testCaseId') || ''

  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<string>(projectIdFromQuery)
  const [projectQuery, setProjectQuery] = useState('')
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setItems([
      { label: 'Test Management', href: '/test-management' },
      { label: 'Test Executions', href: '/test-management/executions' },
      { label: 'Execute Test' }
    ])
  }, [setItems])

  useEffect(() => {
    // If user navigates here with a different projectId in the URL, prefer it.
    if (projectIdFromQuery && projectIdFromQuery !== selectedProject) {
      setSelectedProject(projectIdFromQuery)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIdFromQuery])

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setProjectsLoading(true)
        const res = await fetch('/api/projects')
        const data = await res.json()
        if (data?.success && Array.isArray(data.data)) {
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

  const filteredProjects = useMemo(() => {
    const q = projectQuery.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p) => (p.name || '').toLowerCase().includes(q))
  }, [projects, projectQuery])

  const handleSave = async (executionData: any) => {
    setSaving(true)
    try {
      const payload = {
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

      const res = await fetch('/api/test-executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await res.json().catch(() => ({}))
      if (res.ok && (data as any)?.success && (data as any)?.data?._id) {
        notifySuccess({ title: 'Test execution created.' })
        router.push(`/test-management/executions/${encodeURIComponent((data as any).data._id)}`)
        return
      }

      notifyError({
        title: 'Failed to create test execution.',
        message: (data as any)?.error || 'Please try again.'
      })
      console.error('Failed to create test execution', data)
    } catch (e) {
      notifyError({ title: 'Failed to create test execution.', message: 'Please try again.' })
      console.error('Error creating test execution:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <MainLayout>
      <PermissionGate permission={Permission.TEST_MANAGE}>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Execute Test</h1>
              <p className="text-muted-foreground">Record a test execution result</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Button variant="outline" onClick={() => router.back()} className="w-full sm:w-auto">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={() => {
                  // Let the form submit itself; this button is just a visual affordance.
                  const el = document.getElementById('test-execution-submit') as HTMLButtonElement | null
                  el?.click()
                }}
                disabled={!selectedProject || saving}
                className="w-full sm:w-auto"
              >
                <Play className="mr-2 h-4 w-4" />
                Execute Test
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Project</CardTitle>
              <CardDescription>Select the project to execute tests against</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Select
                value={selectedProject}
                onValueChange={setSelectedProject}
                onOpenChange={(open) => {
                  if (open) setProjectQuery('')
                }}
                disabled={projectsLoading}
              >
                <SelectTrigger className="w-full sm:w-96">
                  <SelectValue placeholder={projectsLoading ? 'Loading projects...' : 'Select a project'} />
                </SelectTrigger>
                <SelectContent className="p-0">
                  <div className="p-2">
                    <Input
                      value={projectQuery}
                      onChange={(e) => setProjectQuery(e.target.value)}
                      placeholder="Search projects"
                      className="mb-2"
                      onKeyDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="max-h-56 overflow-y-auto">
                      {filteredProjects.length === 0 ? (
                        <div className="px-2 py-2 text-sm text-muted-foreground">No matching projects</div>
                      ) : (
                        filteredProjects.map((p) => (
                          <SelectItem key={p._id} value={p._id}>
                            {p.name}
                          </SelectItem>
                        ))
                      )}
                    </div>
                  </div>
                </SelectContent>
              </Select>

              {!selectedProject && (
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <AlertCircle className="h-4 w-4" />
                  <span>Please select a project to execute a test</span>
                </div>
              )}
            </CardContent>
          </Card>

          {selectedProject && (
            <Card>
              <CardHeader>
                <CardTitle>Execution Details</CardTitle>
                <CardDescription>Select suite and test case, then record results</CardDescription>
              </CardHeader>
              <CardContent>
                <TestExecutionForm
                  projectId={selectedProject}
                  initialTestCaseId={testCaseIdFromQuery || undefined}
                  onSave={handleSave}
                  onCancel={() => router.back()}
                  loading={saving}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </PermissionGate>
    </MainLayout>
  )
}
