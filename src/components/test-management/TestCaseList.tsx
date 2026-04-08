'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatToTitleCase } from '@/lib/utils'
import { Input } from '@/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  RotateCcw,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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
  preconditions: string
  createdAt: string
  updatedAt: string
}

interface TestCaseListProps {
  projectId: string
  testSuiteId?: string
  onTestCaseSelect?: (testCase: TestCase) => void
  onTestCaseCreate?: (testSuiteId?: string) => void
  onTestCaseEdit?: (testCase: TestCase) => void
  onTestCaseDelete?: (testCaseId: string, testCaseTitle?: string) => void
  onTestCaseExecute?: (testCase: TestCase) => void
  selectedTestCaseId?: string
  showAddButton?: boolean
}

export default function TestCaseList({
  projectId,
  testSuiteId,
  onTestCaseSelect,
  onTestCaseCreate,
  onTestCaseEdit,
  onTestCaseDelete,
  onTestCaseExecute,
  selectedTestCaseId,
  showAddButton = true
}: TestCaseListProps) {
  const ITEMS_PER_PAGE = 20

  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [appliedSearchTerm, setAppliedSearchTerm] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [automationFilter, setAutomationFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const ALL_PRIORITY = '__ALL_PRIORITY__'
  const ALL_CATEGORIES = '__ALL_CATEGORIES__'
  const ALL_STATUS = '__ALL_STATUS__'
  const [selectedCases, setSelectedCases] = useState<string[]>([])

  useEffect(() => {
    const timeout = setTimeout(() => {
      setAppliedSearchTerm(searchTerm)
    }, 300)

    return () => clearTimeout(timeout)
  }, [searchTerm])

  useEffect(() => {
    setCurrentPage(1)
    setSelectedCases([])
    fetchTestCases(1)
  }, [projectId, testSuiteId, appliedSearchTerm, priorityFilter, categoryFilter, automationFilter])

  const fetchTestCases = async (page = currentPage) => {
    if (!projectId) {
      setTestCases([])
      setSelectedCases([])
      setTotalPages(1)
      setTotalItems(0)
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const params = new URLSearchParams({
        projectId,
        ...(testSuiteId && { testSuiteId }),
        ...(appliedSearchTerm && { search: appliedSearchTerm }),
        ...(priorityFilter && { priority: priorityFilter }),
        ...(categoryFilter && { category: categoryFilter }),
        ...(automationFilter && { automationStatus: automationFilter }),
        page: String(page),
        limit: String(ITEMS_PER_PAGE)
      })

      const response = await fetch(`/api/test-cases?${params}`)
      const data = await response.json()

      if (data.success) {
        const items: TestCase[] = Array.isArray(data.data) ? data.data : []
        setTestCases(items)
        setSelectedCases([])

        const pagesFromApi = Number(data.pagination?.pages)
        const totalFromApi = Number(data.pagination?.total)
        setTotalPages(Number.isFinite(pagesFromApi) && pagesFromApi > 0 ? pagesFromApi : 1)
        setTotalItems(Number.isFinite(totalFromApi) && totalFromApi >= 0 ? totalFromApi : items.length)
      }
    } catch (error) {
      console.error('Error fetching test cases:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleResetFilters = () => {
    setSearchTerm('')
    setAppliedSearchTerm('')
    setPriorityFilter('')
    setCategoryFilter('')
    setAutomationFilter('')
  }

  const handlePreviousPage = () => {
    if (currentPage <= 1) return
    const nextPage = currentPage - 1
    setCurrentPage(nextPage)
    fetchTestCases(nextPage)
  }

  const handleNextPage = () => {
    if (currentPage >= totalPages) return
    const nextPage = currentPage + 1
    setCurrentPage(nextPage)
    fetchTestCases(nextPage)
  }

  const handleTestCaseClick = (testCase: TestCase) => {
    onTestCaseSelect?.(testCase)
  }

  const handleCreateTestCase = () => {
    onTestCaseCreate?.(testSuiteId)
  }

  const handleEditTestCase = (testCase: TestCase) => {

    onTestCaseEdit?.(testCase)
  }

  const handleDeleteTestCase = (testCaseId: string) => {
    const testCase = testCases.find(tc => tc._id === testCaseId)
    onTestCaseDelete?.(testCaseId, testCase?.title)
  }

  const handleExecuteTestCase = (testCase: TestCase) => {
    onTestCaseExecute?.(testCase)
  }

  const handleSelectCase = (testCaseId: string) => {
    setSelectedCases(prev =>
      prev.includes(testCaseId)
        ? prev.filter(id => id !== testCaseId)
        : [...prev, testCaseId]
    )
  }

  const handleSelectAll = () => {
    if (selectedCases.length === testCases.length) {
      setSelectedCases([])
    } else {
      setSelectedCases(testCases.map(tc => tc._id))
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      case 'high': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      case 'low': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'functional': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'integration': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      case 'regression': return 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200'
      case 'performance': return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200'
      case 'security': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      case 'usability': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'compatibility': return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  const getAutomationIcon = (status: string) => {
    switch (status) {
      case 'automated': return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'semi_automated': return <Clock className="h-4 w-4 text-yellow-600" />
      case 'deprecated': return <XCircle className="h-4 w-4 text-red-600" />
      default: return <AlertTriangle className="h-4 w-4 text-gray-600" />
    }
  }

  const hasActiveFilters = Boolean(
    searchTerm.trim() || priorityFilter || categoryFilter || automationFilter
  )

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Test Cases</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-3 border rounded">
                <div className="h-4 w-4 bg-muted animate-pulse rounded" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
                  <div className="h-3 bg-muted animate-pulse rounded w-1/2" />
                </div>
                <div className="h-6 w-16 bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <CardTitle className="text-xl sm:text-2xl">Test Cases</CardTitle>
          {showAddButton && (
            <Button onClick={handleCreateTestCase} className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Add Test Case
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:gap-4 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search test cases..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full"
            />
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
            <Select value={priorityFilter || ALL_PRIORITY} onValueChange={(v) => setPriorityFilter(v === ALL_PRIORITY ? '' : v)}>
              <SelectTrigger className="w-full sm:w-32">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_PRIORITY}>All Priority</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>

            <Select value={categoryFilter || ALL_CATEGORIES} onValueChange={(v) => setCategoryFilter(v === ALL_CATEGORIES ? '' : v)}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CATEGORIES}>All Categories</SelectItem>
                <SelectItem value="functional">Functional</SelectItem>
                <SelectItem value="integration">Integration</SelectItem>
                <SelectItem value="regression">Regression</SelectItem>
                <SelectItem value="performance">Performance</SelectItem>
                <SelectItem value="security">Security</SelectItem>
                <SelectItem value="usability">Usability</SelectItem>
                <SelectItem value="compatibility">Compatibility</SelectItem>
              </SelectContent>
            </Select>

            <Select value={automationFilter || ALL_STATUS} onValueChange={(v) => setAutomationFilter(v === ALL_STATUS ? '' : v)}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Automation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STATUS}>All Status</SelectItem>
                <SelectItem value="not_automated">Not Automated</SelectItem>
                <SelectItem value="automated">Automated</SelectItem>
                <SelectItem value="semi_automated">Semi Automated</SelectItem>
                <SelectItem value="deprecated">Deprecated</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              onClick={handleResetFilters}
              size="sm"
              className="w-full sm:w-auto"
              disabled={!hasActiveFilters}
              title="Clear all filters"
              aria-label="Clear all filters"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {testCases.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No test cases found</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={handleCreateTestCase}
            >
              Create First Test Case
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-2 border-b">
              <input
                type="checkbox"
                checked={selectedCases.length === testCases.length}
                onChange={handleSelectAll}
                className="rounded"
              />
              <span className="text-sm text-muted-foreground">
                {selectedCases.length} of {testCases.length} selected
              </span>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Suite</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Automation</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {testCases.map((testCase) => (
                  <TableRow
                    key={testCase._id}
                    className={`cursor-pointer hover:bg-muted/50 ${selectedTestCaseId === testCase._id ? 'bg-primary/10' : ''
                      }`}
                    onClick={() => handleTestCaseClick(testCase)}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedCases.includes(testCase._id)}
                        onChange={() => handleSelectCase(testCase._id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded"
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{testCase.title}</div>
                        <div className="text-sm text-muted-foreground truncate max-w-xs">
                          {testCase.description}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {testCase.testSuite?.name || 'Unknown Suite'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getPriorityColor(testCase.priority)}>
                        {formatToTitleCase(testCase.priority)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getCategoryColor(testCase.category)}>
                        {formatToTitleCase(testCase.category)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getAutomationIcon(testCase.automationStatus)}
                        <span className="text-sm capitalize">
                          {testCase.automationStatus.replace('_', ' ')}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {testCase.estimatedExecutionTime}m
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => handleExecuteTestCase(testCase)}>
                            <Play className="h-3 w-3 mr-2" />
                            Execute
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => handleEditTestCase(testCase)}>
                            <Edit className="h-3 w-3 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => handleDeleteTestCase(testCase._id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-3 w-3 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages} ({totalItems} test cases)
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreviousPage}
                  disabled={currentPage === 1 || totalPages <= 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={currentPage === totalPages || totalPages <= 1}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
