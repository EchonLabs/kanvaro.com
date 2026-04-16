'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatToTitleCase } from '@/lib/utils'
import { Permission } from '@/lib/permissions'
import { PermissionGate } from '@/lib/permissions/permission-components'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { TestSuiteForm } from '@/components/test-management/TestSuiteForm'
import {
  TestTube,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  BarChart3,
  Folder,
  FileText,
  Calendar,
  Users,
  TrendingUp
} from 'lucide-react'
import TestSuiteCards from '@/components/test-management/TestSuiteCards'
import TestCaseList from '@/components/test-management/TestCaseList'
import { DeleteConfirmDialog } from '@/components/test-management/DeleteConfirmDialog'
import { TestSuiteDetailDialog } from '@/components/test-management/TestSuiteDetailDialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useNotify } from '@/lib/notify'

interface TestSummary {
  totalTestCases: number
  totalTestSuites: number
  totalTestPlans: number
  totalExecutions: number
  passRate: number
  statusCounts: Record<string, number>
}

interface Project {
  _id: string
  name: string
  description: string
  status: string
  testSummary?: TestSummary
}

export default function TestManagementPage() {
  const router = useRouter()
  const { setItems } = useBreadcrumb()
  const { success: notifySuccess } = useNotify()
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [suiteDialogOpen, setSuiteDialogOpen] = useState(false)
  const [suiteSaving, setSuiteSaving] = useState(false)
  const [editingSuite, setEditingSuite] = useState<any | null>(null)
  const [parentSuiteIdForCreate, setParentSuiteIdForCreate] = useState<string | undefined>(undefined)
  const [suitesRefreshCounter, setSuitesRefreshCounter] = useState(0)
  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(null)
  const [selectedSuiteDetails, setSelectedSuiteDetails] = useState<any | null>(null)
  const [suiteDetailsLoading, setSuiteDetailsLoading] = useState(false)
  const [suiteDetailDialogOpen, setSuiteDetailDialogOpen] = useState(false)
  const [detailSuiteId, setDetailSuiteId] = useState<string | null>(null)
  const [suiteDetailRefreshKey, setSuiteDetailRefreshKey] = useState(0)
  const [testCasesRefreshCounter, setTestCasesRefreshCounter] = useState(0)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteItem, setDeleteItem] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [executions, setExecutions] = useState<any[]>([])
  const [executionsTotal, setExecutionsTotal] = useState(0)
  const [executionsLoading, setExecutionsLoading] = useState(false)
  const [executionsRefreshCounter, setExecutionsRefreshCounter] = useState(0)
  const [suiteCount, setSuiteCount] = useState(0)
  const [caseCount, setCaseCount] = useState(0)

  const executionStatusCounts = useMemo(() => {
    const counts: Record<string, number> = { passed: 0, failed: 0, blocked: 0, skipped: 0 }
    for (const e of executions) {
      if (e?.status && typeof counts[e.status] === 'number') counts[e.status] += 1
    }
    return counts
  }, [executions])

  useEffect(() => {
    // Set breadcrumb
    setItems([
      { label: 'Test Management', href: '/test-management' },
      { label: 'Dashboard' }
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
        setProjects(Array.isArray(data.data) ? data.data : [])
        // Do not auto-select a project on load (dashboard starts empty until user selects)
      }
    } catch (error) {
      console.error('Error fetching projects:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch test executions for selected project (dashboard shows latest 20)
  useEffect(() => {
    const fetchExecutions = async () => {
      if (!selectedProject) {
        setExecutions([])
        setExecutionsTotal(0)
        return
      }
      try {
        setExecutionsLoading(true)
        setExecutions([])
        setExecutionsTotal(0)
        const limit = 20
        const res = await fetch(
          `/api/test-executions?projectId=${encodeURIComponent(selectedProject)}&page=1&limit=${limit}`
        )
        const data = await res.json().catch(() => ({}))
        if (res.ok && data?.success && Array.isArray(data.data)) {
          setExecutions(data.data)
          const totalFromApi = Number(data?.pagination?.total)
          setExecutionsTotal(Number.isFinite(totalFromApi) ? totalFromApi : data.data.length)
        } else {
          setExecutions([])
          setExecutionsTotal(0)
        }
      } catch (e) {
        console.error('Error fetching test executions:', e)
        setExecutions([])
        setExecutionsTotal(0)
      } finally {
        setExecutionsLoading(false)
      }
    }
    fetchExecutions()
  }, [selectedProject, executionsRefreshCounter])

  // Fetch counts for suites and cases for Overview
  useEffect(() => {
    const fetchCounts = async () => {
      if (!selectedProject) {
        setSuiteCount(0)
        setCaseCount(0)
        return
      }
      try {
        setSuiteCount(0)
        setCaseCount(0)
        // Use pagination totals to avoid fetching entire datasets
        const [suitesRes, casesRes] = await Promise.all([
          fetch(`/api/test-suites?projectId=${encodeURIComponent(selectedProject)}&page=1&limit=1`),
          fetch(`/api/test-cases?projectId=${encodeURIComponent(selectedProject)}&page=1&limit=1`)
        ])
        const [suitesData, casesData] = await Promise.all([
          suitesRes.json().catch(() => ({})),
          casesRes.json().catch(() => ({}))
        ])

        if (suitesRes.ok && suitesData?.success) {
          const totalSuites = Number(suitesData?.pagination?.total)
          setSuiteCount(Number.isFinite(totalSuites) ? totalSuites : (Array.isArray(suitesData.data) ? suitesData.data.length : 0))
        } else {
          setSuiteCount(0)
        }

        if (casesRes.ok && casesData?.success) {
          const totalCases = Number(casesData?.pagination?.total)
          setCaseCount(Number.isFinite(totalCases) ? totalCases : (Array.isArray(casesData.data) ? casesData.data.length : 0))
        } else {
          setCaseCount(0)
        }
      } catch (e) {
        console.error('Error fetching overview counts:', e)
        setSuiteCount(0)
        setCaseCount(0)
      }
    }
    fetchCounts()
  }, [selectedProject])

  const handleDeleteSuite = async (suiteId: string) => {
    try {
      const res = await fetch(`/api/test-suites/${suiteId}`, { method: 'DELETE' })
      if (res.ok) {
        notifySuccess({ title: 'Test Suite deleted successfully.' })
        setSuitesRefreshCounter(c => c + 1)
        // Clear details panel if the deleted suite was selected
        if (selectedSuiteId === suiteId) {
          setSelectedSuiteId(null)
          setSelectedSuiteDetails(null)
        }
      } else {
        const data = await res.json().catch(() => ({}))
        console.error('Failed to delete test suite', data)
      }
    } catch (err) {
      console.error('Error deleting test suite:', err)
    }
  }

  const fetchSuiteDetails = async (suiteId: string) => {
    try {
      setSuiteDetailsLoading(true)
      const res = await fetch(`/api/test-suites/${suiteId}`)
      const data = await res.json()
      if (res.ok && data?.success) {
        setSelectedSuiteDetails(data.data)
      } else {
        setSelectedSuiteDetails(null)
      }
    } catch (e) {
      setSelectedSuiteDetails(null)
    } finally {
      setSuiteDetailsLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'failed': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      case 'blocked': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      case 'skipped': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
      default: return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed': return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'failed': return <XCircle className="h-4 w-4 text-red-600" />
      case 'blocked': return <AlertTriangle className="h-4 w-4 text-yellow-600" />
      case 'skipped': return <Clock className="h-4 w-4 text-gray-600" />
      default: return <Play className="h-4 w-4 text-blue-600" />
    }
  }

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return 'N/A'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}m ${s}s`
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }

  const displayedExecutionsCount = executions.length
  const passRate = (() => {
    if (displayedExecutionsCount === 0) return 0
    const passed = executions.filter(e => e.status === 'passed').length
    return Math.round((passed / displayedExecutionsCount) * 100)
  })()

  const handleCreateTestPlan = () => {
    const qs = selectedProject ? `?projectId=${encodeURIComponent(selectedProject)}` : ''
    router.push(`/test-management/plans/new${qs}`)
  }

  const handleStartTestExecution = () => {
    if (!selectedProject) return
    router.push(`/test-management/executions/new?projectId=${encodeURIComponent(selectedProject)}`)
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Dashboard</h1>
              <p className="text-muted-foreground">Select a project to manage test suites, cases, and executions</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="space-y-2">
                    <div className="h-4 bg-muted animate-pulse rounded w-1/2" />
                    <div className="h-8 bg-muted animate-pulse rounded w-1/3" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <PermissionGate permission={Permission.TEST_MANAGE}>
        <div className="space-y-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold truncate">Dashboard</h1>
              <p className="text-sm sm:text-base text-muted-foreground mt-1">Select a project to manage test suites, cases, and executions</p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              <Button variant="outline" onClick={() => router.push('/test-management/reports')} className="w-full sm:w-auto">
                <BarChart3 className="h-4 w-4 mr-2" />
                Reports
              </Button>
              <Button onClick={handleCreateTestPlan} className="w-full sm:w-auto" disabled={!selectedProject}>
                <TestTube className="h-4 w-4 mr-2" />
                New Test Plan
              </Button>
            </div>
          </div>

          {projects.length === 0 ? (
            <Card>
              <CardContent className="p-6 sm:p-8 text-center">
                <TestTube className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-base sm:text-lg font-semibold mb-2">No Projects Found</h3>
                <p className="text-sm sm:text-base text-muted-foreground mb-4">
                  You need to be assigned to a project to access test management features.
                </p>
                <Button onClick={() => router.push('/projects/create')} className="w-full sm:w-auto">
                  <TestTube className="h-4 w-4 mr-2" />
                  Create Test Project
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                <span className="text-sm font-medium">Project:</span>
                <Select
                  value={selectedProject || undefined}
                  onValueChange={(value) => {
                    setSelectedProject(value)
                    setActiveTab('overview')
                  }}
                >
                  <SelectTrigger className="w-full sm:w-96">
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p._id} value={p._id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!selectedProject ? (
                <Card>
                  <CardContent className="p-6 sm:p-8 text-center">
                    <TestTube className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-base sm:text-lg font-semibold mb-2">Select a Project</h3>
                    <p className="text-sm sm:text-base text-muted-foreground">
                      Choose a project to view test suites, cases, and executions.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 gap-1 overflow-x-auto mb-4">
                <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
                <TabsTrigger value="suites" className="text-xs sm:text-sm">Test Suites</TabsTrigger>
                <TabsTrigger value="cases" className="text-xs sm:text-sm">Test Cases</TabsTrigger>
                <TabsTrigger value="executions" className="text-xs sm:text-sm">Executions</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-2">
                        <Folder className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium">Test Suites</span>
                      </div>
                      <div className="text-2xl font-bold mt-2">{suiteCount}</div>
                      <p className="text-xs text-muted-foreground">Total suites</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium">Test Cases</span>
                      </div>
                      <div className="text-2xl font-bold mt-2">{caseCount}</div>
                      <p className="text-xs text-muted-foreground">Total cases</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-2">
                        <Play className="h-4 w-4 text-purple-600" />
                        <span className="text-sm font-medium">Executions</span>
                      </div>
                      <div className="text-2xl font-bold mt-2">{executionsTotal}</div>
                      <p className="text-xs text-muted-foreground">Total runs</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-2">
                        <TrendingUp className="h-4 w-4 text-orange-600" />
                        <span className="text-sm font-medium">Pass Rate</span>
                      </div>
                      <div className="text-2xl font-bold mt-2">{passRate}%</div>
                      <p className="text-xs text-muted-foreground">Success rate</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <Card>
                    <CardHeader>
                      <CardTitle>Recent Executions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {executionsLoading ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <Play className="h-8 w-8 mx-auto mb-2 animate-pulse" />
                          <p className="text-sm sm:text-base">Loading recent executions…</p>
                        </div>
                      ) : executions.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <Play className="h-8 w-8 mx-auto mb-2" />
                          <p className="text-sm sm:text-base">No recent executions</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {executions.slice(0, 5).map((exe: any) => (
                            <div key={exe._id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between border rounded-lg p-3 gap-3">
                              <div className="flex-1 min-w-0 w-full sm:w-auto">
                                <div className="text-xs sm:text-sm font-medium truncate">{exe?.testCase?.title || exe.testCase}</div>
                                <div className="text-xs text-muted-foreground truncate mt-1">
                                  {exe?.testPlan?.name || 'No Plan'} · {exe.environment || '—'} · {exe.version || '—'}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto flex-shrink-0">
                                <Badge className={getStatusColor(exe.status) + ' text-xs flex-shrink-0'}>
                                  {exe.status.charAt(0).toUpperCase() + exe.status.slice(1)}
                                </Badge>
                                <div className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0 hidden sm:block">
                                  {exe?.executedAt ? new Date(exe.executedAt).toLocaleString() : '—'}
                                </div>
                                <Button size="sm" variant="outline" onClick={() => router.push(`/test-management/executions/${exe._id}`)} className="flex-1 sm:flex-initial">
                                  View
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Execution Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span className="text-sm">Passed</span>
                          </div>
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            {executionStatusCounts.passed}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-red-600" />
                            <span className="text-sm">Failed</span>
                          </div>
                          <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                            {executionStatusCounts.failed}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-yellow-600" />
                            <span className="text-sm">Blocked</span>
                          </div>
                          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                            {executionStatusCounts.blocked}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-gray-600" />
                            <span className="text-sm">Skipped</span>
                          </div>
                          <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200">
                            {executionStatusCounts.skipped}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="suites" className="space-y-8">
                <TestSuiteCards
                  key={`${selectedProject}-${suitesRefreshCounter}`}
                  projectId={selectedProject}
                  onSuiteView={(suite) => {
                    setDetailSuiteId(suite._id)
                    setSuiteDetailDialogOpen(true)
                  }}
                  onSuiteCreate={(parentSuiteId) => {
                    setEditingSuite(null)
                    setParentSuiteIdForCreate(parentSuiteId)
                    setSuiteDialogOpen(true)
                  }}
                  onSuiteEdit={(suite) => {
                    setEditingSuite(suite)
                    setParentSuiteIdForCreate(undefined)
                    setSuiteDialogOpen(true)
                  }}
                  onSuiteDelete={(suiteId) => handleDeleteSuite(suiteId)}
                />
              </TabsContent>

              <TabsContent value="cases" className="space-y-8">
                <TestCaseList
                  projectId={selectedProject}
                  key={`${selectedProject}-${testCasesRefreshCounter}-${selectedSuiteId ?? 'all'}`}
                  onTestCaseSelect={(testCase) => console.log('Selected test case:', testCase)}
                  onTestCaseCreate={(testSuiteId) => {
                    const qp = new URLSearchParams({ projectId: selectedProject })
                    if (testSuiteId) qp.set('testSuiteId', testSuiteId)
                    router.push(`/test-management/cases/new?${qp.toString()}`)
                  }}
                  onTestCaseEdit={(testCase) => {
                    router.push(
                      `/test-management/cases/${encodeURIComponent(testCase._id)}/edit?projectId=${encodeURIComponent(selectedProject)}`
                    )
                  }}
                  onTestCaseDelete={(testCaseId, testCaseTitle) => {
                    setDeleteItem({ id: testCaseId, name: testCaseTitle || '' })
                    setDeleteDialogOpen(true)
                  }}
                  onTestCaseExecute={(testCase) => {
                    if (!selectedProject) return
                    router.push(
                      `/test-management/executions/new?projectId=${encodeURIComponent(selectedProject)}&testCaseId=${encodeURIComponent(testCase._id)}`
                    )
                  }}
                />
              </TabsContent>

              <TabsContent value="executions" className="space-y-8">
                <Card>
                  <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <CardTitle className="text-xl sm:text-2xl">Test Executions</CardTitle>
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                      <Button
                        variant="outline"
                        onClick={() => router.push(`/test-management/executions?projectId=${encodeURIComponent(selectedProject)}`)}
                        className="w-full sm:w-auto"
                      >
                        View All
                      </Button>
                      <Button onClick={handleStartTestExecution} className="w-full sm:w-auto">
                        <Play className="h-4 w-4 mr-2" />
                        Record Execution
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs sm:text-sm">Test Case</TableHead>
                            <TableHead className="text-xs sm:text-sm">Test Plan</TableHead>
                            <TableHead className="text-xs sm:text-sm">Project</TableHead>
                            <TableHead className="text-xs sm:text-sm">Status</TableHead>
                            <TableHead className="text-xs sm:text-sm">Tester</TableHead>
                            <TableHead className="text-xs sm:text-sm">Duration</TableHead>
                            <TableHead className="text-xs sm:text-sm">Executed</TableHead>
                            <TableHead className="text-xs sm:text-sm">Version</TableHead>
                            <TableHead className="text-xs sm:text-sm w-12">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {executionsLoading ? (
                            <TableRow>
                              <TableCell colSpan={9} className="text-xs sm:text-sm">Loading…</TableCell>
                            </TableRow>
                          ) : executions.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={9} className="text-xs sm:text-sm">No test executions found</TableCell>
                            </TableRow>
                          ) : (
                            executions.map((execution: any) => (
                              <TableRow key={execution._id}>
                                <TableCell className="font-medium text-xs sm:text-sm truncate max-w-[200px]">{execution?.testCase?.title || execution.testCase}</TableCell>
                                <TableCell className="text-xs sm:text-sm truncate max-w-[150px]">{execution?.testPlan?.name || 'N/A'}</TableCell>
                                <TableCell className="text-xs sm:text-sm truncate max-w-[150px]">{execution?.project?.name || '—'}</TableCell>
                                <TableCell className="text-xs sm:text-sm">
                                  <div className="flex items-center space-x-2">
                                    {getStatusIcon(execution.status)}
                                    <Badge className={getStatusColor(execution.status) + ' text-xs'}>
                                      {execution.status.charAt(0).toUpperCase() + execution.status.slice(1)}
                                    </Badge>
                                  </div>
                                </TableCell>
                                <TableCell className="text-xs sm:text-sm truncate max-w-[150px]">{(execution?.executedBy?.firstName || '') + ' ' + (execution?.executedBy?.lastName || '') || execution?.executedBy?.email || '—'}</TableCell>
                                <TableCell className="text-xs sm:text-sm">{formatDuration(execution.executionTime)}</TableCell>
                                <TableCell className="text-xs sm:text-sm whitespace-nowrap">{formatDate(execution.executedAt)}</TableCell>
                                <TableCell className="text-xs sm:text-sm">{execution.version || '—'}</TableCell>
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => router.push(`/test-management/executions/${encodeURIComponent(execution._id)}`)}
                                    className="text-xs sm:text-sm"
                                  >
                                    View
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
                </Tabs>
              )}
            </div>
          )}

          {/* Dialogs */}
          <ResponsiveDialog
            open={suiteDialogOpen}
            onOpenChange={setSuiteDialogOpen}
            title={editingSuite ? 'Edit Test Suite' : 'Create Test Suite'}
            dismissible={false}
          >
            <TestSuiteForm
              testSuite={editingSuite || (parentSuiteIdForCreate ? { name: '', description: '', parentSuite: parentSuiteIdForCreate, project: selectedProject } as any : undefined)}
              projectId={editingSuite?.project || selectedProject}
              projectName={projects.find(p => p._id === (editingSuite?.project || selectedProject))?.name}
              onSave={async (suiteData) => {
                setSuiteSaving(true)
                try {
                  const isEdit = !!editingSuite?._id
                  const projectIdToUse = isEdit ? (editingSuite?.project || selectedProject) : selectedProject
                  const res = await fetch('/api/test-suites', {
                    method: isEdit ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      ...(isEdit ? { suiteId: editingSuite._id } : {}),
                      name: suiteData.name,
                      description: suiteData.description,
                      projectId: projectIdToUse,
                      parentSuiteId: suiteData.parentSuite || parentSuiteIdForCreate,
                    })
                  })
                  if (res.ok) {
                    notifySuccess({ title: isEdit ? 'Test Suite updated successfully.' : 'Test Suite created successfully.' })
                    setSuiteDialogOpen(false)
                    setEditingSuite(null)
                    setParentSuiteIdForCreate(undefined)
                    setSuitesRefreshCounter(c => c + 1)
                    // Reopen detail dialog if it was open before
                    if (detailSuiteId) {
                      setSuiteDetailRefreshKey(k => k + 1)
                      setSuiteDetailDialogOpen(true)
                    }
                  } else {
                    const data = await res.json().catch(() => ({}))
                    console.error('Failed to save test suite', data)
                  }
                } catch (e) {
                  console.error('Error saving test suite:', e)
                } finally {
                  setSuiteSaving(false)
                }
              }}
              onCancel={() => {
                setSuiteDialogOpen(false)
                setEditingSuite(null)
                setParentSuiteIdForCreate(undefined)
                // Reopen detail dialog if it was open before
                if (detailSuiteId) {
                  setSuiteDetailDialogOpen(true)
                }
              }}
              loading={suiteSaving}
            />
          </ResponsiveDialog>

          <TestSuiteDetailDialog
            suiteId={detailSuiteId}
            open={suiteDetailDialogOpen}
            onOpenChange={setSuiteDetailDialogOpen}
            refreshKey={suiteDetailRefreshKey}
            onEdit={(suite) => {
              setSuiteDetailDialogOpen(false)
              setEditingSuite({
                _id: suite._id,
                name: suite.name,
                description: suite.description,
                parentSuite: suite.parentSuite?._id,
                project: selectedProject,
              })
              setParentSuiteIdForCreate(undefined)
              setSuiteDialogOpen(true)
            }}
            onDelete={(suiteId) => {
              setSuiteDetailDialogOpen(false)
              handleDeleteSuite(suiteId)
            }}
            onCreateChild={(parentSuiteId) => {
              setSuiteDetailDialogOpen(false)
              setEditingSuite(null)
              setParentSuiteIdForCreate(parentSuiteId)
              setSuiteDialogOpen(true)
            }}
            onCreateTestCase={(suiteId) => {
              setSuiteDetailDialogOpen(false)
              const qp = new URLSearchParams({ projectId: selectedProject })
              if (suiteId) qp.set('testSuiteId', suiteId)
              router.push(`/test-management/cases/new?${qp.toString()}`)
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
            onConfirm={async () => {
              if (!deleteItem) return
              setDeleting(true)
              try {
                const res = await fetch(`/api/test-cases/${deleteItem.id}`, { method: 'DELETE' })
                if (res.ok) {
                  setDeleteDialogOpen(false)
                  setDeleteItem(null)
                  setTestCasesRefreshCounter(c => c + 1)
                } else {
                  const data = await res.json().catch(() => ({}))
                  console.error('Failed to delete test case', data)
                }
              } catch (e) {
                console.error('Error deleting test case:', e)
              } finally {
                setDeleting(false)
              }
            }}
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
