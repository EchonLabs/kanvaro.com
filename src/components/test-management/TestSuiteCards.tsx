'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Folder, Eye, Edit, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
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

interface TestSuiteCardsProps {
  projectId: string
  onSuiteView?: (suite: TestSuite) => void
  onSuiteCreate?: (parentSuiteId?: string) => void
  onSuiteEdit?: (suite: TestSuite) => void
  onSuiteDelete?: (suiteId: string, suiteName: string) => void
  /** If set, the list will navigate to and highlight this suite (no modal). */
  highlightSuiteId?: string
}

const ITEMS_PER_PAGE = 6

export default function TestSuiteCards({
  projectId,
  onSuiteView,
  onSuiteCreate,
  onSuiteEdit,
  onSuiteDelete,
  highlightSuiteId,
}: TestSuiteCardsProps) {
  const [suites, setSuites] = useState<TestSuite[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [loadingUserRole, setLoadingUserRole] = useState(true)
  const lastHandledHighlightRef = useRef<string | null>(null)

  useEffect(() => {
    fetchTestSuites()
    fetchUserRole()
  }, [projectId])

  const fetchUserRole = async () => {
    try {
      setLoadingUserRole(true)
      const response = await fetch('/api/auth/me')
      const data = await response.json()
      if (response.ok && data.role) {
        setUserRole(data.role)
      }
    } catch (error) {
      console.error('Error fetching user role:', error)
    } finally {
      setLoadingUserRole(false)
    }
  }

  const isAdmin = userRole && ['admin', 'super_admin', 'superadmin'].includes(userRole.toLowerCase())

  const fetchTestSuites = async () => {
    try {
      setLoading(true)
      setCurrentPage(1)
      const response = await fetch(`/api/test-suites?projectId=${projectId}`)
      const data = await response.json()

      if (data.success && Array.isArray(data.data)) {
        // Flatten to show all suites, not hierarchical
        setSuites(data.data)
      }
    } catch (error) {
      console.error('Error fetching test suites:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!highlightSuiteId) return
    if (lastHandledHighlightRef.current === highlightSuiteId) return
    if (!suites || suites.length === 0) return

    const idx = suites.findIndex((s) => s._id === highlightSuiteId)
    if (idx < 0) return

    const page = Math.floor(idx / ITEMS_PER_PAGE) + 1
    setCurrentPage(page)
    lastHandledHighlightRef.current = highlightSuiteId

    setTimeout(() => {
      const el = document.getElementById(`suite-${highlightSuiteId}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 0)
  }, [highlightSuiteId, suites])

  const totalPages = Math.ceil(suites.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
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

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-4 bg-muted rounded w-3/4" />
              <div className="h-3 bg-muted rounded w-1/2 mt-2" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="h-3 bg-muted rounded w-full" />
                <div className="h-3 bg-muted rounded w-5/6" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (suites.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Folder className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-lg font-semibold mb-2">No Test Suites Found</p>
          <p className="text-muted-foreground mb-4">
            {projectId ? 'Create your first test suite to get started.' : 'Select a project to view test suites.'}
          </p>
          {onSuiteCreate && (
            <Button onClick={() => onSuiteCreate()} className="mt-2">
              Create Test Suite
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Grid of Suite Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {currentSuites.map((suite) => (
          <Card
            key={suite._id}
            id={`suite-${suite._id}`}
            className={`flex flex-col hover:shadow-lg transition-shadow overflow-hidden ${
              highlightSuiteId && suite._id === highlightSuiteId
                ? 'ring-2 ring-primary/30 border-primary/40'
                : ''
            }`}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base font-semibold truncate flex-1">
                  {suite.name}
                </CardTitle>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 flex-shrink-0">
                      <span className="sr-only">Open menu</span>
                      <span>⋯</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onSuiteView && (
                      <DropdownMenuItem onClick={() => onSuiteView(suite)}>
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                    )}
                    {onSuiteEdit && (
                      <DropdownMenuItem onClick={() => onSuiteEdit(suite)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                    )}
                    {onSuiteDelete && isAdmin && (
                      <DropdownMenuItem
                        onClick={() => onSuiteDelete(suite._id, suite.name)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    )}
                    {onSuiteDelete && !isAdmin && (
                      <DropdownMenuItem disabled className="text-muted-foreground">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete (Admin only)
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="space-y-2 text-sm">
                {/* Status Badge */}
                <Badge 
                  variant={suite.isActive ? 'default' : 'secondary'}
                  className="text-xs w-fit"
                >
                  {suite.isActive ? 'Active' : 'Inactive'}
                </Badge>

                {/* Description */}
                {suite.description && (
                  <p className="text-muted-foreground text-xs line-clamp-2">
                    {suite.description}
                  </p>
                )}

                {/* Test Cases Count */}
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">{suite.testCaseCount ?? 0}</span> Test Cases
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages} ({suites.length} suites)
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreviousPage}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
