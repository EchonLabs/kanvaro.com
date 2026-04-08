'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import TestCaseList from '@/components/test-management/TestCaseList'
import { TestCaseForm } from '@/components/test-management/TestCaseForm'
import { TestExecutionForm } from '@/components/test-management/TestExecutionForm'
import { DeleteConfirmDialog } from '@/components/test-management/DeleteConfirmDialog'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, AlertCircle } from 'lucide-react'
import { Permission } from '@/lib/permissions'
import { PermissionGate } from '@/lib/permissions/permission-components'

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

interface FormTestCase {
  _id?: string
  title: string
  description: string
  preconditions: string
  steps: Array<{ step: string; expectedResult: string }>
  expectedResult: string
  testData: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  category: 'functional' | 'integration' | 'regression' | 'performance' | 'security' | 'usability' | 'compatibility'
  automationStatus: 'not_automated' | 'automated' | 'semi_automated' | 'deprecated'
  estimatedExecutionTime: number
  testSuite: string
  tags: string[]
  requirements?: string
}

interface Project {
  _id: string
  name: string
  description?: string
  status: string
}

export default function TestCasesPage() {
  const { setItems } = useBreadcrumb()
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [projectQuery, setProjectQuery] = useState('')
  const [testCaseDialogOpen, setTestCaseDialogOpen] = useState(false)
  const [testExecutionDialogOpen, setTestExecutionDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedTestCase, setSelectedTestCase] = useState<FormTestCase | null>(null)
  const [executionTestCase, setExecutionTestCase] = useState<any | null>(null)
  const [deleteItem, setDeleteItem] = useState<{ id: string; name: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [executionSaving, setExecutionSaving] = useState(false)
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
      alert('Please select a project first')
      return
    }
    setSelectedTestCase(null)
    setTestCaseDialogOpen(true)
  }

  const handleEditTestCase = (testCase: TestCase) => {
    const formTestCase: FormTestCase = {
      _id: testCase._id,
      title: testCase.title,
      description: (testCase as any)?.description || '',
      preconditions: (testCase as any)?.preconditions || '',
      steps: (testCase as any)?.steps || [{ step: '', expectedResult: '' }],
      expectedResult: (testCase as any)?.expectedResult || '',
      testData: (testCase as any)?.testData || '',
      priority: testCase.priority,
      category: testCase.category,
      automationStatus: testCase.automationStatus,
      estimatedExecutionTime: testCase.estimatedExecutionTime,
      testSuite: testCase.testSuite._id,
      tags: testCase.tags || [],
      requirements: (testCase as any)?.requirements || ''
    }
    setSelectedTestCase(formTestCase)
    setTestCaseDialogOpen(true)
  }

  const handleDeleteTestCase = (testCaseId: string, testCaseTitle?: string) => {
    setDeleteItem({ id: testCaseId, name: testCaseTitle || 'Unknown Test Case' })
    setDeleteDialogOpen(true)
  }

  const handleExecuteTestCase = (testCase: TestCase) => {
    setExecutionTestCase({
      _id: testCase._id,
      title: testCase.title,
      priority: testCase.priority,
      category: testCase.category,
      estimatedExecutionTime: testCase.estimatedExecutionTime
    })
    setTestExecutionDialogOpen(true)
  }

  const handleSaveTestExecution = async (executionData: any) => {
    setExecutionSaving(true)
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

      const response = await fetch('/api/test-executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        setTestExecutionDialogOpen(false)
        setExecutionTestCase(null)
      } else {
        const data = await response.json().catch(() => ({}))
        console.error('Failed to create test execution', data)
      }
    } catch (error) {
      console.error('Error creating test execution:', error)
    } finally {
      setExecutionSaving(false)
    }
  }

  const handleSaveTestCase = async (testCaseData: FormTestCase) => {
    setSaving(true)
    try {
      const url = selectedTestCase?._id 
        ? `/api/test-cases/${selectedTestCase._id}`
        : '/api/test-cases'
      
      const method = selectedTestCase?._id ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...testCaseData,
          // API expects testSuiteId, include it always to be explicit
          testSuiteId: testCaseData.testSuite,
          projectId: selectedProject
        })
      })

      if (response.ok) {
        setTestCaseDialogOpen(false)
        setSelectedTestCase(null)
        setRefreshCounter(c => c + 1)
      } else {
        console.error('Failed to save test case')
      }
    } catch (error) {
      console.error('Error saving test case:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteItem) return
    
    setDeleting(true)
    try {
      const response = await fetch(`/api/test-cases/${deleteItem.id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setDeleteDialogOpen(false)
        setDeleteItem(null)
        setRefreshCounter(c => c + 1)
      } else {
        console.error('Failed to delete test case')
      }
    } catch (error) {
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

        {/* Dialogs */}
        <ResponsiveDialog
          open={testCaseDialogOpen}
          onOpenChange={setTestCaseDialogOpen}
          title={selectedTestCase ? 'Edit Test Case' : 'Create Test Case'}
          dismissible={false}
        >
          <TestCaseForm
            testCase={selectedTestCase || undefined}
            projectId={selectedProject}
            onSave={handleSaveTestCase}
            onCancel={() => {
              setTestCaseDialogOpen(false)
              setSelectedTestCase(null)
            }}
            loading={saving}
          />
        </ResponsiveDialog>

        <ResponsiveDialog
          open={testExecutionDialogOpen}
          onOpenChange={setTestExecutionDialogOpen}
          title="Execute Test Case"
          dismissible={false}
        >
          <TestExecutionForm
            projectId={selectedProject}
            testCase={executionTestCase || undefined}
            onSave={handleSaveTestExecution}
            onCancel={() => {
              setTestExecutionDialogOpen(false)
              setExecutionTestCase(null)
            }}
            loading={executionSaving}
          />
        </ResponsiveDialog>

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
