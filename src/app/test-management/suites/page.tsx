'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import TestSuiteCards from '@/components/test-management/TestSuiteCards'
import { TestSuiteForm } from '@/components/test-management/TestSuiteForm'
import { DeleteConfirmDialog } from '@/components/test-management/DeleteConfirmDialog'
import { TestSuiteDetailDialog } from '@/components/test-management/TestSuiteDetailDialog'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/Card'
import { AlertCircle, Plus } from 'lucide-react'
import { Permission } from '@/lib/permissions'
import { PermissionGate } from '@/lib/permissions/permission-components'
import { useNotify } from '@/lib/notify'

interface Project {
  _id: string
  name: string
}

interface TestSuite {
  _id?: string
  name: string
  description: string
  parentSuite?: string
  project: string
}

export default function TestSuitesPage() {
  const router = useRouter()
  const { setItems } = useBreadcrumb()
  const searchParams = useSearchParams()
  const { success: notifySuccess } = useNotify()
  const [projects, setProjects] = useState<Project[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [projectQuery, setProjectQuery] = useState('')

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

  // Project selection inside the create/edit dialog.
  // This is intentionally NOT persisted as the default for the next create flow.
  const [suiteDialogProjectId, setSuiteDialogProjectId] = useState<string>('')
  const [highlightSuiteId, setHighlightSuiteId] = useState<string | null>(null)
  const [testSuiteDialogOpen, setTestSuiteDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedTestSuite, setSelectedTestSuite] = useState<TestSuite | null>(null)
  const [deleteItem, setDeleteItem] = useState<{ id: string; name: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [refreshCounter, setRefreshCounter] = useState(0)
  const [suiteDetailDialogOpen, setSuiteDetailDialogOpen] = useState(false)
  const [detailSuiteId, setDetailSuiteId] = useState<string | null>(null)
  const [suiteDetailRefreshKey, setSuiteDetailRefreshKey] = useState(0)

  useEffect(() => {
    // Set breadcrumb
    setItems([
      { label: 'Test Management', href: '/test-management' },
      { label: 'Test Suites' }
    ])
  }, [setItems])

  useEffect(() => {
    const fetchProjects = async () => {
      setProjectsLoading(true)
      try {
        const res = await fetch('/api/projects')
        const data = await res.json().catch(() => ({}))
        if ((data as any)?.success && Array.isArray((data as any)?.data)) {
          const list = (data as any).data
            .filter((p: any) => p?._id && p?.name)
            .map((p: any) => ({ _id: String(p._id), name: String(p.name) }))
          setProjects(list)
        } else {
          setProjects([])
        }
      } catch (e) {
        console.error('Error fetching projects:', e)
        setProjects([])
      } finally {
        setProjectsLoading(false)
      }
    }

    fetchProjects()
  }, [])

  useEffect(() => {
    const suiteId = searchParams.get('suiteId')
    const projectId = searchParams.get('projectId')

    if (projectId && projectId !== selectedProject) {
      setSelectedProject(projectId)
    }

    setHighlightSuiteId(suiteId)
    // Intentionally respond to URL changes (e.g., navigation from Project → Testing)
  }, [searchParams, selectedProject])

  const filteredProjects = useMemo(() => {
    const q = projectQuery.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p) => (p.name || '').toLowerCase().includes(q))
  }, [projects, projectQuery])

  const handleProjectChange = (projectId: string) => {
    setSelectedProject(projectId)

    const nextParams = new URLSearchParams(searchParams.toString())
    if (projectId) nextParams.set('projectId', projectId)
    else nextParams.delete('projectId')

    const nextQuery = nextParams.toString()
    router.replace(nextQuery ? `/test-management/suites?${nextQuery}` : '/test-management/suites')
  }

  const handleCreateTestSuite = () => {
    if (!selectedProject) return
    setSelectedTestSuite(null)
    setSuiteDialogProjectId(selectedProject)
    setTestSuiteDialogOpen(true)
  }

  const handleEditTestSuite = (testSuite: TestSuite) => {
    setSelectedTestSuite(testSuite)
    setSuiteDialogProjectId(testSuite.project)
    setTestSuiteDialogOpen(true)
  }

  const handleDeleteTestSuite = (testSuiteId: string, testSuiteName: string) => {
    setDeleteItem({ id: testSuiteId, name: testSuiteName })
    setDeleteDialogOpen(true)
  }

  const handleSaveTestSuite = async (testSuiteData: TestSuite) => {
    setSaving(true)
    try {
      const isEdit = !!selectedTestSuite?._id
      const projectIdToUse = isEdit
        ? (selectedTestSuite?.project || testSuiteData.project || selectedProject)
        : (testSuiteData.project || suiteDialogProjectId)
      const response = await fetch('/api/test-suites', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isEdit ? { suiteId: selectedTestSuite._id } : {}),
          name: testSuiteData.name,
          description: testSuiteData.description,
          projectId: projectIdToUse,
          parentSuiteId: testSuiteData.parentSuite,
        })
      })

      if (response.ok) {
        notifySuccess({ title: isEdit ? 'Test Suite updated successfully.' : 'Test Suite created successfully.' })
        setTestSuiteDialogOpen(false)
        setSelectedTestSuite(null)
        setSuiteDialogProjectId('')
        // Keep the list scoped to the last successfully used project.
        if (projectIdToUse && projectIdToUse !== selectedProject) {
          setSelectedProject(projectIdToUse)
        }
        setRefreshCounter(c => c + 1)
        if (detailSuiteId) {
          setSuiteDetailRefreshKey(k => k + 1)
          setSuiteDetailDialogOpen(true)
        }
      } else {
        const data = await response.json().catch(() => ({}))
        console.error('Failed to save test suite', data)
      }
    } catch (error) {
      console.error('Error saving test suite:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteItem) return

    setDeleting(true)
    try {
      const response = await fetch(`/api/test-suites/${deleteItem.id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        notifySuccess({ title: 'Test Suite deleted successfully.' })
        setDeleteDialogOpen(false)
        setDeleteItem(null)
        setRefreshCounter(c => c + 1)
      } else {
        console.error('Failed to delete test suite')
      }
    } catch (error) {
      console.error('Error deleting test suite:', error)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <MainLayout>
      <PermissionGate permission={Permission.TEST_MANAGE}>
        <div className="space-y-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Test Suites</h1>
              <p className="text-muted-foreground">
                Organize your test cases into hierarchical test suites
              </p>
            </div>
            <Button onClick={handleCreateTestSuite} className="w-full sm:w-auto" disabled={!selectedProject}>
              <Plus className="mr-2 h-4 w-4" />
              Create Test Suite
            </Button>
          </div>

          {/* Project Selection (required) */}
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <span className="text-sm font-medium">Project:</span>
              <Select
                value={selectedProject}
                onValueChange={handleProjectChange}
                onOpenChange={(open) => {
                  if (open) {
                    setProjectQuery('')
                    focusSearchInput(projectSearchInputRef.current)
                  }
                }}
                disabled={projectsLoading || projects.length === 0}
              >
                <SelectTrigger className="w-full sm:w-96">
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
                      {filteredProjects.length === 0 ? (
                        <div className="px-2 py-2 text-sm text-muted-foreground">No matching projects</div>
                      ) : (
                        filteredProjects.map((project) => (
                          <SelectItem key={project._id} value={project._id}>
                            {project.name}
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
                <span>Select a project to view its test suites.</span>
              </div>
            )}
          </div>

          {!selectedProject ? (
            <Card>
              <CardContent className="p-6 sm:p-8 text-center">
                <h3 className="text-base sm:text-lg font-semibold mb-2">Select a Project</h3>
                <p className="text-sm sm:text-base text-muted-foreground">
                  Choose a project to view its test suites.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-lg border bg-card p-4 sm:p-6">
              <TestSuiteCards
                key={`suites-${selectedProject}-${refreshCounter}`}
                projectId={selectedProject}
                highlightSuiteId={highlightSuiteId || undefined}
                onSuiteView={(suite) => {
                  setDetailSuiteId(suite._id)
                  setSuiteDetailDialogOpen(true)
                }}
                onSuiteEdit={handleEditTestSuite}
                onSuiteDelete={handleDeleteTestSuite}
                onSuiteCreate={() => {
                  setSelectedTestSuite(null)
                  setSuiteDialogProjectId(selectedProject)
                  setTestSuiteDialogOpen(true)
                }}
              />
            </div>
          )}

          {/* Dialogs */}
          <ResponsiveDialog
            open={testSuiteDialogOpen}
            onOpenChange={(open) => {
              setTestSuiteDialogOpen(open)
              if (!open) {
                setSelectedTestSuite(null)
                setSuiteDialogProjectId('')
              }
            }}
            title={selectedTestSuite ? 'Edit Test Suite' : 'Create Test Suite'}
            dismissible={false}
            footer={
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setTestSuiteDialogOpen(false)
                    setSelectedTestSuite(null)
                    setSuiteDialogProjectId('')
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  form="test-suite-form"
                >
                  {saving ? 'Saving...' : (selectedTestSuite?._id ? 'Update Test Suite' : 'Create Test Suite')}
                </Button>
              </>
            }
          >
            <TestSuiteForm
              testSuite={selectedTestSuite || undefined}
              projectId={selectedTestSuite?.project || suiteDialogProjectId}
              showProjectSelector={true}
              onProjectChange={(newProjectId) => setSuiteDialogProjectId(newProjectId)}
              onSave={handleSaveTestSuite}
              onCancel={() => {
                setTestSuiteDialogOpen(false)
                setSelectedTestSuite(null)
                setSuiteDialogProjectId('')
                if (detailSuiteId) {
                  setSuiteDetailDialogOpen(true)
                }
              }}
              loading={saving}
            />
          </ResponsiveDialog>

          <TestSuiteDetailDialog
            suiteId={detailSuiteId}
            open={suiteDetailDialogOpen}
            onOpenChange={setSuiteDetailDialogOpen}
            refreshKey={suiteDetailRefreshKey}
            onEdit={(suite) => {
              setSuiteDetailDialogOpen(false)
              setSelectedTestSuite({
                _id: suite._id,
                name: suite.name,
                description: suite.description,
                parentSuite: suite.parentSuite?._id,
                project: selectedProject,
              })
              setTestSuiteDialogOpen(true)
            }}
            onDelete={(suiteId) => {
              setSuiteDetailDialogOpen(false)
              handleDeleteTestSuite(suiteId, '')
            }}
            onCreateChild={(parentSuiteId) => {
              setSuiteDetailDialogOpen(false)
              setSelectedTestSuite(null)
              setSuiteDialogProjectId('')
              setTestSuiteDialogOpen(true)
            }}
            onChildSuiteClick={(childSuiteId) => {
              setDetailSuiteId(childSuiteId)
            }}
          />

          <DeleteConfirmDialog
            isOpen={deleteDialogOpen}
            onClose={() => {
              setDeleteDialogOpen(false)
              setDeleteItem(null)
            }}
            onConfirm={handleConfirmDelete}
            title="Delete Test Suite"
            itemName={deleteItem?.name || ''}
            itemType="Test Suite"
            loading={deleting}
          />
        </div>
      </PermissionGate>
    </MainLayout>
  )
}

