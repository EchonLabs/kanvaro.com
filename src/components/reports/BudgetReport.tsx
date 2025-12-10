'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { 
  DollarSign, 
  Plus, 
  TrendingUp, 
  Calendar,
  FileText,
  AlertTriangle,
  CheckCircle
} from 'lucide-react'
import { AddBudgetEntryModal } from '@/components/budget/AddBudgetEntryModal'
import { BudgetChart } from '@/components/charts/BudgetChart'

interface BudgetEntry {
  _id: string
  amount: number
  currency: string
  category: string
  description: string
  billingReference?: string
  addedBy: {
    firstName: string
    lastName: string
    email: string
  }
  addedAt: string
  isRecurring: boolean
  recurringFrequency?: string
  status: string
  notes?: string
}

interface BudgetData {
  project: {
    name: string
    budget: {
      total: number
      spent: number
      currency: string
      categories: {
        materials: number
        overhead: number
        external: number
      }
    }
  }
  budgetEntries: BudgetEntry[]
  categoryBreakdown: Record<string, number>
  recurringEntries: BudgetEntry[]
  summary: {
    totalBudget: number
    totalSpent: number
    remaining: number
  }
}

interface BudgetReportProps {
  projectId: string
}

export function BudgetReport({ projectId }: BudgetReportProps) {
  const [data, setData] = useState<BudgetData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    fetchBudgetData()
  }, [projectId])

  const fetchBudgetData = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/reports?projectId=${projectId}&type=budget`)
      if (response.ok) {
        const data = await response.json()
        setData(data)
      }
    } catch (error) {
      console.error('Error fetching budget data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleBudgetEntryAdded = () => {
    fetchBudgetData()
    setShowAddModal(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No budget data available</p>
      </div>
    )
  }

  const getCategoryColor = (category: string) => {
    const colors = {
      materials: 'bg-green-500',
      overhead: 'bg-yellow-500',
      external: 'bg-purple-500',
      other: 'bg-gray-500'
    }
    return colors[category as keyof typeof colors] || 'bg-gray-500'
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'cancelled':
        return <AlertTriangle className="h-4 w-4 text-red-500" />
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-blue-500" />
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Budget Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <DollarSign className="h-5 w-5" />
              <span>Budget Summary</span>
            </div>
            <Button onClick={() => setShowAddModal(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Budget Entry
            </Button>
          </CardTitle>
          <CardDescription>
            Total budget allocation and spending breakdown
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Overall Budget Status */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 border rounded-lg">
                <p className="text-2xl font-bold text-green-600">
                  ${data.summary.totalBudget.toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">Total Budget</p>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <p className="text-2xl font-bold text-red-600">
                  ${data.summary.totalSpent.toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">Total Spent</p>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <p className="text-2xl font-bold text-blue-600">
                  ${data.summary.remaining.toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">Remaining</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Budget Utilization</span>
                <span>
                  {data.summary.totalBudget > 0 
                    ? ((data.summary.totalSpent / data.summary.totalBudget) * 100).toFixed(1)
                    : 0
                  }%
                </span>
              </div>
              <Progress 
                value={data.summary.totalBudget > 0 
                  ? (data.summary.totalSpent / data.summary.totalBudget) * 100 
                  : 0
                } 
                className="h-2" 
              />
            </div>
          </div>

          {/* Interactive Budget Chart */}
          <BudgetChart 
            data={Object.entries(data.categoryBreakdown).map(([category, amount]) => ({
              category,
              amount,
              color: getCategoryColor(category).replace('bg-', '#')
            }))}
            title="Budget Category Breakdown"
            description="Visual breakdown of budget allocation by category"
          />
        </CardContent>
      </Card>

      {/* Budget Entries */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>Budget Entries</span>
          </CardTitle>
          <CardDescription>
            All budget allocations and adjustments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.budgetEntries.map((entry) => (
              <div key={entry._id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="capitalize">
                      {entry.category}
                    </Badge>
                    {getStatusIcon(entry.status)}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">
                      ${entry.amount.toLocaleString()} {entry.currency}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.addedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                
                <div>
                  <p className="text-sm font-medium">{entry.description}</p>
                  {entry.billingReference && (
                    <p className="text-xs text-muted-foreground">
                      Reference: {entry.billingReference}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center space-x-4">
                    <span>Added by: {entry.addedBy.firstName} {entry.addedBy.lastName}</span>
                    {entry.isRecurring && (
                      <Badge variant="secondary" className="text-xs">
                        <Calendar className="h-3 w-3 mr-1" />
                        {entry.recurringFrequency}
                      </Badge>
                    )}
                  </div>
                </div>

                {entry.notes && (
                  <div className="text-sm text-muted-foreground bg-muted p-2 rounded">
                    {entry.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recurring Entries */}
      {data.recurringEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="h-5 w-5" />
              <span>Recurring Budget Entries</span>
            </CardTitle>
            <CardDescription>
              Automated budget allocations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.recurringEntries.map((entry) => (
                <div key={entry._id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{entry.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.recurringFrequency} • {entry.category}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">
                      ${entry.amount.toLocaleString()} {entry.currency}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Next: {(entry as any).nextRecurringDate ? new Date((entry as any).nextRecurringDate).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Budget Entry Modal */}
      {showAddModal && (
        <AddBudgetEntryModal
          projectId={projectId}
          onClose={() => setShowAddModal(false)}
          onSuccess={handleBudgetEntryAdded}
        />
      )}
    </div>
  )
}
