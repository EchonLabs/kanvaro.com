'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import {
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Folder,
  FolderOpen,
  Plus,
  Edit,
  Trash2,
  Eye,
  MoreHorizontal
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu'

interface TestSuite {
  _id: string
  name: string
  description: string
  project: string
  parentSuite?: string
  isActive: boolean
  order: number
  tags: string[]
  children?: TestSuite[]
  testCaseCount?: number
}

interface TestSuiteTreeProps {
  projectId: string
  onSuiteView?: (suite: TestSuite) => void
  onSuiteCreate?: (parentSuiteId?: string) => void
  onSuiteEdit?: (suite: TestSuite) => void
  onSuiteDelete?: (suiteId: string, suiteName: string) => void
  selectedSuiteId?: string
}

export default function TestSuiteTree({
  projectId,
  onSuiteView,
  onSuiteCreate,
  onSuiteEdit,
  onSuiteDelete,
  selectedSuiteId
}: TestSuiteTreeProps) {
  const ROOT_SUITES_PER_PAGE = 8

  const [suites, setSuites] = useState<TestSuite[]>([])
  const [expandedSuites, setExpandedSuites] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    setCurrentPage(1)
    fetchTestSuites()
  }, [projectId])

  const fetchTestSuites = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/test-suites?projectId=${projectId}`)
      const data = await response.json()

      if (data.success) {
        // Build hierarchical structure
        const suiteMap = new Map<string, TestSuite & { children: TestSuite[] }>()
        const rootSuites: TestSuite[] = []

        // First pass: create all suites
        data.data.forEach((suite: TestSuite) => {
          suiteMap.set(suite._id, { ...suite, children: [] })
        })

        // Second pass: build hierarchy
        data.data.forEach((suite: TestSuite) => {
          const suiteWithChildren = suiteMap.get(suite._id)!
          if (suite.parentSuite) {
            const parent = suiteMap.get(suite.parentSuite)
            if (parent) {
              parent.children.push(suiteWithChildren)
            }
          } else {
            rootSuites.push(suiteWithChildren)
          }
        })

        setSuites(rootSuites)
      }
    } catch (error) {
      console.error('Error fetching test suites:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleExpanded = (suiteId: string) => {
    setExpandedSuites(prev => {
      const newSet = new Set(prev)
      if (newSet.has(suiteId)) {
        newSet.delete(suiteId)
      } else {
        newSet.add(suiteId)
      }
      return newSet
    })
  }

  const handleSuiteClick = (suite: TestSuite) => {
    onSuiteView?.(suite)
  }

  const handleViewSuite = (suite: TestSuite) => {
    onSuiteView?.(suite)
  }

  const handleCreateSuite = (parentSuiteId?: string) => {
    onSuiteCreate?.(parentSuiteId)
  }

  const handleEditSuite = (suite: TestSuite) => {
    onSuiteEdit?.(suite)
  }

  const handleDeleteSuite = (suiteId: string, suiteName: string) => {
    onSuiteDelete?.(suiteId, suiteName)
  }

  const totalPages = Math.ceil(suites.length / ROOT_SUITES_PER_PAGE)
  const startIndex = (currentPage - 1) * ROOT_SUITES_PER_PAGE
  const endIndex = startIndex + ROOT_SUITES_PER_PAGE
  const currentSuites = suites.slice(startIndex, endIndex)

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1)
    }
  }

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1)
    }
  }

  const renderSuite = (suite: TestSuite, level = 0) => {
    const isExpanded = expandedSuites.has(suite._id)
    const hasChildren = suite.children && suite.children.length > 0
    const isSelected = selectedSuiteId === suite._id

    return (
      <div key={suite._id} className="select-none">
        <div
          className={`
            flex items-center gap-2 p-2 rounded-md
            ${isSelected ? 'bg-primary/10 border border-primary/20' : ''}
          `}
          style={{ paddingLeft: `${level * 20 + 8}px` }}
          onClick={() => handleSuiteClick(suite)}
        >
          {hasChildren ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0"
              onClick={(e) => {
                e.stopPropagation()
                toggleExpanded(suite._id)
              }}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </Button>
          ) : (
            <div className="w-4" />
          )}

          {isExpanded ? (
            <FolderOpen className="h-4 w-4 text-primary" />
          ) : (
            <Folder className="h-4 w-4 text-muted-foreground" />
          )}

          <span className="flex-1 text-sm font-medium">{suite.name}</span>

          {suite.testCaseCount !== undefined && (
            <Badge variant="secondary" className="text-xs">
              {suite.testCaseCount}
            </Badge>
          )}

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
              {onSuiteCreate && (
                <DropdownMenuItem onClick={() => handleCreateSuite(suite._id)}>
                  <Plus className="h-3 w-3 mr-2" />
                  Add Child Suite
                </DropdownMenuItem>
              )}
              {onSuiteView && (
                <DropdownMenuItem onClick={() => handleViewSuite(suite)}>
                  <Eye className="h-3 w-3 mr-2" />
                  View Details
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => handleEditSuite(suite)}>
                <Edit className="h-3 w-3 mr-2" />
                Edit Suite
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDeleteSuite(suite._id, suite.name)}
                className="text-destructive"
              >
                <Trash2 className="h-3 w-3 mr-2" />
                Delete Suite
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {isExpanded && hasChildren && (
          <div>
            {suite.children!.map(child => renderSuite(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Test Suites</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-2 p-2">
                <div className="h-4 w-4 bg-muted animate-pulse rounded" />
                <div className="h-4 w-4 bg-muted animate-pulse rounded" />
                <div className="h-4 flex-1 bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <CardTitle className="text-xl sm:text-2xl">Test Suites</CardTitle>
        {onSuiteCreate && (
          <Button
            size="sm"
            onClick={() => handleCreateSuite()}
            className="w-full sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Suite
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {suites.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Folder className="h-8 w-8 mx-auto mb-2" />
            <p>No test suites found</p>
            {onSuiteCreate && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => handleCreateSuite()}
              >
                Create First Suite
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {currentSuites.map(suite => renderSuite(suite))}

            <div className="flex items-center justify-between pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages} ({suites.length} root suites)
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
