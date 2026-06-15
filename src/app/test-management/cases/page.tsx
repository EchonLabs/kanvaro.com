'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import TestCaseList from '@/components/test-management/TestCaseList'
import { DeleteConfirmDialog } from '@/components/test-management/DeleteConfirmDialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileText, Plus, ChevronDown } from 'lucide-react'
import { Permission } from '@/lib/permissions'
import { PermissionGate } from '@/lib/permissions/permission-components'
import { useNotify } from '@/lib/notify'

interface TestCase {
  _id: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  category: string
  automationStatus: string
  estimatedExecutionTime: number
  tags: string[]
  testSuite: { _id: string; name: string }
  createdBy: { _id: string; firstName: string; lastName: string }
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
  const projectSearchInputRef = useRef<HTMLInputElement | null>(null)

  const focusSearchInput = (el: HTMLInputElement | null) => {
    if (!el || el.disabled) return
    const doFocus = () => { el.focus({ preventScroll: true }); try { el.select?.() } catch { } }
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(doFocus)
    else setTimeout(doFocus, 0)
  }

  useEffect(() => {
    setItems([{ label: 'Test Management', href: '/test-management' }, { label: 'Test Cases' }])
  }, [setItems])

  useEffect(() => { fetchProjects() }, [])

  useEffect(() => {
    const projectIdFromQuery = searchParams.get('projectId')
    if (projectIdFromQuery && projectIdFromQuery !== selectedProject) setSelectedProject(projectIdFromQuery)
  }, [searchParams, selectedProject])

  const fetchProjects = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/projects')
      const data = await response.json()
      if (data.success) setProjects(data.data)
    } catch { console.error('Error fetching projects') }
    finally { setLoading(false) }
  }

  const handleCreateTestCase = () => {
    if (!selectedProject) { notifyWarning({ title: 'Select a project first.' }); return }
    router.push(`/test-management/cases/new?projectId=${encodeURIComponent(selectedProject)}`)
  }

  const handleEditTestCase = (testCase: TestCase) => {
    router.push(`/test-management/cases/${encodeURIComponent(testCase._id)}/edit?projectId=${encodeURIComponent(selectedProject)}`)
  }

  const handleDeleteTestCase = (testCaseId: string, testCaseTitle?: string) => {
    setDeleteItem({ id: testCaseId, name: testCaseTitle || 'Unknown Test Case' })
    setDeleteDialogOpen(true)
  }

  const handleExecuteTestCase = (testCase: TestCase) => {
    if (!selectedProject) { notifyWarning({ title: 'Select a project first.' }); return }
    router.push(`/test-management/executions/new?projectId=${encodeURIComponent(selectedProject)}&testCaseId=${encodeURIComponent(testCase._id)}`)
  }

  const handleConfirmDelete = async () => {
    if (!deleteItem) return
    setDeleting(true)
    try {
      const response = await fetch(`/api/test-cases/${deleteItem.id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (response.ok && (data as any)?.success !== false) {
        notifySuccess({ title: 'Test case deleted.' })
        setDeleteDialogOpen(false)
        setDeleteItem(null)
        setRefreshCounter(c => c + 1)
      } else {
        notifyError({ title: 'Failed to delete test case.', message: (data as any)?.error || 'Please try again.' })
      }
    } catch {
      notifyError({ title: 'Failed to delete test case.', message: 'Please try again.' })
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

          {/* ── Page Header ── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 flex-shrink-0 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
              <div>
                <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight text-[var(--apple-label)]">Test Cases</h1>
                <p className="text-[15px] text-[var(--apple-secondary-label)] mt-0.5">
                  Manage and organize your test cases across all projects
                </p>
              </div>
            </div>
            <Button
              onClick={handleCreateTestCase}
              disabled={!selectedProject}
              className="w-full sm:w-auto h-9 gap-1.5 rounded-[var(--apple-radius-sm)] apple-transition"
              style={{ background: 'var(--apple-card-gradient)' }}
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              <span className="text-[13px]">Create Test Case</span>
            </Button>
          </div>

          {/* ── Project Selector Toolbar ── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 px-4 py-3 rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)]">
            <span className="apple-section-label whitespace-nowrap">Project</span>
            <Select
              value={selectedProject}
              onValueChange={setSelectedProject}
              onOpenChange={(open) => { if (open) { setProjectQuery(''); focusSearchInput(projectSearchInputRef.current) } }}
            >
              <SelectTrigger id="project-select" className="h-8 w-full sm:w-72 text-[13px] rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] bg-card">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent className="p-0">
                <div className="p-2">
                  <Input
                    ref={projectSearchInputRef}
                    value={projectQuery}
                    onChange={(e) => setProjectQuery(e.target.value)}
                    placeholder="Search projects"
                    className="mb-2 h-8 text-[13px]"
                    onKeyDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="max-h-56 overflow-y-auto">
                    {filteredProjects.length === 0 ? (
                      <div className="px-2 py-2 text-[13px] text-[var(--apple-tertiary-label)]">No matching projects</div>
                    ) : filteredProjects.map((project) => (
                      <SelectItem key={project._id} value={project._id} className="text-[13px]">{project.name}</SelectItem>
                    ))}
                  </div>
                </div>
              </SelectContent>
            </Select>
            {!selectedProject && (
              <p className="text-[12px] text-amber-500 flex items-center gap-1.5">
                <ChevronDown className="h-3 w-3" strokeWidth={1.5} />
                Select a project to view and create test cases
              </p>
            )}
          </div>

          {/* ── Content ── */}
          {!selectedProject ? (
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-12 text-center">
              <FileText className="h-10 w-10 mx-auto mb-4 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
              <h3 className="text-[17px] font-semibold text-[var(--apple-label)] mb-2">Select a Project</h3>
              <p className="text-[15px] text-[var(--apple-secondary-label)]">Choose a project above to view its test cases.</p>
            </div>
          ) : (
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-4 sm:p-6 space-y-6 view-transition-container" key={`cases-${selectedProject}-${refreshCounter}`}>
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
          )}

          <DeleteConfirmDialog
            isOpen={deleteDialogOpen}
            onClose={() => { setDeleteDialogOpen(false); setDeleteItem(null) }}
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
