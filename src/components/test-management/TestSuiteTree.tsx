'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  FolderOpen, 
  Plus, 
  Edit, 
  Trash2,
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
  onSuiteSelect?: (suite: TestSuite) => void
  onSuiteCreate?: (parentSuiteId?: string) => void
  onSuiteEdit?: (suite: TestSuite) => void
  onSuiteDelete?: (suiteId: string) => void
  selectedSuiteId?: string
}

export default function TestSuiteTree({
  projectId,
  onSuiteSelect,
  onSuiteCreate,
  onSuiteEdit,
  onSuiteDelete,
  selectedSuiteId
}: TestSuiteTreeProps) {
  const [suites, setSuites] = useState<TestSuite[]>([])
  const [expandedSuites, setExpandedSuites] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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
    
    onSuiteSelect?.(suite)
  }

  const handleCreateSuite = (parentSuiteId?: string) => {
    onSuiteCreate?.(parentSuiteId)
  }

  const handleEditSuite = (suite: TestSuite) => {
    onSuiteEdit?.(suite)
  }

  const handleDeleteSuite = (suiteId: string) => {
    onSuiteDelete?.(suiteId)
  }

  const renderSuite = (suite: TestSuite, level = 0) => {
    const isExpanded = expandedSuites.has(suite._id)
    const hasChildren = suite.children && suite.children.length > 0
    const isSelected = selectedSuiteId === suite._id

    return (
      <div key={suite._id} className="select-none">
        <div
          className={`
            flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-muted/50
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
              <DropdownMenuItem onClick={() => handleCreateSuite(suite._id)}>
                <Plus className="h-3 w-3 mr-2" />
                Add Child Suite
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleEditSuite(suite)}>
                <Edit className="h-3 w-3 mr-2" />
                Edit Suite
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleDeleteSuite(suite._id)}
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
        <Button
          size="sm"
          onClick={() => handleCreateSuite()}
          className="w-full sm:w-auto"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Suite
        </Button>
      </CardHeader>
      <CardContent>
        {suites.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Folder className="h-8 w-8 mx-auto mb-2" />
            <p>No test suites found</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => handleCreateSuite()}
            >
              Create First Suite
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            {suites.map(suite => renderSuite(suite))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
