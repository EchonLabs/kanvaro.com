'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import TestSuiteTree from '@/components/test-management/TestSuiteTree'
import { TestSuiteForm } from '@/components/test-management/TestSuiteForm'
import { DeleteConfirmDialog } from '@/components/test-management/DeleteConfirmDialog'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { Button } from '@/components/ui/Button'
import { Plus } from 'lucide-react'

interface TestSuite {
  _id?: string
  name: string
  description: string
  parentSuite?: string
  project: string
}

export default function TestSuitesPage() {
  const { setItems } = useBreadcrumb()
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [testSuites, setTestSuites] = useState<TestSuite[]>([])
  const [testSuiteDialogOpen, setTestSuiteDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedTestSuite, setSelectedTestSuite] = useState<TestSuite | null>(null)
  const [deleteItem, setDeleteItem] = useState<{ id: string; name: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    // Set breadcrumb
    setItems([
      { label: 'Test Management', href: '/test-management' },
      { label: 'Test Suites' }
    ])
  }, [setItems])

  useEffect(() => {
    // In a real app, you'd fetch the user's projects and set the first one
    setSelectedProject('')
  }, [])

  const handleCreateTestSuite = () => {
    setSelectedTestSuite(null)
    setTestSuiteDialogOpen(true)
  }

  const handleEditTestSuite = (testSuite: TestSuite) => {
    setSelectedTestSuite(testSuite)
    setTestSuiteDialogOpen(true)
  }

  const handleDeleteTestSuite = (testSuiteId: string) => {
    // Find the test suite to get its name
    const testSuite = testSuites.find(ts => ts._id === testSuiteId)
    const testSuiteName = testSuite?.name || 'Unknown Test Suite'
    setDeleteItem({ id: testSuiteId, name: testSuiteName })
    setDeleteDialogOpen(true)
  }

  const handleSaveTestSuite = async (testSuiteData: any) => {
    setSaving(true)
    try {
      const url = selectedTestSuite?._id 
        ? `/api/test-suites/${selectedTestSuite._id}`
        : '/api/test-suites'
      
      const method = selectedTestSuite?._id ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...testSuiteData,
          projectId: selectedProject
        })
      })

      if (response.ok) {
        setTestSuiteDialogOpen(false)
        setSelectedTestSuite(null)
        // Refresh the tree or show success message
      } else {
        console.error('Failed to save test suite')
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
        setDeleteDialogOpen(false)
        setDeleteItem(null)
        // Refresh the tree or show success message
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
      <div className="space-y-6">
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
          <TestSuiteTree 
            projectId={selectedProject}
            onSuiteCreate={handleCreateTestSuite}
            onSuiteEdit={handleEditTestSuite}
            onSuiteDelete={handleDeleteTestSuite}
          />
        </div>

        {/* Dialogs */}
        <ResponsiveDialog
          open={testSuiteDialogOpen}
          onOpenChange={setTestSuiteDialogOpen}
          title={selectedTestSuite ? 'Edit Test Suite' : 'Create Test Suite'}
        >
          <TestSuiteForm
            testSuite={selectedTestSuite || undefined}
            projectId={selectedProject}
            onSave={handleSaveTestSuite}
            onCancel={() => {
              setTestSuiteDialogOpen(false)
              setSelectedTestSuite(null)
            }}
            loading={saving}
          />
        </ResponsiveDialog>

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
    </MainLayout>
  )
}
