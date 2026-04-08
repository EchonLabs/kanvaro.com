'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import TestSuiteCards from '@/components/test-management/TestSuiteCards'
import { TestSuiteForm } from '@/components/test-management/TestSuiteForm'
import { DeleteConfirmDialog } from '@/components/test-management/DeleteConfirmDialog'
import { TestSuiteDetailDialog } from '@/components/test-management/TestSuiteDetailDialog'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { Button } from '@/components/ui/Button'
import { Plus } from 'lucide-react'
import { Permission } from '@/lib/permissions'
import { PermissionGate } from '@/lib/permissions/permission-components'
import { useNotify } from '@/lib/notify'

interface TestSuite {
  _id?: string
  name: string
  description: string
  parentSuite?: string
  project: string
}

export default function TestSuitesPage() {
  const { setItems } = useBreadcrumb()
  const searchParams = useSearchParams()
  const { success: notifySuccess } = useNotify()
  const [selectedProject, setSelectedProject] = useState<string>('')
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
    const suiteId = searchParams.get('suiteId')
    const projectId = searchParams.get('projectId')

    if (projectId && projectId !== selectedProject) {
      setSelectedProject(projectId)
    }

    setHighlightSuiteId(suiteId)
    // Intentionally respond to URL changes (e.g., navigation from Project → Testing)
  }, [searchParams, selectedProject])

  const handleCreateTestSuite = () => {
    setSelectedTestSuite(null)
    setTestSuiteDialogOpen(true)
  }

  const handleEditTestSuite = (testSuite: TestSuite) => {
    setSelectedTestSuite(testSuite)
    setTestSuiteDialogOpen(true)
  }

  const handleDeleteTestSuite = (testSuiteId: string, testSuiteName: string) => {
    setDeleteItem({ id: testSuiteId, name: testSuiteName })
    setDeleteDialogOpen(true)
  }

  const handleSaveTestSuite = async (testSuiteData: any) => {
    setSaving(true)
    try {
      const isEdit = !!selectedTestSuite?._id
      const projectIdToUse = isEdit ? (selectedTestSuite?.project || selectedProject) : selectedProject
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
            <Button onClick={handleCreateTestSuite} className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Create Test Suite
            </Button>
          </div>

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
                setTestSuiteDialogOpen(true)
              }}
            />
          </div>

          {/* Dialogs */}
          <ResponsiveDialog
            open={testSuiteDialogOpen}
            onOpenChange={setTestSuiteDialogOpen}
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
              projectId={selectedTestSuite?.project || selectedProject}
              showProjectSelector={true}
              onProjectChange={(newProjectId) => setSelectedProject(newProjectId)}
              onSave={handleSaveTestSuite}
              onCancel={() => {
                setTestSuiteDialogOpen(false)
                setSelectedTestSuite(null)
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

