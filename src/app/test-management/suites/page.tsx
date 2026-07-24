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
import { Layers, Plus, ChevronDown } from 'lucide-react'
import { Permission } from '@/lib/permissions'
import { PermissionGate } from '@/lib/permissions/permission-components'
import { useNotify } from '@/lib/notify'
import { cn } from '@/lib/utils'

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
  const projectSearchInputRef = useRef<HTMLInputElement | null>(null)

  const focusSearchInput = (el: HTMLInputElement | null) => {
    if (!el || el.disabled) return
    const doFocus = () => { el.focus({ preventScroll: true }); try { el.select?.() } catch { } }
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(doFocus)
    else setTimeout(doFocus, 0)
  }

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
    setItems([{ label: 'Test Management', href: '/test-management' }, { label: 'Test Suites' }])
  }, [setItems])

  useEffect(() => {
    const fetchProjects = async () => {
      setProjectsLoading(true)
      try {
        const res = await fetch('/api/projects')
        const data = await res.json().catch(() => ({}))
        if ((data as any)?.success && Array.isArray((data as any)?.data)) {
          setProjects((data as any).data.filter((p: any) => p?._id && p?.name).map((p: any) => ({ _id: String(p._id), name: String(p.name) })))
        } else setProjects([])
      } catch { setProjects([]) }
      finally { setProjectsLoading(false) }
    }
    fetchProjects()
  }, [])

  useEffect(() => {
    const suiteId = searchParams.get('suiteId')
    const projectId = searchParams.get('projectId')
    if (projectId && projectId !== selectedProject) setSelectedProject(projectId)
    setHighlightSuiteId(suiteId)
  }, [searchParams, selectedProject])

  const filteredProjects = useMemo(() => {
    const q = projectQuery.trim().toLowerCase()
    return q ? projects.filter(p => p.name.toLowerCase().includes(q)) : projects
  }, [projects, projectQuery])

  const handleProjectChange = (projectId: string) => {
    setSelectedProject(projectId)
    const nextParams = new URLSearchParams(searchParams.toString())
    if (projectId) nextParams.set('projectId', projectId)
    else nextParams.delete('projectId')
    const qs = nextParams.toString()
    router.replace(qs ? `/test-management/suites?${qs}` : '/test-management/suites')
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
        if (projectIdToUse && projectIdToUse !== selectedProject) setSelectedProject(projectIdToUse)
        setRefreshCounter(c => c + 1)
        if (detailSuiteId) { setSuiteDetailRefreshKey(k => k + 1); setSuiteDetailDialogOpen(true) }
      }
    } catch { console.error('Error saving test suite') }
    finally { setSaving(false) }
  }

  const handleConfirmDelete = async () => {
    if (!deleteItem) return
    setDeleting(true)
    try {
      const response = await fetch(`/api/test-suites/${deleteItem.id}`, { method: 'DELETE' })
      if (response.ok) {
        notifySuccess({ title: 'Test Suite deleted successfully.' })
        setDeleteDialogOpen(false)
        setDeleteItem(null)
        setRefreshCounter(c => c + 1)
      }
    } catch { console.error('Error deleting test suite') }
    finally { setDeleting(false) }
  }

  return (
    <MainLayout>
      <PermissionGate permission={Permission.TEST_MANAGE}>
        <div className="space-y-8">

          {/* ── Page Header ── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Layers className="h-8 w-8 flex-shrink-0 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
              <div>
                <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight text-[var(--apple-label)]">Test Suites</h1>
                <p className="text-[15px] text-[var(--apple-secondary-label)] mt-0.5">
                  Organize your test cases into hierarchical test suites
                </p>
              </div>
            </div>
            <Button
              onClick={() => {
                if (!selectedProject) return
                setSelectedTestSuite(null)
                setSuiteDialogProjectId(selectedProject)
                setTestSuiteDialogOpen(true)
              }}
              disabled={!selectedProject}
              className="w-full sm:w-auto h-9 gap-1.5 rounded-[var(--apple-radius-sm)] apple-transition"
              style={{ background: 'var(--apple-card-gradient)' }}
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              <span className="text-[13px]">Create Test Suite</span>
            </Button>
          </div>

          {/* ── Project Selector Toolbar ── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 px-4 py-3 rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)]">
            <span className="apple-section-label whitespace-nowrap">Project</span>
            <Select
              value={selectedProject}
              onValueChange={handleProjectChange}
              onOpenChange={(open) => { if (open) { setProjectQuery(''); focusSearchInput(projectSearchInputRef.current) } }}
              disabled={projectsLoading || projects.length === 0}
            >
              <SelectTrigger className="h-8 w-full sm:w-72 text-[13px] rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] bg-card">
                <SelectValue placeholder={projectsLoading ? 'Loading projects…' : 'Select a project'} />
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
                Select a project to view its test suites
              </p>
            )}
          </div>

          {/* ── Content ── */}
          {!selectedProject ? (
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-12 text-center">
              <Layers className="h-10 w-10 mx-auto mb-4 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
              <h3 className="text-[17px] font-semibold text-[var(--apple-label)] mb-2">Select a Project</h3>
              <p className="text-[15px] text-[var(--apple-secondary-label)]">Choose a project above to view its test suites.</p>
            </div>
          ) : (
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-4 sm:p-6 view-transition-container" key={`suites-${selectedProject}-${refreshCounter}`}>
              <TestSuiteCards
                key={`suites-${selectedProject}-${refreshCounter}`}
                projectId={selectedProject}
                highlightSuiteId={highlightSuiteId || undefined}
                onSuiteView={(suite) => { setDetailSuiteId(suite._id); setSuiteDetailDialogOpen(true) }}
                onSuiteEdit={(suite) => { setSelectedTestSuite(suite); setSuiteDialogProjectId(suite.project); setTestSuiteDialogOpen(true) }}
                onSuiteDelete={(id, name) => { setDeleteItem({ id, name: name || '' }); setDeleteDialogOpen(true) }}
                onSuiteCreate={() => { setSelectedTestSuite(null); setSuiteDialogProjectId(selectedProject); setTestSuiteDialogOpen(true) }}
              />
            </div>
          )}

          {/* ── Dialogs ── */}
          <ResponsiveDialog
            open={testSuiteDialogOpen}
            onOpenChange={(open) => { setTestSuiteDialogOpen(open); if (!open) { setSelectedTestSuite(null); setSuiteDialogProjectId('') } }}
            title={selectedTestSuite ? 'Edit Test Suite' : 'Create Test Suite'}
            dismissible={false}
            footer={
              <>
                <Button type="button" variant="outline" className="rounded-[var(--apple-radius-sm)]"
                  onClick={() => { setTestSuiteDialogOpen(false); setSelectedTestSuite(null); setSuiteDialogProjectId('') }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving} form="test-suite-form"
                  className="rounded-[var(--apple-radius-sm)]"
                  style={{ background: 'var(--apple-card-gradient)' }}>
                  {saving ? 'Saving…' : selectedTestSuite?._id ? 'Update Test Suite' : 'Create Test Suite'}
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
                if (detailSuiteId) setSuiteDetailDialogOpen(true)
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
              setSelectedTestSuite({ _id: suite._id, name: suite.name, description: suite.description, parentSuite: suite.parentSuite?._id, project: selectedProject })
              setTestSuiteDialogOpen(true)
            }}
            onDelete={(suiteId) => { setSuiteDetailDialogOpen(false); setDeleteItem({ id: suiteId, name: '' }); setDeleteDialogOpen(true) }}
            onCreateChild={(parentSuiteId) => { setSuiteDetailDialogOpen(false); setSelectedTestSuite(null); setSuiteDialogProjectId(''); setTestSuiteDialogOpen(true) }}
            onChildSuiteClick={(childSuiteId) => { setDetailSuiteId(childSuiteId) }}
          />

          <DeleteConfirmDialog
            isOpen={deleteDialogOpen}
            onClose={() => { setDeleteDialogOpen(false); setDeleteItem(null) }}
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
