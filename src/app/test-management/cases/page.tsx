'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import TestCaseList from '@/components/test-management/TestCaseList'
import { DeleteConfirmDialog } from '@/components/test-management/DeleteConfirmDialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, AlertCircle } from 'lucide-react'
import { Permission } from '@/lib/permissions'
import { PermissionGate } from '@/lib/permissions/permission-components'
import { useNotify } from '@/lib/notify'

interface TestCase {
  _id: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  category: 'functional' | 'integration' | 'regression' | 'performance' | 'security' | 'usability' | 'compatibility'
  automationStatus: 'not_automated' | 'automated' | 'semi_automated' | 'deprecated'
  estimatedExecutionTime: number
  tags: string[]
  testSuite: {
    _id: string
    name: string
  }
  createdBy: {
    _id: string
    firstName: string
    lastName: string
  }
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface Project {
  _id: string
  name: string
  description?: string
  status: string
}

export default function TestCasesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setItems } = useBreadcrumb()
  const { success: notifySuccess, error: notifyError, warning: notifyWarning } = useNotify()
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [projectQuery, setProjectQuery] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteItem, setDeleteItem] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [refreshCounter, setRefreshCounter] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Set breadcrumb
    setItems([
      { label: 'Test Management', href: '/test-management' },
      { label: 'Test Cases' }
    ])
  }, [setItems])

  useEffect(() => {
    fetchProjects()
  }, [])

  useEffect(() => {
    const projectIdFromQuery = searchParams.get('projectId')
    if (projectIdFromQuery && projectIdFromQuery !== selectedProject) {
      setSelectedProject(projectIdFromQuery)
    }
  }, [searchParams, selectedProject])

  const fetchProjects = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/projects')
      const data = await response.json()

      if (data.success) {
        setProjects(data.data)
      }
    } catch (error) {
      console.error('Error fetching projects:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTestCase = () => {
    if (!selectedProject) {
      notifyWarning({ title: 'Select a project first.' })
      return
    }
    router.push(`/test-management/cases/new?projectId=${encodeURIComponent(selectedProject)}`)
  }

  const handleEditTestCase = (testCase: TestCase) => {
    router.push(
      `/test-management/cases/${encodeURIComponent(testCase._id)}/edit?projectId=${encodeURIComponent(selectedProject)}`
    )
  }

  const handleDeleteTestCase = (testCaseId: string, testCaseTitle?: string) => {
    setDeleteItem({ id: testCaseId, name: testCaseTitle || 'Unknown Test Case' })
    setDeleteDialogOpen(true)
  }

  const handleExecuteTestCase = (testCase: TestCase) => {
    if (!selectedProject) {
      notifyWarning({ title: 'Select a project first.' })
      return
    }

    router.push(
      `/test-management/executions/new?projectId=${encodeURIComponent(selectedProject)}&testCaseId=${encodeURIComponent(testCase._id)}`
    )
  }

  const handleConfirmDelete = async () => {
    if (!deleteItem) return

    setDeleting(true)
    try {
      const response = await fetch(`/api/test-cases/${deleteItem.id}`, {
        method: 'DELETE'
      })

      const data = await response.json().catch(() => ({}))

      if (response.ok && (data as any)?.success !== false) {
        notifySuccess({ title: 'Test case deleted.' })
        setDeleteDialogOpen(false)
        setDeleteItem(null)
        setRefreshCounter(c => c + 1)
      } else {
        notifyError({
          title: 'Failed to delete test case.',
          message: (data as any)?.error || 'Please try again.'
        })
        console.error('Failed to delete test case', data)
      }
    } catch (error) {
      notifyError({ title: 'Failed to delete test case.', message: 'Please try again.' })
      console.error('Error deleting test case:', error)
    } finally {
      setDeleting(false)
    }
  }

  const filteredProjects = projects.filter(project =>
    !projectQuery.trim() || project.name.toLowerCase().includes(projectQuery.toLowerCase())
  )

  return (
    <MainLayout>
      <PermissionGate permission={Permission.TEST_MANAGE}>
        <div className="space-y-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Test Cases</h1>
              <p className="text-muted-foreground">
                Manage and organize your test cases across all projects
              </p>
            </div>
            <Button onClick={handleCreateTestCase} className="w-full sm:w-auto" disabled={!selectedProject}>
              <Plus className="mr-2 h-4 w-4" />
              Create Test Case
            </Button>
          </div>

        {/* Project Selection */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <label htmlFor="project-select" className="text-sm font-medium">
              Project:
            </label>
            <Select
              value={selectedProject}
              onValueChange={setSelectedProject}
              onOpenChange={(open) => {
                if (open) setProjectQuery('')
              }}
            >
              <SelectTrigger id="project-select" className="w-64">
                <SelectValue placeholder="Select a project" />
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
              <span>Please select a project to create test cases</span>
            </div>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4 sm:p-6 space-y-6">
          <TestCaseList 
            projectId={selectedProject}
            key={`${selectedProject}-${refreshCounter}`}
            showAddButton={false}
            onTestCaseCreate={handleCreateTestCase}
            onTestCaseEdit={handleEditTestCase}
            onTestCaseDelete={handleDeleteTestCase}
            onTestCaseExecute={handleExecuteTestCase}
          />
        </div>

        <DeleteConfirmDialog
          isOpen={deleteDialogOpen}
          onClose={() => {
            setDeleteDialogOpen(false)
            setDeleteItem(null)
          }}
          onConfirm={handleConfirmDelete}
          title="Delete Test Case"
          itemName={deleteItem?.name || ''}
          itemType="Test Case"
          loading={deleting}
        />
      </div>
      </PermissionGate>
    </MainLayout>
  )
}
