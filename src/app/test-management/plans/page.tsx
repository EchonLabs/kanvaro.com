'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { TestPlanForm } from '@/components/test-management/TestPlanForm'
import { DeleteConfirmDialog } from '@/components/test-management/DeleteConfirmDialog'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { Plus, Calendar, Users, CheckSquare, Edit, Trash2 } from 'lucide-react'

interface TestPlan {
  _id?: string
  name: string
  description: string
  project: string
  version: string
  assignedTo?: string
  startDate?: Date
  endDate?: Date
  testCases: string[]
  tags: string[]
  customFields?: Record<string, any>
}

export default function TestPlansPage() {
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [testPlanDialogOpen, setTestPlanDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedTestPlan, setSelectedTestPlan] = useState<TestPlan | null>(null)
  const [deleteItem, setDeleteItem] = useState<{ id: string; name: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [testPlans, setTestPlans] = useState<TestPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(false)
  const [refreshCounter, setRefreshCounter] = useState(0)

  // Helper to fetch the first available project id when none is selected
  const getFirstProjectId = async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/projects')
      const data = await res.json()
      if (res.ok && data?.success && Array.isArray(data.data) && data.data.length > 0) {
        return data.data[0]._id as string
      }
    } catch (e) {
      console.error('Error fetching projects:', e)
    }
    return null
  }

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setPlansLoading(true)
        const qs = selectedProject ? `?projectId=${selectedProject}` : ''
        const res = await fetch(`/api/test-plans${qs}`)
        const data = await res.json()
        if (res.ok && data?.success && Array.isArray(data.data)) {
          const mapped: TestPlan[] = data.data.map((p: any) => ({
            _id: p._id,
            name: p.name,
            description: p.description,
            project: typeof p.project === 'object' && p.project?._id ? p.project._id : p.project,
            version: p.version,
            assignedTo: p.assignedTo ? `${p.assignedTo.firstName ?? ''} ${p.assignedTo.lastName ?? ''}`.trim() : undefined,
            startDate: p.startDate ? new Date(p.startDate) : undefined,
            endDate: p.endDate ? new Date(p.endDate) : undefined,
            testCases: Array.isArray(p.testCases) ? p.testCases.map((tc: any) => (typeof tc === 'string' ? tc : tc._id)) : [],
            tags: p.tags || [],
            customFields: p.customFields || {}
          }))
          setTestPlans(mapped)
        } else {
          setTestPlans([])
        }
      } catch (e) {
        console.error('Error fetching test plans:', e)
        setTestPlans([])
      } finally {
        setPlansLoading(false)
      }
    }
    fetchPlans()
  }, [selectedProject, refreshCounter])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'draft': return 'bg-yellow-100 text-yellow-800'
      case 'completed': return 'bg-blue-100 text-blue-800'
      case 'archived': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const handleCreateTestPlan = async () => {
    console.log('inside create project')
    if (!selectedProject) {
      const first = await getFirstProjectId()
      if (first) setSelectedProject(first)
    }
    setSelectedTestPlan(null)
    setTestPlanDialogOpen(true)
  }

  const handleEditTestPlan = (testPlan: TestPlan) => {
    setSelectedTestPlan(testPlan)
    setTestPlanDialogOpen(true)
  }

  const handleDeleteTestPlan = (testPlanId: string, testPlanName: string) => {
    setDeleteItem({ id: testPlanId, name: testPlanName })
    setDeleteDialogOpen(true)
  }

  const handleSaveTestPlan = async (testPlanData: any) => {
    console.log('testPlanData', testPlanData)
    setSaving(true)
    try {
      let effectiveProjectId = selectedProject || testPlanData.project
      if (!effectiveProjectId) {
        const first = await getFirstProjectId()
        if (first) {
          setSelectedProject(first)
          effectiveProjectId = first
        }
      }
      if (!effectiveProjectId) {
        console.error('Cannot save test plan: projectId is missing')
        setSaving(false)
        return
      }
      const url = selectedTestPlan?._id 
        ? `/api/test-plans/${selectedTestPlan._id}` 
        : '/api/test-plans'
      
      const method = selectedTestPlan?._id ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...testPlanData,
          projectId: effectiveProjectId
        })
      })

      if (response.ok) {
        setTestPlanDialogOpen(false)
        setSelectedTestPlan(null)
        setRefreshCounter(c => c + 1)
      } else {
        console.error('Failed to save test plan')
      }
    } catch (error) {
      console.error('Error saving test plan:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteItem) return
    
    setDeleting(true)
    try {
      const response = await fetch(`/api/test-plans/${deleteItem.id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setDeleteDialogOpen(false)
        setDeleteItem(null)
        setRefreshCounter(c => c + 1)
      } else {
        console.error('Failed to delete test plan')
      }
    } catch (error) {
      console.error('Error deleting test plan:', error)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Test Plans</h1>
            <p className="text-muted-foreground">
              Create and manage test plans for your projects
            </p>
          </div>
          <Button onClick={handleCreateTestPlan} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Create Test Plan
          </Button>
        </div>

        <div className="grid gap-6">
          {testPlans.map((plan) => (
            <Card key={plan._id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <CardDescription>{plan.description}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-100 text-blue-800">
                      Active
                    </Badge>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditTestPlan(plan)}
                        className="h-8 w-8 p-0"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteTestPlan(plan._id || '', plan.name)}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="flex items-center space-x-2">
                    <CheckSquare className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Test Cases:</span>
                    <span className="font-medium">{plan.testCases.length}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Start Date:</span>
                    <span className="font-medium">{plan.startDate?.toLocaleDateString() || 'N/A'}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="h-4 w-4 rounded-full bg-blue-500" />
                    <span className="text-sm text-muted-foreground">End Date:</span>
                    <span className="font-medium">{plan.endDate?.toLocaleDateString() || 'N/A'}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="h-4 w-4 rounded-full bg-green-500" />
                    <span className="text-sm text-muted-foreground">Version:</span>
                    <span className="font-medium">{plan.version}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center space-x-2">
                    <Users className="h-4 w-4" />
                    <span>Assigned to {plan.assignedTo || 'Unassigned'}</span>
                  </div>
                  <div className="flex gap-1">
                    {plan.tags.map((tag, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Dialogs */}
        <ResponsiveDialog
          open={testPlanDialogOpen}
          onOpenChange={setTestPlanDialogOpen}
          title={selectedTestPlan ? 'Edit Test Plan' : 'Create Test Plan'}
        >
          <TestPlanForm
            testPlan={selectedTestPlan || undefined}
            projectId={selectedProject}
            onSave={handleSaveTestPlan}
            onCancel={() => {
              setTestPlanDialogOpen(false)
              setSelectedTestPlan(null)
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
          title="Delete Test Plan"
          itemName={deleteItem?.name || ''}
          itemType="Test Plan"
          loading={deleting}
        />
      </div>
    </MainLayout>
  )
}
