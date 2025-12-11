'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Clock, 
  Target,
  AlertTriangle,
  Calendar,
  BarChart3
} from 'lucide-react'
import { BurnRateChart } from '@/components/charts/BurnRateChart'

interface BurnRateData {
  date: string
  plannedBurn: number
  actualBurn: number
  velocity: number
  capacity: number
  utilization: number
  budgetRemaining: number
  forecastedCompletion?: string
  categories: {
    materials: { planned: number; actual: number }
    overhead: { planned: number; actual: number }
    external: { planned: number; actual: number }
  }
  notes?: string
}

interface BurnRateReportData {
  burnRates: BurnRateData[]
  trends: {
    averageBurnRate: number
    averageVelocity: number
    averageUtilization: number
  }
  forecast: {
    remainingBudget: number
    forecastedCompletion?: string
    daysToComplete?: number
  } | null
}

interface BurnRateReportProps {
  projectId: string
}

export function BurnRateReport({ projectId }: BurnRateReportProps) {
  const [data, setData] = useState<BurnRateReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState('30') // days

  useEffect(() => {
    fetchBurnRateData()
  }, [projectId, selectedPeriod])

  const fetchBurnRateData = async () => {
    try {
      setLoading(true)
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - parseInt(selectedPeriod))
      
      const response = await fetch(
        `/api/reports?projectId=${projectId}&type=burn-rate&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
      )
      if (response.ok) {
        const data = await response.json()
        setData(data)
      }
    } catch (error) {
      console.error('Error fetching burn rate data:', error)
    } finally {
      setLoading(false)
    }
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
        <p className="text-muted-foreground">No burn rate data available</p>
      </div>
    )
  }

  const getBurnRateStatus = (actual: number, planned: number) => {
    const variance = ((actual - planned) / planned) * 100
    if (variance > 20) return { color: 'text-red-500', icon: TrendingUp, status: 'Over Budget' }
    if (variance < -20) return { color: 'text-green-500', icon: TrendingDown, status: 'Under Budget' }
    return { color: 'text-blue-500', icon: Target, status: 'On Track' }
  }

  const getUtilizationStatus = (utilization: number) => {
    if (utilization > 0.9) return { color: 'text-red-500', status: 'Overutilized' }
    if (utilization < 0.5) return { color: 'text-yellow-500', status: 'Underutilized' }
    return { color: 'text-green-500', status: 'Optimal' }
  }

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center space-x-2">
        <span className="text-sm font-medium">Period:</span>
        <div className="flex space-x-1">
          {['7', '30', '90'].map((period) => (
            <Button
              key={period}
              variant={selectedPeriod === period ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedPeriod(period)}
            >
              {period} days
            </Button>
          ))}
        </div>
      </div>

      {/* Trends Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average Burn Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${data.trends.averageBurnRate.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">per day</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average Velocity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.trends.averageVelocity.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground">story points per day</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average Utilization</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(data.trends.averageUtilization * 100).toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">team capacity</p>
          </CardContent>
        </Card>
      </div>

      {/* Forecast */}
      {data.forecast && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Target className="h-5 w-5" />
              <span>Project Forecast</span>
            </CardTitle>
            <CardDescription>
              Based on current burn rate trends
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 border rounded-lg">
                <p className="text-2xl font-bold text-blue-600">
                  ${data.forecast.remainingBudget.toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">Remaining Budget</p>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <p className="text-2xl font-bold text-green-600">
                  {data.forecast.daysToComplete || 'N/A'}
                </p>
                <p className="text-sm text-muted-foreground">Days to Complete</p>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <p className="text-2xl font-bold text-purple-600">
                  {data.forecast.forecastedCompletion 
                    ? new Date(data.forecast.forecastedCompletion).toLocaleDateString()
                    : 'N/A'
                  }
                </p>
                <p className="text-sm text-muted-foreground">Forecasted Completion</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Interactive Burn Rate Chart */}
      <BurnRateChart 
        data={data.burnRates}
        title="Burn Rate Analysis"
        description="Interactive visualization of burn rate trends and patterns"
      />

      {/* Detailed Burn Rate History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span>Detailed Burn Rate History</span>
          </CardTitle>
          <CardDescription>
            Individual burn rate entries with detailed breakdowns
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.burnRates.map((rate, index) => {
              const burnStatus = getBurnRateStatus(rate.actualBurn, rate.plannedBurn)
              const utilStatus = getUtilizationStatus(rate.utilization)
              
              return (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {new Date(rate.date).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline" className={burnStatus.color}>
                        <burnStatus.icon className="h-3 w-3 mr-1" />
                        {burnStatus.status}
                      </Badge>
                      <Badge variant="outline" className={utilStatus.color}>
                        {utilStatus.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Planned Burn</p>
                      <p className="text-sm font-medium">${rate.plannedBurn.toLocaleString()}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Actual Burn</p>
                      <p className="text-sm font-medium">${rate.actualBurn.toLocaleString()}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Velocity</p>
                      <p className="text-sm font-medium">{rate.velocity} pts</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Utilization</p>
                      <p className="text-sm font-medium">{(rate.utilization * 100).toFixed(1)}%</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span>Burn Rate Variance</span>
                      <span className={burnStatus.color}>
                        {rate.plannedBurn > 0 
                          ? (((rate.actualBurn - rate.plannedBurn) / rate.plannedBurn) * 100).toFixed(1)
                          : 0
                        }%
                      </span>
                    </div>
                    <Progress 
                      value={rate.plannedBurn > 0 ? (rate.actualBurn / rate.plannedBurn) * 100 : 0} 
                      className="h-1" 
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span>Capacity Utilization</span>
                      <span className={utilStatus.color}>
                        {(rate.utilization * 100).toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={rate.utilization * 100} className="h-1" />
                  </div>

                  {/* Category Breakdown */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Category Breakdown</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {Object.entries(rate.categories).map(([category, values]) => (
                        <div key={category} className="text-center p-2 border rounded">
                          <p className="text-xs text-muted-foreground capitalize">{category}</p>
                          <p className="text-xs font-medium">
                            ${values.actual.toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            (${values.planned.toLocaleString()})
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {rate.notes && (
                    <div className="text-sm text-muted-foreground bg-muted p-2 rounded">
                      {rate.notes}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
