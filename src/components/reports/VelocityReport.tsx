'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatToTitleCase } from '@/lib/utils'
import { Progress } from '@/components/ui/Progress'
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Zap,
  Calendar,
  BarChart3,
  Activity
} from 'lucide-react'
import { VelocityChart } from '@/components/charts/VelocityChart'

interface VelocityData {
  sprint: string
  plannedVelocity: number
  actualVelocity: number
  capacity: number
  actualCapacity: number
  startDate: string
  endDate: string
  status: string
}

interface VelocityReportData {
  velocityData: VelocityData[]
  averageVelocity: number
  totalSprints: number
  completedSprints: number
}

interface VelocityReportProps {
  projectId: string
}

export function VelocityReport({ projectId }: VelocityReportProps) {
  const [data, setData] = useState<VelocityReportData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchVelocityData()
  }, [projectId])

  const fetchVelocityData = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/reports?projectId=${projectId}&type=velocity`)
      if (response.ok) {
        const data = await response.json()
        setData(data)
      }
    } catch (error) {
      console.error('Error fetching velocity data:', error)
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
        <p className="text-muted-foreground">No velocity data available</p>
      </div>
    )
  }

  const getVelocityStatus = (actual: number, planned: number) => {
    if (actual >= planned) return { color: 'text-green-500', icon: TrendingUp, status: 'On Target' }
    if (actual >= planned * 0.8) return { color: 'text-yellow-500', icon: Target, status: 'Close' }
    return { color: 'text-red-500', icon: TrendingDown, status: 'Behind' }
  }

  const getCapacityStatus = (actual: number, planned: number) => {
    const utilization = actual / planned
    if (utilization >= 0.9) return { color: 'text-red-500', status: 'Overutilized' }
    if (utilization >= 0.7) return { color: 'text-green-500', status: 'Optimal' }
    return { color: 'text-yellow-500', status: 'Underutilized' }
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      'planning': 'secondary',
      'active': 'default',
      'completed': 'outline',
      'cancelled': 'destructive'
    } as const
    
    return (
      <Badge variant={variants[status as keyof typeof variants] || 'secondary'}>
        {status}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      {/* Velocity Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average Velocity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.averageVelocity.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground">story points per sprint</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Sprints</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalSprints}</div>
            <p className="text-xs text-muted-foreground">sprints planned</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Completed Sprints</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.completedSprints}</div>
            <p className="text-xs text-muted-foreground">
              {data.totalSprints > 0 ? ((data.completedSprints / data.totalSprints) * 100).toFixed(1) : 0}% completion rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Interactive Velocity Chart */}
      <VelocityChart 
        data={data.velocityData}
        title="Velocity Tracking"
        description="Interactive visualization of sprint velocity and capacity trends"
      />

      {/* Detailed Sprint Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span>Detailed Sprint Analysis</span>
          </CardTitle>
          <CardDescription>
            Individual sprint performance with detailed metrics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.velocityData.map((sprint, index) => {
              const velocityStatus = getVelocityStatus(sprint.actualVelocity, sprint.plannedVelocity)
              const capacityStatus = getCapacityStatus(sprint.actualCapacity, sprint.capacity)
              
              return (
                <div key={index} className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Zap className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{sprint.sprint}</span>
                      <Badge>{formatToTitleCase(sprint.status)}</Badge>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline" className={velocityStatus.color}>
                        <velocityStatus.icon className="h-3 w-3 mr-1" />
                        {velocityStatus.status}
                      </Badge>
                      <Badge variant="outline" className={capacityStatus.color}>
                        {capacityStatus.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Velocity Tracking */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Velocity Tracking</p>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span>Planned: {sprint.plannedVelocity} pts</span>
                          <span>Actual: {sprint.actualVelocity} pts</span>
                        </div>
                        <Progress 
                          value={sprint.plannedVelocity > 0 ? (sprint.actualVelocity / sprint.plannedVelocity) * 100 : 0} 
                          className="h-2" 
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>
                            {sprint.plannedVelocity > 0 
                              ? (((sprint.actualVelocity - sprint.plannedVelocity) / sprint.plannedVelocity) * 100).toFixed(1)
                              : 0
                            }% variance
                          </span>
                          <span className={velocityStatus.color}>
                            {velocityStatus.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Capacity Tracking */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Capacity Utilization</p>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span>Planned: {sprint.capacity}h</span>
                          <span>Actual: {sprint.actualCapacity}h</span>
                        </div>
                        <Progress 
                          value={sprint.capacity > 0 ? (sprint.actualCapacity / sprint.capacity) * 100 : 0} 
                          className="h-2" 
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>
                            {sprint.capacity > 0 
                              ? ((sprint.actualCapacity / sprint.capacity) * 100).toFixed(1)
                              : 0
                            }% utilization
                          </span>
                          <span className={capacityStatus.color}>
                            {capacityStatus.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {new Date(sprint.startDate).toLocaleDateString()} - {new Date(sprint.endDate).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {sprint.capacity > 0 
                          ? ((sprint.actualCapacity / sprint.capacity) * 100).toFixed(1)
                          : 0
                        }% capacity used
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Velocity Insights */}
      {data.completedSprints > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5" />
              <span>Velocity Insights</span>
            </CardTitle>
            <CardDescription>
              Analysis of velocity patterns and recommendations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border rounded-lg">
                  <p className="text-sm font-medium mb-2">Velocity Consistency</p>
                  <p className="text-xs text-muted-foreground">
                    {data.averageVelocity > 0 
                      ? `Your team averages ${data.averageVelocity.toFixed(1)} story points per sprint.`
                      : 'No velocity data available yet.'
                    }
                  </p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm font-medium mb-2">Sprint Completion</p>
                  <p className="text-xs text-muted-foreground">
                    {data.totalSprints > 0 
                      ? `${((data.completedSprints / data.totalSprints) * 100).toFixed(1)}% of sprints have been completed.`
                      : 'No sprints completed yet.'
                    }
                  </p>
                </div>
              </div>
              
              {data.velocityData.length > 1 && (
                <div className="p-4 border rounded-lg">
                  <p className="text-sm font-medium mb-2">Trend Analysis</p>
                  <p className="text-xs text-muted-foreground">
                    {(() => {
                      const recentSprints = data.velocityData.slice(-3)
                      if (recentSprints.length < 2) return 'Not enough data for trend analysis.'
                      
                      const velocities = recentSprints.map(s => s.actualVelocity)
                      const isIncreasing = velocities.every((v, i) => i === 0 || v >= velocities[i-1])
                      const isDecreasing = velocities.every((v, i) => i === 0 || v <= velocities[i-1])
                      
                      if (isIncreasing) return 'Velocity is trending upward - great job!'
                      if (isDecreasing) return 'Velocity is trending downward - consider reviewing sprint planning.'
                      return 'Velocity is relatively stable.'
                    })()}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
